// Preferenze salvate solo nel browser (nessun account).
const KEY = 'wisitrade:'

export function load(name, fallback) {
  try {
    const v = localStorage.getItem(KEY + name)
    return v === null ? fallback : JSON.parse(v)
  } catch { return fallback }
}

export function save(name, value) {
  try { localStorage.setItem(KEY + name, JSON.stringify(value)) } catch { /* storage non disponibile */ }
}

export const defaultRisk = { capital: 300, riskPct: 1, leverage: 3, maxMarginPct: 10 }
export const defaultChart = { tf: '15m', type: 'candles', ind: { ema20: true, ema50: true, vwap: true, bb: false, volume: true, rsi: false, macd: false } }
