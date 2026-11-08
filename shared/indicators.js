// Indicatori tecnici condivisi tra Worker (segnali) e app (grafico).
// Ogni barra: { t: ms, o, h, l, c, v }. Le funzioni restituiscono array allineati alle barre (null dove non calcolabile).

export function sma(values, n) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= n) sum -= values[i - n]
    if (i >= n - 1) out[i] = sum / n
  }
  return out
}

export function ema(values, n) {
  const out = new Array(values.length).fill(null)
  if (values.length < n) return out
  const k = 2 / (n + 1)
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n
  out[n - 1] = prev
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

function wilder(values, n) {
  const out = new Array(values.length).fill(null)
  if (values.length < n) return out
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n
  out[n - 1] = prev
  for (let i = n; i < values.length; i++) {
    prev = (prev * (n - 1) + values[i]) / n
    out[i] = prev
  }
  return out
}

export function trueRange(bars) {
  return bars.map((b, i) => {
    if (i === 0) return b.h - b.l
    const pc = bars[i - 1].c
    return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc))
  })
}

export function atr(bars, n = 14) {
  return wilder(trueRange(bars), n)
}

export function rsi(bars, n = 14) {
  const closes = bars.map(b => b.c)
  const gains = [0], losses = [0]
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gains.push(Math.max(d, 0)); losses.push(Math.max(-d, 0))
  }
  const g = wilder(gains.slice(1), n), l = wilder(losses.slice(1), n)
  const out = [null]
  for (let i = 0; i < g.length; i++) {
    if (g[i] === null) out.push(null)
    else out.push(l[i] === 0 ? 100 : 100 - 100 / (1 + g[i] / l[i]))
  }
  return out
}

export function macd(bars, fast = 12, slow = 26, signal = 9) {
  const closes = bars.map(b => b.c)
  const ef = ema(closes, fast), es = ema(closes, slow)
  const line = closes.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null))
  const start = line.findIndex(v => v !== null)
  const sig = new Array(line.length).fill(null)
  if (start >= 0) {
    const e = ema(line.slice(start), signal)
    e.forEach((v, i) => { sig[start + i] = v })
  }
  const hist = line.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null))
  return { line, signal: sig, hist }
}

export function bollinger(bars, n = 20, mult = 2) {
  const closes = bars.map(b => b.c)
  const mid = sma(closes, n)
  const upper = [], lower = []
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] === null) { upper.push(null); lower.push(null); continue }
    let s = 0
    for (let j = i - n + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2
    const sd = Math.sqrt(s / n)
    upper.push(mid[i] + mult * sd); lower.push(mid[i] - mult * sd)
  }
  return { mid, upper, lower }
}

// VWAP ancorato all'inizio di ogni "sessione". sessionKey(t) restituisce una chiave diversa per ogni sessione.
export function vwap(bars, sessionKey = t => new Date(t).toISOString().slice(0, 10)) {
  const out = []
  let key = null, pv = 0, vol = 0
  for (const b of bars) {
    const k = sessionKey(b.t)
    if (k !== key) { key = k; pv = 0; vol = 0 }
    const tp = (b.h + b.l + b.c) / 3
    pv += tp * (b.v || 0); vol += b.v || 0
    out.push(vol > 0 ? pv / vol : tp)
  }
  return out
}

export function adx(bars, n = 14) {
  const len = bars.length
  const out = new Array(len).fill(null)
  if (len < n * 2 + 1) return out
  const plusDM = [], minusDM = []
  for (let i = 1; i < len; i++) {
    const up = bars[i].h - bars[i - 1].h, down = bars[i - 1].l - bars[i].l
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
  }
  const tr = trueRange(bars).slice(1)
  const trS = wilder(tr, n), pS = wilder(plusDM, n), mS = wilder(minusDM, n)
  const dx = trS.map((t, i) => {
    if (t === null || !t) return null
    const pdi = 100 * pS[i] / t, mdi = 100 * mS[i] / t
    return pdi + mdi === 0 ? 0 : 100 * Math.abs(pdi - mdi) / (pdi + mdi)
  })
  const start = dx.findIndex(v => v !== null)
  const a = wilder(dx.slice(start), n)
  a.forEach((v, i) => { out[start + i + 1] = v })
  return out
}

// Aggrega barre in un timeframe superiore (minuti).
export function aggregate(bars, minutes) {
  const ms = minutes * 60000
  const out = []
  for (const b of bars) {
    const t = Math.floor(b.t / ms) * ms
    const last = out[out.length - 1]
    if (last && last.t === t) {
      last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.v += b.v || 0
    } else out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 })
  }
  return out
}

export const last = arr => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null && arr[i] !== undefined) return arr[i]
  return null
}
