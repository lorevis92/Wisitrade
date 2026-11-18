// Motore dal vivo della strategia "Apertura USA", per ogni exchange (shared/venues.js, adattatori in server/exchanges/)
// e per le due modalità di ognuno:
//  - Prova: capitale fittizio, ordini simulati al prezzo letto con lo slittamento misurato nel Reale di quell'exchange
//  - Reale: ordini veri sull'exchange, solo se LIVE_TRADING=on, il conto Reale di quell'exchange è attivo e le sue chiavi API ci sono
// Ogni exchange è un conto a sé (chiave del conto: paper, live per Bitunix; paper:bitget, live:bitget…): impostazioni,
// capitale, limiti, freno, titoli operabili, prenotazioni, storico. Prezzi e candele sono quelli del suo exchange.
// Gira ogni minuto dentro /api/cron/tick con le candele da 1 minuto già scaricate (per exchange); gli exchange accesi
// girano in contemporanea.
import { ASSET_MAP } from '../shared/assets.js'
import { normalizeSettings, settingsFor, sizing, exitLevel, exitReason, pnlOf, closeMinute, isTradingDay, liqPriceOf, stopPastLiq } from '../shared/opening.js'
import { prepFromBars, findEntry, newPosition, stepBar, riskFor, liqBlocks, indexRule, entryUntil, entryFrom, volInBlock, minuteNormals, signalRank, bySignal, lossCheck, openPnlOf, ENTRY_UNTIL, MIN, PREP_BARS } from '../shared/engine.js'
import { openLive as openLiveSafe, closeOurs, closePart, ensureIsolated, checkStop, LiveSkip } from './live.js'
import { getCapital, applyTrade, checkLimits, markHalted, markDayStop } from './capital.js'
import { adapter, adapterOf, liveAllowedEx, pairFor } from './exchanges/index.js'
import { EX_LIST, DEFAULT_EX, acctKey, exOf, isLive, acctName, acctUrl, exSuffix, prepDay, exName } from '../shared/venues.js'
import { todayIndex, INDEX_READY_MIN } from './mindex.js'
import { db, q, getMeta, setMeta } from './db.js'
import { notifyTrades } from './push.js'
import { ny, OPEN_MIN } from './session.js'
import { operable, keepOperable, markNotOperable, isApiReject, RECHECK_DAYS } from './operable.js'
import { provaEntry, provaExit, loadLiveSlip, CANDLE_EXITS } from './pslip.js'
import { entryRec, exitRec, trackBar, trackPx, saveEvents, sigEv, histSnap, daySnapshot } from './record.js'

// ordini veri: LIVE_TRADING=on e le chiavi di quell'exchange (senza argomento: Bitunix, come prima)
export const liveAllowed = (ex = DEFAULT_EX) => liveAllowedEx(ex)

const fmt = p => (p >= 1000 ? p.toFixed(1) : p >= 100 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toPrecision(4))
const sgn = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
const modeName = m => acctName(m) // "Reale Bitunix", "Prova Bitget"…

// Colonne aggiunte con la migrazione della liquidazione: se schema.sql non è ancora stato rilanciato si salva senza
const NEW_COLS = ['liq_price', 'entry_bar', 'funding', 'half_done', 'half_px', 'half_qty', 'np_done']
const missingCol = e => /column|schema cache/i.test(e?.message || '') && NEW_COLS.some(c => (e.message || '').includes(c))
const strip = o => Object.fromEntries(Object.entries(o).filter(([k]) => !NEW_COLS.includes(k)))
async function updatePos(id, patch) {
  try { await q(db().from('wt_positions').update(patch).eq('id', id)) }
  catch (e) { if (!missingCol(e)) throw e; await q(db().from('wt_positions').update(strip(patch)).eq('id', id)) }
}
// Le colonne nuove esistono? (senza, "Metà subito" non si può ricordare tra un controllo e l'altro)
let colsOk = null
async function newColsOk() {
  if (colsOk === null) colsOk = await db().from('wt_positions').select('half_done, np_done, liq_price, entry_bar').limit(1).then(r => !r.error, () => false)
  return colsOk
}
async function insertPos(pos) {
  try { return await q(db().from('wt_positions').insert(pos).select()) }
  catch (e) { if (!missingCol(e)) throw e; return q(db().from('wt_positions').insert(strip(pos)).select()) }
}

// ---------- Preparazione del giorno (livelli, volatilità, volume normale) ----------
// Ogni exchange ha la sua preparazione, dalle sue candele (wt_prep con giorno = prepDay: "2026-11-18" per Bitunix,
// "2026-11-18@bitget" per Bitget).
async function prepSymbol(sym, today, ex = DEFAULT_EX) {
  const a = adapter(ex)
  const bars = await a.klinesBack(a.perpOf(sym), '15m', PREP_BARS) // ~13 giorni di candele da 15 min
  const prep = prepFromBars(bars, today)
  // volume normale minuto per minuto dalle 9:30 alle 10:05 (10 giorni precedenti: archivio da 1 minuto per Bitunix, API per gli altri)
  if (prep.ok) {
    try { prep.minVol = minuteNormals(await a.prevDays(sym, today, 10)) } catch { prep.minVol = null }
  }
  return prep
}

async function prepare(symbols, today, urgent, ex = DEFAULT_EX) {
  const day = prepDay(ex, today)
  const have = await q(db().from('wt_prep').select('symbol').eq('day', day))
  const done = new Set(have.map(r => r.symbol))
  const todo = symbols.filter(s => !done.has(s)).slice(0, urgent ? 8 : 4)
  const rows = []
  for (const sym of todo) {
    try { rows.push({ day, symbol: sym, data: await prepSymbol(sym, today, ex), created_at: Date.now() }) }
    catch (e) { rows.push({ day, symbol: sym, data: { ok: false, why: e.message }, created_at: Date.now() }) }
  }
  if (rows.length) await q(db().from('wt_prep').upsert(rows))
  return { prepared: todo.length, missing: symbols.length - done.size - todo.length }
}

// ---------- Exchange: apertura e chiusura vere (regole di sicurezza in server/live.js, chiamate nell'adattatore) ----------
// positionId delle posizioni Reali della strategia ancora aperte in quel conto
const ourLiveIds = async mode => new Set((await q(db().from('wt_positions').select('exchange').eq('mode', mode).eq('status', 'open'))).map(r => r.exchange?.positionId).filter(Boolean).map(String))

async function closeLive(p, fallbackPrice) {
  const a = adapterOf(p.mode), perp = a.perpOf(p.symbol)
  const positionId = p.exchange?.positionId
  // senza positionId la posizione non è riconoscibile con certezza: non si tocca niente sull'exchange
  if (!positionId) throw new Error(`posizione ${a.name} non identificata: controlla e chiudi a mano`)
  const ourQty = p.qty - (p.half_done && p.half_qty > 0 ? p.half_qty : 0)
  const pair = await pairFor(a.id, p.symbol)
  const r = await closeOurs(a.api, { perp, positionId, side: p.side, qty: ourQty, step: pair?.step })
  if (r.gone) return { closedByExchange: true, price: p.init_stop } // già chiusa dall'exchange (stop loss o liquidazione)
  // lo stop loss di questa posizione non serve più (se la posizione è chiusa l'exchange lo toglie da solo)
  if (p.exchange?.slOrderId) await a.api.cancelStopLoss({ symbol: perp, orderId: p.exchange.slOrderId }).catch(() => {})
  return { closedByExchange: false, price: fallbackPrice }
}

// Chiusura di metà posizione a mercato ("Metà subito"), solo sulla posizione della strategia; poi lo stop su Bitunix
// passa al prezzo d'entrata e alla quantità rimasta.
async function closeHalfLive(p) {
  const a = adapterOf(p.mode), perp = a.perpOf(p.symbol)
  if (!p.exchange?.positionId) throw new Error(`posizione ${a.name} non identificata`)
  const pair = await pairFor(a.id, p.symbol)
  const qty = a.roundQty(p.qty / 2, pair?.basePrecision ?? 3)
  if (!(qty > 0) || qty < (pair?.minQty || 0)) throw new Error('metà posizione sotto la quantità minima')
  const r = await closePart(a.api, { perp, positionId: p.exchange.positionId, side: p.side, qty })
  if (!r.left) throw new Error('la posizione risulta chiusa per intero')
  if (p.exchange?.slOrderId) {
    const sl = pair?.quotePrecision !== null && pair?.quotePrecision !== undefined ? Number(p.entry.toFixed(pair.quotePrecision)) : Number(p.entry.toPrecision(6))
    await a.api.modifyStopLoss({ orderId: p.exchange.slOrderId, slPrice: sl, qty: p.qty - r.closed, symbol: perp }).catch(() => {})
  }
  return { qty: r.closed }
}

