// Pagina Range lato server: avvisi push e registro automatico dei setup. Solo analisi, nessun ordine.
// - Avvisi: per ogni telefono/browser iscritto, i titoli scelti, le sue impostazioni e il voto minimo. Quando un range diventa
//   valido o c'è un setup di falso breakout valido pronto (shared/range.js) arriva una notifica.
//   wt_meta `range:alerts` = { [id iscrizione]: { symbols, settings, minGrade, at } }, `range:sent` = { chiave evento: ora } (7 giorni).
// - Registro: sui titoli seguiti (wt_meta `range:follow` = { symbols, since: { titolo: ora } }, di partenza BTC, ETH e oro) ogni
//   setup proposto (falso breakout con entrata limite e a mercato, range trade, breakout con conferma) si salva in wt_range_trades
//   con le impostazioni di partenza e se ne segue l'esito fino alla fine (commissioni di Bitunix comprese). Anche a pagina chiusa.
// Gira dal controllo ogni minuto (server/tick.js) una volta ogni 15 minuti, dopo la chiusura della candela, fuori dall'apertura USA.
import { klinesBack } from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { deliver } from './push.js'
import { analyze, events, cleanRangeSettings, gradeAtLeast, isFinal, RANGE_DEFAULTS, GRADES } from '../shared/range.js'

const KEY = 'range:alerts', SENT = 'range:sent', FOLLOW = 'range:follow', REG_ERR = 'range:registry:error'
const MAX_SYMBOLS = 8      // titoli diversi controllati a ogni giro (6 richieste a Bitunix ciascuno)
const FRESH = 20 * 60000   // si avvisa solo di eventi degli ultimi 20 minuti (niente avvisi vecchi alla prima iscrizione)
const STALE = 6 * 864e5    // un trade non concluso dopo 6 giorni esce dai dati: si chiude nel registro come "dati finiti"
export const FOLLOW_DEFAULT = ['BTCUSDT', 'ETHUSDT', 'XAUUSDT']
const isSym = s => typeof s === 'string' && /^[A-Z0-9]{2,24}$/.test(s)
const TABLE_HINT = 'tabella wt_range_trades mancante: esegui la migrazione in fondo a supabase/schema.sql nell\'editor SQL di Supabase'

async function subByEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null
  return q(db().from('wt_subs').select('id, endpoint').eq('endpoint', endpoint).maybeSingle())
}

export async function getRangeAlerts(endpoint) {
  const sub = await subByEndpoint(endpoint)
  if (!sub) return { subscribed: false, symbols: [] }
  const all = (await getMeta(KEY)) || {}
  return { subscribed: true, symbols: all[sub.id]?.symbols || [], minGrade: all[sub.id]?.minGrade || 'C' }
}

export async function setRangeAlerts({ endpoint, symbols, settings, minGrade }) {
  const sub = await subByEndpoint(endpoint)
  if (!sub) { const e = new Error('Attiva prima le notifiche in Impostazioni'); e.status = 400; throw e }
  const list = [...new Set((Array.isArray(symbols) ? symbols : []).filter(isSym))].slice(0, MAX_SYMBOLS)
  const all = (await getMeta(KEY)) || {}
  if (list.length) all[sub.id] = { symbols: list, settings: cleanRangeSettings(settings), minGrade: GRADES.includes(minGrade) ? minGrade : 'C', at: Date.now() }
  else delete all[sub.id]
  await setMeta(KEY, all)
  return { symbols: list, minGrade: all[sub.id]?.minGrade || 'C' }
}

export async function getFollow() {
  const f = await getMeta(FOLLOW)
  return f?.symbols ? f : { symbols: FOLLOW_DEFAULT, since: {} }
}
export async function setFollow(symbols, now = Date.now()) {
  const cur = await getFollow()
  const list = [...new Set((Array.isArray(symbols) ? symbols : []).filter(isSym))].slice(0, MAX_SYMBOLS)
  const since = {}
  for (const s of list) since[s] = cur.since?.[s] || now
  const next = { symbols: list, since }
  await setMeta(FOLLOW, next)
  return next
}

// righe del registro (le più recenti) per le statistiche della pagina
export async function getRegistry() {
  const follow = await getFollow()
  try {
    const rows = await q(db().from('wt_range_trades').select('*').order('created_at', { ascending: false }).limit(2000))
    return { rows, follow, error: null, lastError: await getMeta(REG_ERR).catch(() => null) }
  } catch (e) {
    return { rows: [], follow, error: /wt_range_trades/.test(e.message) ? TABLE_HINT : e.message }
  }
}

const fmt = p => (p >= 1000 ? p.toFixed(1) : p >= 10 ? p.toFixed(2) : p.toPrecision(4))
const short = s => s.replace(/USDT$/, '')
const rowOf = (sym, t, now) => ({
  id: `${sym}:${t.id}`, symbol: sym, kind: t.kind, variant: t.variant || null, range_type: t.type, side: t.side, with_impulse: t.withImpulse,
  fit: t.fit, grade: t.grade, score: t.score, valid: !!t.valid, created_at: t.at, entry: t.entry, stop: t.stop,
  targets: t.targets.map(x => ({ p: x.p, frac: x.frac, why: x.why })), rr: t.rr, status: t.status,
  fill_at: t.fillAt ?? null, exit_at: t.exitAt ?? null, r_gross: t.R ?? null, r_net: t.Rnet ?? null, fees_r: t.feesR ?? null,
  final: isFinal(t), data: { reasons: t.reasons, weekLevels: t.weekLevels, why: t.why || null, openR: t.openR ?? null }, updated_at: now,
})

