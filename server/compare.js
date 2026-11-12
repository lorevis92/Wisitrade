// Confronto serale: Reale, Prova e Simulazione dello stesso giorno, trade per trade, salvato in wt_meta `cmp:<giorno>`.
// Gira nel controllo ogni minuto fuori orario (dopo le 16:35 di New York, quando l'archivio ha le candele del giorno),
// un giorno per volta, a partire dal primo giorno del Reale; i giorni già confrontati non si rifanno.
// Prima del confronto completa la registrazione dei trade del giorno (docs/dati-dal-vivo.md):
//  - Reale: esecuzioni vere dallo storico di Bitunix (ordini, prezzi, ore, commissioni) in exchange.rec.bx
//  - trade senza registrazione (giorni prima di questa versione): exchange.rec ricostruito da preparazione, archivio e registri
// Solo lettura su Bitunix e solo registrazione nel database: risultati, capitale e regole non cambiano.
import { db, q, getMeta, setMeta } from './db.js'
import { loadDays } from './archive.js'
import { runSimulation, MIN, OPEN_MIN, thresholds, entryUntil } from '../shared/engine.js'
import { settingsFor, isTradingDay } from '../shared/opening.js'
import { addDays, weekdayOf, nyTs } from '../shared/time.js'
import { getLimits } from './limits.js'
import { getIndexRaw, indexOf } from './mindex.js'
import { operable, keepOperable } from './operable.js'
import { ASSET_MAP } from '../shared/assets.js'
import { hasKeys, positionHistory, historyTrades } from './bitunix.js'
import { REC_V, prepSnap, exitRec, histSnap, dayEvents } from './record.js'

export const CMP_V = 1
export const FIRST_DAY = '2026-11-09' // primo giorno del Reale
const MODES = ['live', 'paper']
const num = x => (Number.isFinite(x) ? +(+x).toPrecision(8) : null)
const avg = a => (a.length ? num(a.reduce((x, y) => x + y, 0) / a.length) : null)
const tradingDays = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d, weekdayOf(d))) out.push(d); return out }

// Punto d'ingresso dal controllo ogni minuto. info = nyInfo(); day = giorno da rifare (pagina/API), write = false per provare
export async function eveningCompare(info, { budgetMs = 30000, day: forced = null, write = true } = {}) {
  const t0 = Date.now()
  const last = info.minutes >= 990 || !isTradingDay(info.date, info.isWeekday) ? info.date : addDays(info.date, -1)
  const cand = forced ? [forced] : tradingDays(FIRST_DAY, last).slice(-15)
  if (!cand.length) return { done: true }
  let todo = cand
  if (!forced) {
    const have = await q(db().from('wt_meta').select('key, v:value->v').in('key', cand.map(d => `cmp:${d}`)))
    const done = new Set(have.filter(r => r.v === CMP_V).map(r => r.key.slice(4)))
    todo = cand.filter(d => !done.has(d))
  }
  if (!todo.length) return { done: true }
  return compareDay(todo[0], { t0, budgetMs, write, today: info.date })
}

