// Prova più vicina al Reale (docs/be-e-prova-realistica.md): slittamento misurato dal vivo, per tipo d'entrata e d'uscita.
// Ogni sera il confronto serale (server/compare.js) lo ricalcola sugli ultimi 30 trade del Reale di ogni tipo e lo salva in
// wt_meta `liveslip`; con meno di 5 trade di un tipo vale lo 0,05%. Solo la Prova lo usa: il Reale ha i prezzi veri di Bitunix.
// Costo in % del prezzo letto, positivo = peggio per te (mai negativo: la Prova non diventa più ottimista del prezzo letto).
import { db, q, getMeta, setMeta } from './db.js'

export const PSLIP_KEY = 'liveslip'
export const PSLIP_DEFAULT = 0.05
export const PSLIP_MIN_N = 5
export const PSLIP_LAST = 30
export const PSLIP_KINDS = {
  in_veloce: 'entrata veloce', in_minuto: 'entrata al minuto',
  candela: 'uscite a candela chiusa (nessuna conferma, resistenza, nessun progresso…)', segue: 'stop che segue e protezione del guadagno',
  chiusura: 'chiusura delle 15:59', freno: 'freno di mercato',
}
// uscite decise a candela chiusa (le altre uscite del motore vengono dal livello d'uscita: stop, stop che segue, protezione)
export const CANDLE_EXITS = new Set(['volume in calo', 'nessun progresso', 'nessuna conferma', 'fermo dopo 60 min', 'resistenza'])

const r4 = x => Math.round(x * 10000) / 10000
const dflt = () => ({ pct: PSLIP_DEFAULT, n: 0, src: 'predefinito' })
export function defaultSlip() {
  const v = Object.fromEntries(Object.keys(PSLIP_KINDS).map(k => [k, dflt()]))
  v.freno = { ...v.freno, step: 0 }
  return { at: null, values: v }
}
// valori validi da usare (quelli salvati, completati con il predefinito)
export function slipValues(saved) {
  const d = defaultSlip().values
  const v = saved?.values || {}
  return Object.fromEntries(Object.keys(d).map(k => [k, v[k] && Number.isFinite(v[k].pct) ? { ...d[k], ...v[k] } : d[k]]))
}

// Tipo d'uscita di un trade del Reale (null = non serve: stop di Bitunix, liquidazione, chiusure a mano)
export function liveExitKind(p) {
  const x = p.exchange?.slip
  if (!x || x.byExchange) return null
  const r = p.reason || ''
  if (/· da verificare/.test(r)) return null
  if (r === 'freno di mercato') return 'freno'
  if (r === 'chiusura') return 'chiusura'
  if (CANDLE_EXITS.has(r)) return 'candela'
  if (/^(stop loss|ritracciamento|protezione)/.test(r)) return 'segue'
  return null
}

