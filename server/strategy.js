// Motore dal vivo della strategia "Apertura USA" per le due modalità:
//  - paper (Prova): capitale fittizio, ordini simulati al prezzo del segnale, commissione impostata
//  - live (Reale): ordini veri su Bitunix, solo se LIVE_TRADING=on, il conto Reale è attivo e le chiavi API ci sono
// Gira ogni minuto dentro /api/cron/tick con le candele da 1 minuto già scaricate.
import { ASSET_MAP } from '../shared/assets.js'
import { normalizeSettings, settingsFor, sizing, exitLevel, exitReason, pnlOf, closeMinute, isTradingDay, liqPriceOf, stopPastLiq } from '../shared/opening.js'
import { prepFromBars, findEntry, newPosition, stepBar, riskFor, liqBlocks, indexRule, entryUntil, entryFrom, volInBlock, minuteNormals, signalRank, bySignal, lossCheck, openPnlOf, ENTRY_UNTIL, MIN, PREP_BARS } from '../shared/engine.js'
import { loadDays } from './archive.js'
import { addDays } from '../shared/time.js'
import * as bx from './bitunix.js'
import { klinesBack, account, openPositions, positionHistory, hasKeys, tickers } from './bitunix.js'
import { openLive as openLiveSafe, closeOurs, closePart, ensureIsolated, LiveSkip, CLIENT_PREFIX } from './live.js'
import { getCapital, applyTrade, checkLimits, markHalted, markDayStop } from './capital.js'
import { getLimits } from './limits.js'
import { todayIndex, INDEX_READY_MIN } from './mindex.js'
import { db, q, getMeta, setMeta } from './db.js'
import { notifyTrades } from './push.js'
import { ny, OPEN_MIN } from './session.js'
import { getPairs } from './scanner.js'
import { operable, keepOperable, markNotOperable, isApiReject, RECHECK_DAYS } from './operable.js'

export const liveAllowed = () => process.env.LIVE_TRADING === 'on' && hasKeys()

const fmt = p => (p >= 1000 ? p.toFixed(1) : p >= 100 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toPrecision(4))
const sgn = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
const modeName = m => (m === 'live' ? 'Reale' : 'Prova')

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
async function prepSymbol(sym, today) {
  const bars = await klinesBack(ASSET_MAP[sym].perp, '15m', PREP_BARS) // ~13 giorni di candele da 15 min
  const prep = prepFromBars(bars, today)
  // volume normale minuto per minuto dalle 9:30 alle 10:05 (10 giorni precedenti, dall'archivio da 1 minuto)
  if (prep.ok) {
    try {
      const d = await loadDays([sym], addDays(today, -21), addDays(today, -1))
      const prev = Object.keys(d).sort().slice(-10).map(x => d[x][sym]).filter(b => b?.length)
      prep.minVol = minuteNormals(prev)
    } catch { prep.minVol = null }
  }
  return prep
}

async function prepare(symbols, today, urgent) {
  const have = await q(db().from('wt_prep').select('symbol').eq('day', today))
  const done = new Set(have.map(r => r.symbol))
  const todo = symbols.filter(s => !done.has(s)).slice(0, urgent ? 8 : 4)
  const rows = []
  for (const sym of todo) {
    try { rows.push({ day: today, symbol: sym, data: await prepSymbol(sym, today), created_at: Date.now() }) }
    catch (e) { rows.push({ day: today, symbol: sym, data: { ok: false, why: e.message }, created_at: Date.now() }) }
  }
  if (rows.length) await q(db().from('wt_prep').upsert(rows))
  return { prepared: todo.length, missing: symbols.length - done.size - todo.length }
}

// ---------- Bitunix: apertura e chiusura vere (regole di sicurezza in server/live.js) ----------
const API = {
  openPositions: bx.openPositions, pendingOrders: bx.pendingOrders, leverageMarginMode: bx.leverageMarginMode,
  setIsolated: bx.setIsolated, setLeverage: bx.setLeverage, openMarket: bx.openMarket, placeStopLoss: bx.placeStopLoss,
  pendingStopLoss: bx.pendingStopLoss, modifyStopLoss: bx.modifyStopLoss, closePosition: bx.closePosition, closePartial: bx.closePartial,
}
const pairOf = async sym => {
  const pair = (await getPairs()).find(p => p.symbol === ASSET_MAP[sym].perp)
  return pair ? { ...pair, step: 10 ** -(pair.basePrecision ?? 3) } : null
}
// positionId delle posizioni Reali della strategia ancora aperte
const ourLiveIds = async () => new Set((await q(db().from('wt_positions').select('exchange').eq('mode', 'live').eq('status', 'open'))).map(r => r.exchange?.positionId).filter(Boolean).map(String))

