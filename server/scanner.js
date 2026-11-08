// Scanner dei movimenti forti: riceve le candele già scaricate, calcola i segnali, gestisce il ciclo di vita e manda le push.
import { ASSETS, ALERT, DEFAULT_DURATION } from '../shared/assets.js'
import { analyze, shouldEnd } from '../shared/signals.js'
import { aggregate } from '../shared/indicators.js'
import { tickers, tradingPairs } from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { deliver } from './push.js'
import { sessionKeyFn, ny as nyOf } from './session.js'

const MIN = 60000
const pct = (a, b) => (b ? (a / b - 1) * 100 : 0)
const fmtPct = v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

// Elenco dei perpetual aperti su Bitunix (con precisione), aggiornato una volta al giorno
export async function getPairs() {
  const v = await getMeta('pairs')
  if (v && Date.now() - v.at < 24 * 60 * MIN) return v.list
  try {
    const list = await tradingPairs()
    await setMeta('pairs', { at: Date.now(), list })
    return list
  } catch { return v?.list || [] }
}

export async function durationStats() {
  const rows = await q(db().from('wt_signals').select('type, started_at, ended_at, ret90').eq('status', 'ended').not('ret90', 'is', null).order('started_at', { ascending: false }).limit(2000))
  const out = {}
  for (const r of rows) {
    const s = (out[r.type] ||= { n: 0, ms: 0, win: 0 })
    s.n++; s.ms += r.ended_at - r.started_at; if (r.ret90 > 0) s.win++
  }
  for (const t in out) { out[t].avg_ms = out[t].ms / out[t].n; out[t].win = out[t].win / out[t].n }
  return out
}

