// Motore dal vivo della strategia "Apertura USA" per le due modalità:
//  - paper (Prova): capitale fittizio, ordini simulati al prezzo del segnale, commissione impostata
//  - live (Reale): ordini veri su Bitunix, solo se LIVE_TRADING=on, il conto Reale è attivo e le chiavi API ci sono
// Gira ogni minuto dentro /api/cron/tick con le candele da 1 minuto già scaricate.
import { ASSET_MAP } from '../shared/assets.js'
import { normalizeSettings, sizing, exitLevel, exitReason, pnlOf, closeMinute, isTradingDay } from '../shared/opening.js'
import { prepFromBars, findEntry, newPosition, stepBar, ENTRY_UNTIL, MIN, PREP_BARS } from '../shared/engine.js'
import { klinesBack, account, setIsolated, setLeverage, openMarket, openPositions, closePosition, hasKeys, roundQty, tickers } from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { notifyTrades } from './push.js'
import { ny, OPEN_MIN } from './session.js'
import { getPairs } from './scanner.js'

export const liveAllowed = () => process.env.LIVE_TRADING === 'on' && hasKeys()

const fmt = p => (p >= 1000 ? p.toFixed(1) : p >= 100 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toPrecision(4))
const sgn = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
const modeName = m => (m === 'live' ? 'Reale' : 'Prova')

