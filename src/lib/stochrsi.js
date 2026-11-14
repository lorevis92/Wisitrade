// Stocastico RSI (come TradingView): RSI sulle chiusure, stocastico dell'RSI su `stoch` candele,
// K = media semplice dello stocastico su `k` candele, D = media di K su `d` candele. Valori 0–100, null dove non calcolabile.
import { rsi } from '@shared/indicators.js'

export const RSI_DEFAULTS = { rsi: 14, stoch: 14, k: 3, d: 3, high: 80, low: 20 }

const smaNull = (vals, n) => {
  const out = new Array(vals.length).fill(null)
  for (let i = n - 1; i < vals.length; i++) {
    let s = 0, ok = true
    for (let j = i - n + 1; j <= i; j++) { if (vals[j] === null) { ok = false; break } s += vals[j] }
    if (ok) out[i] = s / n
  }
  return out
}

export function stochRsi(bars, p = RSI_DEFAULTS) {
  const r = rsi(bars, p.rsi)
  const st = r.map((v, i) => {
    if (v === null || i < p.stoch - 1) return null
    let lo = Infinity, hi = -Infinity
    for (let j = i - p.stoch + 1; j <= i; j++) { if (r[j] === null) return null; lo = Math.min(lo, r[j]); hi = Math.max(hi, r[j]) }
    return hi === lo ? 50 : (v - lo) / (hi - lo) * 100 // RSI piatto: a metà, come se non ci fosse spinta
  })
  const k = smaNull(st, p.k)
  const d = smaNull(k, p.d)
  return { k, d }
}

// Lettura dell'ultimo valore: stato, intensità (0–1 quanto è dentro la zona), ultimo incrocio K/D recente,
// uscite passate dalle zone estreme con quanto si è mosso il prezzo dopo.
export function readStoch(bars, p = RSI_DEFAULTS) {
  const { k, d } = stochRsi(bars, p)
  const n = bars.length, K = k[n - 1], D = d[n - 1]
  const state = K === null ? null : K < p.low ? 'oversold' : K > p.high ? 'overbought' : 'neutral'
  const intensity = state === 'oversold' ? (p.low - K) / p.low : state === 'overbought' ? (K - p.high) / (100 - p.high) : 0

  // incrocio K/D nelle ultime 3 candele (0 = candela in corso)
  let cross = null
  for (let i = n - 1; i >= Math.max(1, n - 3); i--) {
    if ([k[i], d[i], k[i - 1], d[i - 1]].some(v => v === null)) break
    const before = k[i - 1] - d[i - 1], now = k[i] - d[i]
    if (before <= 0 && now > 0) { cross = { dir: 'up', ago: n - 1 - i, k: k[i] }; break }
    if (before >= 0 && now < 0) { cross = { dir: 'down', ago: n - 1 - i, k: k[i] }; break }
  }
  // incrocio dentro una zona estrema: K o D in zona nella candela dell'incrocio o in quella prima
  if (cross) {
    const i = n - 1 - cross.ago, vals = [k[i], d[i], k[i - 1], d[i - 1]]
    cross.inZone = cross.dir === 'up' ? Math.min(...vals) < p.low : Math.max(...vals) > p.high
  }

  // uscite dalle zone: K che risale sopra la soglia bassa o scende sotto quella alta (solo candele chiuse)
  const exits = []
  for (let i = 1; i < n - 1; i++) {
    if (k[i] === null || k[i - 1] === null) continue
    const after = j => (i + j < n ? (bars[i + j].c / bars[i].c - 1) * 100 : null)
    if (k[i - 1] < p.low && k[i] >= p.low) exits.push({ i, t: bars[i].t, from: 'oversold', price: bars[i].c, a5: after(5), a10: after(10) })
    if (k[i - 1] > p.high && k[i] <= p.high) exits.push({ i, t: bars[i].t, from: 'overbought', price: bars[i].c, a5: after(5), a10: after(10) })
  }
  return { k, d, K, D, state, intensity: Math.max(0, Math.min(1, intensity)), cross, exits }
}

// Suggerimento per gli ordini manuali (solo un'indicazione): ogni timeframe in ipervenduto vale +1, in ipercomprato −1;
// un incrocio K/D recente (ultime 3 candele) vale ±0,5, ±1 se è dentro una zona estrema. Long da +2 in su, short da −2 in giù.
export function suggest(reads, tfs) {
  const ready = tfs.filter(tf => reads[tf]?.state)
  if (!ready.length) return { side: null, score: 0, reason: 'Timeframe non ancora caricati' }
  const os = ready.filter(tf => reads[tf].state === 'oversold'), ob = ready.filter(tf => reads[tf].state === 'overbought')
  const up = ready.filter(tf => reads[tf].cross?.dir === 'up'), dn = ready.filter(tf => reads[tf].cross?.dir === 'down')
  let score = os.length - ob.length
  for (const tf of up) score += reads[tf].cross.inZone ? 1 : 0.5
  for (const tf of dn) score -= reads[tf].cross.inZone ? 1 : 0.5
  const side = score >= 2 ? 1 : score <= -2 ? -1 : null
  const parts = []
  const list = a => a.join(', ')
  if (os.length) parts.push(`${os.length} su ${ready.length} in ipervenduto (${list(os)})`)
  if (ob.length) parts.push(`${ob.length} su ${ready.length} in ipercomprato (${list(ob)})`)
  if (up.length) parts.push(`K incrocia D verso l'alto su ${list(up.map(tf => tf + (reads[tf].cross.inZone ? ' in zona' : '')))}`)
  if (dn.length) parts.push(`K incrocia D verso il basso su ${list(dn.map(tf => tf + (reads[tf].cross.inZone ? ' in zona' : '')))}`)
  const head = side === 1 ? 'Long' : side === -1 ? 'Short' : 'Nessun suggerimento, segnali misti o deboli'
  return { side, score: Math.round(score * 10) / 10, reason: `${head}: ${parts.length ? parts.join(' · ') : 'tutti i timeframe in zona neutra, nessun incrocio recente'}` }
}
