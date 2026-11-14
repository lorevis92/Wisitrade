// Avvisi push della pagina Range: per ogni telefono/browser iscritto, i titoli scelti e le sue impostazioni.
// Quando un range diventa valido o c'è un setup valido pronto (shared/range.js) arriva una notifica. Solo analisi, nessun ordine.
// Dati in wt_meta: `range:alerts` = { [id iscrizione]: { symbols, settings, at } }, `range:sent` = { chiave evento: ora } (7 giorni).
// Gira dal controllo ogni minuto (server/tick.js) una volta ogni 15 minuti, dopo la chiusura della candela, fuori dall'apertura USA.
import { klinesBack } from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { deliver } from './push.js'
import { analyze, events, cleanRangeSettings } from '../shared/range.js'

const KEY = 'range:alerts', SENT = 'range:sent'
const MAX_SYMBOLS = 8      // titoli diversi controllati a ogni giro (4 richieste a Bitunix ciascuno)
const FRESH = 20 * 60000   // si avvisa solo di eventi degli ultimi 20 minuti (niente avvisi vecchi alla prima iscrizione)
const isSym = s => typeof s === 'string' && /^[A-Z0-9]{2,24}$/.test(s)

async function subByEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null
  return q(db().from('wt_subs').select('id, endpoint').eq('endpoint', endpoint).maybeSingle())
}

export async function getRangeAlerts(endpoint) {
  const sub = await subByEndpoint(endpoint)
  if (!sub) return { subscribed: false, symbols: [] }
  const all = (await getMeta(KEY)) || {}
  return { subscribed: true, symbols: all[sub.id]?.symbols || [] }
}

export async function setRangeAlerts({ endpoint, symbols, settings }) {
  const sub = await subByEndpoint(endpoint)
  if (!sub) { const e = new Error('Attiva prima le notifiche in Impostazioni'); e.status = 400; throw e }
  const list = [...new Set((Array.isArray(symbols) ? symbols : []).filter(isSym))].slice(0, MAX_SYMBOLS)
  const all = (await getMeta(KEY)) || {}
  if (list.length) all[sub.id] = { symbols: list, settings: cleanRangeSettings(settings), at: Date.now() }
  else delete all[sub.id]
  await setMeta(KEY, all)
  return { symbols: list }
}

const fmt = p => (p >= 1000 ? p.toFixed(1) : p >= 10 ? p.toFixed(2) : p.toPrecision(4))
const short = s => s.replace(/USDT$/, '')

export async function runRangeAlerts({ budgetMs = 12000, now = Date.now() } = {}) {
  const t0 = Date.now()
  const all = (await getMeta(KEY)) || {}
  const ids = Object.keys(all)
  if (!ids.length) return { subs: 0 }
  const subs = await q(db().from('wt_subs').select('*').in('id', ids))
  const byId = Object.fromEntries(subs.map(x => [x.id, x]))
  const symbols = [...new Set(ids.flatMap(id => (byId[id] ? all[id].symbols : [])))].slice(0, MAX_SYMBOLS)
  const sent = (await getMeta(SENT)) || {}
  const items = [], done = []
  for (const sym of symbols) {
    if (Date.now() - t0 > budgetMs) break
    let b15, b1h, b4h
    try { [b15, b1h, b4h] = await Promise.all([klinesBack(sym, '15m', 400), klinesBack(sym, '1h', 200), klinesBack(sym, '4h', 200)]) } catch { continue }
    const closed = b15.filter(b => b.t + 15 * 60000 <= now), closed4 = b4h.filter(b => b.t + 4 * 3600000 <= now)
    const cache = new Map()
    for (const id of ids) {
      const sub = byId[id], cfg = all[id]
      if (!sub || !cfg.symbols.includes(sym)) continue
      const sk = JSON.stringify(cfg.settings)
      if (!cache.has(sk)) cache.set(sk, analyze(closed, cfg.settings, { bars1h: b1h, bars4h: closed4 }))
      for (const ev of events(cache.get(sk))) {
        if (now - ev.at > FRESH) continue
        const k = `${id}|${sym}|${ev.key}`
        if (sent[k]) continue
        sent[k] = now
        let payload
        if (ev.kind === 'valid') {
          const r = ev.range
          payload = { title: `${short(sym)}: range ${r.type} valido${r.strong ? ' (rafforzato)' : ''}`, body: `${fmt(r.bottom)} – ${fmt(r.top)} · tocchi ${r.touchUp} in alto, ${r.touchDn} in basso${r.strong ? ` · su ${r.strong.map(x => x.name).join(', ')} settimanale` : ''}`, url: '/range', tag: `range-${sym}` }
        } else {
          const s = ev.setup
          payload = { title: `${short(sym)}: setup ${s.side > 0 ? 'LONG' : 'SHORT'} pronto (${s.type}${s.reversal ? ', inversione' : ''}${s.strong ? ', rafforzato' : ''})`, body: `limite ${fmt(s.entry)} · stop ${fmt(s.stop)} · T1 ${fmt(s.t1)} · T2 ${fmt(s.t2)} · T3 ${fmt(s.t3)} · R:R ${s.rr.toFixed(1)} · trend 4h ${s.fit}`, url: '/range', tag: `range-${sym}` }
        }
        items.push({ sub, payload, topic: payload.tag })
        done.push(`${sym} ${ev.key}`)
      }
    }
  }
  for (const [k, at] of Object.entries(sent)) if (now - at > 7 * 864e5) delete sent[k]
  if (items.length) await setMeta(SENT, sent)
  const r = items.length ? await deliver(items) : { sent: 0 }
  return { subs: ids.length, symbols: symbols.length, events: done, sent: r.sent, ms: Date.now() - t0 }
}