export function durationText(type, stats) {
  const s = stats?.[type]
  if (s && s.n >= 10) {
    const m = Math.round(s.avg_ms / MIN)
    const d = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`
    return { text: `media ${d}`, win: Math.round(s.win * 100), n: s.n, source: 'storico' }
  }
  return { text: DEFAULT_DURATION[type] || '', win: null, n: s?.n || 0, source: 'stima iniziale' }
}

// series: { SYMBOL: { '1m': bars, '15m': bars } }
export async function scan(series, ny) {
  const now = Date.now()
  const sessionKey = sessionKeyFn()
  const log = { crypto: 0, stocks: 0, signalsOpened: 0, signalsEnded: 0, pushes: 0 }

  const [ctxRows, activeRows, pairs] = await Promise.all([
    q(db().from('wt_context').select('symbol, bias, next_earnings, daily_atr_pct, dirty, dirty_day')),
    q(db().from('wt_signals').select('*').eq('status', 'active')),
    getPairs(),
  ])
  const ctx = Object.fromEntries(ctxRows.map(r => [r.symbol, r]))
  const active = Object.fromEntries(activeRows.map(r => [r.symbol, r]))
  const perps = new Set(pairs.map(p => p.symbol))
  const tk = await tickers(ASSETS.map(a => a.perp).filter(p => perps.has(p)))

  const states = {}
  for (const a of ASSETS) {
    const s = series[a.symbol]
    if (!s?.['1m']?.length || !s?.['15m']?.length) continue
    if (a.kind === 'stock' && !ny.inSession) continue
    const b1 = s['1m']
    if (now - b1[b1.length - 1].t > 10 * MIN) continue

    let session = null
    if (a.kind === 'stock') {
      const today = b1.filter(b => sessionKey(b.t) === ny.date && b.t >= ny.openTs)
      const orBars = today.filter(b => b.t < ny.openTs + 15 * MIN)
      session = {
        sessionKey,
        orbActive: ny.orbWindow && orBars.length >= 10,
        orHigh: orBars.length ? Math.max(...orBars.map(b => b.h)) : null,
        orLow: orBars.length ? Math.min(...orBars.map(b => b.l)) : null,
        openPrice: today[0]?.o ?? null,
      }
    }
    const refSeries = a.ref ? series[a.ref]?.['1m'] : null
    const st = analyze({ asset: a, b1, b15: s['15m'], ref1: refSeries, bias: ctx[a.symbol]?.bias || 'neutral', session })
    if (!st) continue

    const t = tk[a.perp]
    if (a.kind === 'crypto') st.chgDay = t?.open24 ? pct(st.price, t.open24) : null
    else {
      // chiusura di ieri = ultima candela da 15 min prima delle 16:00 del giorno precedente
      const prev = s['15m'].filter(b => { const n = nyOf(b.t); return n.date < ny.date && n.min >= 570 && n.min < 960 })
      const prevClose = prev.length ? prev[prev.length - 1].c : null
      st.chgDay = prevClose ? pct(st.price, prevClose) : null
    }
    st.perp = perps.has(a.perp) ? { symbol: a.perp, price: t?.last ?? st.price } : null
    st.spark = aggregate(b1.slice(-120), 5).map(b => +b.c.toPrecision(6))
    st.at = now
    states[a.symbol] = st
    a.kind === 'crypto' ? log.crypto++ : log.stocks++
  }

  const notes = []
  const stats = await durationStats()
  const updates = [], inserts = []

  for (const [sym, st] of Object.entries(states)) {
    const a = ASSETS.find(x => x.symbol === sym)
    const sig = active[sym]
    const b15 = series[sym]['15m']

    if (sig) {
      const sign = sig.direction === 'long' ? 1 : -1
      const mfe = Math.max(sig.mfe, (sign * (st.price - sig.entry)) / sig.atr)
      const age = now - sig.started_at
      const ret90 = sig.ret90 === null && age >= 90 * MIN ? (sign * (st.price - sig.entry) / sig.entry) * 100 : sig.ret90
      const flipped = st.type && st.score >= ALERT.OPEN && st.direction !== sig.direction
      const sessionEnd = a.kind === 'stock' && ny.minutes >= 958
      if (shouldEnd(sig, st, b15) || flipped || sessionEnd) {
        const r90 = ret90 ?? sign * pct(st.price, sig.entry)
        updates.push(q(db().from('wt_signals').update({ status: 'ended', ended_at: now, end_price: st.price, mfe, ret90: r90 }).eq('id', sig.id)))
        log.signalsEnded++
        notes.push({ symbol: sym, direction: sig.direction, level: 'watch', payload: {
          title: `${sym}: segnale ${sig.direction} terminato`,
          body: `Durata ${Math.round(age / MIN)} min · risultato ${fmtPct(sign * pct(st.price, sig.entry))} dal segnale`,
          url: `/asset/${sym}`, tag: `${sym}-end`,
        } })
      } else {
        updates.push(q(db().from('wt_signals').update({ mfe, ret90, max_score: Math.max(sig.max_score, st.score) }).eq('id', sig.id)))
        st.signal = { ...sig, mfe, ret90, ageMin: Math.round(age / MIN) }
        continue
      }
    }

    if (st.type && st.score >= ALERT.OPEN) {
      const recent = await q(db().from('wt_signals').select('started_at').eq('symbol', sym).eq('direction', st.direction).order('started_at', { ascending: false }).limit(1))
      if (recent[0] && now - recent[0].started_at < ALERT.COOLDOWN_MIN * MIN) continue
      inserts.push({ symbol: sym, type: st.type, direction: st.direction, score: st.score, max_score: st.score, entry: st.price, stop: st.levels.stop, atr: st.metrics.atr15, started_at: now })
      st.signal = { type: st.type, direction: st.direction, score: st.score, entry: st.price, stop: st.levels.stop, started_at: now, ageMin: 0 }
      log.signalsOpened++
      const dur = durationText(st.type, stats)
      const dirWord = st.direction === 'long' ? 'rialzista' : 'ribassista'
      const title = st.type === 'impulse' ? `Forte movimento ${dirWord} su ${sym}`
        : st.type === 'orb' ? `Breakout apertura USA su ${sym} (${st.direction})`
        : `Trend ${st.direction} deciso su ${sym}`
      notes.push({ symbol: sym, direction: st.direction, level: st.score >= ALERT.ALL ? 'all' : 'watch', payload: {
        title,
        body: `${fmtPct(st.metrics.move30Pct)} in 30 min · volume ${st.metrics.relVol}x · forza ${st.score} · durata ${dur.text}`,
        url: `/asset/${sym}`, tag: `${sym}-${st.direction}`,
      } })
    }
  }

  // Contesto da rifare? (movimento anomalo o trimestrale passata)
  for (const [sym, st] of Object.entries(states)) {
    const c = ctx[sym]
    if (!c || c.dirty || c.dirty_day === ny.date) continue
    let reason = null
    if (c.daily_atr_pct && st.chgDay !== null && Math.abs(st.chgDay) > 2 * c.daily_atr_pct) reason = `movimento giornaliero anomalo ${fmtPct(st.chgDay)}`
    if (c.next_earnings && c.next_earnings < ny.date) reason = 'trimestrale pubblicata'
    if (reason) updates.push(q(db().from('wt_context').update({ dirty: true, dirty_reason: reason, dirty_day: ny.date }).eq('symbol', sym)))
  }

  if (inserts.length) updates.push(q(db().from('wt_signals').insert(inserts)))
  const rows = Object.entries(states).map(([symbol, st]) => ({ symbol, score: st.signal ? Math.max(st.score, st.signal.score || 0) : st.score, data: st, updated_at: now }))
  if (rows.length) updates.push(q(db().from('wt_state').upsert(rows)))
  await Promise.all(updates)

  if (notes.length) {
    const subs = await q(db().from('wt_subs').select('*'))
    const items = []
    for (const n of notes) for (const sub of subs) {
      const follows = (sub.watchlist || []).includes(n.symbol)
      const wants = n.level === 'all' ? (sub.all_alerts || follows) : follows
      if (wants) items.push({ sub, payload: n.payload, topic: `${n.symbol}-${n.direction}` })
    }
    log.pushes = (await deliver(items)).sent
  }
  return log
}
