// Pagina Range · Simulazione: backtest indipendente sullo storico, con la stessa logica del registro dal vivo (shared/range.js:
// analyze con le impostazioni di partenza, contesto 4h, profilo settimanale, range, tocchi, falso breakout, voto A/B/C, filtro costi).
// Non legge né scrive il registro dal vivo (wt_range_trades) né il conto di prova (range:paper): calcola tutto da zero sul periodo.
// Candele archiviate a mesi in wt_meta `range:k:<titolo>:<tf>:<mese>` (solo mesi completi; il mese in corso sempre da Bitunix).
// Come il controllo dal vivo, che a ogni giro guarda le ultime 600 candele da 15 minuti (circa 6 giorni), il periodo si divide in
// blocchi: ogni blocco ha 600 candele prima (riscaldamento), 7 giorni di "nucleo" (solo i setup nati qui contano) e 6 giorni dopo
// per seguire l'esito (come il registro, che dopo 6 giorni chiude i trade ancora aperti come "dati finiti").
import { klines } from './bitunix.js'
import { getMeta, setMeta } from './db.js'
import { analyze, isFinal, RANGE_DEFAULTS } from '../shared/range.js'

const DAY = 864e5, M15 = 9e5
const TF = { '15m': M15, '1h': 36e5, '4h': 144e5 }
export const MAX_WORK = 120 // titoli × mesi per simulazione (limite di tempo della funzione)
export class BacktestError extends Error { constructor(msg, status = 400) { super(msg); this.status = status } }
const isSym = s => typeof s === 'string' && /^[A-Z0-9]{2,24}$/.test(s)

const pack = b => [b.t, b.o, b.h, b.l, b.c, b.v]
const unpack = a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] })
async function fetchRange(sym, tf, from, to) {
  let out = [], end = to - 1
  for (let guard = 0; guard < 300; guard++) {
    const page = await klines(sym, tf, 200, { endTime: end })
    const fresh = page.filter(b => b.t >= from && b.t < to && (!out.length || b.t < out[0].t))
    out = [...fresh, ...out]
    if (!page.length || page[0].t <= from || page.length < 200 || !fresh.length) break
    end = page[0].t - 1
  }
  return out
}
const monthStart = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) }
const nextMonth = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) }
const monthsIn = (from, to) => { const out = []; for (let m = monthStart(from); m < to; m = nextMonth(m)) out.push(m); return out }
async function bars(sym, tf, from, to, now) {
  const out = []
  for (const m of monthsIn(from, to)) {
    const end = nextMonth(m), complete = end + TF[tf] <= now
    const key = `range:k:${sym}:${tf}:${new Date(m).toISOString().slice(0, 7)}`
    let list = complete ? (await getMeta(key).catch(() => null))?.bars?.map(unpack) : null
    if (!list) {
      list = (await fetchRange(sym, tf, m, Math.min(end, now))).filter(b => b.t + TF[tf] <= now)
      if (complete) await setMeta(key, { at: now, bars: list.map(pack) }).catch(() => {})
    }
    out.push(...list)
  }
  return out.filter(b => b.t >= from && b.t < to)
}

// Riga nello stesso formato del registro dal vivo (stessi campi: la pagina usa le stesse tabelle e gli stessi totali)
const rowOf = (sym, t) => ({
  id: `${sym}:${t.id}`, symbol: sym, kind: t.kind, variant: t.variant || null, range_type: t.type, side: t.side, with_impulse: t.withImpulse,
  fit: t.fit, grade: t.grade, valid: !!t.valid, cost_pct: t.costPct ?? null, valid_fut: !!t.validFut, cost_pct_fut: t.costPctFut ?? null, created_at: t.at,
  entry: t.entry, stop: t.stop, rr: t.rr, status: t.status, fill_at: t.fillAt ?? null, exit_at: t.exitAt ?? null,
  r_gross: t.R ?? null, r_net: t.Rnet ?? null, fees_r: t.feesR ?? null, r_net_fut: t.RnetFut ?? null, fees_r_fut: t.feesRFut ?? null, final: isFinal(t),
  data: { why: t.why || null },
})

// Setup di un titolo nel periodo [from, to): blocchi come il controllo dal vivo, nessun setup contato due volte
export function backtestSymbol(b15, b1h, b4h, from, to, settings = RANGE_DEFAULTS) {
  const WARM = 600, CORE = 7 * DAY, TAIL = 6 * DAY
  const seen = new Map()
  for (let c = from; c < to; c += CORE) {
    const coreEnd = Math.min(c + CORE, to)
    let i0 = b15.findIndex(b => b.t >= c)
    if (i0 < 0) break
    i0 = Math.max(0, i0 - WARM)
    const win = b15.filter((b, i) => i >= i0 && b.t < coreEnd + TAIL)
    if (win.length < 60) continue
    const tEnd = win.at(-1).t + M15
    const res = analyze(win, settings, { bars1h: b1h.filter(b => b.t + 36e5 <= tEnd), bars4h: b4h.filter(b => b.t + 144e5 <= tEnd) })
    for (const t of res.trades) if (t.at >= c && t.at < coreEnd && !seen.has(t.id)) seen.set(t.id, rowOf('', t))
  }
  return [...seen.values()]
}

export async function rangeBacktest(body, send, isClosed = () => false) {
  const now = Date.now()
  const to = Math.min(Number.isFinite(Date.parse(body?.to)) ? Date.parse(body.to) + DAY : now, now)
  const from = Number.isFinite(Date.parse(body?.from)) ? Date.parse(body.from) : to - 90 * DAY
  if (!(from < to)) throw new BacktestError('Periodo non valido')
  const syms = [...new Set((Array.isArray(body?.symbols) ? body.symbols : []).filter(isSym))]
  if (!syms.length) throw new BacktestError('Scegli almeno un titolo')
  const work = syms.length * monthsIn(from - 8 * DAY, to).length
  if (work > MAX_WORK) throw new BacktestError(`Troppo lavoro per una simulazione (${syms.length} titoli × ${monthsIn(from - 8 * DAY, to).length} mesi): al massimo ${MAX_WORK} titoli × mesi. Accorcia il periodo o scegli meno titoli.`)
  const rows = [], perSym = {}, errors = []
  let k = 0
  for (const sym of syms) {
    if (isClosed()) return null
    send({ t: 'phase', msg: `${sym.replace(/USDT$/, '')}: candele e setup (${++k}/${syms.length})` })
    try {
      const [b15, b1h, b4h] = await Promise.all([bars(sym, '15m', from - 7 * DAY, Math.min(to + 6 * DAY, now), now), bars(sym, '1h', from - 15 * DAY, Math.min(to + 6 * DAY, now), now), bars(sym, '4h', from - 60 * DAY, Math.min(to + 6 * DAY, now), now)])
      if (!b15.length) { errors.push(`${sym}: nessuna candela nel periodo`); continue }
      const list = backtestSymbol(b15, b1h, b4h, from, to).map(r => ({ ...r, id: `${sym}${r.id}`, symbol: sym }))
      rows.push(...list)
      perSym[sym] = { first: b15[0].t, bars: b15.length }
      send({ t: 'load', sym, done: k, total: syms.length, setups: list.length })
    } catch (e) { errors.push(`${sym}: ${e.message}`) }
  }
  rows.sort((a, b) => b.created_at - a.created_at)
  return { from, to, symbols: syms, rows, perSym, errors, at: now }
}
