// ICC Scanner lato server: universo dei perpetual Bitunix, candele 1D/4H/1H, motore ICC (shared/icc.js), segnali e paper tracking.
// Solo analisi e segnalazione: nessun ordine. Gira dal controllo ogni minuto (server/tick.js): dopo ogni chiusura della candela 1H
// aggiorna a lotti tutti i mercati seguiti (prima quelli aggiornati da più tempo, BTC per primo), entro il tempo concesso;
// bitunix.js resta sotto il limite di richieste (8 al secondo). Dati:
//   wt_meta icc:settings      impostazioni (cleanIcc)
//   wt_meta icc:universe      mercati seguiti { at, list: [{ symbol, category, vol }] } (volume 24h sopra soglia, aggiornato ogni 6 ore)
//   wt_meta icc:k:<titolo>    candele chiuse { h1, h4, d1 } (ultime 700 / 400 / 400), si scaricano solo quelle nuove
//   wt_meta icc:states        stato di ogni mercato (setup in corso, trend, zone) per la dashboard; icc:done = ultima ora completata
//   wt_meta icc:since         da quando ogni mercato è seguito (i segnali prima non si registrano)
//   tabella wt_icc_signals    segnali con esito (paper tracking), filtri e dati del setup
import { klines, klinesBack, tradingPairs, marketTickers } from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { notifyTrades } from './push.js'
import { ASSETS } from '../shared/assets.js'
import { STRATEGY_SYMBOLS } from '../shared/opening.js'
import { ASSET_MAP } from '../shared/assets.js'
import { runIcc, applyFilters, cleanIcc, categoryOf, swings, trendOf, H1, H4, D1 } from '../shared/icc.js'

export class IccError extends Error { constructor(msg, status = 400) { super(msg); this.status = status } }
export const TABLE_HINT = 'tabella wt_icc_signals mancante: esegui la migrazione in fondo a supabase/schema.sql nell\'editor SQL di Supabase'
const KEEP = { h1: 700, h4: 400, d1: 400 }
const TF = { h1: ['1h', H1], h4: ['4h', H4], d1: ['1d', D1] }
const STOCK_PERPS = new Set([...ASSETS.filter(a => a.kind !== 'crypto').map(a => a.perp), ...STRATEGY_SYMBOLS.map(s => ASSET_MAP[s]?.perp).filter(Boolean)])
const pack = b => [b.t, b.o, b.h, b.l, b.c]
const unpack = a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4] })
const isSym = s => typeof s === 'string' && /^[A-Z0-9]{2,30}$/.test(s)

export async function getSettings() { return cleanIcc((await getMeta('icc:settings').catch(() => null)) || {}) }
export async function saveSettings(raw) { const s = cleanIcc(raw); await setMeta('icc:settings', s); await setMeta('icc:universe', null).catch(() => {}); return s }

// ---------- Universo: perpetual aperti con volume 24h sopra la soglia della loro categoria, i più scambiati ----------
export async function universe(s, now = Date.now(), force = false) {
  const u = await getMeta('icc:universe').catch(() => null)
  if (!force && u?.list && now - u.at < 6 * H1) return u
  const [pairs, tk] = await Promise.all([tradingPairs(), marketTickers()])
  const min = { crypto: s.minVolCrypto, stock: s.minVolStock, commodity: s.minVolCommodity }
  const list = pairs.filter(p => /USDT$/.test(p.symbol)).map(p => ({ symbol: p.symbol, category: categoryOf(p.symbol, STOCK_PERPS), vol: tk[p.symbol]?.quoteVol || 0 }))
    .filter(x => x.vol >= min[x.category]).sort((a, b) => b.vol - a.vol).slice(0, s.maxMarkets)
  const next = { at: now, list, total: pairs.length }
  await setMeta('icc:universe', next)
  return next
}

