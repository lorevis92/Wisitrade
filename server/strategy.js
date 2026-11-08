// Motore dal vivo della strategia "Apertura USA" per le due modalità:
//  - paper (Prova): capitale fittizio, ordini simulati al prezzo del segnale, commissione impostata
//  - live (Reale): ordini veri su Bitunix, solo se LIVE_TRADING=on, il conto Reale è attivo e le chiavi API ci sono
// Gira ogni minuto dentro /api/cron/tick con le candele da 1 minuto già scaricate.
import { ASSET_MAP } from '../shared/assets.js'
import {
  normalizeSettings, sizing, pathOf, walk, exitLevel, exitReason, pnlOf, closeMinute, isTradingDay, HOLIDAYS,
} from '../shared/opening.js'
import { klinesBack, account, setIsolated, setLeverage, openMarket, openPositions, closePosition, hasKeys, roundQty, tickers } from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { notifyTrades } from './push.js'
import { ny, OPEN_MIN } from './session.js'
import { getPairs } from './scanner.js'

const MIN = 60000
const ENTRY_UNTIL = OPEN_MIN + 30 // entrate solo nei primi 30 minuti
const LOOKBACK = 10, MIN_HISTORY = 5
export const liveAllowed = () => process.env.LIVE_TRADING === 'on' && hasKeys()

const fmt = p => (p >= 1000 ? p.toFixed(1) : p >= 100 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toPrecision(4))
const sgn = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
const modeName = m => (m === 'live' ? 'Reale' : 'Prova')
const weekdayOf = d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6 }

