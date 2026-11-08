// Analisi della Simulazione: valori calcolati solo con quello che si sapeva in quel minuto (nessun dato futuro).
// Server: dayContext / tradeContext / tradeStates (dentro runSimulation, sulle candele da 1 minuto archiviate).
// App: quartiles / bandTable / toCsv per le tabelle e l'esportazione.
import { ny } from './time.js'
import { closeMinute } from './opening.js'

export const MOMENTS = [5, 10, 15, 20, 30, 45, 60]
const OPEN = 570
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)

// Informazioni di un titolo in un giorno (memorizzate): candele per minuto NY, apertura, chiusura, escursione, volumi
// max: quanti titoli-giorno tenere pronti (i più vecchi si ricalcolano se servono di nuovo: stesso risultato, meno memoria)
export function makeInfo(days, { max = 6000 } = {}) {
  const memo = new Map()
  return (sym, date) => {
    const key = sym + '|' + date
    if (memo.has(key)) return memo.get(key)
    if (memo.size >= max) memo.delete(memo.keys().next().value)
    const raw = days[date]?.[sym]
    let out = null
    if (raw?.length) {
      const by = new Map()
      for (const b of raw) by.set(ny(b.t).min, b)
      const close = closeMinute(date)
      let hi = -Infinity, lo = Infinity, last = null
      for (const [m, b] of by) if (m >= OPEN && m < close) { hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); if (!last || m > last.m) last = { m, c: b.c } }
      const o = by.get(OPEN)?.o ?? null
      out = { by, open: o, close: last?.c ?? null, range: o && hi > lo ? (hi - lo) / o : null }
    }
    memo.set(key, out)
    return out
  }
}

const volSum = (inf, from, to) => { let v = 0; for (let m = from; m <= to; m++) v += inf.by.get(m)?.v || 0; return v }
// date con dati del titolo prima di `date` (le più recenti per ultime)
const prevDates = (dates, date, sym, info, n) => {
  const out = []
  for (let i = dates.indexOf(date) - 1; i >= 0 && out.length < n; i--) if (info(sym, dates[i])?.open) out.unshift(dates[i])
  return out
}
// volume dei minuti [from, to] di oggi rispetto alla media degli stessi minuti nei 10 giorni precedenti
function volRatio(info, dates, date, sym, from, to) {
  const today = info(sym, date)
  if (!today) return null
  const prev = prevDates(dates, date, sym, info, 10).map(d => volSum(info(sym, d), from, to)).filter(v => v > 0)
  if (prev.length < 3) return null
  const norm = mean(prev)
  return norm > 0 ? volSum(today, from, to) / norm : null
}
function prevClose(info, dates, date, sym) {
  const p = prevDates(dates, date, sym, info, 1)[0]
  return p ? info(sym, p).close : null
}

// ---------- Giornata, alle 9:35 di New York (candele 9:30–9:34 chiuse) ----------
export function dayContext(days, dates, date, symbols, info) {
  const moves = [], vols = [], gaps = [], volat = []
  for (const sym of symbols) {
    const t = info(sym, date)
    const o = t?.by.get(OPEN)?.o, c = t?.by.get(OPEN + 4)?.c
    if (!o || !c) continue
    moves.push(c / o - 1)
    const vr = volRatio(info, dates, date, sym, OPEN, OPEN + 4); if (vr !== null) vols.push(vr)
    const pc = prevClose(info, dates, date, sym); if (pc) gaps.push(Math.abs(o / pc - 1))
    const pr = prevDates(dates, date, sym, info, 20).map(d => info(sym, d).range).filter(x => x > 0)
    if (pr.length >= 10) { const r5 = mean(pr.slice(-5)), r20 = mean(pr); if (r20 > 0) volat.push(r5 / r20) }
  }
  if (!moves.length) return null
  const up = moves.filter(x => x > 0).length, down = moves.filter(x => x < 0).length
  const idx = sym => {
    const t = info(sym, date), o = t?.by.get(OPEN)?.o, c = t?.by.get(OPEN + 4)?.c
    return { move: o && c ? (c / o - 1) * 100 : null, vol: volRatio(info, dates, date, sym, OPEN, OPEN + 4) }
  }
  const q = idx('QQQ'), s = idx('SPY')
  const btc = info('BTC', date), b1 = btc?.by.get(OPEN + 4)?.c, b0 = btc?.by.get(OPEN + 4 - 60)?.c
  return {
    breadth: Math.max(up, down) / moves.length * 100,       // % titoli nella direzione prevalente
    breadthDir: up >= down ? 1 : -1,
    absMove: mean(moves.map(Math.abs)) * 100,              // movimento medio dei titoli dall'apertura (%)
    vol5: vols.length ? mean(vols) : null,                 // volume dei primi 5 minuti / normale
    qqqMove: q.move, qqqVol: q.vol, spyMove: s.move, spyVol: s.vol,
    gap: gaps.length ? mean(gaps) * 100 : null,            // gap medio dalla chiusura di ieri (%, in valore assoluto)
    volat: volat.length ? mean(volat) : null,              // volatilità 5 giorni / 20 giorni
    btc1h: b0 && b1 ? (b1 / b0 - 1) * 100 : null,           // BTC nell'ultima ora (8:34 → 9:34)
    nSym: moves.length,
  }
}