// ---------- Candele: archivio in wt_meta, solo quelle nuove da Bitunix ----------
async function loadBars(sym, now) {
  const c = (await getMeta(`icc:k:${sym}`).catch(() => null)) || {}
  const out = {}
  for (const [k, [tf, ms]] of Object.entries(TF)) {
    let bars = (c[k] || []).map(unpack)
    const lastClosed = Math.floor(now / ms) * ms - ms // inizio dell'ultima candela chiusa
    if (!bars.length || bars.at(-1).t < lastClosed) {
      const miss = bars.length ? Math.ceil((now - bars.at(-1).t) / ms) + 2 : KEEP[k]
      const fresh = miss <= 200 && bars.length ? await klines(sym, tf, miss) : await klinesBack(sym, tf, KEEP[k])
      const m = new Map(bars.map(b => [b.t, b]))
      for (const b of fresh) m.set(b.t, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })
      bars = [...m.values()].sort((a, b) => a.t - b.t)
    }
    out[k] = bars.filter(b => b.t + ms <= now).slice(-KEEP[k])
  }
  await setMeta(`icc:k:${sym}`, Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map(pack)]))).catch(() => {})
  return out
}

const rowOf = (sym, category, g, now, filtered) => ({
  id: `${sym}:${g.id}`, symbol: sym, category, side: g.side, grade: g.grade, scenario: g.scenario, deep: !!g.deep, trend: g.trend, level_kind: g.levelKind,
  created_at: g.at, entry: g.entry, stop: g.stop, tp1: g.tp1, tp2: g.tp2, rr: g.rr, status: g.status, final: !!g.final, filtered,
  r: g.R ?? null, r_net: g.Rnet ?? null, exit_at: g.exitAt ?? null, tp1_at: g.tp1At ?? null,
  data: { level: g.level, zone: g.zone, origin: g.origin, ext: g.ext, corrExt: g.corrExt, mini: g.mini, indAt: g.indAt, corrAt: g.corrAt, rr1: g.rr1, rr2: g.rr2, risk: g.risk },
  updated_at: now,
})
const compact = st => st && { id: st.id, side: st.side, stage: st.stage, at: st.at, level: st.level, levelKind: st.levelKind, zone: st.zone, origin: st.origin, ext: st.ext, corrExt: st.corrExt, mini: st.mini, deep: st.deep, trend: st.trend, corrAt: st.corrAt || null }

