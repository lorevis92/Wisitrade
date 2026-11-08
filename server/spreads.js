// Spread e profondità del libro ordini di Bitunix in orario di borsa, per i titoli della strategia.
// Dalle 9:30 alle 9:35 di New York ogni controllo ne misura una parte, così ogni titolo viene misurato due volte
// (es. 9:30 e 9:33) senza rallentare la strategia. Una riga per giorno in wt_meta `spread:YYYY-MM-DD`:
// { SYM: [[minuto, spread %, costo 1.500 USDT %, costo 15.000 USDT %, profondità ±0,1% in USDT, profondità ±0,5% in USDT], ...] }
// Il costo è lo scostamento medio dal prezzo di metà spread per un ordine a mercato di quella cifra, nel lato peggiore
// (null = libro non abbastanza profondo); la profondità è il valore sul lato più sottile entro quella distanza.
import { ASSET_MAP } from '../shared/assets.js'
import { STRATEGY_SYMBOLS } from '../shared/opening.js'
import { depth } from './bitunix.js'
import { getMeta, setMeta } from './db.js'

export const SPREAD_FROM = 570, SPREAD_TO = 575 // 9:30–9:35 New York
const ROUNDS = 3                                // ogni titolo una volta ogni 3 minuti → 2 misure nella finestra
const r4 = x => (x === null ? null : +x.toFixed(4))

function cost(levels, mid, usdt) {
  let left = usdt, qty = 0
  for (const [p, q] of levels) { const take = Math.min(left, p * q); qty += take / p; left -= take; if (left <= 1e-9) break }
  return left > 1e-9 ? null : Math.abs(usdt / qty / mid - 1) * 100
}
const within = (levels, mid, pct) => levels.filter(([p]) => Math.abs(p / mid - 1) * 100 <= pct).reduce((s, [p, q]) => s + p * q, 0)
const worst = (a, b) => (a === null || b === null ? null : Math.max(a, b))

export function measure(book) {
  const { bids, asks } = book
  if (!bids.length || !asks.length) return null
  const mid = (bids[0][0] + asks[0][0]) / 2
  return {
    spread: (asks[0][0] - bids[0][0]) / mid * 100,
    c1500: worst(cost(asks, mid, 1500), cost(bids, mid, 1500)),
    c15000: worst(cost(asks, mid, 15000), cost(bids, mid, 15000)),
    d01: Math.min(within(asks, mid, 0.1), within(bids, mid, 0.1)),
    d05: Math.min(within(asks, mid, 0.5), within(bids, mid, 0.5)),
  }
}

// perps = perpetual disponibili; maxMs = tempo massimo per questo giro (si misura quello che ci sta)
export async function recordSpreads(info, perps, { maxMs = 8000 } = {}) {
  const m = info.minutes
  if (m < SPREAD_FROM || m > SPREAD_TO) return null
  const t0 = Date.now()
  const list = STRATEGY_SYMBOLS.filter(s => ASSET_MAP[s] && perps.has(ASSET_MAP[s].perp)).filter((_, i) => i % ROUNDS === (m - SPREAD_FROM) % ROUNDS)
  const out = {}
  let done = 0, failed = 0
  const queue = [...list]
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length && Date.now() - t0 < maxMs) {
      const sym = queue.shift()
      try {
        const x = measure(await depth(ASSET_MAP[sym].perp))
        if (x) { out[sym] = [m, r4(x.spread), r4(x.c1500), r4(x.c15000), Math.round(x.d01), Math.round(x.d05)]; done++ }
      } catch { failed++ }
    }
  }))
  const key = `spread:${info.date}`
  const day = (await getMeta(key)) || {}
  for (const [sym, row] of Object.entries(out)) (day[sym] ||= []).push(row)
  await setMeta(key, day)
  return { done, failed, skipped: queue.length }
}

// Riepilogo degli ultimi giorni: mediana per titolo di spread e costi
export async function spreadSummary(dates) {
  const rows = await Promise.all(dates.map(d => getMeta(`spread:${d}`).catch(() => null)))
  const by = {}
  rows.forEach((day, i) => { for (const [sym, list] of Object.entries(day || {})) for (const r of list) (by[sym] ||= []).push([dates[i], ...r]) })
  const med = a => { const v = a.filter(x => x !== null && Number.isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null }
  return Object.entries(by).map(([sym, list]) => ({
    symbol: sym, samples: list.length, days: new Set(list.map(r => r[0])).size,
    spread: med(list.map(r => r[2])), c1500: med(list.map(r => r[3])), c15000: med(list.map(r => r[4])), d01: med(list.map(r => r[5])), d05: med(list.map(r => r[6])),
  })).sort((a, b) => (a.spread ?? 99) - (b.spread ?? 99))
}