// ---------- Trade, al momento dell'entrata (candele chiuse prima della candela del segnale) ----------
export function tradeContext(days, dates, date, sym, sig, symbols, info) {
  const km = sig.k.min
  const volPre = km > OPEN ? volRatio(info, dates, date, sym, OPEN, km - 1) : null
  const minutes = km - OPEN
  const speed = Math.abs(sig.entry - sig.open) / sig.open * 100 / (minutes + 1) // % al minuto
  let crowd = null
  if (km > OPEN) {
    let up = 0, down = 0
    for (const x of symbols) {
      const t = info(x, date), o = t?.by.get(OPEN)?.o, c = t?.by.get(km - 1)?.c
      if (!o || !c) continue
      if (c > o) up++; else if (c < o) down++
    }
    crowd = up === down ? 'pari' : (up > down ? 1 : -1) === sig.side ? 'stessa' : 'contro'
  }
  const pc = prevClose(info, dates, date, sym)
  const gap = pc ? sig.side * (sig.open / pc - 1) * 100 : null // gap del titolo nella direzione del trade (+ = a favore)
  return { volPre, minutes, speed, crowd, gap }
}

// ---------- Stato del trade a 5…60 minuti dall'entrata (in unità di volatilità) ----------
// g = guadagno alla chiusura di quel minuto, mae = massima perdita toccata fino ad allora (≤ 0). null se il trade era già chiuso.
export function tradeStates(pos, byMin, closedAt) {
  const out = {}
  let mae = 0
  const km = pos.kmin
  for (let m = 1, mi = 0; m <= MOMENTS[MOMENTS.length - 1]; m++) {
    const b = byMin.get(km + m)
    if (b) mae = Math.min(mae, pos.side * ((pos.side > 0 ? b.l : b.h) - pos.entry) / pos.unit)
    if (m === MOMENTS[mi]) {
      out[m] = b && closedAt > b.t + 60000 ? { g: pos.side * (b.c - pos.entry) / pos.unit, mae } : null
      mi++
    }
  }
  return out
}

// ---------- Tabelle (app) ----------
// Divide le righe in 4 gruppi della stessa grandezza secondo il valore; righe senza valore escluse
export function quartiles(rows, val) {
  const xs = rows.map(r => ({ r, v: val(r) })).filter(x => x.v !== null && x.v !== undefined && Number.isFinite(x.v)).sort((a, b) => a.v - b.v)
  if (xs.length < 4) return []
  const out = []
  for (let g = 0; g < 4; g++) {
    const part = xs.slice(Math.round(g * xs.length / 4), Math.round((g + 1) * xs.length / 4))
    if (part.length) out.push({ from: part[0].v, to: part[part.length - 1].v, rows: part.map(x => x.r) })
  }
  return out
}

// Esportazione CSV per Excel in italiano: separatore ; e virgola decimale
export function toCsv(cols, rows) {
  const cell = v => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toFixed(6)).replace('.', ',') : ''
    const s = String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.map(c => c[0]).join(';'), ...rows.map(r => cols.map(c => cell(c[1](r))).join(';'))].join('\n')
}

// ---------- Indice di attività del mercato (alle 9:35 di New York) ----------
// Cinque valori del giorno, calcolati su tutti i titoli della strategia; ognuno diventa il percentile rispetto
// ai 60 giorni di borsa precedenti (solo giorni passati) e l'indice è la media dei percentili (0–100).
export const INDEX_PARTS = [['gap', 'gap medio'], ['absMove', 'movimento primi 5 min'], ['vol5', 'volume primi 5 min'], ['spyVol', 'volume SPY'], ['volat', 'volatilità 5/20 giorni']]
export const INDEX_LOOKBACK = 60
export const INDEX_MIN_HISTORY = 20

// Valori grezzi del giorno (usa dayContext: solo candele fino alle 9:34 e giorni precedenti)
export function indexRaw(days, dates, date, symbols, info) {
  const c = dayContext(days, dates, date, symbols, info)
  if (!c) return null
  return { gap: c.gap, absMove: c.absMove, vol5: c.vol5, spyVol: c.spyVol, volat: c.volat, nSym: c.nSym }
}

// raw = { 'YYYY-MM-DD': valori grezzi }. Restituisce { idx, pcts } oppure null se lo storico non basta.
export function marketIndex(raw, day) {
  const today = raw[day]
  if (!today) return null
  const prev = Object.keys(raw).filter(d => d < day).sort().slice(-INDEX_LOOKBACK)
  const pcts = {}
  for (const [k] of INDEX_PARTS) {
    const x = today[k]
    if (x === null || x === undefined || !Number.isFinite(x)) continue
    const vals = prev.map(d => raw[d]?.[k]).filter(v => v !== null && v !== undefined && Number.isFinite(v))
    if (vals.length < INDEX_MIN_HISTORY) continue
    let lt = 0, eq = 0
    for (const v of vals) { if (v < x) lt++; else if (v === x) eq++ }
    pcts[k] = (lt + eq / 2) / vals.length * 100
  }
  const v = Object.values(pcts)
  if (v.length < 3) return null
  return { idx: mean(v), pcts }
}