export async function compareDay(day, { t0 = Date.now(), budgetMs = 30000, write = true, today = day } = {}) {
  const [positions, accRows, snaps, brake, mindexDay, opensFast, firstsFast, skips, events, closecost, prepRows] = await Promise.all([
    q(db().from('wt_positions').select('*').eq('day', day).order('opened_at')),
    q(db().from('wt_accounts').select('*')),
    Promise.all(MODES.map(m => getMeta(`dayset:${m}:${day}`))).then(a => Object.fromEntries(MODES.map((m, i) => [m, a[i]]))),
    getMeta(`brake:${day}`), getMeta(`mindex:${day}`), getMeta(`fast:opens:${day}`), getMeta(`fast:first:${day}`), getMeta(`orbskip:${day}`),
    dayEvents(day), getMeta(`closecost:${day}`),
    q(db().from('wt_prep').select('symbol, data').eq('day', day)),
  ])
  const accounts = Object.fromEntries(accRows.map(a => [a.mode, a]))
  const preps = Object.fromEntries(prepRows.map(r => [r.symbol, r.data]))
  const op = await operable()
  // impostazioni del giorno (registrate alle 9:25), altrimenti quelle di adesso
  const setup = {}
  for (const mode of MODES) {
    const mine = positions.filter(p => p.mode === mode)
    const snap = snaps[mode]
    if (!mine.length && !snap) continue
    let s, from
    if (snap?.settings) { s = snap.settings; from = 'giorno' } else { const s0 = settingsFor(mode, accounts[mode]?.settings); s = { ...s0, symbols: keepOperable(s0.symbols, op) }; from = 'attuali' }
    // il Reale non apre mai con lo stop oltre la liquidazione e paga la commissione vera (come closePos)
    if (mode === 'live') s = { ...s, liqGuard: true, fee: 0.06 }
    setup[mode] = { s, from, mine, snap }
  }
  const modes = Object.keys(setup)
  if (!modes.length) return save(day, { v: CMP_V, day, at: Date.now(), empty: true }, write)
  const symbols = [...new Set(modes.flatMap(m => [...setup[m].s.symbols, ...setup[m].mine.map(p => p.symbol)]))].filter(x => ASSET_MAP[x])

  // archivio del giorno pronto per tutti i titoli? (aspetta fino a 2 giorni, poi confronta con quello che c'è)
  const bars = await q(db().from('wt_bars').select('symbol').eq('day', day).in('symbol', symbols))
  if (bars.length < symbols.length && day >= addDays(today, -2)) return { waiting: day, archive: bars.length, need: symbols.length }

  // 1. candele dell'archivio (40 giorni prima: preparazione come nella Simulazione)
  const days = await loadDays(symbols, addDays(day, -40), day)
  const todayBars = days[day] || {}

  // 2. trade senza registrazione: si ricostruisce quello che si può
  let rebuilt = 0
  for (const p of positions) {
    if (p.exchange?.rec || p.status !== 'closed') continue
    const st = setup[p.mode]?.s || settingsFor(p.mode, accounts[p.mode]?.settings)
    const rec = rebuildRec(p, { s: st, prep: preps[p.symbol], bars: todayBars[p.symbol] || [], dayPos: positions, brake, mindex: mindexDay })
    p.exchange = { ...(p.exchange || {}), rec }
    if (write) await q(db().from('wt_positions').update({ exchange: p.exchange }).eq('id', p.id))
    rebuilt++
  }

  // 3. Reale: esecuzioni vere dallo storico di Bitunix (solo lettura; se il tempo non basta si continua al giro dopo)
  const bxDone = await bitunixFills(positions.filter(p => p.mode === 'live' && p.status === 'closed'), { t0, budgetMs: budgetMs * 0.6, write })
  if (bxDone.left) return { day, rebuilt, bitunix: bxDone, more: true }

  // 4. Simulazione del giorno per ogni modalità, con le sue impostazioni e il suo capitale di inizio giornata
  const limits = await getLimits().catch(() => ({}))
  const raw = await getIndexRaw()
  const mindex = {}
  for (const d of Object.keys(days)) { const x = indexOf(raw, d); if (x) mindex[d] = x }
  const out = { v: CMP_V, day, at: Date.now(), modes: {}, rebuilt, bitunix: bxDone }
  for (const mode of modes) {
    const { s, from, mine, snap } = setup[mode]
    const cap = capitalFor(mode, s, snap, mine, accounts[mode])
    const r = runSimulation(days, s, { from: day, to: day, capital: cap.capital, limits, mindex, analysis: false, story: true })
    out.modes[mode] = modeCompare({ mode, s, from, cap, r, mine, ev: events[mode] || {}, skips: skips?.[mode] || {} })
  }
  // Reale: posizioni aperte e chiuse subito (stop non accettato, margine non isolato): costo vero, fuori dai trade
  if (closecost?.length) out.immediate = closecost
  // 5. Reale e Prova a confronto sugli stessi titoli
  if (out.modes.live && out.modes.paper) out.livePaper = livePaper(positions)
  // 6. primo prezzo oltre la soglia: dal controllo veloce (al secondo) o, per i giorni prima, dalle candele (al minuto)
  out.firsts = firstsFast ? { src: 'veloce', ...compactFirsts(firstsFast) } : { src: 'candele', ...firstsFromBars(setup, todayBars, opensFast, day) }
  out.ms = Date.now() - t0
  return save(day, out, write)
}

