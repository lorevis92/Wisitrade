// Pagina Range lato server: avvisi push e registro automatico dei setup. Solo analisi, nessun ordine.
// - Avvisi: per ogni telefono/browser iscritto, i titoli scelti, le sue impostazioni e il voto minimo. Quando un range diventa
//   valido o c'è un setup di falso breakout valido pronto (shared/range.js) arriva una notifica.
//   wt_meta `range:alerts` = { [id iscrizione]: { symbols, settings, minGrade, at } }, `range:sent` = { chiave evento: ora } (7 giorni).
// - Registro: sui titoli seguiti (wt_meta `range:follow` = { symbols, since: { titolo: ora } }, di partenza BTC, ETH e oro) ogni
//   setup proposto (falso breakout con entrata limite e a mercato, range trade, breakout con conferma) si salva in wt_range_trades
//   con le impostazioni di partenza e se ne segue l'esito fino alla fine (commissioni di Bitunix comprese). Anche a pagina chiusa.
// Gira dal controllo ogni minuto (server/tick.js) una volta ogni 15 minuti, dopo la chiusura della candela, fuori dall'apertura USA.
import { klinesBack, allTickers } from './bitunix.js'
import { operable } from './operable.js'
import { atr } from '../shared/indicators.js'
import { ASSET_MAP } from '../shared/assets.js'
import { STRATEGY_SYMBOLS } from '../shared/opening.js'
import { db, q, getMeta, setMeta } from './db.js'
import { deliver } from './push.js'
import { getMacro } from './macro.js'

import { analyze, events, cleanRangeSettings, gradeAtLeast, isFinal, trend4h, weekProfiles, RANGE_DEFAULTS, GRADES } from '../shared/range.js'

const KEY = 'range:alerts', SENT = 'range:sent', FOLLOW = 'range:follow', REG_ERR = 'range:registry:error', STATUS = 'range:status', HOT = 'range:hot', FAST = 'range:fast'
const MAX_SYMBOLS = 8      // titoli con avvisi push controllati a ogni giro (6 richieste a Bitunix ciascuno)
export const MAX_FOLLOW = 200 // titoli seguiti dal registro: a rotazione, prima quelli controllati da più tempo (entro il tempo del giro)
const FRESH = 20 * 60000   // si avvisa solo di eventi degli ultimi 20 minuti (niente avvisi vecchi alla prima iscrizione)
const STALE = 6 * 864e5    // un trade non concluso dopo 6 giorni esce dai dati: si chiude nel registro come "dati finiti"
const OLD_DEFAULT = ['BTCUSDT', 'ETHUSDT', 'XAUUSDT'] // selezione di partenza precedente: si sostituisce con quella nuova
// Selezione di default: crypto solo BTC ed ETH (storico affidabile); azioni = i titoli di Apertura USA operabili via API su
// Bitunix (stessa lista e stessa logica della strategia: server/operable.js), così il registro è già pronto per l'automatico.
export async function defaultFollow() {
  const op = await operable().catch(() => null)
  const stocks = STRATEGY_SYMBOLS.filter(sym => ASSET_MAP[sym] && ASSET_MAP[sym].kind !== 'crypto' && (!op || !op.check(sym))).map(sym => ASSET_MAP[sym].perp)
  return ['BTCUSDT', 'ETHUSDT', ...new Set(stocks)].slice(0, MAX_FOLLOW)
}
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
  const old = f?.symbols && f.symbols.length === OLD_DEFAULT.length && OLD_DEFAULT.every(x => f.symbols.includes(x))
  return f?.symbols && !old ? f : { symbols: await defaultFollow(), since: f?.since || {}, isDefault: true }
}
export async function setFollow(symbols, now = Date.now()) {
  const cur = await getFollow()
  const list = [...new Set((Array.isArray(symbols) ? symbols : []).filter(isSym))].slice(0, MAX_FOLLOW)
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
    return { rows, follow, defaults: await defaultFollow(), hot: (await getMeta(HOT).catch(() => null)) || {}, status: (await getMeta(STATUS).catch(() => null)) || {}, paper: await getMeta('range:paper').catch(() => null), error: null, lastError: await getMeta(REG_ERR).catch(() => null) }
  } catch (e) {
    return { rows: [], follow, status: (await getMeta(STATUS).catch(() => null)) || {}, error: /wt_range_trades/.test(e.message) ? TABLE_HINT : e.message }
  }
}

const fmt = p => (p >= 1000 ? p.toFixed(1) : p >= 10 ? p.toFixed(2) : p.toPrecision(4))
const short = s => s.replace(/USDT$/, '')
const rowOf = (sym, t, now) => ({
  id: `${sym}:${t.id}`, symbol: sym, kind: t.kind, variant: t.variant || null, range_type: t.type, side: t.side, with_impulse: t.withImpulse,
  fit: t.fit, grade: t.grade, score: t.score, valid: !!t.valid, cost_pct: t.costPct ?? null, cost_reject: !!t.costReject, valid_fut: !!t.validFut, cost_pct_fut: t.costPctFut ?? null, created_at: t.at, entry: t.entry, stop: t.stop,
  targets: t.targets.map(x => ({ p: x.p, frac: x.frac, why: x.why })), rr: t.rr, status: t.status,
  fill_at: t.fillAt ?? null, exit_at: t.exitAt ?? null, r_gross: t.R ?? null, r_net: t.Rnet ?? null, fees_r: t.feesR ?? null, r_net_fut: t.RnetFut ?? null, fees_r_fut: t.feesRFut ?? null,
  final: isFinal(t), data: { reasons: t.reasons, weekLevels: t.weekLevels, why: t.why || null, invalid: t.invalid || null, openR: t.openR ?? null }, updated_at: now,
})