// Un giro ogni 15 minuti: candele dei titoli seguiti e di quelli con avvisi, registro, poi avvisi
export async function runRangeAlerts({ budgetMs = 15000, now = Date.now() } = {}) {
  const t0 = Date.now()
  const all = (await getMeta(KEY)) || {}
  const ids = Object.keys(all)
  const subs = ids.length ? await q(db().from('wt_subs').select('*').in('id', ids)) : []
  const byId = Object.fromEntries(subs.map(x => [x.id, x]))
  let follow = await getFollow()
  // prima volta: i titoli di partenza si seguono da adesso
  if (follow.symbols.some(s => !follow.since?.[s])) follow = await setFollow(follow.symbols, now)
  const alertSyms = ids.flatMap(id => (byId[id] ? all[id].symbols : []))
  const symbols = [...new Set([...follow.symbols, ...alertSyms])].slice(0, MAX_SYMBOLS)
  const sent = (await getMeta(SENT)) || {}
  const items = [], done = [], reg = { saved: 0, error: null }
  let finalIds = null
  for (const sym of symbols) {
    if (Date.now() - t0 > budgetMs) break
    let b15, b1h, b4h
    try { [b15, b1h, b4h] = await Promise.all([klinesBack(sym, '15m', 600), klinesBack(sym, '1h', 400), klinesBack(sym, '4h', 200)]) } catch { continue }
    const closed = b15.filter(b => b.t + 15 * 60000 <= now), closed4 = b4h.filter(b => b.t + 4 * 3600000 <= now)
    const cache = new Map()
    const run = settings => { const k = JSON.stringify(settings); if (!cache.has(k)) cache.set(k, analyze(closed, settings, { bars1h: b1h, bars4h: closed4 })); return cache.get(k) }

    // registro (impostazioni di partenza, sempre le stesse: così le statistiche sono confrontabili)
    if (follow.symbols.includes(sym) && !reg.error) {
      try {
        const res = run(RANGE_DEFAULTS), since = follow.since?.[sym] || now
        const list = res.trades.filter(t => t.at >= since)
        if (list.length) {
          if (!finalIds) finalIds = new Set((await q(db().from('wt_range_trades').select('id').eq('final', true).gte('created_at', now - 10 * 864e5))).map(r => r.id))
          const rows = list.map(t => rowOf(sym, t, now)).filter(r => !finalIds.has(r.id))
          if (rows.length) { await q(db().from('wt_range_trades').upsert(rows)); reg.saved += rows.length }
        }
        // trade rimasti aperti oltre i dati scaricati: chiusi come "dati finiti" (con l'ultimo risultato noto)
        await q(db().from('wt_range_trades').update({ final: true, status: 'dati finiti', updated_at: now }).eq('symbol', sym).eq('final', false).lt('created_at', now - STALE))
      } catch (e) { reg.error = /wt_range_trades/.test(e.message) ? TABLE_HINT : e.message }
    }

    // avvisi
    for (const id of ids) {
      const sub = byId[id], cfg = all[id]
      if (!sub || !cfg.symbols.includes(sym)) continue
      for (const ev of events(run(cfg.settings))) {
        if (now - ev.at > FRESH) continue
        if (ev.kind === 'setup' && !gradeAtLeast(ev.setup.grade, cfg.minGrade || 'C')) continue
        const k = `${id}|${sym}|${ev.key}`
        if (sent[k]) continue
        sent[k] = now
        let payload
        if (ev.kind === 'valid') {
          const r = ev.range
          payload = { title: `${short(sym)}: range ${r.type} valido${r.strong ? ' su livello settimanale' : ''}`, body: `${fmt(r.bottom)} – ${fmt(r.top)} · tocchi ${r.touchUp} in alto, ${r.touchDn} in basso${r.strong ? ` · ${r.strong.map(x => x.name).join(', ')}` : ''}`, url: '/range', tag: `range-${sym}` }
        } else {
          const s = ev.setup, tg = s.targets
          payload = { title: `${short(sym)}: ${s.side > 0 ? 'LONG' : 'SHORT'} voto ${s.grade} (${s.type}, ${s.withImpulse ? 'a favore' : 'contro'} l'impulso)`, body: `limite ${fmt(s.entry)} · stop ${fmt(s.stop)} · T1 ${fmt(tg[0].p)} · T2 ${fmt(tg[1].p)} · T3 ${fmt(tg[2].p)} · R:R ${s.rr.toFixed(1)} · trend 4h ${s.fit}`, url: '/range', tag: `range-${sym}` }
        }
        items.push({ sub, payload, topic: payload.tag })
        done.push(`${sym} ${ev.key}`)
      }
    }
  }
  if (reg.error) await setMeta(REG_ERR, { at: now, error: reg.error }).catch(() => {})
  for (const [k, at] of Object.entries(sent)) if (now - at > 7 * 864e5) delete sent[k]
  if (items.length) await setMeta(SENT, sent)
  const r = items.length ? await deliver(items) : { sent: 0 }
  return { subs: ids.length, symbols: symbols.length, registry: reg, events: done, sent: r.sent, ms: Date.now() - t0 }
}
