// Titoli operabili via API su Bitunix (per Prova, Reale e Simulazione).
// Due fonti:
//  1. il campo isApiSupported delle coppie di Bitunix (trading_pairs, pubblico): false = Bitunix rifiuta gli ordini via API
//     ("This trading pair does not currently support trading via OpenAPI"). Si rilegge ogni giorno (getPairs).
//  2. quello che succede davvero nel Reale: un titolo che Bitunix rifiuta per questo motivo (ordine, oppure stop loss non
//     impostabile) viene segnato qui (wt_meta `api:marks`) e non si tenta più per RECHECK_DAYS giorni; poi si riprova da solo.
// Prova e Reale usano sempre la stessa lista (così il confronto è onesto); la Simulazione con l'opzione "solo titoli operabili".
import { ASSET_MAP } from '../shared/assets.js'
import { getMeta, setMeta } from './db.js'
import { getPairs } from './scanner.js'

export const RECHECK_DAYS = 7
const KEY = 'api:marks'
const DAY = 86400000

// Errore di Bitunix "coppia non operabile via API"
export const isApiReject = msg => /not currently support trading via OpenAPI|not support.*open ?api|api.*not.*support/i.test(String(msg || ''))

// Stato attuale: { pairsAt, marks, check(sym) → null se operabile, altrimenti { kind, why, at, until } }
export async function operable(now = Date.now()) {
  const [pairs, marksRaw, pairsMeta] = await Promise.all([getPairs(), getMeta(KEY), getMeta('pairs')])
  const byPerp = new Map(pairs.map(p => [p.symbol, p]))
  const marks = {}
  for (const [sym, m] of Object.entries(marksRaw || {})) if (m && now - m.at < RECHECK_DAYS * DAY) marks[sym] = m
  const check = sym => {
    const perp = ASSET_MAP[sym]?.perp
    const p = perp ? byPerp.get(perp) : null
    if (p && p.api === false) return { kind: 'bitunix', why: 'Bitunix: coppia non operabile via API (isApiSupported = false)', at: pairsMeta?.at || null, until: null }
    const m = marks[sym]
    if (m) return { kind: m.kind, why: m.why, at: m.at, until: m.at + RECHECK_DAYS * DAY }
    return null
  }
  return { pairsAt: pairsMeta?.at || null, marks, check }
}

// Solo i titoli operabili, nello stesso ordine
export const keepOperable = (symbols, op) => symbols.filter(sym => !op.check(sym))

// Segna un titolo come non operabile (kind: 'ordini' = ordine rifiutato, 'stop' = stop loss non impostabile)
export async function markNotOperable(sym, kind, msg, now = Date.now()) {
  const marks = (await getMeta(KEY)) || {}
  const fresh = !marks[sym] || now - marks[sym].at >= RECHECK_DAYS * DAY
  const why = kind === 'stop' ? `stop loss rifiutato da Bitunix via API (${String(msg).slice(0, 160)})` : `ordine rifiutato da Bitunix via API (${String(msg).slice(0, 160)})`
  marks[sym] = { kind, why, at: now }
  await setMeta(KEY, marks)
  return fresh
}

// Ricontrollo a mano (pagina Strategia): toglie i segni, così al prossimo segnale si riprova
export async function clearMarks(sym) {
  if (!sym) { await setMeta(KEY, {}); return }
  const marks = (await getMeta(KEY)) || {}
  delete marks[sym]
  await setMeta(KEY, marks)
}

// Vista per la pagina: titoli della strategia non operabili, con motivo e date
export async function operableView(symbols) {
  const op = await operable()
  const list = symbols.map(sym => ({ symbol: sym, ...(op.check(sym) || {}) })).filter(x => x.kind)
  return { pairsAt: op.pairsAt, recheckDays: RECHECK_DAYS, total: symbols.length, ok: symbols.length - list.length, list }
}
