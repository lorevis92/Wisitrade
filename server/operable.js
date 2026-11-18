// Titoli operabili via API, per exchange (Prova e Reale di quell'exchange; la Simulazione con l'opzione "solo titoli operabili"
// usa la lista di Bitunix). Due fonti:
//  1. le coppie dell'exchange (adattatore, notTradable): Bitunix = campo isApiSupported di trading_pairs ("This trading pair
//     does not currently support trading via OpenAPI"); Bitget = perpetuo USDT sul titolo presente e negoziabile.
//  2. quello che succede davvero nel Reale: un titolo che l'exchange rifiuta (ordine, oppure stop loss non impostabile) viene
//     segnato qui (wt_meta `api:marks` per Bitunix, `api:marks:<exchange>` per gli altri) e non si tenta più per RECHECK_DAYS
//     giorni; poi si riprova da solo.
// Prova e Reale dello stesso exchange usano sempre la stessa lista (così il confronto è onesto).
import { getMeta, setMeta } from './db.js'
import { adapter } from './exchanges/index.js'
import { exSuffix, exName, DEFAULT_EX } from '../shared/venues.js'
import { STRATEGY_SYMBOLS } from '../shared/opening.js'

export const RECHECK_DAYS = 7
const KEY = ex => `api:marks${exSuffix(ex)}`
const DAY = 86400000

// Errore "coppia non operabile via API" (Bitunix; per gli altri exchange l'adattatore ha il suo isApiReject)
export const isApiReject = (msg, ex = DEFAULT_EX) => adapter(ex).isApiReject(msg)

// Stato attuale: { pairsAt, marks, check(sym) → null se operabile, altrimenti { kind, why, at, until } }
export async function operable(now = Date.now(), ex = DEFAULT_EX) {
  const a = adapter(ex)
  const [pairs, marksRaw, pairsAt] = await Promise.all([a.pairs(), getMeta(KEY(ex)), a.pairsAt()])
  const byPerp = new Map(pairs.map(p => [p.symbol, p]))
  const marks = {}
  for (const [sym, m] of Object.entries(marksRaw || {})) if (m && now - m.at < RECHECK_DAYS * DAY) marks[sym] = m
  const check = sym => {
    // senza elenco delle coppie (exchange non raggiungibile) non si esclude niente per questo motivo
    const why = pairs.length ? a.notTradable(sym, byPerp) : null
    if (why) return { kind: ex, why, at: pairsAt || null, until: null }
    const m = marks[sym]
    if (m) return { kind: m.kind, why: m.why, at: m.at, until: m.at + RECHECK_DAYS * DAY }
    return null
  }
  return { ex, pairsAt: pairsAt || null, marks, check }
}

// Solo i titoli operabili, nello stesso ordine
export const keepOperable = (symbols, op) => symbols.filter(sym => !op.check(sym))

// Segna un titolo come non operabile (kind: 'ordini' = ordine rifiutato, 'stop' = stop loss non impostabile)
export async function markNotOperable(sym, kind, msg, now = Date.now(), ex = DEFAULT_EX) {
  const marks = (await getMeta(KEY(ex))) || {}
  const fresh = !marks[sym] || now - marks[sym].at >= RECHECK_DAYS * DAY
  const X = exName(ex)
  const why = kind === 'stop' ? `stop loss rifiutato da ${X} via API (${String(msg).slice(0, 160)})` : `ordine rifiutato da ${X} via API (${String(msg).slice(0, 160)})`
  marks[sym] = { kind, why, at: now }
  await setMeta(KEY(ex), marks)
  return fresh
}

// Ricontrollo a mano (pagina Strategia): toglie i segni, così al prossimo segnale si riprova
export async function clearMarks(sym, ex = DEFAULT_EX) {
  if (!sym) { await setMeta(KEY(ex), {}); return }
  const marks = (await getMeta(KEY(ex))) || {}
  delete marks[sym]
  await setMeta(KEY(ex), marks)
}

// Vista per la pagina. La lista di ogni exchange parte da tutto l'universo della strategia (STRATEGY_SYMBOLS), indipendente
// dagli altri exchange: universe/uniOk = titoli dell'universo e quanti sono operabili su questo exchange, all = esclusi
// dell'universo con motivo e date. total/ok/list = gli stessi conti sui titoli scelti nelle impostazioni (che non cambiano).
export async function operableView(symbols, ex = DEFAULT_EX) {
  const op = await operable(Date.now(), ex)
  const row = sym => ({ symbol: sym, ...(op.check(sym) || {}) })
  const all = STRATEGY_SYMBOLS.map(row).filter(x => x.kind)
  const list = symbols.map(row).filter(x => x.kind)
  return {
    ex, pairsAt: op.pairsAt, recheckDays: RECHECK_DAYS,
    universe: STRATEGY_SYMBOLS.length, uniOk: STRATEGY_SYMBOLS.length - all.length, all,
    total: symbols.length, ok: symbols.length - list.length, list,
  }
}
