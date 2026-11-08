// Motore della strategia "Apertura USA": le stesse regole di entrata e uscita, minuto per minuto,
// usate da Prova e Reale (server/strategy.js, ogni minuto) e dalla Simulazione (runSimulation, sui dati archiviati).
// Qui non c'è nessun accesso a database o a Bitunix: solo calcoli.
import { sizing, pathOf, walk, exitReason, pnlOf, closeMinute, isTradingDay, HOLIDAYS, tierFor, liqPriceOf, stopPastLiq } from './opening.js'
import { ny, weekdayOf } from './time.js'

export const MIN = 60000
export const OPEN_MIN = 570                // 9:30 New York
export const ENTRY_UNTIL = OPEN_MIN + 30   // entrate solo nei primi 30 minuti
const LOOKBACK = 10, MIN_HISTORY = 5
export const PREP_BARS = 1300              // candele da 15 min usate per la preparazione (~13 giorni)

// Candela unica da una serie di candele
export const agg = bars => bars.length ? { t: bars[0].t, o: bars[0].o, h: Math.max(...bars.map(b => b.h)), l: Math.min(...bars.map(b => b.l)), c: bars[bars.length - 1].c, v: bars.reduce((s, b) => s + b.v, 0) } : null

// ---------- Preparazione del giorno: livelli di ieri e 5 giorni, volatilità, volume normale ----------
// bars = candele da 15 minuti dei giorni precedenti (anche fuori orario: vengono filtrate qui)
export function prepFromBars(bars, today) {
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

// ---------- Entrata ----------
// bars = candele da 1 minuto di oggi (con .min), dalle 9:30 e prima della fine della finestra d'entrata.
// Restituisce null (nessun segnale per ora), { skip } (titolo scartato per oggi) o il segnale.
export function findEntry(bars, s, prep) {
  if (!prep.ok) return { skip: prep.why || 'dati insufficienti' }
  if (!bars.length) return null
  if (bars[0].min !== OPEN_MIN) return { skip: 'manca la candela delle 9:30' }
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
  if (!k) return null
  // spazio fino al livello più vicino nella direzione del trade
  const ahead = prep.levels.filter(l => (side > 0 ? l.p > entry : l.p < entry)).sort((a, b) => (side > 0 ? a.p - b.p : b.p - a.p))
  const R = ahead[0] || null, done = Math.abs(entry - open)
  if (s.room > 0 && R && Math.abs(R.p - entry) < s.room * done) return { skip: `${R.t} troppo vicino` }
  return { k, side, entry, open, R }
}

// Margine di mantenimento per un titolo: quello di Bitunix per lo scaglione del valore della posizione,
// altrimenti quello impostato (s.mmr, in %). lim = limiti Bitunix del titolo ({ maxLev, tiers }) o null.
export function riskFor(lim, notional, s) {
  const t = tierFor(lim, notional)
  return { mmr: t ? t.mmr : s.mmr / 100, maxLev: t ? t.maxLev : (lim?.maxLev || null), fromBitunix: !!t }
}

// Nuova posizione a partire dal segnale e dalla dimensione calcolata (con il prezzo di liquidazione in margine isolato)
export function newPosition({ mode, day, symbol, sig, s, prep, size, risk }) {
  const { k, side, entry, open, R } = sig
  const unit = prep.unit
  const p = {
    mode, day, symbol, side, status: 'open', entry, qty: size.notional / entry, margin: size.margin, leverage: s.leverage,
    init_stop: entry - side * s.sl * unit, unit, best: entry, open_price: open, move_pct: side * 1.25 * s.movePct,
    level: R, entry_slot: k.min < 585 ? 570 : 585, confirmed: false, last_bar: k.t - 1, opened_at: k.t, capital: size.capital,
    entry_bar: k.t, liq_price: null,
  }
  if (risk) p.liq_price = liqPriceOf(p, risk.mmr, s.liqFee)
  return p
}

// Lo stop loss è oltre il prezzo di liquidazione? (la posizione verrebbe liquidata prima di arrivare allo stop)
export const liqBlocks = p => stopPastLiq(p)

// ---------- Uscita: una candela da 1 minuto chiusa ----------
// p = posizione (viene aggiornata), b = candela chiusa (con .min), dayBars = candele di oggi dalle 9:30 (con .min).
// Restituisce { exit, reason } se la posizione va chiusa, altrimenti null.
export function stepBar(p, s, b, dayBars, prep) {
  const inProfit = x => p.side * (x - p.entry) > 0
  // dalla seconda candela in poi l'apertura può essere già oltre lo stop (salto): si esce a quel prezzo
  const gap = b.t > (p.entry_bar ?? (p.opened_at - MIN))
  const hit = walk(p, s, pathOf(b), gap)
  p.last_bar = b.t
  if (hit !== null) return { exit: hit.px, reason: hit.liq ? 'liquidazione' : exitReason(p, hit.px), liq: hit.liq }
  // a ogni chiusura di una candela da 15 minuti
  if ((b.min + 1 - OPEN_MIN) % 15 !== 0) return null
  const slot = b.min - 14
  const b15 = agg(dayBars.filter(x => x.min >= slot && x.min <= b.min))
  if (!b15) return null
  if (!p.confirmed && slot === p.entry_slot) {
    // conferma: volume della candela d'entrata almeno 1,5 volte il normale e prezzo dalla parte giusta del VWAP
    p.confirmed = true
    const norm = prep?.slotVol?.[slot]
    p.volx = norm ? b15.v / norm : null
    let pv = 0, vv = 0
    for (const x of dayBars) { if (x.min > b.min) break; const tp = (x.h + x.l + x.c) / 3; pv += tp * x.v; vv += x.v }
    const vwap = vv > 0 ? pv / vv : b15.c
    const ok = p.volx >= 1.5 && (p.side > 0 ? b15.c > vwap : b15.c < vwap)
    if (!ok && inProfit(b15.c)) return { exit: b15.c, reason: 'nessuna conferma' }
  } else if (slot > p.entry_slot) {
    if (!p.stale_done && slot - p.entry_slot >= 60) {
      p.stale_done = true
      if (p.side * (p.best - p.entry) < 0.5 * p.unit) {
        if (s.stale === 'close' && p.side * (b15.c - p.entry) <= 0) return { exit: b15.c, reason: 'fermo dopo 60 min' }
        if (s.stale === 'half') { p.init_stop = p.entry - p.side * s.sl * p.unit / 2; p.halved = true }
      }
    }
    const R = p.level
    if (R && inProfit(b15.c) && (p.side > 0 ? b15.h >= R.p && b15.c < R.p : b15.l <= R.p && b15.c > R.p)) return { exit: b15.c, reason: 'resistenza' }
  }
  return null
}

// ---------- Simulazione sui dati archiviati ----------
// days: { 'YYYY-MM-DD': { SYM: [candele 1 min con t,o,h,l,c,v] } } (9:00–16:30 NY)
// opts: { from, to, capital, limits }. Le regole sono le stesse del dal vivo; il saldo cresce e cala a ogni chiusura (guadagni reinvestiti).
// limits = { SYM: { maxLev, tiers, fundingH } } da Bitunix (margine di mantenimento e orari del funding); se manca si usano i valori impostati.
// Costi: commissione per lato sul valore della posizione, slittamento per lato sugli ordini a mercato (s.slip),
// funding stimato (s.funding) a ogni orario del funding di Bitunix con la posizione aperta, pagato sempre (stima prudente).
// Come dal vivo: il segnale nella candela del minuto m viene preso al controllo successivo (dopo le uscite di quel minuto),
// la candela d'entrata viene già controllata per l'uscita, e alle 15:59 si chiude tutto all'apertura di quel minuto.
export function runSimulation(days, s, { from, to, capital, limits = {} }) {
  const slip = (s.slip || 0) / 100
  const mmrFrom = {}
  const allDates = Object.keys(days).sort()
  const symOrder = Object.fromEntries(s.symbols.map((x, i) => [x, i]))
  // candele da 15 minuti per simbolo (per la preparazione di ogni giorno)
  const b15 = {}
  for (const d of allDates) for (const [sym, bars] of Object.entries(days[d])) {
    const arr = (b15[sym] ||= [])
    let cur = null
    for (const b of bars) {
      const t = Math.floor(b.t / 900000) * 900000
      if (!cur || cur.t !== t) { cur = { t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; arr.push(cur) } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v }
    }
  }
  const prepFor = (sym, day, openTs) => {
    const arr = b15[sym] || []
    const start = openTs - 5 * MIN - PREP_BARS * 15 * MIN // come dal vivo: le ultime 1300 candele prima della preparazione
    return prepFromBars(arr.filter(b => b.t >= start && b.t < openTs), day)
  }

  let balance = capital, peak = capital, maxDD = 0, maxDDPct = 0
  const trades = [], dayRows = [], reasons = {}, skips = {}
  let fundingTot = 0, slipTot = 0, liqs = 0
  let tradeId = 0

  for (const day of allDates) {
    if (day < from || day > to || !isTradingDay(day, weekdayOf(day))) continue
    const closeMin = closeMinute(day)
    const startBal = balance
    const today = {}
    for (const sym of s.symbols) {
      const raw = days[day][sym]
      if (!raw?.length) continue
      today[sym] = raw.map(b => ({ ...b, min: ny(b.t).min })).filter(b => b.min >= OPEN_MIN)
    }
    const syms = Object.keys(today)
    if (!syms.length) continue
    // segnali di entrata
    const sigs = []
    for (const sym of syms) {
      const openTs = today[sym][0].t - (today[sym][0].min - OPEN_MIN) * MIN
      const prep = prepFor(sym, day, openTs)
      const sig = findEntry(today[sym].filter(b => b.min < ENTRY_UNTIL), s, prep)
      if (!sig) continue
      if (sig.skip) { const why = sig.skip.replace(/^solo \d+ giorni.*/, 'storico insufficiente'); skips[why] = (skips[why] || 0) + 1; continue }
      sigs.push({ sym, sig, prep })
    }
    sigs.sort((a, b) => a.sig.k.t - b.sig.k.t || symOrder[a.sym] - symOrder[b.sym])

    const byMin = {}
    for (const sym of syms) { const m = (byMin[sym] = new Map()); for (const b of today[sym]) m.set(b.min, b) }
    let open = [], taken = 0
    const dayTrades = []
    const close = (pos, raw, reason, at, liq = false) => {
      // uscita a mercato: slittamento contro di te (non con la liquidazione, che chiude Bitunix)
      const exit = liq ? raw : raw * (1 - pos.side * slip)
      const slipCost = pos.slipIn + Math.abs(raw - exit) * pos.qty
      const P = (limits[pos.symbol]?.fundingH || 8) * 3600000
      const nF = Math.max(0, Math.ceil(at / P) - Math.ceil(pos.opened_at / P)) // orari del funding con la posizione aperta
      const funding = nF * pos.qty * pos.entry * (s.funding || 0) / 100
      const { pnl, fees } = pnlOf(pos, exit, s.fee, { liq, funding })
      fundingTot += funding; slipTot += slipCost; if (liq) liqs++
      balance += pnl
      peak = Math.max(peak, balance)
      const dd = peak - balance
      if (dd > maxDD) maxDD = dd
      if (peak > 0 && dd / peak * 100 > maxDDPct) maxDDPct = dd / peak * 100
      const r = (reasons[reason] ||= { n: 0, wins: 0, pnl: 0 })
      r.n++; r.pnl += pnl; if (pnl > 0) r.wins++
      const tr = {
        id: ++tradeId, symbol: pos.symbol, day, side: pos.side, entry: pos.entry, exit, stop: pos.stop0, stopEnd: pos.init_stop,
        level: pos.level, opened_at: pos.opened_at, closed_at: at, reason, pnl, fees, qty: pos.qty, margin: pos.margin,
        leverage: pos.leverage, pct: pnl / (pos.entry * pos.qty) * 100, balance, liq: pos.liq_price, funding, slip: slipCost,
        signal: pos.signal,
      }
      trades.push(tr); dayTrades.push(tr)
      open = open.filter(x => x !== pos)
    }

    let si = 0
    for (let m = OPEN_MIN; m < closeMin - 1; m++) {
      // uscite sulla candela chiusa del minuto m
      for (const pos of [...open]) {
        const b = byMin[pos.symbol].get(m)
        if (!b) continue
        const r = stepBar(pos, s, b, today[pos.symbol], pos.prep)
        if (r) close(pos, r.exit, r.reason, b.t + MIN, r.liq)
      }
      // entrate scattate nel minuto m
      while (si < sigs.length && sigs[si].sig.k.min <= m) {
        const { sym, sig, prep } = sigs[si++]
        if (s.maxPos > 0 && taken >= s.maxPos) { skips['limite posizioni al giorno'] = (skips['limite posizioni al giorno'] || 0) + 1; continue }
        const size = sizing(s, balance)
        if (!(size.margin >= 1)) { skips['capitale insufficiente'] = (skips['capitale insufficiente'] || 0) + 1; continue }
        // entrata a mercato: slittamento contro di te; lo stop si calcola dal prezzo eseguito, come nel Reale
        const fill = sig.entry * (1 + sig.side * slip)
        const risk = riskFor(limits[sym], size.notional, s)
        mmrFrom[sym] = risk.fromBitunix ? 'bitunix' : 'impostato'
        const pos = newPosition({ mode: 'sim', day, symbol: sym, sig: { ...sig, entry: fill }, s, prep, size, risk })
        if (s.liqGuard && liqBlocks(pos)) { skips['stop oltre la liquidazione'] = (skips['stop oltre la liquidazione'] || 0) + 1; continue }
        pos.prep = prep; pos.stop0 = pos.init_stop; pos.signal = sig.entry
        pos.slipIn = Math.abs(fill - sig.entry) * pos.qty
        taken++; open.push(pos)
        const r = stepBar(pos, s, sig.k, today[sym], prep)
        if (r) close(pos, r.exit, r.reason, sig.k.t + MIN, r.liq)
      }
    }
    // fine giornata: chiude tutto un minuto prima della chiusura della borsa
    for (const pos of [...open]) {
      const last = byMin[pos.symbol].get(closeMin - 1)
      const fallback = today[pos.symbol].filter(b => b.min < closeMin - 1).at(-1)
      const px = last ? last.o : fallback?.c ?? pos.entry
      close(pos, px, 'chiusura', last ? last.t : (fallback?.t ?? pos.opened_at) + MIN)
    }
    if (dayTrades.length) {
      const pnl = dayTrades.reduce((a, t) => a + t.pnl, 0)
      dayRows.push({ day, n: dayTrades.length, wins: dayTrades.filter(t => t.pnl > 0).length, pnl, pct: startBal > 0 ? pnl / startBal * 100 : null, balance })
    } else dayRows.push({ day, n: 0, wins: 0, pnl: 0, pct: 0, balance })
  }

  let gp = 0, gl = 0, wins = 0, fees = 0
  for (const t of trades) { if (t.pnl > 0) { gp += t.pnl; wins++ } else gl -= t.pnl; fees += t.fees }
  const simDays = dayRows.length
  return {
    from, to, capital, final: balance, net: balance - capital, pct: capital > 0 ? (balance / capital - 1) * 100 : 0,
    n: trades.length, wins, pf: gl > 0 ? gp / gl : null, grossWin: gp, grossLoss: gl, fees,
    funding: fundingTot, slippage: slipTot, costs: fees + fundingTot + slipTot, liquidations: liqs,
    worstDay: dayRows.filter(d => d.n && d.pct !== null).reduce((w, d) => (!w || d.pct < w.pct ? d : w), null),
    mmrFrom,
    maxDD, maxDDPct, days: simDays, daysWithTrades: dayRows.filter(d => d.n).length, daysUp: dayRows.filter(d => d.pnl > 0).length,
    firstDay: dayRows[0]?.day ?? null, lastDay: dayRows.at(-1)?.day ?? null,
    reasons: Object.entries(reasons).map(([reason, r]) => ({ reason, ...r })).sort((a, b) => b.n - a.n),
    skips: Object.entries(skips).map(([why, n]) => ({ why, n })).sort((a, b) => b.n - a.n),
    daily: dayRows,
    trades,
  }
}