// ---------- Giro dello scanner (dal controllo ogni minuto) ----------
export async function runIccScan({ budgetMs = 8000, now = Date.now() } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0)
  const hour = Math.floor(now / H1) * H1 // chiusura dell'ultima candela 1H
  if ((await getMeta('icc:done').catch(() => null))?.hour === hour) return { idle: true }
  const s = await getSettings()
  const u = await universe(s, now)
  const states = (await getMeta('icc:states').catch(() => null)) || {}
  const since = (await getMeta('icc:since').catch(() => null)) || {}
  const syms = u.list.map(x => x.symbol)
  const todo = syms.filter(x => !(states[x]?.lastT >= hour)).sort((a, b) => (a === 'BTCUSDT' ? -1 : b === 'BTCUSDT' ? 1 : (states[a]?.at || 0) - (states[b]?.at || 0)))
  const out = { todo: todo.length, done: 0, signals: [], errors: [] }
  let known = null, table = true
  const active = []
  for (const sym of todo) {
    if (left() < 1500) break
    const meta = u.list.find(x => x.symbol === sym)
    try {
      const b = await loadBars(sym, now)
      if (!b.h1.length) { states[sym] = { ...states[sym], at: now, lastT: hour, error: 'nessuna candela 1H' }; continue }
      since[sym] ||= now
      const r = runIcc({ b1h: b.h1, b4h: b.h4, b1d: b.d1, s0: s })
      states[sym] = {
        at: now, lastT: b.h1.at(-1).t + H1 >= hour ? hour : b.h1.at(-1).t + H1, category: meta.category, vol: meta.vol, price: b.h1.at(-1).c, trend: r.trend,
        current: compact(r.current), zones: r.zones.slice(0, 12),
      }
      out.done++
      // segnali: nuovi (dopo l'inizio del monitoraggio) e aggiornamento dell'esito di quelli aperti
      const sigs = r.signals.filter(g => g.at >= since[sym])
      if (!sigs.length || !table) continue
      if (!known) {
        try {
          const rows = await q(db().from('wt_icc_signals').select('id, final, filtered, side, exit_at').gte('created_at', now - 60 * D1))
          known = new Map(rows.map(x => [x.id, x]))
          for (const x of rows) if (!x.filtered && !x.final) active.push({ side: x.side, until: null })
        } catch (e) { table = false; out.errors.push(/wt_icc_signals/.test(e.message) ? TABLE_HINT : e.message); continue }
      }
      const btcTrend = states.BTCUSDT?.trend || 'range'
      const rows = []
      for (const g of sigs) {
        const id = `${sym}:${g.id}`, old = known.get(id)
        if (old?.final) continue
        let filtered = old ? old.filtered : null
        if (!old) {
          filtered = applyFilters([{ ...g, symbol: sym, category: meta.category, exitAt: null }], s, { btcTrendAt: () => btcTrend, active })[0].filtered
          if (!filtered) active.push({ side: g.side, until: null })
          known.set(id, { id, final: g.final, filtered })
          if (!filtered && g.grade === 'A' && s.notifyA && now - g.at < 3 * H1) {
            await notifyTrades([{ title: `ICC · ${sym.replace(/USDT$/, '')} ${g.side > 0 ? 'LONG' : 'SHORT'} voto A`, body: `${g.scenario} · entrata ${g.entry.toPrecision(6)} · stop ${g.stop.toPrecision(6)} · TP1 ${g.tp1.toPrecision(6)}${g.tp2 ? ` · TP2 ${g.tp2.toPrecision(6)}` : ''} · R:R ${g.rr.toFixed(1)}`, url: '/icc', tag: `icc-${sym}` }]).catch(() => {})
          }
          out.signals.push(`${sym} ${g.side > 0 ? 'long' : 'short'} ${g.grade}${filtered ? ` (filtrato: ${filtered})` : ''}`)
        }
        rows.push(rowOf(sym, meta.category, g, now, filtered))
      }
      if (rows.length) await q(db().from('wt_icc_signals').upsert(rows))
    } catch (e) { out.errors.push(`${sym}: ${e.message}`); states[sym] = { ...states[sym], at: now, error: e.message } }
  }
  for (const k of Object.keys(states)) if (!syms.includes(k)) delete states[k]
  await setMeta('icc:states', states)
  await setMeta('icc:since', since)
  const remaining = syms.filter(x => !(states[x]?.lastT >= hour)).length
  if (!remaining) await setMeta('icc:done', { hour, at: Date.now() })
  out.remaining = remaining
  out.ms = Date.now() - t0
  out.errors = out.errors.slice(0, 5)
  return out
}

// ---------- Dati per la pagina ----------
export async function iccState() {
  const [s, u, states, done] = await Promise.all([getSettings(), getMeta('icc:universe').catch(() => null), getMeta('icc:states').catch(() => null), getMeta('icc:done').catch(() => null)])
  let rows = [], error = null
  try { rows = await q(db().from('wt_icc_signals').select('*').order('created_at', { ascending: false }).limit(3000)) } catch (e) { error = /wt_icc_signals/.test(e.message) ? TABLE_HINT : e.message }
  return { settings: s, universe: u ? { at: u.at, n: u.list.length, total: u.total } : null, states: states || {}, done, signals: rows, error }
}
export async function iccChart(sym) {
  if (!isSym(sym)) throw new IccError('Titolo non valido')
  const s = await getSettings()
  const c = await getMeta(`icc:k:${sym}`).catch(() => null)
  let b
  if (c?.h1?.length) b = { h1: c.h1.map(unpack), h4: c.h4.map(unpack), d1: c.d1.map(unpack) }
  else {
    const now = Date.now()
    const [h1, h4, d1] = await Promise.all([klinesBack(sym, '1h', 700), klinesBack(sym, '4h', 400), klinesBack(sym, '1d', 400)])
    b = { h1: h1.filter(x => x.t + H1 <= now), h4: h4.filter(x => x.t + H4 <= now), d1: d1.filter(x => x.t + D1 <= now) }
  }
  if (!b.h1.length) throw new IccError(`${sym} non ha candele su Bitunix`, 404)
  const r = runIcc({ b1h: b.h1, b4h: b.h4, b1d: b.d1, s0: s })
  return { symbol: sym, bars: b.h1.slice(-400), zones: r.zones, trend: r.trend, current: compact(r.current), signals: r.signals.slice(-12).map(g => ({ ...g })) }
}