// Un giro ogni 15 minuti: candele dei titoli seguiti e di quelli con avvisi, registro, poi avvisi
export async function runRangeAlerts({ budgetMs = 15000, now = Date.now() } = {}) {
  const t0 = Date.now()
  const macro = ((await getMacro(now).catch(() => null))?.events || []).filter(e => e.t > now && e.t < now + 24 * 3600000)
  const all = (await getMeta(KEY)) || {}
  const ids = Object.keys(all)
  const subs = ids.length ? await q(db().from('wt_subs').select('*').in('id', ids)) : []
  const byId = Object.fromEntries(subs.map(x => [x.id, x]))
  let follow = await getFollow()
  // prima volta: i titoli di partenza si seguono da adesso
  if (follow.isDefault || follow.symbols.some(s => !follow.since?.[s])) follow = await setFollow(follow.symbols, now)
  const alertSyms = ids.flatMap(id => (byId[id] ? all[id].symbols : []))
  // prima i titoli con avvisi (servono subito), poi i titoli seguiti a rotazione: quelli controllati da più tempo
  const status = (await getMeta(STATUS).catch(() => null)) || {}
  const rot = follow.symbols.slice().sort((a, b) => (status[a]?.at || 0) - (status[b]?.at || 0))
  // titoli segnalati dal controllo leggero (prezzo vicino a un bordo o livello rotto): in prima fila, i più vecchi prima
  const hot = (await getMeta(HOT).catch(() => null)) || {}
  const hotSyms = Object.keys(hot).filter(x => follow.symbols.includes(x)).sort((a, b) => hot[a].at - hot[b].at)
  const symbols = [...new Set([...alertSyms.slice(0, MAX_SYMBOLS), ...hotSyms, ...rot])]
  const sent = (await getMeta(SENT)) || {}
  const items = [], done = [], reg = { saved: 0, error: null }
  let finalIds = null
  for (const sym of symbols) {
    if (Date.now() - t0 > budgetMs) break
    let b15, b1h, b4h
    try { [b15, b1h, b4h] = await Promise.all([klinesBack(sym, '15m', 600), klinesBack(sym, '1h', 400), klinesBack(sym, '4h', 200)]) } catch (e) { if (follow.symbols.includes(sym)) status[sym] = { ...status[sym], at: now, error: `candele non disponibili: ${e.message}` }; continue }
    const closed = b15.filter(b => b.t + 15 * 60000 <= now), closed4 = b4h.filter(b => b.t + 4 * 3600000 <= now)
    const cache = new Map()
    const run = settings => { const k = JSON.stringify(settings); if (!cache.has(k)) cache.set(k, analyze(closed, settings, { bars1h: b1h, bars4h: closed4 })); return cache.get(k) }

    // registro (impostazioni di partenza, sempre le stesse: così le statistiche sono confrontabili)
    if (follow.symbols.includes(sym)) {
      // stato attuale del titolo per il riepilogo della pagina (range attivi, setup pronto, trend a 4 ore)
      try {
        const res = run(RANGE_DEFAULTS), act = res.ranges.filter(r => r.active)
        const ready = act.map(r => r.lastSetup).find(x => x && x.valid && ['pronto', 'in corso'].includes(x.status))
        const wp = weekProfiles(b1h, now), A = atr(closed, 14)
        const lv = []
        for (const [w, nm] of [[wp.cur, 'settimana'], [wp.prev, 'settimana prima']]) if (w) for (const k of ['poc', 'vah', 'val']) if (Number.isFinite(w[k])) lv.push({ p: w[k], name: `${k.toUpperCase()} ${nm}` })
        status[sym] = {
          at: now, price: closed.at(-1)?.c ?? null, trend: closed4.length ? trend4h(closed4)?.trend ?? null : null, atr: A.at(-1) ?? null, levels: lv,
          ranges: act.map(r => ({ type: r.type, valid: r.validIdx !== null, top: r.top, bottom: r.bottom })),
          setup: ready ? { side: ready.side, grade: ready.grade, kind: ready.kind, status: ready.status, entry: ready.entry } : null,
        }
      } catch (e) { status[sym] = { at: now, error: e.message } }
    }
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
          const nx = macro[0]
          const warn = nx ? ` · ATTENZIONE: ${nx.title} tra ${Math.max(1, Math.round((nx.t - now) / 3600000))} ore` : ''
          payload = { title: `${short(sym)}: ${s.side > 0 ? 'LONG' : 'SHORT'} voto ${s.grade} (${s.type}, ${s.withImpulse ? 'a favore' : 'contro'} l'impulso)`, body: `limite ${fmt(s.entry)} · stop ${fmt(s.stop)} · T1 ${fmt(tg[0].p)} · T2 ${fmt(tg[1].p)} · T3 ${fmt(tg[2].p)} · R:R ${s.rr.toFixed(1)} · costi ${s.costPct.toFixed(0)}% del rischio · trend 4h ${s.fit}${warn}`, url: '/range', tag: `range-${sym}` }
        }
        items.push({ sub, payload, topic: payload.tag })
        done.push(`${sym} ${ev.key}`)
      }
    }
  }
  if (reg.error) await setMeta(REG_ERR, { at: now, error: reg.error }).catch(() => {})
  for (const k of Object.keys(status)) if (!follow.symbols.includes(k)) delete status[k]
  await setMeta(STATUS, status).catch(() => {})
  // titoli ricalcolati in questo giro: escono dalla prima fila
  const fresh = Object.keys(hot).filter(k => status[k]?.at === now || !follow.symbols.includes(k))
  if (fresh.length) { const h = (await getMeta(HOT).catch(() => null)) || {}; for (const k of fresh) if (!h[k] || h[k].at <= now) delete h[k]; await setMeta(HOT, h).catch(() => {}) }
  for (const [k, at] of Object.entries(sent)) if (now - at > 7 * 864e5) delete sent[k]
  if (items.length) await setMeta(SENT, sent)
  const r = items.length ? await deliver(items) : { sent: 0 }
  return { subs: ids.length, symbols: Object.values(status).filter(x => x.at === now).length, follow: follow.symbols.length, registry: reg, events: done, sent: r.sent, ms: Date.now() - t0 }
}

