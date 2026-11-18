// Adattatore Bitunix per la strategia Apertura USA: tutto quello che parla con Bitunix (dati, ordini, leva, margine, stop,
// posizioni, saldo) dietro la stessa interfaccia degli altri exchange (server/exchanges/index.js). Le chiamate sono quelle di
// server/bitunix.js, invariate: la sezione Bitunix funziona esattamente come prima.
import * as bx from '../bitunix.js'
import { ASSET_MAP } from '../../shared/assets.js'
import { getPairs } from '../scanner.js'
import { getMeta, setMeta } from '../db.js'
import { getLimits } from '../limits.js'
import { loadDays, dayBars } from '../archive.js'
import { addDays } from '../../shared/time.js'

const withStep = p => (p ? { ...p, step: 10 ** -(p.basePrecision ?? 3) } : null)

export const bitunix = {
  id: 'bitunix',
  name: 'Bitunix',
  takerFee: 0.06,          // % (commissione usata nel Reale se lo storico non dà quella vera)
  clientPrefix: 'wt',
  needOneWay: false,       // il conto Bitunix lavora in hedge: si usa il positionId della posizione
  hasKeys: bx.hasKeys,
  perpOf: sym => ASSET_MAP[sym]?.perp || null,

  // ---------- dati ----------
  pairs: async () => (await getPairs()).map(withStep),
  pairsAt: async () => (await getMeta('pairs'))?.at || null,
  resetPairs: () => setMeta('pairs', null),
  // motivo per cui un titolo non è operabile in questo exchange (null = operabile). Titolo senza coppia: come prima, non escluso qui.
  notTradable: (sym, byPerp) => {
    const p = byPerp.get(ASSET_MAP[sym]?.perp)
    return p && p.api === false ? 'Bitunix: coppia non operabile via API (isApiSupported = false)' : null
  },
  klines: bx.klines,
  klinesBack: bx.klinesBack,
  many: bx.many,
  tickers: bx.tickers,
  allPrices: bx.allTickers,  // { PERP: prezzo } con una sola richiesta
  limits: () => getLimits(),
  // giorni precedenti da 1 minuto (9:00–16:30) per il volume normale minuto per minuto: dall'archivio della Simulazione
  prevDays: async (sym, today, n = 10) => {
    const d = await loadDays([sym], addDays(today, -21), addDays(today, -1))
    return Object.keys(d).sort().slice(-n).map(x => d[x][sym]).filter(b => b?.length)
  },
  // candele da 1 minuto di un giorno chiuso (grafico della posizione): archivio
  dayBars: (sym, day) => dayBars(sym, day).catch(() => []),

  // ---------- conto e ordini (usati da server/live.js con le sue regole di sicurezza) ----------
  account: bx.account,
  api: {
    openPositions: bx.openPositions, pendingOrders: bx.pendingOrders, leverageMarginMode: bx.leverageMarginMode,
    setIsolated: bx.setIsolated, setLeverage: bx.setLeverage, openMarket: bx.openMarket, placeStopLoss: bx.placeStopLoss,
    pendingStopLoss: bx.pendingStopLoss, modifyStopLoss: bx.modifyStopLoss, cancelStopLoss: bx.cancelStopLoss,
    closePosition: bx.closePosition, closePartial: bx.closePartial,
  },
  positionHistory: bx.positionHistory,
  historyTrades: bx.historyTrades,
  tpslHistory: bx.tpslHistory,
  roundQty: bx.roundQty,
  // errore "coppia non operabile via API"
  isApiReject: msg => /not currently support trading via OpenAPI|not support.*open ?api|api.*not.*support/i.test(String(msg || '')),
}
