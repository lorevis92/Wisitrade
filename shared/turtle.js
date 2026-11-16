// Strategia Turtle (breakout giornaliero, solo long): regole comuni a Simulazione, Prova e Reale (server/turtle.js, src/pages/Turtle.jsx).
// Riproduce l'indicatore Pine "Turtle Breakout - Revelio" su candele giornaliere (giorno UTC di Bitunix, solo giorni chiusi per
// bande e ATR), senza la modalità day-trading (la posizione resta aperta finché non scatta l'uscita):
//  - entrata: il massimo supera (>) il massimo degli ultimi N giorni; prezzo d'entrata = max(livello, apertura del giorno);
//  - stop fisso per tutto il trade = max(livello, apertura) − K × ATR (gestione del gap in apertura come nel Pine);
//  - nel giorno del breakout esce solo se il minimo va sotto (<) lo stop, al prezzo dello stop;
//  - dai giorni dopo esce se il minimo va sotto (<) max(stop, minimo degli ultimi M giorni), al prezzo
//    min(apertura, quel livello) (se apre già sotto, esce all'apertura);
//  - dopo un'uscita serve un nuovo breakout (mai nello stesso giorno dell'uscita);
//  - ATR di Wilder (media semplice dei primi N true range, poi smoothing) sulle candele giornaliere.
// Dimensione: rischio = % del capitale attuale del conto (non del massimo); quantità = rischio / (entrata − stop).
// Leva scelta dall'utente ma mai oltre il massimo di Bitunix per quel titolo e quel valore; se lo stop iniziale è oltre il
// prezzo di liquidazione il trade si salta. La posizione resta aperta finché non scatta l'uscita; si contano commissioni,
// slittamento e funding dei perpetual. Candele: { t: ms (inizio giorno UTC), o, h, l, c, v }.
import { atr } from './indicators.js'
import { liqPriceOf, tierFor } from './opening.js'

export const TURTLE_DEFAULTS = {
  entryN: 20,     // giorni del massimo da superare
  exitM: 10,      // giorni del minimo per l'uscita trailing
  atrK: 2,        // stop fisso: K × ATR sotto l'entrata
  atrN: 20,       // giorni dell'ATR (Wilder)
  riskPct: 2,     // rischio per trade in % del capitale attuale
  leverage: 3,    // leva scelta (sempre entro il massimo di Bitunix)
  capital: 1000,  // capitale iniziale in USDT (Simulazione e Prova; nel Reale il capitale dedicato)
  maxPos: 10,     // posizioni aperte al massimo insieme (0 = nessun limite)
  stocks: true,   // titoli USA
  crypto: true,   // crypto
  fee: 0.06,      // commissione per lato in % (Simulazione e Prova; nel Reale quella vera di Bitunix)
  slip: 0.05,     // slittamento per lato sugli ordini a mercato, in % (Simulazione e Prova)
  funding: 0.01,  // funding medio per periodo in % del valore (solo Simulazione; Prova usa il tasso di Bitunix, Reale quello pagato)
  mmr: 1,         // margine di mantenimento in % se Bitunix non lo fornisce
  liqFee: 0.1,    // commissione di liquidazione in % del valore
}
export const TURTLE_LIMITS = {
  entryN: [5, 120], exitM: [2, 60], atrK: [0.5, 6], atrN: [5, 60], riskPct: [0.1, 10], leverage: [1, 50], capital: [50, 1e8],
  maxPos: [0, 100], fee: [0, 0.2], slip: [0, 1], funding: [-0.1, 0.2], mmr: [0.2, 10], liqFee: [0, 2],
}
export function cleanTurtle(raw = {}) {
  const out = { ...TURTLE_DEFAULTS }
  for (const [k, [lo, hi]] of Object.entries(TURTLE_LIMITS)) { const v = +raw?.[k]; if (Number.isFinite(v) && v >= lo && v <= hi) out[k] = v }
  for (const k of ['entryN', 'exitM', 'atrN', 'maxPos', 'leverage']) out[k] = Math.round(out[k])
  for (const k of ['stocks', 'crypto']) if (typeof raw?.[k] === 'boolean') out[k] = raw[k]
  if (typeof raw?.active === 'boolean') out.active = raw.active
  return out
}

const DAY = 864e5
export const dayKey = t => new Date(t).toISOString().slice(0, 10)

// Livelli per il giorno dopo l'ultima candela CHIUSA (bars = solo candele chiuse):
// hiN = massimo degli ultimi N giorni, loM = minimo degli ultimi M giorni, atr = ATR di Wilder dell'ultimo giorno.
// Stesso calcolo per la Simulazione (seriesLevels: livelli di ogni giorno i dalle candele fino a i − 1) e per Prova e Reale
// (levelsOf: livelli per domani). L'ATR è quello di Wilder su tutta la serie disponibile.
export function seriesLevels(bars, s = TURTLE_DEFAULTS) {
  const n = bars.length, a = atr(bars, s.atrN), out = new Array(n + 1).fill(null)
  for (let i = Math.max(s.entryN, s.exitM, s.atrN); i <= n; i++) {
    const x = a[i - 1]
    if (!(x > 0)) continue
    let hi = -Infinity, lo = Infinity
    for (let j = i - s.entryN; j < i; j++) hi = Math.max(hi, bars[j].h)
    for (let j = i - s.exitM; j < i; j++) lo = Math.min(lo, bars[j].l)
    out[i] = { hiN: hi, loM: lo, atr: x, close: bars[i - 1].c, t: bars[i - 1].t + DAY }
  }
  return out
}
export const levelsOf = (bars, s = TURTLE_DEFAULTS) => seriesLevels(bars, s)[bars.length]