// ---------- Controllo leggero (ogni minuto, dal controllo ogni minuto) ----------
// Una sola richiesta a Bitunix (tutti i prezzi) e i range e livelli già calcolati nell'ultimo giro pesante (wt_meta range:status),
// senza ricalcolare niente. Un titolo va in prima fila per il prossimo giro pesante (wt_meta range:hot) quando:
//  - il prezzo arriva vicino a un bordo di un range attivo (entro NEAR_ATR × ATR a 15 minuti) o ne esce;
//  - il prezzo attraversa un livello già noto (bordi dei range, POC, VAH, VAL della settimana e di quella prima).
// Si segnala solo il cambiamento (ultimo prezzo e vicinanza in wt_meta range:fast), non a ogni minuto.
export const NEAR_ATR = 0.5
export function fastCheck(st, prev, px) {
  const a = st?.atr > 0 ? st.atr : null
  if (!a || !(px > 0)) return { near: false, why: null }
  const edges = (st.ranges || []).flatMap(r => [{ p: r.top, name: `bordo alto del range ${r.type}`, top: true, r }, { p: r.bottom, name: `bordo basso del range ${r.type}`, top: false, r }])
  const outside = (st.ranges || []).find(r => px > r.top || px < r.bottom)
  const nearEdge = edges.find(e => Math.abs(px - e.p) <= NEAR_ATR * a)
  const near = !!(nearEdge || outside)
  let why = null
  const last = prev?.px
  if (last > 0) {
    const crossed = [...edges, ...(st.levels || [])].find(l => (last - l.p) * (px - l.p) < 0)
    if (crossed) why = `prezzo oltre ${crossed.name} (${crossed.p.toPrecision(6)})`
  }
  if (!why && near && !prev?.near) why = outside ? `prezzo fuori dal range ${outside.type}` : `prezzo vicino al ${nearEdge.name}`
  return { near, why }
}
export async function runRangeFast({ now = Date.now() } = {}) {
  const [follow, status, prevAll] = await Promise.all([getFollow(), getMeta(STATUS).catch(() => null), getMeta(FAST).catch(() => null)])
  if (!status || !follow.symbols.length) return { idle: true }
  const prices = await allTickers()
  const next = {}, flagged = {}
  for (const sym of follow.symbols) {
    const st = status[sym], px = prices[sym]
    if (!st || !(px > 0)) continue
    // dopo un ricalcolo pesante si riparte dal suo stato (niente segnali su livelli appena ricalcolati)
    const prev = prevAll?.[sym] && prevAll[sym].at >= st.at ? prevAll[sym] : { px: st.price, near: false }
    const r = fastCheck(st, prev, px)
    next[sym] = { px, near: r.near, at: now }
    if (r.why) flagged[sym] = { at: now, why: r.why, px }
  }
  await setMeta(FAST, next).catch(() => {})
  if (Object.keys(flagged).length) {
    const hot = (await getMeta(HOT).catch(() => null)) || {}
    for (const [k, v] of Object.entries(flagged)) if (!hot[k]) hot[k] = v
    await setMeta(HOT, hot)
  }
  return { checked: Object.keys(next).length, flagged: Object.entries(flagged).map(([k, v]) => `${k.replace(/USDT$/, '')}: ${v.why}`) }
}