// ---------- Backtest: stesso motore sullo storico di uno o più mercati (indipendente dai segnali dal vivo) ----------
const monthStart = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) }
const nextMonth = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) }
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
async function history(sym, tf, ms, from, to, now) {
  const out = []
  for (let m = monthStart(from); m < to; m = nextMonth(m)) {
    const end = nextMonth(m), complete = end + ms <= now
    const key = `icc:m:${sym}:${tf}:${new Date(m).toISOString().slice(0, 7)}`
    let list = complete ? (await getMeta(key).catch(() => null))?.bars?.map(unpack) : null
    if (!list) {
      list = (await fetchRange(sym, tf, m, Math.min(end, now))).filter(b => b.t + ms <= now).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }))
      if (complete) await setMeta(key, { at: now, bars: list.map(pack) }).catch(() => {})
    }
    out.push(...list)
  }
  return out.filter(b => b.t >= from && b.t < to)
}
export const BT_MAX_WORK = 150 // mercati × mesi per backtest
export async function iccBacktest(body, send, isClosed = () => false) {
  const s = cleanIcc(body?.settings || (await getSettings()))
  const now = Date.now()
  const to = Math.min(Number.isFinite(Date.parse(body?.to)) ? Date.parse(body.to) + D1 : now, now)
  const from = Number.isFinite(Date.parse(body?.from)) ? Date.parse(body.from) : to - 180 * D1
  if (!(from < to)) throw new IccError('Periodo non valido')
  const syms = [...new Set((Array.isArray(body?.symbols) ? body.symbols : []).map(x => String(x).toUpperCase()).filter(isSym))]
  if (!syms.length) throw new IccError('Scegli almeno un mercato')
  const months = Math.ceil((to - from + 60 * D1) / (30 * D1))
  if (syms.length * months > BT_MAX_WORK) throw new IccError(`Troppo lavoro (${syms.length} mercati × ${months} mesi): al massimo ${BT_MAX_WORK}. Accorcia il periodo o scegli meno mercati.`)
  const sigs = [], setups = {}, errors = [], first = {}
  let k = 0
  // trend daily di BTC nel tempo (filtro per le altcoin)
  let btcTrendAt = null
  if (s.btcFilter) {
    try {
      const bd = await history('BTCUSDT', '1d', D1, from - 400 * D1, to, now)
      const sw = swings(bd, s.swingN, D1)
      btcTrendAt = t => trendOf(sw.filter(x => x.conf <= t && x.t >= t - s.zoneDays * D1))
    } catch (e) { errors.push(`BTC (filtro): ${e.message}`) }
  }
  for (const sym of syms) {
    if (isClosed()) return null
    send({ t: 'phase', msg: `${sym.replace(/USDT$/, '')}: candele e motore ICC (${++k}/${syms.length})` })
    try {
      const [b1h, b4h, b1d] = await Promise.all([history(sym, '1h', H1, from - 10 * D1, to, now), history(sym, '4h', H4, from - 60 * D1, to, now), history(sym, '1d', D1, from - 400 * D1, to, now)])
      if (!b1h.length) { errors.push(`${sym}: nessuna candela nel periodo`); continue }
      first[sym] = b1h[0].t
      const r = runIcc({ b1h, b4h, b1d, s0: s, from })
      const cat = categoryOf(sym, STOCK_PERPS)
      for (const g of r.signals) sigs.push({ ...g, symbol: sym, category: cat })
      const st = {}
      for (const x of r.setups) st[x.stage] = (st[x.stage] || 0) + 1
      setups[sym] = st
    } catch (e) { errors.push(`${sym}: ${e.message}`) }
  }
  const out = applyFilters(sigs, s, { btcTrendAt }).sort((a, b) => b.at - a.at)
  return { from, to, symbols: syms, settings: s, signals: out, setups, errors, first }
}
