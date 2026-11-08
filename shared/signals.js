// Motore dei segnali. Funzione pura: riceve le barre e restituisce lo stato dell'asset.
// Usata dal Worker ogni minuto (e riusabile in futuro per backtest).
import { ema, atr, adx, vwap, last } from './indicators.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const pct = (a, b) => (b ? (a / b - 1) * 100 : 0)

/**
 * @param {object} p
 * @param {object} p.asset   voce di ASSETS
 * @param {Array}  p.b1      barre 1m (almeno 40), per stock dalla apertura della sessione
 * @param {Array}  p.b15     barre 15m (almeno 60)
 * @param {Array}  [p.ref1]  barre 1m dell'asset di riferimento (QQQ o BTC)
 * @param {string} [p.bias]  'long' | 'short' | 'neutral' dal Contesto
 * @param {object} [p.session] per stock: { orbActive, orHigh, orLow, openPrice, sessionKey }
 */
export function analyze({ asset, b1, b15, ref1, bias = 'neutral', session = null }) {
  if (!b1?.length || b1.length < 31 || !b15?.length || b15.length < 55) return null

  const price = b1[b1.length - 1].c
  const atr15 = last(atr(b15, 14))
  if (!atr15) return null

  // 1) Impulso: movimento degli ultimi 30 minuti rispetto alla volatilità tipica di una candela 15m
  const p30 = b1[b1.length - 31].c
  const move30 = price - p30
  const imp = Math.abs(move30) / atr15
  const impDir = move30 >= 0 ? 'long' : 'short'

  // 2) Volume relativo: volume ultimi 30m contro media di 30m sulle 15m recenti
  const vol30 = b1.slice(-30).reduce((s, b) => s + (b.v || 0), 0)
  const recent15 = b15.slice(-97, -1)
  const avg30 = (recent15.reduce((s, b) => s + (b.v || 0), 0) / Math.max(recent15.length, 1)) * 2
  const relVol = avg30 > 0 ? vol30 / avg30 : 1

  // 3) Trend su 15m: EMA20/EMA50 allineate, pendenza, ADX
  const c15 = b15.map(b => b.c)
  const e20 = ema(c15, 20), e50 = ema(c15, 50)
  const e20n = last(e20), e50n = last(e50), e20p = e20[e20.length - 5]
  const adxN = last(adx(b15, 14)) || 0
  let trendDir = null
  if (e20n > e50n && price > e20n && e20n > e20p) trendDir = 'long'
  if (e20n < e50n && price < e20n && e20n < e20p) trendDir = 'short'

  // 4) Conferma 1m
  const e20_1 = last(ema(b1.map(b => b.c), 20))

  // 5) Forza relativa (30m) contro il riferimento
  let rs = null
  if (ref1?.length > 31) {
    const r = ref1[ref1.length - 1].c, r30 = ref1[ref1.length - 31].c
    rs = pct(price, p30) - pct(r, r30)
  }

  // Direzione: impulso se forte, altrimenti trend
  const direction = imp >= 1.2 ? impDir : (trendDir || impDir)
  const sign = direction === 'long' ? 1 : -1

  let score = 0
  const reasons = []

  const impPts = clamp((imp / 2.5) * 35, 0, 35)
  score += impPts
  reasons.push({ key: 'impulse', label: 'Movimento 30m vs volatilità', ok: imp >= 1.5, value: `${imp.toFixed(1)}x` })

  const volPts = relVol > 1 ? clamp(((relVol - 1) / 2) * 20, 0, 20) : 0
  score += volPts
  reasons.push({ key: 'volume', label: 'Volume vs media', ok: relVol >= 1.8, value: `${relVol.toFixed(1)}x` })

  const trendOk = trendDir === direction
  if (trendOk) score += 15 + clamp(((adxN - 15) / 25) * 10, 0, 10)
  reasons.push({ key: 'trend', label: 'Medie allineate 15m', ok: trendOk, value: `ADX ${Math.round(adxN)}` })

  const conf1 = e20_1 !== null && sign * (price - e20_1) > 0
  if (conf1) score += 5
  reasons.push({ key: 'confirm', label: 'Prezzo sopra/sotto EMA20 1m', ok: conf1 })

  if (rs !== null) {
    const rsDir = sign * rs
    if (rsDir > 0) score += clamp(rsDir / 1 * 10, 0, 10)
    reasons.push({ key: 'rs', label: `Forza vs ${asset.ref}`, ok: rsDir > 0.2, value: `${rs >= 0 ? '+' : ''}${rs.toFixed(2)}%` })
  }

  let orb = false
  if (session?.orbActive && session.orHigh) {
    if (direction === 'long' && price > session.orHigh) orb = true
    if (direction === 'short' && price < session.orLow) orb = true
    if (orb) score += 15
    reasons.push({ key: 'orb', label: 'Breakout range apertura', ok: orb })
  }

  // Contesto settimanale
  let biasAdj = 0
  if (bias === direction) biasAdj = 10
  else if (bias && bias !== 'neutral') biasAdj = -15
  score += biasAdj
  reasons.push({ key: 'bias', label: 'In linea con il Contesto', ok: biasAdj > 0, value: bias || 'neutral' })

  // Tipo di segnale
  let type = null
  if (orb) type = 'orb'
  else if (imp >= 2 && relVol >= 1.3) type = 'impulse'
  else if (trendOk && adxN >= 25) type = 'trend'
  if (!type) score *= 0.6

  score = Math.round(clamp(score, 0, 100))

  // Livelli
  const sessionKey = session?.sessionKey
  const vw = last(vwap(b1, sessionKey))
  const swing = b15.slice(-40)
  const resistance = Math.max(...swing.map(b => b.h))
  const support = Math.min(...swing.map(b => b.l))
  const stop = direction === 'long' ? price - 1.2 * atr15 : price + 1.2 * atr15

  return {
    price,
    direction,
    type,
    score,
    reasons,
    levels: { vwap: vw, stop, ema20: e20n, ema50: e50n, support, resistance, orHigh: session?.orHigh ?? null, orLow: session?.orLow ?? null },
    metrics: { imp: +imp.toFixed(2), relVol: +relVol.toFixed(2), adx: Math.round(adxN), rs: rs === null ? null : +rs.toFixed(2), atr15, move30Pct: +pct(price, p30).toFixed(2) },
  }
}

// Il segnale attivo è finito? (lo usa il Worker per chiudere i segnali e misurarne la durata)
export function shouldEnd(signal, state, b15) {
  const ema20 = state.levels.ema20
  const close15 = b15[b15.length - 1].c
  if (signal.direction === 'long') return close15 < ema20 || state.price <= signal.stop
  return close15 > ema20 || state.price >= signal.stop
}