// Livello d'uscita di una posizione: il più alto tra stop fisso e minimo trailing (scatta prima quello più vicino)
export const exitOf = (pos, loM) => Math.max(pos.stop0, Number.isFinite(loM) ? loM : -Infinity)

// Dimensione di un trade. lim = { maxLev, tiers } di Bitunix per quel titolo. Restituisce la posizione o { skip: motivo }.
// entry = prezzo d'esecuzione (con lo slittamento), base = max(livello, apertura) da cui si calcola lo stop come nel Pine
export function sizeTrade({ entry, base = entry, atr: a, balance, free, s, lim }) {
  const stop0 = base - s.atrK * a
  const exit0 = stop0
  const dist = entry - stop0
  if (!(dist > 0)) return { skip: 'uscita già sopra il prezzo d\'entrata' }
  const risk = balance * s.riskPct / 100
  let qty = risk / dist
  let notional = qty * entry
  const t0 = tierFor(lim, notional)
  const maxLev = Math.min(t0?.maxLev || lim?.maxLev || 1e9, lim?.maxLev || 1e9)
  const lev = Math.max(1, Math.min(s.leverage, maxLev))
  let margin = notional / lev
  if (margin > free) { // non basta il capitale libero: posizione ridotta a quello che c'è
    if (free < 1) return { skip: 'capitale libero esaurito' }
    margin = free; notional = margin * lev; qty = notional / entry
  }
  if (notional < 5) return { skip: 'posizione troppo piccola' }
  const tier = tierFor(lim, notional)
  const mmr = tier?.mmr ?? s.mmr / 100
  const liq = liqPriceOf({ side: 1, entry, qty, margin }, mmr, s.liqFee)
  if (liq && stop0 <= liq) return { skip: 'stop oltre il prezzo di liquidazione (abbassa la leva)' }
  return { qty, notional, margin, leverage: lev, stop0, exit0, liq, risk: qty * dist, mmr }
}

// Risultato di una posizione chiusa: lordo, commissioni, funding (positivo = pagato)
export function closeResult(pos, exit, s, { liq = false, funding = 0 } = {}) {
  const feeIn = pos.qty * pos.entry * s.fee / 100
  const feeOut = liq ? 0 : pos.qty * exit * s.fee / 100
  const gross = liq ? -pos.margin : (exit - pos.entry) * pos.qty
  const pnl = gross - feeIn - feeOut - funding
  return { gross, fees: feeIn + feeOut, funding, pnl, R: pos.risk > 0 ? pnl / pos.risk : null }
}