async function save(day, value, write) {
  if (write) await setMeta(`cmp:${day}`, value)
  return value
}

// ---------- Capitale di partenza della Simulazione ----------
function capitalFor(mode, s, snap, mine, acc) {
  const first = mine.slice().sort((a, b) => a.opened_at - b.opened_at)[0]
  // capitale usato dal primo trade (quello vero, anche se limitato dal saldo); con "% saldo" si risale al saldo
  if (first?.capital > 0) {
    const pct = s.capitalMode !== 'fixed' && s.capitalMode !== 'dedicated' && s.capitalPct > 0
    return { capital: pct ? first.capital * 100 / s.capitalPct : first.capital, from: 'primo trade' }
  }
  if (snap?.capital > 0) return { capital: snap.capital, from: 'giorno' }
  if (snap?.balance > 0) return { capital: snap.balance, from: 'giorno' }
  return { capital: mode === 'paper' ? acc?.balance || 300 : s.capitalDedicated || 300, from: 'attuale' }
}

// ---------- Confronto di una modalità ----------
const realOf = p => {
  const rec = p.exchange?.rec, slip = p.exchange?.slip || {}, tm = p.exchange?.timing || {}
  const notional = p.entry * p.qty
  const mx = rec?.mx
  return {
    id: p.id, src: tm.src ?? rec?.entry?.src ?? null, bar: p.entry_bar ?? null, sigAt: tm.signalAt ?? null, level: num(tm.level ?? slip.sigIn ?? null),
    entry: num(p.entry), exit: num(p.exit), exitLevel: num(slip.sigOut ?? null), closedAt: p.closed_at, reason: p.reason,
    pnl: num(p.pnl), fees: num(p.fees), funding: num(p.funding), pct: notional ? num(p.pnl / notional * 100) : null,
    gross: num(p.side * (p.exit - p.entry) / p.entry * 100), stop: num(rec?.stop0 ?? p.exchange?.sl ?? p.init_stop),
    mfe: mx ? num(p.side > 0 ? (mx.hi - p.entry) / p.entry * 100 : (p.entry - mx.lo) / p.entry * 100) : null,
    mae: mx ? num(p.side > 0 ? (mx.lo - p.entry) / p.entry * 100 : (p.entry - mx.hi) / p.entry * 100) : null,
    half: p.half_done ? { px: num(p.half_px), qty: num(p.half_qty) } : null,
  }
}
const simOf = t => ({
  bar: t.opened_at, signal: num(t.signal), entry: num(t.entry), exit: num(t.exit), closedAt: t.closed_at, reason: t.reason, pnl: num(t.pnl), fees: num(t.fees),
  pct: num(t.pct), gross: num(t.side * (t.exit - t.entry) / t.entry * 100), stop: num(t.stop), half: t.half ? { px: num(t.half.px), qty: num(t.half.qty) } : null,
})