// Dati veri della posizione chiusa sull'exchange (prezzo, commissioni, funding, liquidazione), se l'API li fornisce
async function liveClosed(p) {
  if (!p.exchange?.positionId) return null
  const a = adapterOf(p.mode)
  for (let i = 0; i < 3; i++) {
    const h = await a.positionHistory(a.perpOf(p.symbol), p.exchange?.positionId).catch(() => null)
    if (h) return h
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}

// ---------- Chiusura (comune) ----------
async function closePos(p, exit, reason, accounts, notes, { liq = false, level = null, sig = null } = {}) {
  const acc = accounts[p.mode]
  const s = settingsFor(p.mode, acc.settings)
  const live = isLive(p.mode), X = exName(exOf(p.mode))
  let note = null, real = null
  const sigOut = level ?? exit // livello d'uscita (stop, livello che segue, chiusura della candela): per lo slittamento
  const reasonIn = reason
  let exchangeClosed = false
  const tSent = Date.now() // solo registrazione: quando parte la chiusura (sig.at = quando è stata decisa)
  let tDone = null
  if (live) {
    try {
      const r = await closeLive(p, exit)
      tDone = Date.now()
      real = await liveClosed(p)
      if (r.closedByExchange) {
        // chiusa dall'exchange: stop loss di sicurezza oppure liquidazione
        exit = real?.closePrice ?? r.price
        liq = !!(real?.liqQty > 0) || (!!p.liq_price && (p.side > 0 ? exit <= p.liq_price * 1.001 : exit >= p.liq_price * 0.999))
        reason = liq ? 'liquidazione' : `stop loss (${X})`
        exchangeClosed = true
      } else {
        liq = false // chiusa da noi a mercato prima della liquidazione
        if (real?.closePrice) exit = real.closePrice
      }
    } catch (e) { note = `chiusura su ${X} non riuscita: ${e.message}`; reason = `${reason} · da verificare` }
  }
  const fee = live ? adapterOf(p.mode).takerFee : s.fee
  let { pnl, fees } = pnlOf(p, exit, fee, { liq })
  let funding = null
  if (real) {
    // Reale: commissioni e funding veri dell'exchange (funding con segno: negativo = pagato)
    if (real.fee !== null) fees = Math.abs(real.fee)
    funding = real.funding
    const gross = pnlOf(p, exit, 0, { liq }).gross // comprende la metà già chiusa con "Metà subito"
    pnl = gross - fees + (funding || 0)
  }
  // Reale: prezzi del segnale e prezzi eseguiti sull'exchange, commissioni vere (slittamento per lato)
  let exchange = live && p.exchange ? {
    ...p.exchange,
    slip: { ...(p.exchange.slip || {}), sigOut: exchangeClosed ? (p.exchange.sl ?? p.init_stop) : sigOut, fillOut: real?.closePrice ?? null, fee: real?.fee ?? null, funding: real?.funding ?? null, byExchange: exchangeClosed },
  } : null
  // registrazione dell'uscita (Prova e Reale): motivo, livello e ora del segnale, invio, prezzo eseguito
  if (p.exchange?.rec) try {
    const rec = { ...p.exchange.rec, exits: [...(p.exchange.rec.exits || [])] }
    rec.exits.push(exitRec(p, {
      reason, level: exchangeClosed ? (p.exchange.sl ?? p.init_stop) : sigOut, sigAt: exchangeClosed ? null : (sig?.at ?? tSent), bar: sig?.bar ?? null,
      sentAt: exchangeClosed ? null : tSent, doneAt: tDone, fillPx: live ? (real?.closePrice ?? null) : exit,
      fillAt: live ? null : tSent, qty: p.qty - (p.half_done && p.half_qty > 0 ? p.half_qty : 0), byExchange: exchangeClosed,
    }))
    // prezzo letto nel controllo che ha deciso l'uscita (misura dello slittamento per la Prova) e, in Prova, il modello usato
    if (sig?.px > 0) rec.exits.at(-1).readPx = sig.px
    if (sig?.rank !== undefined) rec.exits.at(-1).rank = sig.rank
    if (sig?.prova) rec.exits.at(-1).prova = sig.prova
    if (reasonIn !== reason) rec.exits.at(-1).asked = reasonIn
    if (live && real?.raw) rec.hist = histSnap(real.raw)
    exchange = { ...(exchange || p.exchange), rec }
  } catch { /* solo registrazione: la chiusura si salva comunque */ }
  await updatePos(p.id, {
    status: 'closed', exit, reason, pnl, fees, closed_at: Date.now(), best: p.best, last_bar: p.last_bar, ...(exchange ? { exchange } : {}),
    init_stop: p.init_stop, halved: p.halved, stale_done: p.stale_done, confirmed: p.confirmed, volx: p.volx,
    half_done: !!p.half_done, half_px: p.half_px ?? null, half_qty: p.half_qty ?? null, np_done: !!p.np_done,
    ...(funding !== null ? { funding } : {}), ...(note ? { note } : {}),
  })
  if (!live) {
    const fresh = await q(db().from('wt_accounts').select('balance').eq('mode', p.mode).single())
    await q(db().from('wt_accounts').update({ balance: fresh.balance + pnl }).eq('mode', p.mode))
  }
  // capitale dedicato: si aggiorna con il risultato vero del trade; perdita massima totale superata → strategia ferma
  if (s.capitalMode === 'dedicated') {
    const st = await applyTrade(p.mode, pnl)
    const lim = checkLimits(st, s, 0, p.day)
    if (lim.total && lim.fresh) await haltAccount(p.mode, lim.why, notes)
  }
  const pct = pnl / (p.entry * p.qty) * 100
  notes.push({
    title: `${pnl >= 0 ? '✓' : '✗'} ${p.symbol} chiuso ${sgn(pnl)} USDT (${sgn(pct)}%)`,
    body: `${p.side > 0 ? 'Long' : 'Short'} · uscita ${fmt(exit)} · ${reason} · ${modeName(p.mode)}${note ? ' · ' + note : ''}`,
    url: acctUrl(p.mode), tag: `pos-${p.id}-close`,
  })
}

// Perdita massima totale: la strategia si ferma (conto disattivato) finché non la riavvii tu
async function haltAccount(mode, why, notes) {
  await markHalted(mode, why)
  await q(db().from('wt_accounts').update({ enabled: false, updated_at: Date.now() }).eq('mode', mode))
  notes.push({ title: `⛔ Strategia ${modeName(mode)} fermata`, body: `${why}. Le posizioni aperte vengono comunque gestite fino alla chiusura. Riavviala tu dalla pagina Strategia.`, url: acctUrl(mode), tag: `halt-${mode}` })
}

// ---------- Freno di mercato ----------
// Per ogni modalità con il freno attivo: perdita di oggi = trade chiusi + posizioni aperte al prezzo attuale, in % del capitale
// di inizio giornata (capitale dedicato, altrimenti quello usato dal primo trade di oggi). Superata la soglia: chiude subito
// tutte le posizioni della strategia di quella modalità, niente nuovi trade fino a domani, notifica.
// Stato del giorno in wt_meta `brake:<giorno>` (Bitunix) o `brake:<exchange>:<giorno>`, per conto.
export const brakeKey = (ex, day) => `brake${exSuffix(ex)}:${day}`
async function brakeCheck(ctx, accRows) {
  const { today, series, lastPrice, accounts, notes } = ctx
  const key = brakeKey(ctx.ex, today)
  const state = (await getMeta(key)) || {}
  const out = Object.fromEntries(accRows.map(a => [a.mode, !!state[a.mode]]))
  const modes = accRows.map(a => ({ mode: a.mode, s: settingsFor(a.mode, a.settings) })).filter(x => x.s.brakePct > 0 && !out[x.mode])
  if (!modes.length) return out
  const dayPos = await q(db().from('wt_positions').select('*').eq('day', today).in('mode', modes.map(x => x.mode)))
  let changed = false
  for (const { mode, s } of modes) {
    const mine = dayPos.filter(p => p.mode === mode)
    if (!mine.length) continue
    const dayPnl = mine.filter(p => p.status === 'closed').reduce((a, p) => a + (p.pnl || 0), 0)
    const open = mine.filter(p => p.status === 'open')
    const pxOf = p => series[p.symbol]?.['1m']?.at(-1)?.c ?? lastPrice[p.symbol] ?? null
    const openPnl = open.reduce((a, p) => { const px = pxOf(p); return a + (px ? openPnlOf(p, px) : 0) }, 0)
    let dayRef = mine.slice().sort((a, b) => a.opened_at - b.opened_at)[0]?.capital ?? null
    if (s.capitalMode === 'dedicated') { const st = await getCapital(mode); if (st) dayRef = st.current - dayPnl }
    if (!lossCheck(s, { dayRef, dayPnl, openPnl }).brake) continue
    const loss = dayPnl + openPnl
    let rank = 0
    for (const p of open) {
      const px = pxOf(p)
      if (!px) continue
      // Prova: prezzo letto meno lo slittamento misurato nel Reale, che cresce con l'ordine di chiusura (il Reale le chiude una dopo l'altra)
      const pv = !isLive(mode) ? provaExit(ctx.pslip, 'freno', px, p.side, rank) : null
      await closePos(p, pv ? pv.px : px, 'freno di mercato', accounts, notes, { level: px, sig: { at: Date.now(), px, rank, ...(pv ? { prova: { kind: pv.kind, cost: pv.cost } } : {}) } }).catch(() => {})
      rank++
    }
    state[mode] = { at: Date.now(), loss, pct: dayRef ? loss / dayRef * 100 : null }
    out[mode] = true; changed = true
    notes.push({ title: `🛑 Freno di mercato: ${modeName(mode)}`, body: `Perdita del giorno ${loss.toFixed(2)} USDT (${(loss / dayRef * 100).toFixed(1)}%, soglia ${s.brakePct}%): chiuse ${open.length} posizioni, niente nuovi trade fino a domani.`, url: acctUrl(mode), tag: `brake-${mode}-${today}` })
  }
  if (changed) await setMeta(key, state)
  return out
}

// ---------- Gestione delle posizioni aperte ----------
async function manage(p, ctx) {
  const { series, today, nowMin, closeMin, accounts, preps, notes, lastPrice } = ctx
  const s = settingsFor(p.mode, accounts[p.mode].settings)
  const all = (series[p.symbol]?.['1m'] || []).map(b => ({ ...b, ...ny(b.t) }))
  const todayBars = all.filter(b => b.date === p.day && b.min >= OPEN_MIN)
  const now = Date.now()
  const last = all[all.length - 1]
  const px = last?.c ?? lastPrice[p.symbol]

  // posizione rimasta aperta da un giorno precedente (es. controllo saltato): chiudi subito
  if (p.day < today) { if (px) await closePos(p, px, 'chiusura', accounts, notes); return }

  let exit = null, reason = null, liq = false, level = null, sig = null
  const halfBefore = !!p.half_done, stopBefore = p.init_stop, halvedBefore = !!p.halved
  // registrazione: massimo e minimo toccati (solo dati, non cambia niente nelle regole)
  const rec = p.exchange?.rec ? (p.exchange.rec = { ...p.exchange.rec, mx: { ...p.exchange.rec.mx } }) : null
  let recCh = false
  for (const b of todayBars) {
    if (b.t <= (p.last_bar ?? 0) || b.t + MIN > now) continue // solo candele chiuse e non ancora controllate
    if (rec) recCh = trackBar(rec, p, b) || recCh
    const r = stepBar(p, s, b, todayBars, preps[p.symbol])
    if (r) { exit = r.exit; reason = r.reason; liq = !!r.liq; sig = { at: b.t + MIN, bar: b.t, px, viaBar: true }; break }
  }
  if (rec && exit === null && px) recCh = trackPx(rec, px, now) || recCh
  // controllo in tempo reale sul prezzo attuale (candela ancora in corso)
  if (exit === null && px) {
    const lvl = exitLevel(p, s)
    if (p.liq_price && (p.side > 0 ? px <= p.liq_price : px >= p.liq_price)) { exit = p.liq_price; reason = 'liquidazione'; liq = true; sig = { at: now, px } }
    else if (p.side > 0 ? px <= lvl : px >= lvl) { exit = px; reason = exitReason(p, lvl); level = lvl; sig = { at: now, px } }
  }
  // fine giornata: chiudi tutto un minuto prima della chiusura della borsa
  if (exit === null && nowMin >= closeMin - 1 && px) { exit = px; reason = 'chiusura'; sig = { at: now, px } }

  // "Metà subito" appena scattata: nel Reale chiude davvero metà posizione sull'exchange
  if (!halfBefore && p.half_done && !(await newColsOk())) {
    // schema.sql non ancora rilanciato: la metà non si può salvare, quindi non si chiude niente
    p.half_done = false; p.half_qty = null; p.half_px = null
    if (!!p.halved === halvedBefore) p.init_stop = stopBefore
  }
  if (!halfBefore && p.half_done) {
    let msg = `metà chiusa a ${fmt(p.half_px)}, stop al prezzo d'entrata`
    const halfLevel = p.half_px, tHalf = Date.now()
    let tHalfDone = null
    if (isLive(p.mode)) {
      const X = exName(exOf(p.mode))
      try {
        const r = await closeHalfLive(p)
        tHalfDone = Date.now()
        p.half_qty = r.qty
        if (px) p.half_px = px
        msg = `metà chiusa a ${fmt(p.half_px)} su ${X}, stop al prezzo d'entrata`
      } catch (e) {
        p.half_qty = 0 // la posizione resta intera; lo stop resta comunque al prezzo d'entrata
        msg = `metà non chiusa su ${X} (${e.message}), stop al prezzo d'entrata`
      }
    }
    // registrazione della metà: livello del motore, invio, prezzo letto (quello eseguito vero arriva la sera dallo storico dell'exchange)
    const lv = isLive(p.mode)
    if (rec) try {
      rec.exits = [...(rec.exits || []), exitRec(p, { kind: 'metà', reason: 'metà subito', level: halfLevel, sigAt: tHalf, sentAt: lv ? tHalf : null, doneAt: tHalfDone, fillPx: lv ? (p.half_qty > 0 ? px : null) : halfLevel, fillAt: lv ? null : tHalf, qty: p.half_qty ?? p.qty / 2 })]
      recCh = true
    } catch { /* solo registrazione */ }
    notes.push({ title: `½ ${p.symbol}: ${msg}`, body: modeName(p.mode), url: acctUrl(p.mode), tag: `pos-${p.id}-half` })
  }

  // Prova più vicina al Reale (docs/be-e-prova-realistica.md): le uscite decise dall'app si registrano al prezzo letto in questo
  // controllo meno lo slittamento misurato nel Reale dello stesso exchange per quel tipo; lo stop sull'exchange (livello = stop
  // iniziale) e la liquidazione restano come sono. Il livello del motore resta in exchange.rec.
  if (exit !== null && !isLive(p.mode) && !liq && px > 0) {
    const exchangeStop = !CANDLE_EXITS.has(reason) && reason !== 'chiusura' && Math.abs(exitLevel(p, s) - p.init_stop) <= Math.abs(p.entry) * 1e-9
    const kind = reason === 'chiusura' ? 'chiusura' : CANDLE_EXITS.has(reason) ? 'candela' : exchangeStop ? null : 'segue'
    if (kind) {
      const pv = provaExit(ctx.pslip, kind, px, p.side)
      level = level ?? exit
      exit = pv.px
      sig = { ...(sig || { at: now, px }), prova: { kind, cost: pv.cost } }
    }
  }
  if (exit !== null) return closePos(p, exit, reason, accounts, notes, { liq, level, sig })
  await updatePos(p.id, {
    best: p.best, last_bar: p.last_bar, init_stop: p.init_stop, halved: p.halved, stale_done: p.stale_done, confirmed: p.confirmed, volx: p.volx,
    half_done: !!p.half_done, half_px: p.half_px ?? null, half_qty: p.half_qty ?? null, np_done: !!p.np_done,
    ...(rec && recCh ? { exchange: p.exchange } : {}),
  })
}

// ---------- Reale: stop su Bitunix verificato ogni minuto ----------
// Bitunix dice che TP/SL sui titoli TradFi possono non esserci o cambiare senza preavviso. Finché una posizione del Reale è
// aperta, ogni minuto si controlla che il suo stop sia ancora su Bitunix (solo quel positionId). Se manca si rimette (stesso
// prezzo: lo stop iniziale, oppure il prezzo d'entrata dopo «Metà subito»; quantità della strategia). Se non si riesce, o se
// manca di nuovo subito dopo averlo rimesso, si applica la regola dell'apertura: posizione chiusa, titolo non operabile per
// RECHECK_DAYS giorni, notifica. Ogni controllo resta in exchange.slCheck. Non cambia stop, uscite o regole della strategia.
const UNKNOWN_ALERT = 3 // minuti di fila senza poter leggere Bitunix → notifica (nessuna azione)
async function stopWatch(ctx, log) {
  const ex = ctx.ex, a = adapter(ex), mode = acctKey('live', ex), X = a.name
  if (!liveAllowed(ex)) return
  const rows = await q(db().from('wt_positions').select('*').eq('mode', mode).eq('status', 'open'))
  const list = rows.filter(p => p.exchange?.positionId && p.day === ctx.today)
  if (!list.length) return
  const res = await Promise.all(list.map(async p => {
    const perp = a.perpOf(p.symbol)
    const pair = await pairFor(ex, p.symbol)
    const qp = pair?.quotePrecision
    const rnd = x => (qp !== null && qp !== undefined ? Number(x.toFixed(qp)) : Number(x.toPrecision(6)))
    const half = p.half_done && p.half_qty > 0
    const slPrice = rnd(half ? p.entry : (p.exchange.sl ?? p.init_stop))
    const qty = p.qty - (half ? p.half_qty : 0)
    const prev = p.exchange.slCheck || {}
    let r
    try { r = await checkStop(a.api, { perp, positionId: p.exchange.positionId, slPrice, qty, replacedBefore: prev.state === 'replaced' }) } catch (e) { r = { state: 'unknown', why: e.message } }
    return { p, r, prev, slPrice, qty }
  }))
  for (const { p, r, prev, slPrice, qty } of res) {
    const now = Date.now()
    const c = {
      first: prev.first ?? now, at: now, n: (prev.n || 0) + 1, state: r.state, ok: (prev.ok || 0) + (r.state === 'ok' ? 1 : 0),
      unknown: (prev.unknown || 0) + (r.state === 'unknown' ? 1 : 0), unknownRun: r.state === 'unknown' ? (prev.unknownRun || 0) + 1 : 0,
      ...(r.price ? { price: r.price } : {}), ...(r.why ? { why: r.why } : {}),
      missing: [...(prev.missing || []), ...(r.state === 'replaced' || r.state === 'failed' ? [{ at: now, state: r.state, id: r.id ?? null, price: slPrice, qty, why: r.why ?? null }] : [])].slice(-10),
    }
    if (r.state === 'replaced' || r.state === 'failed') (log.stopWatch ||= []).push(`${p.symbol}: ${r.state}${r.why ? ` (${r.why})` : ''}`)
    if (r.state === 'gone') continue // la posizione è già chiusa sull'exchange: la registra il controllo delle uscite
    p.exchange = { ...p.exchange, slCheck: c, ...(r.state === 'replaced' && r.id ? { slOrderId: r.id } : {}) }
    if (r.state === 'failed') {
      // regola dell'apertura: mai posizioni senza stop sull'exchange → chiusura della sola posizione della strategia
      const px = ctx.series[p.symbol]?.['1m']?.at(-1)?.c ?? ctx.lastPrice[p.symbol] ?? p.entry
      try { await closePos(p, px, `stop mancante su ${X}`, ctx.accounts, ctx.notes) } catch (e) { (log.errors ||= []).push(`${p.symbol} stop: ${e.message}`) }
      await markNotOperable(p.symbol, 'stop', r.why, Date.now(), ex).catch(() => false)
      ctx.notes.push({ title: `⚠ ${p.symbol}: stop sparito su ${X}`, body: `Lo stop della posizione non c'era più e non sono riuscito a rimetterlo (${r.why}). Posizione chiusa; titolo escluso per ${RECHECK_DAYS} giorni (Prova e Reale ${X}). ${modeName(mode)}`, url: acctUrl(mode), tag: `sl-${p.id}` })
      continue
    }
    if (c.unknownRun === UNKNOWN_ALERT) ctx.notes.push({ title: `⚠ ${p.symbol}: stop non verificabile`, body: `Da ${UNKNOWN_ALERT} minuti non riesco a leggere da ${X} lo stop della posizione (${r.why}). Controlla su ${X}. ${modeName(mode)}`, url: acctUrl(mode), tag: `slr-${p.id}` })
    await updatePos(p.id, { exchange: p.exchange })
  }
}

// Verifica a posteriori (referto docs/stop-bitunix.md): storico TP/SL di Bitunix dei trade chiusi del Reale, salvato una volta
// in exchange.slAudit. Solo lettura su Bitunix; lontano dalle entrate.
export async function auditStops({ from = '2026-11-09', max = 12 } = {}) {
  const bx = adapter('bitunix')
  if (!bx.hasKeys()) return { skipped: 'chiavi' }
  const rows = await q(db().from('wt_positions').select('id, symbol, day, opened_at, closed_at, exchange').eq('mode', 'live').eq('status', 'closed').gte('day', from).order('opened_at'))
  const todo = rows.filter(p => p.exchange?.positionId && !p.exchange.slAudit).slice(0, max)
  let done = 0
  for (const p of todo) {
    const fresh = (await q(db().from('wt_positions').select('exchange').eq('id', p.id)))[0]?.exchange
    if (!fresh || fresh.slAudit) continue
    let audit
    try {
      const list = await bx.tpslHistory(bx.perpOf(p.symbol), { positionId: fresh.positionId, startTime: (p.opened_at || 0) - 120000, endTime: (p.closed_at || Date.now()) + 600000 })
      audit = { at: Date.now(), orders: list.slice(0, 20) }
    } catch (e) { audit = { at: Date.now(), error: e.message.slice(0, 200) } }
    await updatePos(p.id, { exchange: { ...fresh, slAudit: audit } })
    done++
  }
  return { done, left: rows.filter(p => p.exchange?.positionId && !p.exchange.slAudit).length - done }
}

// ---------- Entrate ----------
// Diviso in pezzi usati sia dal controllo ogni minuto (entries) sia dal controllo veloce dell'apertura (server/fast.js):
// entryEnv = stato comune di un giro (titoli scartati, limiti Bitunix, saldo), accountGate = controlli del conto
// (freno, limiti di perdita, capitale dedicato, indice), openSignal = apertura di un segnale con tutte le regole.

// Prenotazione di un titolo per oggi in una modalità: una riga in wt_meta (chiave primaria), quindi un secondo
// tentativo, anche da un altro processo, fallisce. Serve a non aprire mai due volte lo stesso titolo.
export async function claimSymbol(mode, day, sym, by) {
  const { error } = await db().from('wt_meta').insert({ key: `claim:${mode}:${day}:${sym}`, value: { by, at: Date.now() } })
  return !error
}

// Titoli scartati di oggi, per conto: wt_meta `orbskip:<giorno>` (Bitunix) o `orbskip:<exchange>:<giorno>`
export const skipKey = (ex, day) => `orbskip${exSuffix(ex)}:${day}`
// Un ambiente per exchange (ex): saldo, posizioni della strategia, limiti (leva massima, scaglioni) di quell'exchange
export async function entryEnv(ctx, ex = ctx.ex || DEFAULT_EX) {
  const { today } = ctx
  let limits = null
  const env = {
    ex,
    skipKey: skipKey(ex, today),
    skips: (await getMeta(skipKey(ex, today))) || {},
    changed: false,
    liveBalance: null, liveIds: null,
    lim: async sym => { if (!limits) limits = await adapter(ex).limits().catch(() => ({})); return limits[sym] || null },
  }
  // ev = dati del segnale (ora, prezzo, soglia, lato), se lo scarto riguarda un segnale vero: solo registrazione (wt_meta sig:...)
  env.events = []
  env.skip = (mode, sym, why, ev = null) => { (env.skips[mode] ||= {})[sym] = why; env.changed = true; env.events.push({ mode, sym, kind: 'scartato', why, seenAt: Date.now(), ...(ev || {}) }) }
  env.note = (mode, sym, kind, ev = null) => { env.events.push({ mode, sym, kind, seenAt: Date.now(), ...(ev || {}) }) }
  env.save = async () => {
    if (env.changed) { await setMeta(env.skipKey, env.skips); env.changed = false }
    if (env.events.length) { const ev = env.events; env.events = []; await saveEvents(today, ev).catch(() => {}) }
  }
  return env
}

// Controlli del conto prima di cercare segnali. Restituisce null se oggi non si apre niente (i titoli sono già segnati
// come scartati), altrimenti { s, mode, taken, ded, rule }.
export async function accountGate(env, ctx, acc, dayPos) {
  const { today, notes } = ctx
  const s = acc.s, mode = acc.mode
  if (isLive(mode) && !liveAllowed(exOf(mode))) return null
  const taken = dayPos.filter(p => p.mode === mode)
  const skipAll = why => { for (const sym of s.symbols) if (!taken.some(p => p.symbol === sym) && !env.skips[mode]?.[sym]) env.skip(mode, sym, why) }
  // freno di mercato già scattato oggi: niente nuovi trade fino a domani
  if (ctx.braked?.[mode]) { skipAll('freno di mercato: niente nuovi trade fino a domani'); return null }
  const dayPnl = taken.filter(p => p.status === 'closed').reduce((a, p) => a + (p.pnl || 0), 0)
  let ded = null
  if (s.capitalMode !== 'dedicated') {
    // senza capitale dedicato: limite giornaliero sul capitale usato dal primo trade di oggi (la perdita totale vale solo con il capitale dedicato)
    const dayRef = taken.slice().sort((a, b) => a.opened_at - b.opened_at)[0]?.capital ?? null
    if (dayRef && lossCheck(s, { dayRef, dayPnl }).dayStop) {
      const k = `daystop:${mode}:${today}`
      if (!(await getMeta(k))) {
        await setMeta(k, { at: Date.now() })
        notes.push({ title: `⏸ ${modeName(mode)}: niente nuovi trade fino a domani`, body: `perdita massima giornaliera superata: ${dayPnl.toFixed(2)} USDT oggi (limite ${s.maxDayLoss}% di ${dayRef.toFixed(2)})`, url: acctUrl(mode), tag: `daystop-${mode}-${today}` })
      }
      skipAll('perdita massima giornaliera superata')
      return null
    }
  } else {
    // capitale dedicato e limiti di perdita (in % del capitale dedicato)
    ded = await getCapital(mode)
    if (!ded || !(ded.current > 0)) { skipAll('capitale dedicato non impostato'); return null }
    const lim = checkLimits(ded, s, dayPnl, today)
    if (!lim.ok) {
      if (lim.total && lim.fresh) await haltAccount(mode, lim.why, notes)
      if (lim.day && lim.fresh) {
        await markDayStop(mode, today)
        notes.push({ title: `⏸ ${modeName(mode)}: niente nuovi trade fino a domani`, body: lim.why, url: acctUrl(mode), tag: `daystop-${mode}-${today}` })
      }
      skipAll(lim.total ? 'strategia fermata: perdita massima totale' : 'perdita massima giornaliera superata')
      return null
    }
  }
  // indice di attività del mercato: con la regola attiva si aspetta le 9:35
  if (s.idxMode !== 'off' && ctx.nowMin < INDEX_READY_MIN) return null
  const rule = indexRule(s, ctx.mindex?.idx ?? null)
  if (!rule.ok) { skipAll(rule.why); return null }
  return { s, mode, taken, ded, rule, acc }
}

// Apertura di un segnale con tutte le regole (posti liberi, capitale, leva massima, liquidazione, prenotazione del titolo,
// nel Reale ordine vero con le regole di server/live.js). timing = { src: 'veloce' | 'minuto', signalAt, sigPx }.
// price = prezzo attuale (per la quantità dell'ordine nel Reale). Restituisce la posizione salvata o null.
export async function openSignal(env, ctx, gate, dayPos, { sym, sig, prep, price, timing }) {
  const { today, notes, accounts } = ctx
  const { s, mode, taken, ded, rule, acc } = gate
  const live = isLive(mode), ex = exOf(mode), a = adapter(ex), X = a.name
  const now = Date.now()
  // registrazione: ogni scarto di questo segnale resta con ora, prezzo, soglia e lato (wt_meta sig:...)
  const ev = sigEv(sig, timing)
  const skip = why => env.skip(mode, sym, why, ev)
  if (taken.some(p => p.symbol === sym)) return null
  if (rule.maxPos > 0 && taken.length >= rule.maxPos) { skip('limite posizioni al giorno'); return null }
  const { k, side } = sig
  // nel Reale si entra solo se il segnale è appena scattato (niente entrate in ritardo a prezzi peggiori)
  if (live && now - (k.t + MIN) > 2 * MIN) { skip('segnale scattato mentre il controllo era fermo'); return null }

  let base = acc.balance
  if (live) {
    // nel Reale: con il capitale dedicato mai più del saldo DISPONIBILE sull'exchange
    if (env.liveBalance === null) env.liveBalance = await a.account().catch(() => null)
    base = s.capitalMode === 'dedicated' ? (env.liveBalance?.available ?? 0) : (env.liveBalance?.equity ?? 0)
  }
  const { capital, margin, notional } = sizing(s, base, ded ? ded.current : undefined)
  if (!(margin >= 1)) { skip('capitale insufficiente'); return null }
  if (live && env.liveBalance && margin > env.liveBalance.available) { skip(`saldo disponibile su ${X} insufficiente`); return null }
  const unit = prep.unit
  // margine di mantenimento e leva massima dell'exchange per questo titolo e questo valore della posizione
  const risk = riskFor(await env.lim(sym), notional, s)
  if (live && risk.maxLev && s.leverage > risk.maxLev) { skip(`leva ${s.leverage}x oltre il massimo ${X} (${risk.maxLev}x)`); return null }
  let pos = newPosition({ mode, day: today, symbol: sym, sig, s, prep, size: { capital, margin, notional }, risk })
  // stop loss oltre il prezzo di liquidazione: non si apre (nel Reale sempre)
  if ((live || s.liqGuard) && liqBlocks(pos)) { skip('stop oltre la liquidazione'); return null }
  // prenotazione del titolo: se un altro controllo l'ha già preso (o lo sta aprendo) non si fa niente
  if (!(await claimSymbol(mode, today, sym, timing?.src || 'minuto'))) { env.note(mode, sym, 'già preso da un altro controllo', ev); return null }
  // level = soglia in cui scatta il segnale (minuto: è il prezzo d'entrata del segnale; veloce: apertura ± soglia)
  const tm = { src: timing?.src || 'minuto', signalAt: timing?.signalAt ?? now, sigPx: timing?.sigPx ?? sig.entry, level: timing?.level ?? sig.entry }
  if (live) {
    const pair = await pairFor(ex, sym)
    if (!pair) { skip(`perpetual non disponibile su ${X}`); return null }
    if (env.liveIds === null) env.liveIds = await ourLiveIds(mode)
    try {
      tm.orderAt = Date.now()
      const r = await openLiveSafe(a.api, { perp: a.perpOf(sym), pair, side, notional, price, leverage: s.leverage, stopDist: s.sl * unit, ourIds: env.liveIds, clientId: `${a.clientPrefix}${Date.now()}${sym}`.slice(0, 32) })
      if (r.unidentified) {
        skip(`ordine inviato ma posizione non riconosciuta (${r.why}): da controllare`)
        notes.push({ title: `⚠ ${sym}: controlla ${X}`, body: `Ordine ${r.orderId || ''} inviato ma la posizione non è riconoscibile con certezza (${r.why}). La strategia non la gestisce: controllala e chiudila a mano. ${modeName(mode)}`, url: acctUrl(mode), tag: `err-${sym}` })
        return null
      }
      tm.fillAt = r.exchange.fillAt ?? Date.now()
      pos = { ...pos, entry: r.entry, qty: r.qty, leverage: r.leverage, best: r.entry, init_stop: r.entry - side * s.sl * unit, opened_at: now,
        exchange: { ...r.exchange, slip: { sigIn: tm.level, sigPx: tm.sigPx, fillIn: r.entry }, timing: tm } }
      env.liveIds.add(String(r.exchange.positionId))
      // prezzo di liquidazione vero dell'exchange, altrimenti calcolato sul prezzo eseguito
      pos.liq_price = r.liqPrice || liqPriceOf(pos, risk.mmr, s.liqFee)
    } catch (e) {
      // posizione aperta e chiusa subito (stop rifiutato, margine non isolato): il costo vero va nel capitale dedicato
      if (e.closed) await immediateCost(sym, e.closed, today, notes, mode).catch(() => null)
      // l'exchange non accetta questo titolo via API (ordine o stop loss): segnato come non operabile, non si ritenta per qualche giorno
      if (e.noSl || isApiReject(e.message, ex)) {
        const kind = e.noSl ? 'stop' : 'ordini'
        const fresh = await markNotOperable(sym, kind, e.message, Date.now(), ex).catch(() => false)
        skip(`non operabile via API: ${kind === 'stop' ? 'stop loss non accettato' : 'ordine rifiutato'} (${e.message})`)
        if (fresh) notes.push({ title: `⚠ ${sym}: non operabile via API`, body: `${kind === 'stop' ? `${X} non accetta lo stop loss via API (posizione chiusa subito)` : `${X} rifiuta gli ordini via API`}. Non lo tento più per ${RECHECK_DAYS} giorni (Prova e Reale ${X}). ${modeName(mode)}`, url: acctUrl(mode), tag: `api-${sym}` })
        return null
      }
      if (e instanceof LiveSkip) {
        skip(e.message)
        if (e.notify) notes.push({ title: `⚠ ${sym}: trade non aperto`, body: `${e.message} · ${modeName(mode)}`, url: acctUrl(mode), tag: `err-${sym}` })
        return null
      }
      skip(`ordine non riuscito: ${e.message}`)
      notes.push({ title: `⚠ ${sym}: ordine non riuscito`, body: `${e.message} · ${modeName(mode)}`, url: acctUrl(mode), tag: `err-${sym}` })
      return null
    }
  } else {
    // Prova: eseguito subito al prezzo del segnale
    tm.orderAt = tm.fillAt = Date.now()
    // prezzo letto + slittamento d'entrata misurato nel Reale (docs/be-e-prova-realistica.md); stop e liquidazione dal prezzo
    // così ottenuto, come nel Reale dal prezzo eseguito. Le regole che guardano il prezzo d'entrata decidono su questo prezzo.
    const pv = tm.sigPx > 0 ? provaEntry(ctx.pslip, tm.src, tm.sigPx, side) : null
    if (pv) {
      pos = { ...pos, entry: pv.px, qty: notional / pv.px, best: pv.px, init_stop: pv.px - side * s.sl * unit }
      pos.liq_price = liqPriceOf(pos, risk.mmr, s.liqFee)
    }
    pos = { ...pos, exchange: { timing: tm, ...(pv ? { prova: { read: tm.sigPx, kind: pv.kind, cost: pv.cost } } : {}) } }
  }
  // registrazione dei dati d'entrata (mai bloccante: l'ordine nel Reale è già eseguito)
  try { pos.exchange = { ...(pos.exchange || {}), rec: entryRec({ pos, sig, prep, tm, gate, dayPos, ctx }) } } catch { /* senza registrazione */ }
  const [row] = await insertPos(pos)
  try { env.note(mode, sym, 'aperto', { ...ev, id: row.id, fillPx: pos.entry, fillAt: tm.fillAt }) } catch { /* solo registrazione */ }
  taken.push(row); dayPos.push(row)
  // Reale: se dopo l'esecuzione lo stop risulta oltre la liquidazione dell'exchange, chiudi subito
  if (live && stopPastLiq(pos)) {
    await closePos({ ...pos, ...row }, pos.entry, 'stop oltre la liquidazione', accounts, notes)
    skip('stop oltre la liquidazione (chiusa subito)')
    return null
  }
  notes.push({
    title: `${side > 0 ? '▲ LONG' : '▼ SHORT'} ${sym} a ${fmt(pos.entry)}`,
    body: `${sgn(pos.move_pct)}% dall'apertura · stop ${fmt(pos.init_stop)} · margine ${pos.margin.toFixed(0)} USDT × ${pos.leverage}x · ${modeName(mode)}${tm.src === 'veloce' ? ' · entrata veloce' : ''}`,
    url: acctUrl(mode), tag: `pos-${row.id}`,
  })
  return row
}

// Costo di una posizione del Reale aperta e chiusa subito (commissioni + slittamento, dallo storico dell'exchange):
// si conta nel capitale dedicato e resta nel registro del giorno (wt_meta closecost:<giorno>, closecost:<exchange>:<giorno>).
export const closecostKey = (ex, day) => `closecost${exSuffix(ex)}:${day}`
async function immediateCost(sym, c, today, notes, mode = 'live') {
  const a = adapterOf(mode), perp = a.perpOf(sym)
  let h = null
  for (let i = 0; i < 3 && !h; i++) { if (i) await new Promise(r => setTimeout(r, 600)); h = await a.positionHistory(perp, c.positionId).catch(() => null) }
  const exit = h?.closePrice ?? null
  const fee = h?.fee !== null && h?.fee !== undefined ? Math.abs(h.fee) : null
  // come closePos: risultato = (uscita − entrata) × quantità − commissioni vere (realizedPNL dell'exchange solo se manca il resto)
  const pnl = exit && fee !== null ? c.side * (exit - c.entry) * c.qty - fee : (h?.realizedPNL ?? null)
  const row = { symbol: sym, positionId: c.positionId, qty: c.qty, entry: c.entry, exit, fee, pnl, at: Date.now() }
  const k = closecostKey(a.id, today)
  await setMeta(k, [...((await getMeta(k)) || []), row])
  const s = settingsFor(mode, (await q(db().from('wt_accounts').select('settings').eq('mode', mode).single())).settings)
  if (pnl !== null && s.capitalMode === 'dedicated') await applyTrade(mode, pnl)
  if (pnl !== null) notes.push({ title: `${sym}: aperta e chiusa subito ${sgn(pnl)} USDT`, body: `costo contato nel capitale dedicato · ${modeName(mode)}`, url: acctUrl(mode), tag: `cost-${sym}` })
  return row
}

// Prova e Reale: solo i titoli operabili via API sul loro exchange (stessa lista per tutte e due, vedi server/operable.js)
export const onlyOperable = (list, op) => list.map(a => ({ ...a, s: { ...a.s, symbols: keepOperable(a.s.symbols, op) } }))

// Controllo ogni minuto: segnali dalle candele da 1 minuto chiuse. Le modalità seguite in quel momento dal controllo
// veloce dell'apertura (ctx.fastModes) qui non aprono niente.
async function entries(ctx, active, dayPos) {
  const { series, today, preps } = ctx
  const env = await entryEnv(ctx, ctx.ex)
  for (const acc of active) {
    if (ctx.fastModes?.includes(acc.mode)) continue
    const gate = await accountGate(env, ctx, acc, dayPos)
    if (!gate) continue
    const { s, mode, taken, rule } = gate
    // segnali di questo controllo: per minuto del segnale, poi secondo la regola di scelta tra segnali contemporanei
    const cands = []
    s.symbols.forEach((sym, idx) => {
      if (taken.some(p => p.symbol === sym) || env.skips[mode]?.[sym]) return
      const prep = preps[sym]
      if (!prep) return
      const bars = (series[sym]?.['1m'] || []).map(b => ({ ...b, ...ny(b.t) })).filter(b => b.date === today && b.min >= OPEN_MIN && b.min < entryUntil(s))
      const sig = findEntry(bars, s, prep, entryFrom(s, rule))
      if (!sig) return
      if (sig.skip) { env.skip(mode, sym, sig.skip, sig.k ? { bar: sig.k.t, side: sig.side, src: 'minuto' } : null); return }
      const vb = volInBlock(s, sig, bars, prep)
      if (vb) { env.skip(mode, sym, vb, sigEv(sig, { src: 'minuto' })); return }
      cands.push({ sym, sig, prep, idx, rank: signalRank(s, { sig, prep, bars, idx }) })
    })
    cands.sort((a, b) => bySignal(a, b) || a.idx - b.idx)
    for (const { sym, sig, prep } of cands) {
      await openSignal(env, ctx, gate, dayPos, { sym, sig, prep, price: series[sym]['1m'].at(-1).c, timing: { src: 'minuto', signalAt: Date.now(), sigPx: sig.entry } })
    }
  }
  await env.save()
}

// ---------- Preparazione del Reale prima dell'apertura ----------
// Dalle 9:05 alle 9:28 di New York, per ogni exchange con il Reale acceso: margine isolato e leva (e one-way dove serve)
// impostati e verificati per i titoli della strategia dove NON hai posizioni né ordini (dove ce li hai non si tocca niente).
// Così al segnale parte solo l'ordine (che comunque riverifica tutto prima di partire). Stato del giorno in wt_meta
// `preset:YYYY-MM-DD` (Bitunix) o `preset:<exchange>:YYYY-MM-DD`.
export async function presetLive(info, budgetMs = 15000) {
  const t0 = Date.now()
  const out = {}
  for (const ex of EX_LIST) {
    const left = budgetMs - (Date.now() - t0)
    if (left <= 0) break
    try { const r = await presetVenue(ex, info, left); if (r) out[ex] = r } catch (e) { out[ex] = { error: e.message } }
  }
  if (!Object.keys(out).length) return null
  return out.bitunix && Object.keys(out).length === 1 ? out.bitunix : out
}
async function presetVenue(ex, info, budgetMs) {
  const t0 = Date.now()
  if (!liveAllowed(ex)) return null
  const mode = acctKey('live', ex), a = adapter(ex)
  const acc = await q(db().from('wt_accounts').select('*').eq('mode', mode).maybeSingle())
  if (!acc?.enabled) return null
  const s0 = settingsFor(mode, acc.settings)
  const s = { ...s0, symbols: keepOperable(s0.symbols, await operable(Date.now(), ex)) }
  const key = `preset${exSuffix(ex)}:${info.date}`
  const st = (await getMeta(key)) || {}
  const todo = s.symbols.filter(x => ASSET_MAP[x] && !st[x])
  if (!todo.length) return { done: Object.keys(st).length }
  const [positions, orders, ours, pairs] = await Promise.all([a.api.openPositions(), a.api.pendingOrders(), ourLiveIds(mode), a.pairs()])
  const perps = new Set(pairs.map(p => p.symbol))
  let n = 0
  for (const sym of todo) {
    if (Date.now() - t0 > budgetMs) break
    const perp = a.perpOf(sym)
    if (!perps.has(perp)) { st[sym] = `non disponibile su ${a.name}`; continue }
    if (positions.some(p => p.symbol === perp && !ours.has(String(p.positionId)))) { st[sym] = 'posizione manuale: nessuna modifica'; continue }
    if (orders.some(o => o.symbol === perp && !(o.clientId || '').startsWith(a.clientPrefix))) { st[sym] = 'ordine in attesa: nessuna modifica'; continue }
    // one-way vale per tutto il conto: con una posizione o un ordine aperti su qualunque titolo non si cambia (lo rifà l'ordine)
    try { await ensureIsolated(a.api, perp, s.leverage); st[sym] = 'ok' } catch (e) { st[sym] = `errore: ${e.message}` }
    n++
  }
  await setMeta(key, st)
  return { done: n, left: s.symbols.filter(x => !st[x]).length }
}

// ---------- Titoli che servono in questo controllo ----------
// Per ogni exchange: le candele da 1 minuto servono solo per le posizioni aperte e, nella finestra d'entrata, per i titoli
// scelti nelle modalità attive che oggi non sono ancora stati presi o scartati (e hanno la preparazione pronta).
// Così il controllo resta nei tempi anche con molti titoli selezionati. Risultato: { bitunix: [...], bitget: [...] }.
export async function strategyNeeds(info) {
  const today = info.date, nowMin = info.minutes
  const out = Object.fromEntries(EX_LIST.map(ex => [ex, []]))
  if (!isTradingDay(today, info.isWeekday)) return out
  const [accRows, openPos] = await Promise.all([
    q(db().from('wt_accounts').select('mode, enabled, settings')),
    q(db().from('wt_positions').select('mode, symbol').eq('status', 'open')),
  ])
  const inWindow = nowMin >= OPEN_MIN && nowMin <= ENTRY_UNTIL
  const dayPos = inWindow ? await q(db().from('wt_positions').select('mode, symbol').eq('day', today)) : []
  await Promise.all(EX_LIST.map(async ex => {
    const need = new Set(openPos.filter(p => exOf(p.mode) === ex).map(p => p.symbol))
    out[ex] = [...need]
    if (!inWindow) return
    const active0 = accRows.filter(a => exOf(a.mode) === ex && a.enabled && (!isLive(a.mode) || liveAllowed(ex))).map(a => ({ mode: a.mode, s: settingsFor(a.mode, a.settings) }))
    if (!active0.length) return
    const active = onlyOperable(active0, await operable(Date.now(), ex))
    const [skips, prepRows] = await Promise.all([
      getMeta(skipKey(ex, today)),
      q(db().from('wt_prep').select('symbol, data').eq('day', prepDay(ex, today))),
    ])
    const prepOk = new Set(prepRows.filter(r => r.data?.ok).map(r => r.symbol))
    for (const a of active) {
      if (nowMin > entryUntil(a.s)) continue                                // finestra d'entrata finita
      if (a.s.idxMode !== 'off' && nowMin < INDEX_READY_MIN) continue      // con la regola dell'indice si aspetta le 9:35
      const taken = dayPos.filter(p => p.mode === a.mode)
      if (a.s.maxPos > 0 && taken.length >= a.s.maxPos) continue           // posizioni del giorno già tutte usate
      for (const sym of a.s.symbols) if (prepOk.has(sym) && !taken.some(p => p.symbol === sym) && !skips?.[a.mode]?.[sym]) need.add(sym)
    }
    out[ex] = [...need]
  }))
  return out
}

// ---------- Punto d'ingresso dal controllo ogni minuto ----------
// only = 'exits': solo uscite e freno (il controllo ogni minuto lo fa subito, con le candele delle sole posizioni aperte);
// skipManage = uscite già fatte in questo minuto: qui solo le entrate.
// Titoli con posizioni aperte, per exchange: { bitunix: [...], bitget: [...] }
export async function strategyOpenSymbols() {
  const rows = await q(db().from('wt_positions').select('mode, symbol').eq('status', 'open'))
  return Object.fromEntries(EX_LIST.map(ex => [ex, [...new Set(rows.filter(p => exOf(p.mode) === ex).map(p => p.symbol))]]))
}
// series = candele per exchange { bitunix: { SYM: { '1m': [...] } }, bitget: {...} } (una serie sola = Bitunix, come prima).
// Ogni exchange acceso (o con posizioni aperte) gira per conto suo, in contemporanea; le notifiche partono insieme alla fine.
// Registro: quello di Bitunix in cima (come prima), gli altri sotto il loro nome (log.bitget).
export async function runStrategy(series, info, { only = null, skipManage = false } = {}) {
  const today = info.date
  const log = { day: today }
  if (!isTradingDay(today, info.isWeekday)) return { ...log, skipped: 'borsa chiusa' }
  const byEx = series && EX_LIST.some(ex => ex in series) ? series : { [DEFAULT_EX]: series || {} }
  const [accRows, openPos] = await Promise.all([
    q(db().from('wt_accounts').select('*')),
    q(db().from('wt_positions').select('*').eq('status', 'open')),
  ])
  const venues = EX_LIST.filter(ex => accRows.some(a => exOf(a.mode) === ex && a.enabled) || openPos.some(p => exOf(p.mode) === ex))
  if (!venues.length) return { ...log, skipped: 'nessuna modalità attiva' }
  const notes = []
  const res = await Promise.all(venues.map(ex =>
    runVenue(ex, byEx[ex] || {}, info, { only, skipManage }, accRows.filter(a => exOf(a.mode) === ex), openPos.filter(p => exOf(p.mode) === ex), notes)
      .catch(e => ({ errors: [e.message] }))))
  venues.forEach((ex, i) => { if (ex === DEFAULT_EX) Object.assign(log, res[i]); else log[ex] = res[i] })
  log.opened = notes.filter(n => /^(▲|▼)/.test(n.title)).length
  log.closed = notes.filter(n => /^(✓|✗)/.test(n.title)).length
  if (notes.length) log.pushes = (await notifyTrades(notes)).sent
  return log
}

async function runVenue(ex, series, info, { only, skipManage }, accRows, openPos, notes) {
  const today = info.date
  const a = adapter(ex)
  const log = {}
  const closeMin = closeMinute(today)
  const accounts = Object.fromEntries(accRows.map(x => [x.mode, x]))
  const active0 = accRows.filter(x => x.enabled).map(x => ({ ...x, s: settingsFor(x.mode, x.settings) }))
  const op = active0.length ? await operable(Date.now(), ex) : null
  const active = active0.length ? onlyOperable(active0, op) : active0
  // registrazione: impostazioni, titoli esclusi e capitale del giorno, dalle 9:25 alle 9:29 (prima riga vince; fuori dai minuti
  // delle entrate per non rallentarle), per il confronto serale
  if (only !== 'exits' && info.minutes >= OPEN_MIN - 5 && info.minutes < OPEN_MIN) {
    for (const x of active) {
      if (isLive(x.mode) && !liveAllowed(ex)) continue
      try {
        const a0 = active0.find(y => y.mode === x.mode)
        const excluded = a0.s.symbols.filter(y => op.check(y)).map(y => ({ symbol: y, why: op.check(y).why }))
        await daySnapshot(today, x, { chosen: a0.s.symbols, excluded, capital: x.s.capitalMode === 'dedicated' ? ((await getCapital(x.mode))?.current ?? null) : null })
      } catch { /* solo registrazione */ }
    }
  }
  if (!active.length && !openPos.length) return { ...log, skipped: 'nessuna modalità attiva' }

  const symbols = [...new Set([...active.flatMap(x => x.s.symbols), ...openPos.map(p => p.symbol)])]
  if (only !== 'exits' && info.minutes >= 480 && info.minutes < ENTRY_UNTIL) log.prep = await prepare(symbols, today, info.minutes >= OPEN_MIN - 5, ex)

  const prepRows = await q(db().from('wt_prep').select('symbol, data').eq('day', prepDay(ex, today)))
  const preps = Object.fromEntries(prepRows.map(r => [r.symbol, r.data]))
  const lastPrice = {}
  const needTk = openPos.filter(p => !series[p.symbol]?.['1m']?.length).map(p => a.perpOf(p.symbol))
  if (needTk.length) { const t = await a.tickers(needTk); for (const p of openPos) { const x = t[a.perpOf(p.symbol)]; if (x?.last) lastPrice[p.symbol] = x.last } }
  // slittamento misurato nel Reale di questo exchange per i prezzi della sua Prova (server/pslip.js); senza, 0,05% per ogni tipo
  const paperKey = acctKey('paper', ex)
  const pslip = accounts[paperKey] && (accounts[paperKey].enabled || openPos.some(p => p.mode === paperKey)) ? await loadLiveSlip(ex) : null
  const ctx = { ex, series, today, nowMin: info.minutes, closeMin, accounts, preps, notes, lastPrice, pslip }

  if (!skipManage) for (const p of openPos) {
    try { await manage(p, ctx) } catch (e) { (log.errors ||= []).push(`${p.symbol}: ${e.message}`) }
  }
  // freno di mercato "chiudi tutto": perdita del giorno (chiusi + aperti) oltre la soglia → chiude tutte le posizioni della strategia
  try { ctx.braked = await brakeCheck(ctx, accRows); if (Object.values(ctx.braked).some(Boolean)) log.brake = ctx.braked } catch (e) { (log.errors ||= []).push(`freno: ${e.message}`) }
  // Reale: stop di ogni posizione aperta verificato sull'exchange (rimesso se manca; altrimenti chiusura e titolo escluso)
  if (!skipManage) try { await stopWatch(ctx, log) } catch (e) { (log.errors ||= []).push(`stop: ${e.message}`) }
  // indice di attività del mercato di oggi (dalle 9:35 di New York, una volta al giorno; comune a tutti gli exchange)
  if (info.minutes >= INDEX_READY_MIN && info.minutes <= ENTRY_UNTIL) {
    try { ctx.mindex = await todayIndex(today); log.mindex = ctx.mindex.idx === null ? null : Math.round(ctx.mindex.idx) } catch (e) { (log.errors ||= []).push(`indice: ${e.message}`) }
  }
  if (only !== 'exits' && info.minutes >= OPEN_MIN && info.minutes <= ENTRY_UNTIL && active.length) {
    const dayPos = await q(db().from('wt_positions').select('*').eq('day', today).in('mode', accRows.map(x => x.mode)))
    // conti seguiti in questo momento dal controllo veloce dell'apertura: le entrate le fa lui
    const fl = await getMeta('fast:lock').catch(() => null)
    if (fl?.until > Date.now() && fl.day === today) { ctx.fastModes = fl.modes || []; if (ctx.fastModes.length) log.fast = ctx.fastModes.filter(m => exOf(m) === ex) }
    try { await entries(ctx, active, dayPos) } catch (e) { (log.errors ||= []).push(`entrate: ${e.message}`) }
  }
  return log
}

// Reale: posizioni chiuse senza i dati veri dell'exchange (lo storico non era ancora pronto alla chiusura): si riprovano più
// tardi e si correggono prezzo d'uscita, commissioni e risultato (con la differenza nel capitale dedicato).
export async function repairLiveClosed(max = 3) {
  const out = {}
  for (const ex of EX_LIST) {
    const a = adapter(ex)
    if (!a.hasKeys()) continue
    const mode = acctKey('live', ex)
    const since = Date.now() - 3 * 86400000
    const rows = (await q(db().from('wt_positions').select('*').eq('mode', mode).eq('status', 'closed').gte('closed_at', since)))
      .filter(p => p.exchange?.positionId && p.exchange?.slip && !p.exchange.slip.fillOut && !p.exchange.slip.repairTried)
      .slice(0, max)
    let fixed = 0
    for (const p of rows) {
      const h = await a.positionHistory(a.perpOf(p.symbol), p.exchange.positionId).catch(() => null)
      const slip = { ...p.exchange.slip, repairTried: Date.now() }
      if (!h?.closePrice) { await updatePos(p.id, { exchange: { ...p.exchange, slip } }); continue }
      const fees = h.fee !== null ? Math.abs(h.fee) : p.fees
      const gross = pnlOf({ ...p }, h.closePrice, 0, {}).gross
      const pnl = gross - fees + (h.funding || 0)
      await updatePos(p.id, { exit: h.closePrice, fees, pnl, ...(h.funding !== null ? { funding: h.funding } : {}), exchange: { ...p.exchange, slip: { ...slip, fillOut: h.closePrice, fee: h.fee, funding: h.funding } } })
      const s = settingsFor(mode, (await q(db().from('wt_accounts').select('settings').eq('mode', mode).single())).settings)
      if (s.capitalMode === 'dedicated' && Number.isFinite(pnl - (p.pnl || 0))) await applyTrade(mode, pnl - (p.pnl || 0), { count: false })
      fixed++
    }
    out[ex] = { checked: rows.length, fixed }
  }
  return Object.keys(out).length ? (Object.keys(out).length === 1 && out.bitunix ? out.bitunix : out) : null
}

// Chiusura manuale dalla pagina Strategia (una posizione o tutte) di un conto (chiave del conto: paper, live, live:bitget…)
export async function closeManual(mode, id) {
  let query = db().from('wt_positions').select('*').eq('status', 'open').eq('mode', mode)
  if (id) query = query.eq('id', id)
  const list = await q(query)
  if (!list.length) return { closed: 0 }
  const accRows = await q(db().from('wt_accounts').select('*'))
  const accounts = Object.fromEntries(accRows.map(x => [x.mode, x]))
  const a = adapterOf(mode)
  const t = await a.tickers(list.map(p => a.perpOf(p.symbol)))
  const notes = []
  for (const p of list) {
    const px = t[a.perpOf(p.symbol)]?.last
    if (px) await closePos(p, px, 'chiusa a mano', accounts, notes)
  }
  if (notes.length) await notifyTrades(notes)
  return { closed: notes.length }
}