// ---------- Simulazione su più titoli insieme (un conto solo) ----------
// data = { SYM: bars giornaliere }, limits = { SYM: { maxLev, tiers, fundingH } }.
// Ogni giorno: prima le uscite (apertura sotto il livello = uscita all'apertura; minimo sotto = uscita al livello),
// poi le entrate (massimo sopra hiN = entrata a max(apertura, hiN)), in ordine di forza del breakout. Nel giorno d'entrata,
// se il minimo arriva all'uscita si considera colpita (prudente: non si sa cosa è venuto prima).
// Funding: s.funding % del valore a ogni periodo (fundingH ore) con la posizione aperta, sempre pagato (stima prudente).
export function simulate(data, limits, s0, { from = null, to = null, onDay = null } = {}) {
  const s = cleanTurtle(s0)
  const syms = Object.keys(data).filter(k => data[k]?.length > s.entryN + 2)
  const idx = {}, byDay = new Map()
  for (const sym of syms) {
    idx[sym] = new Map(data[sym].map((b, i) => [b.t, i]))
    for (const b of data[sym]) byDay.set(b.t, true)
  }
  const days = [...byDay.keys()].sort((a, b) => a - b).filter(t => (from === null || t >= from) && (to === null || t <= to))
  let balance = s.capital, peak = s.capital, maxDD = 0
  const open = new Map(), trades = [], curve = [], skipped = {}
  const per = {}
  const LV = Object.fromEntries(syms.map(sym => [sym, seriesLevels(data[sym], s)]))
  const lv = (sym, i) => LV[sym][i]
  const finish = (sym, pos, t, exit, liq, reason) => {
    const P = (limits[sym]?.fundingH || 8) * 3600000
    const nF = Math.max(0, Math.floor((t + DAY / 2) / P) - Math.floor(pos.t / P)) // periodi di funding con la posizione aperta (stima)
    const funding = nF * pos.qty * pos.entry * s.funding / 100
    const r = closeResult(pos, exit, s, { liq, funding })
    balance += r.pnl
    const tr = { symbol: sym, in: pos.t, out: t, entry: pos.entry, exit, qty: pos.qty, leverage: pos.leverage, days: Math.round((t - pos.t) / DAY) + 1, reason, liq, ...r, balance }
    trades.push(tr)
    const ps = (per[sym] ||= { symbol: sym, trades: 0, wins: 0, pnl: 0, R: 0, fees: 0, funding: 0 })
    ps.trades++; if (r.pnl > 0) ps.wins++; ps.pnl += r.pnl; ps.R += r.R || 0; ps.fees += r.fees; ps.funding += r.funding
    open.delete(sym)
  }
  for (const t of days) {
    const exited = new Set()
    // uscite
    for (const [sym, pos] of [...open]) {
      const i = idx[sym].get(t)
      if (i === undefined) continue
      const b = data[sym][i], L = lv(sym, i)
      const ex = exitOf(pos, L?.loM)
      const sl = 1 - s.slip / 100
      const why = ex === pos.stop0 ? 'stop ATR' : `minimo ${s.exitM} giorni`
      if (pos.liq && b.o <= pos.liq) { finish(sym, pos, t, pos.liq, true, 'liquidazione'); exited.add(sym) }
      else if (b.l < ex) { finish(sym, pos, t, Math.min(b.o, ex) * sl, false, b.o < ex ? `${why} (apertura sotto)` : why); exited.add(sym) }
    }
    // entrate (non nello stesso giorno di un'uscita: nel Pine il breakout richiede di non essere già long in quella candela)
    const cands = []
    for (const sym of syms) {
      if (open.has(sym) || exited.has(sym)) continue
      const i = idx[sym].get(t)
      if (i === undefined || i < s.entryN) continue
      const L = lv(sym, i), b = data[sym][i]
      if (L && b.h > L.hiN) cands.push({ sym, i, L, b, str: (b.h - L.hiN) / L.atr })
    }
    cands.sort((x, y) => y.str - x.str)
    for (const c of cands) {
      if (s.maxPos && open.size >= s.maxPos) { skipped['posizioni massime raggiunte'] = (skipped['posizioni massime raggiunte'] || 0) + 1; continue }
      const base = Math.max(c.b.o, c.L.hiN), entry = base * (1 + s.slip / 100)
      const used = [...open.values()].reduce((x, p) => x + p.margin, 0)
      const z = sizeTrade({ entry, base, atr: c.L.atr, balance, free: balance - used, s, lim: limits[c.sym] })
      if (z.skip) { skipped[z.skip] = (skipped[z.skip] || 0) + 1; continue }
      const pos = { t, entry, ...z }
      open.set(c.sym, pos)
      // giorno del breakout: esce solo se il minimo va sotto lo stop, al prezzo dello stop (come nel Pine)
      if (c.b.l < z.stop0) finish(c.sym, pos, t, z.stop0 * (1 - s.slip / 100), false, 'stop nel giorno del breakout')
    }
    // capitale a fine giornata con le posizioni aperte valutate alla chiusura
    let eq = balance
    for (const [sym, pos] of open) { const i = idx[sym].get(t); const c = i !== undefined ? data[sym][i].c : pos.entry; eq += (c - pos.entry) * pos.qty }
    peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak > 0 ? (peak - eq) / peak * 100 : 0)
    curve.push({ t, v: eq })
    onDay?.(t)
  }
  const openList = [...open].map(([sym, p]) => {
    const last = data[sym].at(-1)
    return { symbol: sym, in: p.t, entry: p.entry, qty: p.qty, leverage: p.leverage, stop0: p.stop0, last: last.c, upnl: (last.c - p.entry) * p.qty }
  })
  const wins = trades.filter(x => x.pnl > 0)
  const sum = k => trades.reduce((x, tr) => x + (tr[k] || 0), 0)
  const endEq = curve.at(-1)?.v ?? balance
  return {
    settings: s,
    summary: {
      from: days[0] ?? null, to: days.at(-1) ?? null, symbols: syms.length, start: s.capital, balance, equity: endEq,
      ret: (endEq / s.capital - 1) * 100, trades: trades.length, wins: wins.length, winRate: trades.length ? wins.length / trades.length * 100 : null,
      pnl: sum('pnl'), gross: sum('gross'), fees: sum('fees'), funding: sum('funding'), R: sum('R'), avgR: trades.length ? sum('R') / trades.length : null,
      avgWin: wins.length ? wins.reduce((x, w) => x + w.pnl, 0) / wins.length : null,
      avgLoss: trades.length > wins.length ? trades.filter(x => x.pnl <= 0).reduce((x, w) => x + w.pnl, 0) / (trades.length - wins.length) : null,
      maxDD, liquidations: trades.filter(x => x.liq).length, avgDays: trades.length ? sum('days') / trades.length : null, open: openList.length,
    },
    curve, trades, open: openList, skipped,
    bySymbol: Object.values(per).sort((a, b) => b.pnl - a.pnl),
  }
}