async function closeLive(p, fallbackPrice) {
  const perp = ASSET_MAP[p.symbol].perp
  const positionId = p.exchange?.positionId
  // senza positionId la posizione non è riconoscibile con certezza: non si tocca niente su Bitunix
  if (!positionId) throw new Error('posizione Bitunix non identificata: controlla e chiudi a mano')
  const ourQty = p.qty - (p.half_done && p.half_qty > 0 ? p.half_qty : 0)
  const pair = await pairOf(p.symbol)
  const r = await closeOurs(API, { perp, positionId, side: p.side, qty: ourQty, step: pair?.step })
  if (r.gone) return { closedByExchange: true, price: p.init_stop } // già chiusa da Bitunix (stop loss o liquidazione)
  // lo stop loss su Bitunix di questa posizione non serve più (se la posizione è chiusa Bitunix lo toglie da solo)
  if (p.exchange?.slOrderId) await bx.cancelStopLoss({ symbol: perp, orderId: p.exchange.slOrderId }).catch(() => {})
  return { closedByExchange: false, price: fallbackPrice }
}

// Chiusura di metà posizione a mercato ("Metà subito"), solo sulla posizione della strategia; poi lo stop su Bitunix
// passa al prezzo d'entrata e alla quantità rimasta.
async function closeHalfLive(p) {
  const perp = ASSET_MAP[p.symbol].perp
  if (!p.exchange?.positionId) throw new Error('posizione Bitunix non identificata')
  const pair = await pairOf(p.symbol)
  const qty = bx.roundQty(p.qty / 2, pair?.basePrecision ?? 3)
  if (!(qty > 0) || qty < (pair?.minQty || 0)) throw new Error('metà posizione sotto la quantità minima')
  const r = await closePart(API, { perp, positionId: p.exchange.positionId, side: p.side, qty })
  if (!r.left) throw new Error('la posizione risulta chiusa per intero')
  if (p.exchange?.slOrderId) {
    const sl = pair?.quotePrecision !== null && pair?.quotePrecision !== undefined ? Number(p.entry.toFixed(pair.quotePrecision)) : Number(p.entry.toPrecision(6))
    await bx.modifyStopLoss({ orderId: p.exchange.slOrderId, slPrice: sl, qty: p.qty - r.closed }).catch(() => {})
  }
  return { qty: r.closed }
}

