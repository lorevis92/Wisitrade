// Indice di attività del mercato: valori grezzi di ogni giorno calcolati dall'archivio (wt_meta 'mindex:raw'),
// e indice di oggi alle 9:35 di New York con le candele appena chiuse (wt_meta 'mindex:YYYY-MM-DD').
import { ASSET_MAP } from '../shared/assets.js'
import { ORB_SYMBOLS } from '../shared/opening.js'
import { addDays, nyTs } from '../shared/time.js'
import { makeInfo, indexRaw, marketIndex } from '../shared/analysis.js'
import { existing, lastReadyDay, tradingDays, loadDays, LISTING_KEY, ARCHIVE_SYMBOLS } from './archive.js'
import { klines } from './bitunix.js'
import { getMeta, setMeta } from './db.js'

const RAW_KEY = 'mindex:raw'
const SYMS = [...ORB_SYMBOLS, 'SPY']
export const INDEX_READY_MIN = 575 // 9:35 New York: candele 9:30–9:34 chiuse

export const getIndexRaw = async () => (await getMeta(RAW_KEY)) || {}

// Calcola i valori grezzi dei giorni archiviati che ancora non li hanno (solo giorni con l'archivio completo)
export async function ensureIndex({ budgetMs = 60000 } = {}) {
  const t0 = Date.now()
  const [raw, listing, rows] = await Promise.all([getIndexRaw(), getMeta(LISTING_KEY), existing()])
  const have = new Set(rows.map(r => `${r.symbol}|${r.day}`))
  const L = listing || {}
  const first = Object.values(L).map(x => x.first).filter(Boolean).sort()[0]
  if (!first) return { computed: 0, missing: 0 }
  const complete = d => ARCHIVE_SYMBOLS.every(s => !L[s]?.first || L[s].first > d || have.has(`${s}|${d}`)) && ARCHIVE_SYMBOLS.every(s => L[s])
  const todo = tradingDays(first, lastReadyDay()).filter(d => !raw[d] && complete(d))
  let computed = 0
  for (let i = 0; i < todo.length && Date.now() - t0 < budgetMs; i += 20) {
    const part = todo.slice(i, i + 20)
    const days = await loadDays(SYMS, addDays(part[0], -35), part[part.length - 1])
    const dates = Object.keys(days).sort()
    const info = makeInfo(days)
    for (const d of part) { raw[d] = indexRaw(days, dates, d, ORB_SYMBOLS, info) || { none: true }; computed++ }
    await setMeta(RAW_KEY, raw)
  }
  return { computed, missing: todo.length - computed }
}

// Indice di un giorno passato (o null)
export const indexOf = (raw, day) => (raw[day] && !raw[day].none ? marketIndex(raw, day) : null)

// Indice di oggi, dalle 9:35 di New York (una volta al giorno, poi salvato)
export async function todayIndex(today) {
  const key = `mindex:${today}`
  const cached = await getMeta(key)
  if (cached) return cached
  const end = nyTs(today, INDEX_READY_MIN) - 1
  const past = await loadDays(SYMS, addDays(today, -35), addDays(today, -1))
  const todayBars = {}
  await Promise.all(SYMS.map(async s => {
    try { const b = await klines(ASSET_MAP[s].perp, '1m', 10, { endTime: end }); if (b.length) todayBars[s] = b.filter(x => x.t <= end) } catch { /* titolo non disponibile */ }
  }))
  const days = { ...past, [today]: todayBars }
  const dates = Object.keys(days).sort()
  const rawToday = indexRaw(days, dates, today, ORB_SYMBOLS, makeInfo(days))
  const raw = await getIndexRaw()
  const res = rawToday ? marketIndex({ ...raw, [today]: rawToday }, today) : null
  const out = { day: today, idx: res?.idx ?? null, pcts: res?.pcts ?? null, raw: rawToday, at: Date.now() }
  await setMeta(key, out)
  return out
}