// Misura dai trade chiusi del Reale (più recenti prima). Entrata: prezzo letto al segnale → eseguito.
// Uscite: prezzo letto nel controllo che ha deciso l'uscita → eseguito (prezzo letto registrato in exchange.rec da
// questa versione; per freno e chiusura delle 15:59 era già il livello salvato). Freno: costo = base + passo × posizione chiusa prima.
export function measureSlip(rows) {
  const out = defaultSlip().values
  const take = (k, list) => {
    const xs = list.slice(0, PSLIP_LAST)
    if (xs.length < PSLIP_MIN_N) return { ...out[k], n: xs.length }
    return { pct: r4(Math.max(0, xs.reduce((a, b) => a + b, 0) / xs.length)), n: xs.length, src: 'vivo' }
  }
  const ins = { veloce: [], minuto: [] }
  const exits = { candela: [], segue: [], chiusura: [] }
  const brake = [] // [rank, costo, closed_at]
  const brakeDays = {}
  for (const p of rows) {
    const x = p.exchange?.slip
    if (!x) continue
    const src = p.exchange?.timing?.src
    if (x.sigPx > 0 && x.fillIn > 0 && ins[src]) ins[src].push(p.side * (x.fillIn - x.sigPx) / x.sigPx * 100)
    const k = liveExitKind(p)
    if (!k || !(x.fillOut > 0)) continue
    const fin = (p.exchange?.rec?.exits || []).filter(e => e.kind !== 'metà').at(-1)
    const read = fin?.readPx > 0 ? fin.readPx : (k === 'freno' || k === 'chiusura') && x.sigOut > 0 ? x.sigOut : null
    if (!read) continue
    const cost = p.side * (read - x.fillOut) / read * 100
    if (k === 'freno') (brakeDays[p.day] ||= []).push({ cost, at: p.closed_at, rank: fin?.rank ?? null })
    else exits[k].push(cost)
  }
  out.in_veloce = take('in_veloce', ins.veloce)
  out.in_minuto = take('in_minuto', ins.minuto)
  for (const k of Object.keys(exits)) out[k] = take(k, exits[k])
  // freno: ordine di chiusura dentro lo stesso giorno (rank registrato, altrimenti dall'ora di chiusura)
  for (const list of Object.values(brakeDays)) {
    list.sort((a, b) => a.at - b.at).forEach((x, i) => brake.push([x.rank ?? i, x.cost, x.at]))
  }
  brake.sort((a, b) => b[2] - a[2])
  const bk = brake.slice(0, PSLIP_LAST)
  if (bk.length >= PSLIP_MIN_N) {
    // retta dei minimi quadrati: costo = base + passo × posizione (0 = la prima chiusa)
    const n = bk.length, mx = bk.reduce((a, x) => a + x[0], 0) / n, my = bk.reduce((a, x) => a + x[1], 0) / n
    const sxx = bk.reduce((a, x) => a + (x[0] - mx) ** 2, 0), sxy = bk.reduce((a, x) => a + (x[0] - mx) * (x[1] - my), 0)
    let step = sxx > 0 ? sxy / sxx : 0, base = my - step * mx
    if (step < 0) { step = 0; base = my }
    if (base < 0) { // retta per l'origine
      const s0 = bk.reduce((a, x) => a + x[0] * x[0], 0)
      base = 0; step = s0 > 0 ? Math.max(0, bk.reduce((a, x) => a + x[0] * x[1], 0) / s0) : 0
    }
    out.freno = { pct: r4(base), step: r4(step), n, src: 'vivo' }
  } else out.freno = { ...out.freno, n: bk.length }
  return out
}

export async function updateLiveSlip(now = Date.now()) {
  const rows = await q(db().from('wt_positions').select('day, side, reason, closed_at, exchange').eq('mode', 'live').eq('status', 'closed').order('closed_at', { ascending: false }).limit(400))
  const value = { at: now, values: measureSlip(rows), last: PSLIP_LAST, minN: PSLIP_MIN_N, dflt: PSLIP_DEFAULT }
  await setMeta(PSLIP_KEY, value)
  return value
}
export const loadLiveSlip = () => getMeta(PSLIP_KEY).catch(() => null)

// ---------- Prezzi della Prova ----------
// entrata: prezzo letto + slittamento d'entrata (contro di te)
export function provaEntry(saved, src, read, side) {
  const v = slipValues(saved)[src === 'veloce' ? 'in_veloce' : 'in_minuto']
  return { px: read * (1 + side * v.pct / 100), cost: v.pct, kind: src === 'veloce' ? 'in_veloce' : 'in_minuto' }
}
// uscita decisa dall'app: prezzo letto nel controllo − slittamento del tipo (contro di te); freno: + passo per posizione
export function provaExit(saved, kind, read, side, rank = 0) {
  const v = slipValues(saved)[kind]
  const cost = kind === 'freno' ? v.pct + (v.step || 0) * rank : v.pct
  return { px: read * (1 - side * cost / 100), cost: r4(cost), kind }
}