// Dati veri della posizione chiusa su Bitunix (prezzo, commissioni, funding, liquidazione), se l'API li fornisce
async function liveClosed(p) {
  if (!p.exchange?.positionId) return null
  for (let i = 0; i < 3; i++) {
    const h = await positionHistory(ASSET_MAP[p.symbol].perp, p.exchange?.positionId).catch(() => null)
    if (h) return h
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}

// ---------- Chiusura (comune) ----------
async function closePos(p, exit, reason, accounts, notes, { liq = false } = {}) {
  const acc = accounts[p.mode]
  const s = settingsFor(p.mode, acc.settings)
  let note = null, real = null
  const sigOut = exit // prezzo del segnale d'uscita (per misurare lo slittamento)
  let exchangeClosed = false
  if (p.mode === 'live') {
    try {
      const r = await closeLive(p, exit)
      real = await liveClosed(p)
      if (r.closedByExchange) {
        // chiusa da Bitunix: stop loss di sicurezza oppure liquidazione
        exit = real?.closePrice ?? r.price
        liq = !!(real?.liqQty > 0) || (!!p.liq_price && (p.side > 0 ? exit <= p.liq_price * 1.001 : exit >= p.liq_price * 0.999))
        reason = liq ? 'liquidazione' : 'stop loss (Bitunix)'
        exchangeClosed = true
      } else {
        liq = false // chiusa da noi a mercato prima della liquidazione
        if (real?.closePrice) exit = real.closePrice
      }
    } catch (e) { note = `chiusura su Bitunix non riuscita: ${e.message}`; reason = `${reason} · da verificare` }
  }
  const fee = p.mode === 'live' ? 0.06 : s.fee
  let { pnl, fees } = pnlOf(p, exit, fee, { liq })
  let funding = null
  if (real) {
    // Reale: commissioni e funding veri di Bitunix (funding con segno: negativo = pagato)
    if (real.fee !== null) fees = Math.abs(real.fee)
    funding = real.funding
    const gross = pnlOf(p, exit, 0, { liq }).gross // comprende la metà già chiusa con "Metà subito"
    pnl = gross - fees + (funding || 0)
  }
  // Reale: prezzi del segnale e prezzi eseguiti su Bitunix, commissioni vere (slittamento per lato)
  const exchange = p.mode === 'live' && p.exchange ? {
    ...p.exchange,
    slip: { ...(p.exchange.slip || {}), sigOut: exchangeClosed ? (p.exchange.sl ?? p.init_stop) : sigOut, fillOut: real?.closePrice ?? null, fee: real?.fee ?? null, funding: real?.funding ?? null, byExchange: exchangeClosed },
  } : null
  await updatePos(p.id, {
    status: 'closed', exit, reason, pnl, fees, closed_at: Date.now(), best: p.best, last_bar: p.last_bar, ...(exchange ? { exchange } : {}),
    init_stop: p.init_stop, halved: p.halved, stale_done: p.stale_done, confirmed: p.confirmed, volx: p.volx,
    half_done: !!p.half_done, half_px: p.half_px ?? null, half_qty: p.half_qty ?? null, np_done: !!p.np_done,
    ...(funding !== null ? { funding } : {}), ...(note ? { note } : {}),
  })
  if (p.mode === 'paper') {
    const fresh = await q(db().from('wt_accounts').select('balance').eq('mode', 'paper').single())
    await q(db().from('wt_accounts').update({ balance: fresh.balance + pnl }).eq('mode', 'paper'))
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
    url: `/strategia?mode=${p.mode}`, tag: `pos-${p.id}-close`,
  })
}

// Perdita massima totale: la strategia si ferma (conto disattivato) finché non la riavvii tu
async function haltAccount(mode, why, notes) {
  await markHalted(mode, why)
  await q(db().from('wt_accounts').update({ enabled: false, updated_at: Date.now() }).eq('mode', mode))
  notes.push({ title: `⛔ Strategia ${modeName(mode)} fermata`, body: `${why}. Le posizioni aperte vengono comunque gestite fino alla chiusura. Riavviala tu dalla pagina Strategia.`, url: `/strategia?mode=${mode}`, tag: `halt-${mode}` })
}

