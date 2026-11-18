// Adattatori degli exchange della strategia Apertura USA. Ognuno ha la stessa interfaccia (vedi server/exchanges/bitunix.js):
// dati (coppie, candele, prezzi in blocco, limiti), conto (saldo) e api per server/live.js (posizioni, ordini, margine, leva,
// stop). Le regole della strategia restano in shared/engine.js, uguali per tutti.
// Nuovo exchange: un file qui con la stessa interfaccia, una voce in shared/venues.js e le righe di wt_accounts.
import { bitunix } from './bitunix.js'
import { bitget } from './bitget.js'
import { exOf } from '../../shared/venues.js'

const ADAPTERS = { bitunix, bitget }
// sostituzione per le prove automatiche (exchange finti)
let override = null
export const __setAdapters = o => { override = o }

export function adapter(ex) {
  const a = override?.[ex] || ADAPTERS[ex]
  if (!a) throw new Error(`Exchange sconosciuto: ${ex}`)
  return a
}
export const adapterOf = key => adapter(exOf(key))
// gli ordini veri partono solo con LIVE_TRADING=on e le chiavi di quell'exchange
export const liveAllowedEx = ex => process.env.LIVE_TRADING === 'on' && adapter(ex).hasKeys()
// coppia dell'exchange per un titolo della strategia (con il passo della quantità)
export async function pairFor(ex, sym) {
  const a = adapter(ex), perp = a.perpOf(sym)
  if (!perp) return null
  const p = (await a.pairs()).find(x => x.symbol === perp)
  return p ? { ...p, step: p.step ?? 10 ** -(p.basePrecision ?? 3) } : null
}