function modeCompare({ mode, s, from, cap, r, mine, ev, skips }) {
  const closed = mine.filter(p => p.status === 'closed')
  const row = r.daily[0] || null
  const simSkip = Object.fromEntries((row?.skipped || []).map(([sym, min, side, why]) => [sym, { min, side, why }]))
  const syms = [...new Set([...r.trades.map(t => t.symbol), ...closed.map(p => p.symbol)])]
  const rows = []
  for (const sym of syms) {
    const t = r.trades.find(x => x.symbol === sym), p = closed.find(x => x.symbol === sym)
    const x = { symbol: sym, side: p?.side ?? t?.side, sim: t ? simOf(t) : null, real: p ? realOf(p) : null }
    if (t && p) {
      x.d = {
        sameSide: t.side === p.side,
        entryMin: p.entry_bar && t.opened_at ? Math.round((p.entry_bar - t.opened_at) / MIN) : null,
        // a favore del vivo (positivo = il vivo ha fatto meglio della Simulazione)
        entryPct: num(p.side * (t.entry - p.entry) / t.entry * 100),
        exitPct: num(p.side * (p.exit - t.exit) / t.exit * 100),
        resPct: x.real.pct !== null ? num(x.real.pct - t.pct) : null,
        sameReason: t.reason === p.reason || (t.reason === 'stop loss' && /stop loss/.test(p.reason || '')),
        exitMin: p.closed_at && t.closed_at ? Math.round((p.closed_at - t.closed_at) / MIN) : null,
      }
    } else if (t) x.why = whyReal(ev[sym], skips[sym])
    else x.why = simSkip[sym] ? `Simulazione: ${simSkip[sym].why} (${hm(simSkip[sym].min)})` : 'Simulazione: nessun segnale'
    rows.push(x)
  }
  rows.sort((a, b) => (a.real?.bar ?? a.sim?.bar ?? 0) - (b.real?.bar ?? b.sim?.bar ?? 0))
  const both = rows.filter(x => x.d)
  const realPnl = closed.reduce((a, p) => a + (p.pnl || 0), 0)
  // segnali di tutti i titoli: cosa ha fatto il vivo e cosa la Simulazione (aperto, scartato e perché)
  const signals = []
  for (const sym of s.symbols) {
    const e = ev[sym], k = skips[sym], t = r.trades.find(x => x.symbol === sym), sk = simSkip[sym]
    if (!e && !k && !t && !sk) continue
    const realLast = e?.filter(x => x.kind !== 'scartato' || x.px || x.bar).at(-1) || e?.at(-1) || null
    signals.push({
      symbol: sym,
      real: closed.some(p => p.symbol === sym) ? 'aperto' : k ? `scartato: ${k}` : realLast?.kind || null, realAt: realLast?.at ?? realLast?.seenAt ?? null, realPx: realLast?.px ?? null,
      sim: t ? 'aperto' : sk ? `scartato: ${sk.why}` : null, simMin: t ? Math.round((t.opened_at - nyTs(r.from, 0)) / MIN) : sk?.min ?? null,
    })
  }
  return {
    settingsFrom: from, capital: num(cap.capital), capitalFrom: cap.from, symbols: s.symbols.length,
    sim: { n: r.trades.length, pnl: num(r.net), pct: num(row?.pct ?? 0), limitEvents: r.limitEvents },
    real: { n: closed.length, pnl: num(realPnl), pct: cap.capital > 0 ? num(realPnl / cap.capital * 100) : null },
    matched: both.length, onlySim: rows.filter(x => x.sim && !x.real).length, onlyReal: rows.filter(x => x.real && !x.sim).length,
    avg: { entryPct: avg(both.map(x => x.d.entryPct)), exitPct: avg(both.map(x => x.d.exitPct)), resPct: avg(both.map(x => x.d.resPct).filter(v => v !== null)), sameReason: both.filter(x => x.d.sameReason).length },
    rows, signals,
  }
}
const hm = min => (min === null || min === undefined ? '?' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`)
function whyReal(e, k) {
  if (k) return `vivo: ${k}`
  const last = e?.at(-1)
  return last ? `vivo: ${last.why || last.kind}` : 'vivo: nessun segnale'
}

function livePaper(positions) {
  const live = positions.filter(p => p.mode === 'live' && p.status === 'closed'), paper = positions.filter(p => p.mode === 'paper' && p.status === 'closed')
  const syms = [...new Set([...live, ...paper].map(p => p.symbol))]
  return syms.map(sym => {
    const a = live.find(p => p.symbol === sym), b = paper.find(p => p.symbol === sym)
    const A = a ? realOf(a) : null, B = b ? realOf(b) : null
    return {
      symbol: sym, live: A, paper: B,
      d: A && B ? { sameSide: a.side === b.side, entryPct: num(a.side * (b.entry - a.entry) / b.entry * 100), exitPct: num(a.side * (a.exit - b.exit) / b.exit * 100), resPct: A.pct !== null && B.pct !== null ? num(A.pct - B.pct) : null, sameReason: a.reason === b.reason } : null,
    }
  })
}

// ---------- Primo prezzo oltre la soglia ----------
function compactFirsts(f) {
  const out = {}
  for (const [mode, list] of Object.entries(f || {})) out[mode] = Object.fromEntries(Object.entries(list).map(([sym, x]) => [sym, { at: x.at, px: x.px, side: x.side, level: num(x.level), before: x.before || null, taken: x.taken, skip: x.skip }]))
  return out
}
function firstsFromBars(setup, todayBars, opens, day) {
  const out = {}
  for (const [mode, { s }] of Object.entries(setup)) {
    const m = (out[mode] = {})
    for (const sym of s.symbols) {
      const bars = (todayBars[sym] || []).filter(b => b.min >= OPEN_MIN && b.min < entryUntil(s))
      if (!bars.length) continue
      const open = opens?.[sym] ?? (bars[0].min === OPEN_MIN ? bars[0].o : null)
      if (!open) continue
      const { cu, cd } = thresholds(s, open)
      const b = bars.find(x => x.h >= cu || x.l <= cd)
      if (b) m[sym] = { bar: b.t, min: b.min, side: b.h >= cu ? 1 : -1, level: num(b.h >= cu ? cu : cd), approx: 'minuto' }
    }
  }
  return out
}

// ---------- Registrazione dei trade dei giorni prima ----------
export function rebuildRec(p, { s, prep, bars, dayPos, brake, mindex }) {
  const tm = p.exchange?.timing || {}, slip = p.exchange?.slip || {}
  const mine = dayPos.filter(x => x.mode === p.mode)
  const before = mine.filter(x => x.opened_at < p.opened_at)
  const fillAt = tm.fillAt ?? p.opened_at
  const mx = { hi: p.entry, hiAt: fillAt, lo: p.entry, loAt: fillAt, k: null, approx: true }
  for (const b of bars) {
    if (b.t < (p.entry_bar ?? 0) || b.t >= (p.closed_at ?? 0)) continue
    if (b.t === p.entry_bar) { mx.k = { h: b.h, l: b.l }; continue }
    if (b.h > mx.hi) { mx.hi = b.h; mx.hiAt = b.t }
    if (b.l < mx.lo) { mx.lo = b.l; mx.loAt = b.t }
  }
  const exits = []
  if (p.half_done) exits.push(exitRec(p, { kind: 'metà', reason: 'metà subito', level: p.mode === 'live' ? null : p.half_px, fillPx: p.half_px, qty: p.half_qty }))
  exits.push({ ...exitRec(p, { reason: p.reason, level: slip.sigOut ?? p.exit, fillPx: slip.fillOut ?? (p.mode === 'live' ? null : p.exit), byExchange: !!slip.byExchange, qty: p.qty - (p.half_done && p.half_qty > 0 ? p.half_qty : 0) }), closedAt: p.closed_at })
  const brakeAt = brake?.[p.mode]?.at ?? null
  return {
    v: REC_V, backfill: true,
    open: p.open_price, threshold: tm.level ?? slip.sigIn ?? null, unit: p.unit, prep: prepSnap(prep), nearest: p.level || null,
    stop0: p.entry - p.side * s.sl * p.unit, stopBx: p.exchange?.sl ?? null,
    entry: {
      src: tm.src ?? null, bar: p.entry_bar ?? null, sigAt: tm.signalAt ?? null, sigPx: tm.sigPx ?? slip.sigPx ?? null, level: tm.level ?? slip.sigIn ?? null,
      orderAt: tm.orderAt ?? null, sentAt: p.exchange?.sentAt ?? null, fillAt: tm.fillAt ?? null, fillPx: p.entry,
      delayMs: tm.fillAt && tm.signalAt ? tm.fillAt - tm.signalAt : null,
      slipPct: (tm.level ?? slip.sigIn) ? p.side * ((tm.level ?? slip.sigIn) - p.entry) / (tm.level ?? slip.sigIn) * 100 : null,
      orderId: p.exchange?.orderId ?? null, positionId: p.exchange?.positionId ?? null, slOrderId: p.exchange?.slOrderId ?? null,
    },
    size: { qty: p.qty, leverage: p.leverage, margin: p.margin, notional: p.qty * p.entry, capital: p.capital, liq: p.liq_price },
    state: {
      openNow: before.filter(x => !x.closed_at || x.closed_at > p.opened_at).length, takenToday: before.length, maxPos: s.maxPos,
      mindex: mindex?.idx ?? null, braked: !!(brakeAt && brakeAt < p.opened_at), dayPnl: before.filter(x => x.closed_at && x.closed_at <= p.opened_at).reduce((a, x) => a + (x.pnl || 0), 0),
      brakePct: s.brakePct, maxDayLoss: s.maxDayLoss, maxTotalLoss: s.maxTotalLoss,
    },
    mx, exits,
  }
}

// ---------- Reale: esecuzioni vere dallo storico di Bitunix ----------
async function bitunixFills(rows, { t0, budgetMs, write }) {
  const todo = rows.filter(p => p.exchange?.positionId && p.exchange?.rec && !p.exchange.rec.bx)
  if (!todo.length || !hasKeys()) return { done: 0, left: 0, keys: hasKeys() }
  let done = 0
  for (const p of todo) {
    if (Date.now() - t0 > budgetMs) break
    const perp = ASSET_MAP[p.symbol]?.perp
    const [h, fills] = await Promise.all([
      positionHistory(perp, p.exchange.positionId).catch(() => null),
      historyTrades(perp, { positionId: p.exchange.positionId, startTime: p.opened_at - 5 * MIN, endTime: (p.closed_at || Date.now()) + 10 * MIN }).catch(e => ({ error: e.message })),
    ])
    const list = Array.isArray(fills) ? fills : []
    const entryId = p.exchange.orderId ? String(p.exchange.orderId) : null
    const byOrder = new Map()
    for (const f of list) { const k = f.orderId || f.tradeId; if (!byOrder.has(k)) byOrder.set(k, []); byOrder.get(k).push(f) }
    const orders = [...byOrder.entries()].map(([orderId, fs]) => {
      const qty = fs.reduce((a, f) => a + (f.qty || 0), 0)
      return { orderId, qty: num(qty), px: qty ? num(fs.reduce((a, f) => a + (f.qty || 0) * (f.price || 0), 0) / qty) : null, fee: num(fs.reduce((a, f) => a + (f.fee || 0), 0)), at: fs[0].at, lastAt: fs.at(-1).at, side: fs[0].side, tradeSide: fs[0].tradeSide, role: fs[0].role, n: fs.length, entry: orderId === entryId || fs[0].tradeSide === 'OPEN' }
    })
    const bx = { at: Date.now(), hist: h ? histSnap(h.raw) : null, orders, fills: list.slice(0, 30), ...(fills?.error ? { error: fills.error } : {}) }
    const rec = { ...p.exchange.rec, bx }
    // entrata e uscite: ora e prezzo eseguiti veri dagli ordini (apertura; chiusure in ordine di tempo)
    const inO = orders.find(o => o.entry)
    if (inO) rec.entry = { ...rec.entry, bxPx: inO.px, bxAt: inO.at, bxFee: inO.fee, bxRole: inO.role }
    const outs = orders.filter(o => !o.entry).sort((a, b) => a.at - b.at)
    let oi = 0 // una metà non riuscita su Bitunix (quantità 0) non ha un ordine di chiusura
    if (rec.exits?.length && outs.length) rec.exits = rec.exits.map(e => { if (e.kind === 'metà' && !(e.qty > 0)) return e; const o = outs[oi++]; return o ? { ...e, fillPx: e.fillPx ?? o.px, fillAt: o.lastAt ?? o.at, orderId: o.orderId, fee: o.fee, role: o.role } : e })
    p.exchange = { ...p.exchange, rec }
    if (write) await q(db().from('wt_positions').update({ exchange: p.exchange }).eq('id', p.id))
    done++
  }
  return { done, left: todo.length - done, keys: true }
}