// ---------- Freno di mercato ----------
// Per ogni modalità con il freno attivo: perdita di oggi = trade chiusi + posizioni aperte al prezzo attuale, in % del capitale
// di inizio giornata (capitale dedicato, altrimenti quello usato dal primo trade di oggi). Superata la soglia: chiude subito
// tutte le posizioni della strategia di quella modalità, niente nuovi trade fino a domani, notifica.
async function brakeCheck(ctx, accRows) {
  const { today, series, lastPrice, accounts, notes } = ctx
  const key = `brake:${today}`
  const state = (await getMeta(key)) || {}
  const out = { paper: !!state.paper, live: !!state.live }
  const modes = accRows.map(a => ({ mode: a.mode, s: settingsFor(a.mode, a.settings) })).filter(x => x.s.brakePct > 0 && !out[x.mode])
  if (!modes.length) return out
  const dayPos = await q(db().from('wt_positions').select('*').eq('day', today))
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
    for (const p of open) { const px = pxOf(p); if (px) await closePos(p, px, 'freno di mercato', accounts, notes).catch(() => {}) }
    state[mode] = { at: Date.now(), loss, pct: dayRef ? loss / dayRef * 100 : null }
    out[mode] = true; changed = true
    notes.push({ title: `🛑 Freno di mercato: ${modeName(mode)}`, body: `Perdita del giorno ${loss.toFixed(2)} USDT (${(loss / dayRef * 100).toFixed(1)}%, soglia ${s.brakePct}%): chiuse ${open.length} posizioni, niente nuovi trade fino a domani.`, url: `/strategia?mode=${mode}`, tag: `brake-${mode}-${today}` })
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

  let exit = null, reason = null, liq = false
  const halfBefore = !!p.half_done, stopBefore = p.init_stop, halvedBefore = !!p.halved
  for (const b of todayBars) {
    if (b.t <= (p.last_bar ?? 0) || b.t + MIN > now) continue // solo candele chiuse e non ancora controllate
    const r = stepBar(p, s, b, todayBars, preps[p.symbol])
    if (r) { exit = r.exit; reason = r.reason; liq = !!r.liq; break }
  }
  // controllo in tempo reale sul prezzo attuale (candela ancora in corso)
  if (exit === null && px) {
    const lvl = exitLevel(p, s)
    if (p.liq_price && (p.side > 0 ? px <= p.liq_price : px >= p.liq_price)) { exit = p.liq_price; reason = 'liquidazione'; liq = true }
    else if (p.side > 0 ? px <= lvl : px >= lvl) { exit = px; reason = exitReason(p, lvl) }
  }
  // fine giornata: chiudi tutto un minuto prima della chiusura della borsa
  if (exit === null && nowMin >= closeMin - 1 && px) { exit = px; reason = 'chiusura' }

  // "Metà subito" appena scattata: nel Reale chiude davvero metà posizione su Bitunix
  if (!halfBefore && p.half_done && !(await newColsOk())) {
    // schema.sql non ancora rilanciato: la metà non si può salvare, quindi non si chiude niente
    p.half_done = false; p.half_qty = null; p.half_px = null
    if (!!p.halved === halvedBefore) p.init_stop = stopBefore
  }
  if (!halfBefore && p.half_done) {
    let msg = `metà chiusa a ${fmt(p.half_px)}, stop al prezzo d'entrata`
    if (p.mode === 'live') {
      try {
        const r = await closeHalfLive(p)
        p.half_qty = r.qty
        if (px) p.half_px = px
        msg = `metà chiusa a ${fmt(p.half_px)} su Bitunix, stop al prezzo d'entrata`
      } catch (e) {
        p.half_qty = 0 // la posizione resta intera; lo stop resta comunque al prezzo d'entrata
        msg = `metà non chiusa su Bitunix (${e.message}), stop al prezzo d'entrata`
      }
    }
    notes.push({ title: `½ ${p.symbol}: ${msg}`, body: modeName(p.mode), url: `/strategia?mode=${p.mode}`, tag: `pos-${p.id}-half` })
  }

  if (exit !== null) return closePos(p, exit, reason, accounts, notes, { liq })
  await updatePos(p.id, {
    best: p.best, last_bar: p.last_bar, init_stop: p.init_stop, halved: p.halved, stale_done: p.stale_done, confirmed: p.confirmed, volx: p.volx,
    half_done: !!p.half_done, half_px: p.half_px ?? null, half_qty: p.half_qty ?? null, np_done: !!p.np_done,
  })
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

export async function entryEnv(ctx) {
  const { today } = ctx
  let limits = null
  const env = {
    skipKey: `orbskip:${today}`,
    skips: (await getMeta(`orbskip:${today}`)) || { paper: {}, live: {} },
    changed: false,
    liveBalance: null, liveIds: null,
    lim: async sym => { if (!limits) limits = await getLimits().catch(() => ({})); return limits[sym] || null },
  }
  env.skip = (mode, sym, why) => { (env.skips[mode] ||= {})[sym] = why; env.changed = true }
  env.save = async () => { if (env.changed) { await setMeta(env.skipKey, env.skips); env.changed = false } }
  return env
}

// Controlli del conto prima di cercare segnali. Restituisce null se oggi non si apre niente (i titoli sono già segnati
// come scartati), altrimenti { s, mode, taken, ded, rule }.
export async function accountGate(env, ctx, acc, dayPos) {
  const { today, notes } = ctx
  const s = acc.s, mode = acc.mode
  if (mode === 'live' && !liveAllowed()) return null
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
        notes.push({ title: `⏸ ${modeName(mode)}: niente nuovi trade fino a domani`, body: `perdita massima giornaliera superata: ${dayPnl.toFixed(2)} USDT oggi (limite ${s.maxDayLoss}% di ${dayRef.toFixed(2)})`, url: `/strategia?mode=${mode}`, tag: `daystop-${mode}-${today}` })
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
        notes.push({ title: `⏸ ${modeName(mode)}: niente nuovi trade fino a domani`, body: lim.why, url: `/strategia?mode=${mode}`, tag: `daystop-${mode}-${today}` })
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
  const now = Date.now()
  if (taken.some(p => p.symbol === sym)) return null
  if (rule.maxPos > 0 && taken.length >= rule.maxPos) { env.skip(mode, sym, 'limite posizioni al giorno'); return null }
  const { k, side } = sig
  // nel Reale si entra solo se il segnale è appena scattato (niente entrate in ritardo a prezzi peggiori)
  if (mode === 'live' && now - (k.t + MIN) > 2 * MIN) { env.skip(mode, sym, 'segnale scattato mentre il controllo era fermo'); return null }

  let base = acc.balance
  if (mode === 'live') {
    // nel Reale: con il capitale dedicato mai più del saldo DISPONIBILE su Bitunix
    if (env.liveBalance === null) env.liveBalance = await account().catch(() => null)
    base = s.capitalMode === 'dedicated' ? (env.liveBalance?.available ?? 0) : (env.liveBalance?.equity ?? 0)
  }
  const { capital, margin, notional } = sizing(s, base, ded ? ded.current : undefined)
  if (!(margin >= 1)) { env.skip(mode, sym, 'capitale insufficiente'); return null }
  if (mode === 'live' && env.liveBalance && margin > env.liveBalance.available) { env.skip(mode, sym, 'saldo disponibile su Bitunix insufficiente'); return null }
  const unit = prep.unit
  // margine di mantenimento e leva massima di Bitunix per questo titolo e questo valore della posizione
  const risk = riskFor(await env.lim(sym), notional, s)
  if (mode === 'live' && risk.maxLev && s.leverage > risk.maxLev) { env.skip(mode, sym, `leva ${s.leverage}x oltre il massimo Bitunix (${risk.maxLev}x)`); return null }
  let pos = newPosition({ mode, day: today, symbol: sym, sig, s, prep, size: { capital, margin, notional }, risk })
  // stop loss oltre il prezzo di liquidazione: non si apre (nel Reale sempre)
  if ((mode === 'live' || s.liqGuard) && liqBlocks(pos)) { env.skip(mode, sym, 'stop oltre la liquidazione'); return null }
  // prenotazione del titolo: se un altro controllo l'ha già preso (o lo sta aprendo) non si fa niente
  if (!(await claimSymbol(mode, today, sym, timing?.src || 'minuto'))) return null
  const tm = { src: timing?.src || 'minuto', signalAt: timing?.signalAt ?? now, sigPx: timing?.sigPx ?? sig.entry, level: sig.entry }
  if (mode === 'live') {
    const pair = await pairOf(sym)
    if (!pair) { env.skip(mode, sym, 'perpetual non disponibile su Bitunix'); return null }
    if (env.liveIds === null) env.liveIds = await ourLiveIds()
    try {
      tm.orderAt = Date.now()
      const r = await openLiveSafe(API, { perp: ASSET_MAP[sym].perp, pair, side, notional, price, leverage: s.leverage, stopDist: s.sl * unit, ourIds: env.liveIds, clientId: `${CLIENT_PREFIX}${Date.now()}${sym}`.slice(0, 32) })
      if (r.unidentified) {
        env.skip(mode, sym, `ordine inviato ma posizione non riconosciuta (${r.why}): da controllare`)
        notes.push({ title: `⚠ ${sym}: controlla Bitunix`, body: `Ordine ${r.orderId || ''} inviato ma la posizione non è riconoscibile con certezza (${r.why}). La strategia non la gestisce: controllala e chiudila a mano. Reale`, url: '/strategia?mode=live', tag: `err-${sym}` })
        return null
      }
      tm.fillAt = r.exchange.fillAt ?? Date.now()
      pos = { ...pos, entry: r.entry, qty: r.qty, leverage: r.leverage, best: r.entry, init_stop: r.entry - side * s.sl * unit, opened_at: now,
        exchange: { ...r.exchange, slip: { sigIn: tm.sigPx, fillIn: r.entry }, timing: tm } }
      env.liveIds.add(String(r.exchange.positionId))
      // prezzo di liquidazione vero di Bitunix, altrimenti calcolato sul prezzo eseguito
      pos.liq_price = r.liqPrice || liqPriceOf(pos, risk.mmr, s.liqFee)
    } catch (e) {
      // Bitunix non accetta questo titolo via API (ordine o stop loss): segnato come non operabile, non si ritenta per qualche giorno
      if (e.noSl || isApiReject(e.message)) {
        const kind = e.noSl ? 'stop' : 'ordini'
        const fresh = await markNotOperable(sym, kind, e.message).catch(() => false)
        env.skip(mode, sym, `non operabile via API: ${kind === 'stop' ? 'stop loss non accettato' : 'ordine rifiutato'} (${e.message})`)
        if (fresh) notes.push({ title: `⚠ ${sym}: non operabile via API`, body: `${kind === 'stop' ? 'Bitunix non accetta lo stop loss via API (posizione chiusa subito)' : 'Bitunix rifiuta gli ordini via API'}. Non lo tento più per ${RECHECK_DAYS} giorni (Prova e Reale). Reale`, url: '/strategia?mode=live', tag: `api-${sym}` })
        return null
      }
      if (e instanceof LiveSkip) {
        env.skip(mode, sym, e.message)
        if (e.notify) notes.push({ title: `⚠ ${sym}: trade non aperto`, body: `${e.message} · Reale`, url: '/strategia?mode=live', tag: `err-${sym}` })
        return null
      }
      env.skip(mode, sym, `ordine non riuscito: ${e.message}`)
      notes.push({ title: `⚠ ${sym}: ordine non riuscito`, body: `${e.message} · Reale`, url: '/strategia?mode=live', tag: `err-${sym}` })
      return null
    }
  } else {
    // Prova: eseguito subito al prezzo del segnale
    tm.orderAt = tm.fillAt = Date.now()
    pos = { ...pos, exchange: { timing: tm } }
  }
  const [row] = await insertPos(pos)
  taken.push(row); dayPos.push(row)
  // Reale: se dopo l'esecuzione lo stop risulta oltre la liquidazione di Bitunix, chiudi subito
  if (mode === 'live' && stopPastLiq(pos)) {
    await closePos({ ...pos, ...row }, pos.entry, 'stop oltre la liquidazione', accounts, notes)
    env.skip(mode, sym, 'stop oltre la liquidazione (chiusa subito)')
    return null
  }
  notes.push({
    title: `${side > 0 ? '▲ LONG' : '▼ SHORT'} ${sym} a ${fmt(pos.entry)}`,
    body: `${sgn(pos.move_pct)}% dall'apertura · stop ${fmt(pos.init_stop)} · margine ${pos.margin.toFixed(0)} USDT × ${pos.leverage}x · ${modeName(mode)}${tm.src === 'veloce' ? ' · entrata veloce' : ''}`,
    url: `/strategia?mode=${mode}`, tag: `pos-${row.id}`,
  })
  return row
}

// Prova e Reale: solo i titoli operabili via API su Bitunix (stessa lista per tutte e due, vedi server/operable.js)
export const onlyOperable = (list, op) => list.map(a => ({ ...a, s: { ...a.s, symbols: keepOperable(a.s.symbols, op) } }))

// Controllo ogni minuto: segnali dalle candele da 1 minuto chiuse. Le modalità seguite in quel momento dal controllo
// veloce dell'apertura (ctx.fastModes) qui non aprono niente.
async function entries(ctx, active, dayPos) {
  const { series, today, preps } = ctx
  const env = await entryEnv(ctx)
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
      if (sig.skip) { env.skip(mode, sym, sig.skip); return }
      const vb = volInBlock(s, sig, bars, prep)
      if (vb) { env.skip(mode, sym, vb); return }
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
// Dalle 9:05 alle 9:28 di New York: margine isolato e leva impostati e verificati su Bitunix per i titoli della strategia
// dove NON hai posizioni né ordini (dove ce li hai non si tocca niente). Così al segnale parte solo l'ordine
// (che comunque riverifica il margine prima di partire). Stato del giorno in wt_meta `preset:YYYY-MM-DD`.
export async function presetLive(info, budgetMs = 15000) {
  const t0 = Date.now()
  if (!liveAllowed()) return null
  const acc = await q(db().from('wt_accounts').select('*').eq('mode', 'live').maybeSingle())
  if (!acc?.enabled) return null
  const s0 = settingsFor('live', acc.settings)
  const s = { ...s0, symbols: keepOperable(s0.symbols, await operable()) }
  const key = `preset:${info.date}`
  const st = (await getMeta(key)) || {}
  const todo = s.symbols.filter(x => ASSET_MAP[x] && !st[x])
  if (!todo.length) return { done: Object.keys(st).length }
  const [positions, orders, ours, pairs] = await Promise.all([bx.openPositions(), bx.pendingOrders(), ourLiveIds(), getPairs()])
  const perps = new Set(pairs.map(p => p.symbol))
  let n = 0
  for (const sym of todo) {
    if (Date.now() - t0 > budgetMs) break
    const perp = ASSET_MAP[sym].perp
    if (!perps.has(perp)) { st[sym] = 'non disponibile su Bitunix'; continue }
    if (positions.some(p => p.symbol === perp && !ours.has(String(p.positionId)))) { st[sym] = 'posizione manuale: nessuna modifica'; continue }
    if (orders.some(o => o.symbol === perp && !(o.clientId || '').startsWith(CLIENT_PREFIX))) { st[sym] = 'ordine in attesa: nessuna modifica'; continue }
    try { await ensureIsolated(API, perp, s.leverage); st[sym] = 'ok' } catch (e) { st[sym] = `errore: ${e.message}` }
    n++
  }
  await setMeta(key, st)
  return { done: n, left: s.symbols.filter(x => !st[x]).length }
}

// ---------- Titoli che servono in questo controllo ----------
// Le candele da 1 minuto servono solo per le posizioni aperte e, nella finestra d'entrata, per i titoli scelti
// nelle modalità attive che oggi non sono ancora stati presi o scartati (e hanno la preparazione pronta).
// Così il controllo resta nei tempi anche con molti titoli selezionati.
export async function strategyNeeds(info) {
  const today = info.date, nowMin = info.minutes
  if (!isTradingDay(today, info.isWeekday)) return []
  const [accRows, openPos] = await Promise.all([
    q(db().from('wt_accounts').select('mode, enabled, settings')),
    q(db().from('wt_positions').select('symbol').eq('status', 'open')),
  ])
  const need = new Set(openPos.map(p => p.symbol))
  if (nowMin < OPEN_MIN || nowMin > ENTRY_UNTIL) return [...need]
  const active0 = accRows.filter(a => a.enabled && (a.mode !== 'live' || liveAllowed())).map(a => ({ mode: a.mode, s: settingsFor(a.mode, a.settings) }))
  if (!active0.length) return [...need]
  const active = onlyOperable(active0, await operable())
  const [dayPos, skips, prepRows] = await Promise.all([
    q(db().from('wt_positions').select('mode, symbol').eq('day', today)),
    getMeta(`orbskip:${today}`),
    q(db().from('wt_prep').select('symbol, data').eq('day', today)),
  ])
  const prepOk = new Set(prepRows.filter(r => r.data?.ok).map(r => r.symbol))
  for (const a of active) {
    if (nowMin > entryUntil(a.s)) continue                                // finestra d'entrata finita
    if (a.s.idxMode !== 'off' && nowMin < INDEX_READY_MIN) continue      // con la regola dell'indice si aspetta le 9:35
    const taken = dayPos.filter(p => p.mode === a.mode)
    if (a.s.maxPos > 0 && taken.length >= a.s.maxPos) continue           // posizioni del giorno già tutte usate
    for (const sym of a.s.symbols) if (prepOk.has(sym) && !taken.some(p => p.symbol === sym) && !skips?.[a.mode]?.[sym]) need.add(sym)
  }
  return [...need]
}

// ---------- Punto d'ingresso dal controllo ogni minuto ----------
export async function runStrategy(series, info) {
  const today = info.date
  const log = { day: today }
  if (!isTradingDay(today, info.isWeekday)) return { ...log, skipped: 'borsa chiusa' }
  const closeMin = closeMinute(today)
  const accRows = await q(db().from('wt_accounts').select('*'))
  const accounts = Object.fromEntries(accRows.map(a => [a.mode, a]))
  const active0 = accRows.filter(a => a.enabled).map(a => ({ ...a, s: settingsFor(a.mode, a.settings) }))
  const active = active0.length ? onlyOperable(active0, await operable()) : active0
  const openPos = await q(db().from('wt_positions').select('*').eq('status', 'open'))
  if (!active.length && !openPos.length) return { ...log, skipped: 'nessuna modalità attiva' }

  const symbols = [...new Set([...active.flatMap(a => a.s.symbols), ...openPos.map(p => p.symbol)])]
  if (info.minutes >= 480 && info.minutes < ENTRY_UNTIL) log.prep = await prepare(symbols, today, info.minutes >= OPEN_MIN - 5)

  const prepRows = await q(db().from('wt_prep').select('symbol, data').eq('day', today))
  const preps = Object.fromEntries(prepRows.map(r => [r.symbol, r.data]))
  const notes = []
  const lastPrice = {}
  const needTk = openPos.filter(p => !series[p.symbol]?.['1m']?.length).map(p => ASSET_MAP[p.symbol].perp)
  if (needTk.length) { const t = await tickers(needTk); for (const p of openPos) { const x = t[ASSET_MAP[p.symbol].perp]; if (x?.last) lastPrice[p.symbol] = x.last } }
  const ctx = { series, today, nowMin: info.minutes, closeMin, accounts, preps, notes, lastPrice }

  for (const p of openPos) {
    try { await manage(p, ctx) } catch (e) { (log.errors ||= []).push(`${p.symbol}: ${e.message}`) }
  }
  // freno di mercato "chiudi tutto": perdita del giorno (chiusi + aperti) oltre la soglia → chiude tutte le posizioni della strategia
  try { ctx.braked = await brakeCheck(ctx, accRows) ; if (Object.values(ctx.braked).some(Boolean)) log.brake = ctx.braked } catch (e) { (log.errors ||= []).push(`freno: ${e.message}`) }
  // indice di attività del mercato di oggi (dalle 9:35 di New York, una volta al giorno)
  if (info.minutes >= INDEX_READY_MIN && info.minutes <= ENTRY_UNTIL) {
    try { ctx.mindex = await todayIndex(today); log.mindex = ctx.mindex.idx === null ? null : Math.round(ctx.mindex.idx) } catch (e) { (log.errors ||= []).push(`indice: ${e.message}`) }
  }
  if (info.minutes >= OPEN_MIN && info.minutes <= ENTRY_UNTIL && active.length) {
    const dayPos = await q(db().from('wt_positions').select('*').eq('day', today))
    // modalità seguite in questo momento dal controllo veloce dell'apertura: le entrate le fa lui
    const fl = await getMeta('fast:lock').catch(() => null)
    if (fl?.until > Date.now() && fl.day === today) { ctx.fastModes = fl.modes || []; if (ctx.fastModes.length) log.fast = ctx.fastModes }
    try { await entries(ctx, active, dayPos) } catch (e) { (log.errors ||= []).push(`entrate: ${e.message}`) }
  }
  log.opened = notes.filter(n => /^(▲|▼)/.test(n.title)).length
  log.closed = notes.filter(n => /^(✓|✗)/.test(n.title)).length
  if (notes.length) log.pushes = (await notifyTrades(notes)).sent
  return log
}

// Chiusura manuale dalla pagina Strategia (una posizione o tutte)
export async function closeManual(mode, id) {
  let query = db().from('wt_positions').select('*').eq('status', 'open').eq('mode', mode)
  if (id) query = query.eq('id', id)
  const list = await q(query)
  if (!list.length) return { closed: 0 }
  const accRows = await q(db().from('wt_accounts').select('*'))
  const accounts = Object.fromEntries(accRows.map(a => [a.mode, a]))
  const t = await tickers(list.map(p => ASSET_MAP[p.symbol].perp))
  const notes = []
  for (const p of list) {
    const px = t[ASSET_MAP[p.symbol].perp]?.last
    if (px) await closePos(p, px, 'chiusa a mano', accounts, notes)
  }
  if (notes.length) await notifyTrades(notes)
  return { closed: notes.length }
}