// ---------- Preparazione del giorno (livelli, volatilità, volume normale) ----------
async function prepSymbol(sym, today) {
  const a = ASSET_MAP[sym]
  const bars = await klinesBack(a.perp, '15m', 1300) // ~13 giorni di candele da 15 min
  const rth = []
  for (const b of bars) {
    const n = ny(b.t)
    if (n.date >= today || !weekdayOf(n.date) || HOLIDAYS.has(n.date)) continue
    if (n.min < OPEN_MIN || n.min >= closeMinute(n.date)) continue
    rth.push({ ...b, date: n.date, min: n.min })
  }
  const byDate = {}
  for (const b of rth) (byDate[b.date] ||= []).push(b)
  const dates = Object.keys(byDate).sort().filter(d => byDate[d].length >= 8)
  const prev = dates.slice(-LOOKBACK)
  if (prev.length < MIN_HISTORY) return { ok: false, why: `solo ${prev.length} giorni di storico su Bitunix` }
  // ATR (Wilder 14) sulle candele da 15 min in orario di borsa
  const seq = dates.flatMap(d => byDate[d])
  let atr = NaN
  seq.forEach((b, i) => {
    const tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - seq[i - 1].c), Math.abs(b.l - seq[i - 1].c))
    atr = i < 14 ? (Number.isNaN(atr) ? tr : atr + (tr - atr) / (i + 1)) : (atr * 13 + tr) / 14
  })
  const y = byDate[prev[prev.length - 1]], last5 = prev.slice(-5).flatMap(d => byDate[d])
  const levels = [
    { p: Math.max(...y.map(b => b.h)), t: 'massimo di ieri' }, { p: Math.min(...y.map(b => b.l)), t: 'minimo di ieri' },
    { p: y[y.length - 1].c, t: 'chiusura di ieri' },
    { p: Math.max(...last5.map(b => b.h)), t: 'massimo 5 giorni' }, { p: Math.min(...last5.map(b => b.l)), t: 'minimo 5 giorni' },
  ]
  const first = prev.map(d => byDate[d][0]).filter(b => b.min === OPEN_MIN)
  const atrOpen = first.length ? first.reduce((s, b) => s + (b.h - b.l), 0) / first.length : atr
  const slotVol = {}
  for (const slot of [570, 585]) {
    const v = prev.map(d => byDate[d].find(b => b.min === slot)).filter(Boolean).map(b => b.v)
    slotVol[slot] = v.length >= MIN_HISTORY ? v.reduce((s, x) => s + x, 0) / v.length : null
  }
  return { ok: true, levels, atr, atrOpen, unit: Math.max(atr, atrOpen), slotVol, days: prev.length, yClose: y[y.length - 1].c }
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
const agg = bars => bars.length ? { t: bars[0].t, o: bars[0].o, h: Math.max(...bars.map(b => b.h)), l: Math.min(...bars.map(b => b.l)), c: bars[bars.length - 1].c, v: bars.reduce((s, b) => s + b.v, 0) } : null

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

  const inProfit = x => p.side * (x - p.entry) > 0
  let exit = null, reason = null
  for (const b of todayBars) {
    if (b.t <= (p.last_bar ?? 0) || b.t + MIN > now) continue // solo candele chiuse e non ancora controllate
    const hit = walk(p, s, pathOf(b))
    p.last_bar = b.t
    if (hit !== null) { exit = hit; reason = exitReason(p, hit); break }
    // a ogni chiusura di una candela da 15 minuti
    if ((b.min + 1 - OPEN_MIN) % 15 === 0) {
      const slot = b.min - 14
      const b15 = agg(todayBars.filter(x => x.min >= slot && x.min <= b.min))
      if (!b15) continue
      if (!p.confirmed && slot === p.entry_slot) {
        // conferma: volume della candela d'entrata almeno 1,5 volte il normale e prezzo dalla parte giusta del VWAP
        p.confirmed = true
        const norm = preps[p.symbol]?.slotVol?.[slot]
        p.volx = norm ? b15.v / norm : null
        let pv = 0, vv = 0
        for (const x of todayBars) { if (x.min > b.min) break; const tp = (x.h + x.l + x.c) / 3; pv += tp * x.v; vv += x.v }
        const vwap = vv > 0 ? pv / vv : b15.c
        const ok = p.volx >= 1.5 && (p.side > 0 ? b15.c > vwap : b15.c < vwap)
        if (!ok && inProfit(b15.c)) { exit = b15.c; reason = 'nessuna conferma'; break }
      } else if (slot > p.entry_slot) {
        if (!p.stale_done && slot - p.entry_slot >= 60) {
          p.stale_done = true
          if (p.side * (p.best - p.entry) < 0.5 * p.unit) {
            if (s.stale === 'close' && p.side * (b15.c - p.entry) <= 0) { exit = b15.c; reason = 'fermo dopo 60 min'; break }
            if (s.stale === 'half') { p.init_stop = p.entry - p.side * s.sl * p.unit / 2; p.halved = true }
          }
        }
        const R = p.level
        if (R && inProfit(b15.c) && (p.side > 0 ? b15.h >= R.p && b15.c < R.p : b15.l <= R.p && b15.c > R.p)) { exit = b15.c; reason = 'resistenza'; break }
      }
    }
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
      if (!prep.ok) { skip(mode, sym, prep.why || 'dati insufficienti'); continue }
      const bars = (series[sym]?.['1m'] || []).map(b => ({ ...b, ...ny(b.t) })).filter(b => b.date === today && b.min >= OPEN_MIN && b.min < ENTRY_UNTIL)
      if (!bars.length) continue
      if (bars[0].min !== OPEN_MIN) { skip(mode, sym, 'manca la candela delle 9:30'); continue }
      const open = bars[0].o, X = s.movePct / 100, cu = open * (1 + 1.25 * X), cd = open * (1 - 1.25 * X)
      let k = null, side = 0, entry = 0
      for (const b of bars) {
        const path = pathOf(b)
        for (let i = 0; i < path.length; i++) {
          const prev = i ? path[i - 1] : path[0], cur = path[i]
          if (cur >= cu && (i === 0 || prev < cu)) { k = b; side = 1; entry = i === 0 ? cur : cu; break }
          if (cur <= cd && (i === 0 || prev > cd)) { k = b; side = -1; entry = i === 0 ? cur : cd; break }
        }
        if (k) break
      }
      if (!k) continue
      // spazio fino al livello più vicino nella direzione del trade
      const ahead = prep.levels.filter(l => (side > 0 ? l.p > entry : l.p < entry)).sort((a, b) => (side > 0 ? a.p - b.p : b.p - a.p))
      const R = ahead[0] || null, done = Math.abs(entry - open)
      if (s.room > 0 && R && Math.abs(R.p - entry) < s.room * done) { skip(mode, sym, `${R.t} troppo vicino`); continue }
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
      let pos = {
        mode, day: today, symbol: sym, side, status: 'open', entry, qty: notional / entry, margin, leverage: s.leverage,
        init_stop: entry - side * s.sl * unit, unit, best: entry, open_price: open, move_pct: side * 1.25 * s.movePct,
        level: R, entry_slot: k.min < 585 ? 570 : 585, confirmed: false, last_bar: k.t - 1, opened_at: k.t, capital,
      }
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