// ---------- Preparazione del giorno (livelli, volatilità, volume normale) ----------
async function prepSymbol(sym, today) {
  const bars = await klinesBack(ASSET_MAP[sym].perp, '15m', PREP_BARS) // ~13 giorni di candele da 15 min
  return prepFromBars(bars, today)
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

// ---------- Bitunix: apertura e chiusura vere ----------
async function openLive({ sym, side, notional, price, leverage, initStop }) {
  const a = ASSET_MAP[sym]
  const pair = (await getPairs()).find(p => p.symbol === a.perp)
  if (!pair) throw new Error(`${a.perp} non disponibile su Bitunix`)
  const lev = Math.min(leverage, pair.maxLeverage || leverage)
  const qty = roundQty(notional / price, pair.basePrecision)
  if (!(qty > 0) || qty < pair.minQty) throw new Error(`quantità troppo piccola (${qty}, minimo ${pair.minQty})`)
  // margine isolato e leva: se sono già impostati Bitunix può rispondere con un errore innocuo
  await setIsolated(a.perp).catch(() => {})
  await setLeverage(a.perp, lev).catch(() => {})
  const sl = pair.quotePrecision !== null ? Number(initStop.toFixed(pair.quotePrecision)) : Number(initStop.toPrecision(6))
  const order = await openMarket({ symbol: a.perp, side, qty, slPrice: sl, clientId: `wt${Date.now()}${sym}`.slice(0, 32) })
  let pos = null
  for (let i = 0; i < 3 && !pos; i++) {
    const list = await openPositions(a.perp).catch(() => [])
    pos = list.find(p => p.side === side) || null
    if (!pos) await new Promise(r => setTimeout(r, 400))
  }
  return { qty: pos?.qty || qty, entry: pos?.entry || price, leverage: lev, exchange: { orderId: order?.orderId, positionId: pos?.positionId || null, sl } }
}

async function closeLive(p, fallbackPrice) {
  const a = ASSET_MAP[p.symbol]
  const list = await openPositions(a.perp)
  const pos = list.find(x => (p.exchange?.positionId ? x.positionId === p.exchange.positionId : x.side === p.side))
  if (!pos) return { closedByExchange: true, price: p.init_stop } // già chiusa dallo stop loss su Bitunix
  await closePosition(pos.positionId)
  return { closedByExchange: false, price: fallbackPrice }
}

// ---------- Chiusura (comune) ----------
async function closePos(p, exit, reason, accounts, notes) {
  const acc = accounts[p.mode]
  const s = normalizeSettings(acc.settings)
  let note = null
  if (p.mode === 'live') {
    try {
      const r = await closeLive(p, exit)
      if (r.closedByExchange) { exit = r.price; reason = 'stop loss (Bitunix)' }
    } catch (e) { note = `chiusura su Bitunix non riuscita: ${e.message}`; reason = `${reason} · da verificare` }
  }
  const fee = p.mode === 'live' ? 0.06 : s.fee
  const { pnl, fees } = pnlOf(p, exit, fee)
  await q(db().from('wt_positions').update({
    status: 'closed', exit, reason, pnl, fees, closed_at: Date.now(), best: p.best, last_bar: p.last_bar,
    init_stop: p.init_stop, halved: p.halved, stale_done: p.stale_done, confirmed: p.confirmed, volx: p.volx, ...(note ? { note } : {}),
  }).eq('id', p.id))
  if (p.mode === 'paper') {
    const fresh = await q(db().from('wt_accounts').select('balance').eq('mode', 'paper').single())
    await q(db().from('wt_accounts').update({ balance: fresh.balance + pnl }).eq('mode', 'paper'))
  }
  const pct = pnl / (p.entry * p.qty) * 100
  notes.push({
    title: `${pnl >= 0 ? '✓' : '✗'} ${p.symbol} chiuso ${sgn(pnl)} USDT (${sgn(pct)}%)`,
    body: `${p.side > 0 ? 'Long' : 'Short'} · uscita ${fmt(exit)} · ${reason} · ${modeName(p.mode)}${note ? ' · ' + note : ''}`,
    url: `/strategia?mode=${p.mode}`, tag: `pos-${p.id}-close`,
  })
}

// ---------- Gestione delle posizioni aperte ----------
async function manage(p, ctx) {
  const { series, today, nowMin, closeMin, accounts, preps, notes, lastPrice } = ctx
  const s = normalizeSettings(accounts[p.mode].settings)
  const all = (series[p.symbol]?.['1m'] || []).map(b => ({ ...b, ...ny(b.t) }))
  const todayBars = all.filter(b => b.date === p.day && b.min >= OPEN_MIN)
  const now = Date.now()
  const last = all[all.length - 1]
  const px = last?.c ?? lastPrice[p.symbol]

  // posizione rimasta aperta da un giorno precedente (es. controllo saltato): chiudi subito
  if (p.day < today) { if (px) await closePos(p, px, 'chiusura', accounts, notes); return }

  let exit = null, reason = null
  for (const b of todayBars) {
    if (b.t <= (p.last_bar ?? 0) || b.t + MIN > now) continue // solo candele chiuse e non ancora controllate
    const r = stepBar(p, s, b, todayBars, preps[p.symbol])
    if (r) { exit = r.exit; reason = r.reason; break }
  }
  // controllo in tempo reale sul prezzo attuale (candela ancora in corso)
  if (exit === null && px) {
    const lvl = exitLevel(p, s)
    if (p.side > 0 ? px <= lvl : px >= lvl) { exit = px; reason = exitReason(p, lvl) }
  }
  // fine giornata: chiudi tutto un minuto prima della chiusura della borsa
  if (exit === null && nowMin >= closeMin - 1 && px) { exit = px; reason = 'chiusura' }

  if (exit !== null) return closePos(p, exit, reason, accounts, notes)
  await q(db().from('wt_positions').update({
    best: p.best, last_bar: p.last_bar, init_stop: p.init_stop, halved: p.halved, stale_done: p.stale_done, confirmed: p.confirmed, volx: p.volx,
  }).eq('id', p.id))
}

// ---------- Entrate ----------
async function entries(ctx, active, dayPos) {
  const { series, today, preps, notes } = ctx
  const skipKey = `orbskip:${today}`
  const skips = (await getMeta(skipKey)) || { paper: {}, live: {} }
  let skipsChanged = false
  const skip = (mode, sym, why) => { (skips[mode] ||= {})[sym] = why; skipsChanged = true }
  const now = Date.now()
  let liveBalance = null

  for (const acc of active) {
    const s = acc.s, mode = acc.mode
    if (mode === 'live' && !liveAllowed()) continue
    const taken = dayPos.filter(p => p.mode === mode)
    for (const sym of s.symbols) {
      if (taken.some(p => p.symbol === sym) || skips[mode]?.[sym]) continue
      if (s.maxPos > 0 && taken.length >= s.maxPos) break
      const prep = preps[sym]
      if (!prep) continue
      const bars = (series[sym]?.['1m'] || []).map(b => ({ ...b, ...ny(b.t) })).filter(b => b.date === today && b.min >= OPEN_MIN && b.min < ENTRY_UNTIL)
      const sig = findEntry(bars, s, prep)
      if (!sig) continue
      if (sig.skip) { skip(mode, sym, sig.skip); continue }
      const { k, side } = sig
      // nel Reale si entra solo se il segnale è appena scattato (niente entrate in ritardo a prezzi peggiori)
      if (mode === 'live' && now - (k.t + MIN) > 2 * MIN) { skip(mode, sym, 'segnale scattato mentre il controllo era fermo'); continue }

      let base = acc.balance
      if (mode === 'live') {
        if (liveBalance === null) liveBalance = await account().then(x => x.equity).catch(() => 0)
        base = liveBalance
      }
      const { capital, margin, notional } = sizing(s, base)
      if (!(margin >= 1)) { skip(mode, sym, 'capitale insufficiente'); continue }
      const unit = prep.unit
      let pos = newPosition({ mode, day: today, symbol: sym, sig, s, prep, size: { capital, margin, notional } })
      if (mode === 'live') {
        try {
          const r = await openLive({ sym, side, notional, price: series[sym]['1m'].at(-1).c, leverage: s.leverage, initStop: pos.init_stop })
          pos = { ...pos, entry: r.entry, qty: r.qty, leverage: r.leverage, best: r.entry, init_stop: r.entry - side * s.sl * unit, exchange: r.exchange, opened_at: now }
        } catch (e) {
          skip(mode, sym, `ordine non riuscito: ${e.message}`)
          notes.push({ title: `⚠ ${sym}: ordine non riuscito`, body: `${e.message} · Reale`, url: '/strategia?mode=live', tag: `err-${sym}` })
          continue
        }
      }
      const [row] = await q(db().from('wt_positions').insert(pos).select())
      taken.push(row); dayPos.push(row)
      notes.push({
        title: `${side > 0 ? '▲ LONG' : '▼ SHORT'} ${sym} a ${fmt(pos.entry)}`,
        body: `${sgn(pos.move_pct)}% dall'apertura · stop ${fmt(pos.init_stop)} · margine ${pos.margin.toFixed(0)} USDT × ${pos.leverage}x · ${modeName(mode)}`,
        url: `/strategia?mode=${mode}`, tag: `pos-${row.id}`,
      })
    }
  }
  if (skipsChanged) await setMeta(skipKey, skips)
}

// ---------- Punto d'ingresso dal controllo ogni minuto ----------
export async function runStrategy(series, info) {
  const today = info.date
  const log = { day: today }
  if (!isTradingDay(today, info.isWeekday)) return { ...log, skipped: 'borsa chiusa' }
  const closeMin = closeMinute(today)
  const accRows = await q(db().from('wt_accounts').select('*'))
  const accounts = Object.fromEntries(accRows.map(a => [a.mode, a]))
  const active = accRows.filter(a => a.enabled).map(a => ({ ...a, s: normalizeSettings(a.settings) }))
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
  if (info.minutes >= OPEN_MIN && info.minutes <= ENTRY_UNTIL && active.length) {
    const dayPos = await q(db().from('wt_positions').select('*').eq('day', today))
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
