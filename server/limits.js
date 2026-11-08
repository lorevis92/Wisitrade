// Limiti di Bitunix per i perpetual della strategia: leva massima, scaglioni con il margine di mantenimento
// e intervallo del funding. Dati pubblici, salvati in wt_meta e aggiornati una volta al giorno.
import { ASSET_MAP } from '../shared/assets.js'
import { STRATEGY_SYMBOLS } from '../shared/opening.js'
import { tradingPairs, positionTiers, fundingRates } from './bitunix.js'
import { getMeta, setMeta } from './db.js'

const KEY = 'bitunix:limits'
const TTL = 24 * 3600000
let mem = null

const fresh = c => c && Date.now() - c.at < TTL && STRATEGY_SYMBOLS.every(s => s in (c.data || {}))

// { SYM: { maxLev, tiers: [{ start, end, lev, mmr }], fundingH } } (tiers null se Bitunix non li fornisce)
export async function getLimits() {
  if (fresh(mem)) return mem.data
  const cached = await getMeta(KEY).catch(() => null)
  if (fresh(cached)) { mem = cached; return cached.data }
  try {
    const [pairs, fr] = await Promise.all([tradingPairs().catch(() => []), fundingRates().catch(() => ({}))])
    const bySym = Object.fromEntries(pairs.map(p => [p.symbol, p]))
    const data = {}
    const queue = [...STRATEGY_SYMBOLS]
    const worker = async () => {
      while (queue.length) {
        const sym = queue.shift(), perp = ASSET_MAP[sym]?.perp
        const pair = bySym[perp]
        const old = cached?.data?.[sym]
        const tiers = pair ? await positionTiers(perp).catch(() => old?.tiers ?? null) : null
        data[sym] = { available: !!pair, maxLev: pair?.maxLeverage ?? null, tiers: tiers?.length ? tiers : null, fundingH: fr[perp]?.hours || old?.fundingH || 8 }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    mem = { at: Date.now(), data }
    await setMeta(KEY, mem).catch(() => {})
    return data
  } catch {
    return cached?.data || {} // Bitunix non risponde: valori salvati o quelli impostati
  }
}
