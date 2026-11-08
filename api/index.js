// Wisi Trade — tutte le API in una sola funzione Vercel (vercel.json riscrive /api/* qui).
import crypto from 'node:crypto'
import { ASSETS, ASSET_MAP, TYPE_LABEL } from '../shared/assets.js'
import { normalizeSettings, sizing, isTradingDay } from '../shared/opening.js'
import { db, q, getMeta } from '../server/db.js'
import { klinesBack, account, hasKeys, tickers } from '../server/bitunix.js'
import { nyInfo } from '../server/session.js'
import { durationStats, durationText, getPairs } from '../server/scanner.js'
import { refreshContexts, generateContext } from '../server/context.js'
import { sendPush } from '../server/push.js'
import { tick } from '../server/tick.js'
import { closeManual, liveAllowed } from '../server/strategy.js'

const TF = {
  '1m': { bx: '1m', n: 400, ttl: 20 },
  '5m': { bx: '5m', n: 500, ttl: 60 },
  '15m': { bx: '15m', n: 500, ttl: 120 },
  '1h': { bx: '1h', n: 500, ttl: 300 },
  '4h': { bx: '4h', n: 400, ttl: 600 },
  '1d': { bx: '1d', n: 400, ttl: 1800 },
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status } }
const safeEq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
const isAdmin = req => !!process.env.ADMIN_TOKEN && safeEq(bearer(req), process.env.ADMIN_TOKEN)
const requireAdmin = req => { if (!isAdmin(req)) throw new HttpError(401, 'Codice di controllo non valido') }
const requireCron = (req, url) => {
  const key = bearer(req) || url.searchParams.get('key') || ''
  if (!process.env.CRON_SECRET || !safeEq(key, process.env.CRON_SECRET)) throw new HttpError(401, 'Non autorizzato')
}
const marketOpen = a => {
  if (a.kind === 'crypto') return true
  const n = nyInfo()
  return n.inSession && isTradingDay(n.date, n.isWeekday)
}

// ---------- Strategia ----------
function dailySummary(closed) {
  const days = new Map()
  for (const p of [...closed].sort((a, b) => a.opened_at - b.opened_at)) {
    const d = days.get(p.day) || { day: p.day, n: 0, wins: 0, pnl: 0, capital: p.capital || null }
    d.n++; if (p.pnl > 0) d.wins++; d.pnl += p.pnl || 0
    days.set(p.day, d)
  }
  return [...days.values()].map(d => ({ ...d, pct: d.capital ? d.pnl / d.capital * 100 : null })).sort((a, b) => (a.day < b.day ? 1 : -1))
}

async function strategyView(mode) {
  const acc = await q(db().from('wt_accounts').select('*').eq('mode', mode).single())
  const s = normalizeSettings(acc.settings)
  let platform
  if (mode === 'paper') platform = { balance: acc.balance, start: acc.start_balance }
  else if (!hasKeys()) platform = { balance: null, error: 'Chiavi API Bitunix non configurate su Vercel' }
  else {
    try { const a = await account(); platform = { balance: a.equity, available: a.available, margin: a.margin, upnl: a.upnl } }
    catch (e) { platform = { balance: null, error: e.message } }
  }
  const [open, closed] = await Promise.all([
    q(db().from('wt_positions').select('*').eq('mode', mode).eq('status', 'open').order('opened_at')),
    q(db().from('wt_positions').select('*').eq('mode', mode).eq('status', 'closed').order('closed_at', { ascending: false }).limit(1500)),
  ])
  const prices = open.length ? await tickers(open.map(p => ASSET_MAP[p.symbol].perp)) : {}
  const n = nyInfo()
  const [skips, last, prepRows] = await Promise.all([
    getMeta(`orbskip:${n.date}`),
    getMeta('last:tick'),
    q(db().from('wt_prep').select('symbol, data').eq('day', n.date)),
  ])
  let gp = 0, gl = 0, wins = 0
  for (const p of closed) { if (p.pnl > 0) { gp += p.pnl; wins++ } else gl -= p.pnl || 0 }
  return {
    mode, enabled: acc.enabled, settings: s, platform,
    sizing: sizing(s, platform.balance ?? 0),
    open: open.map(p => {
      const px = prices[ASSET_MAP[p.symbol].perp]?.last ?? null
      return { ...p, price: px, upnl: px ? p.side * (px - p.entry) * p.qty : null }
    }),
    trades: closed.slice(0, 300),
    days: dailySummary(closed),
    totals: { n: closed.length, wins, net: gp - gl, pf: gl > 0 ? gp / gl : null },
    today: { date: n.date, tradingDay: isTradingDay(n.date, n.isWeekday), minutes: n.minutes, skips: skips?.[mode] || {}, prepared: prepRows.filter(r => r.data?.ok).length, prepTotal: prepRows.length },
    status: { liveTrading: process.env.LIVE_TRADING === 'on', keys: hasKeys(), liveAllowed: liveAllowed(), lastTick: last },
  }
}

// ---------- Router ----------
async function route(req, url) {
  const m = req.method
  const path = '/' + (url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '')).replace(/\/+$/, '')
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

  if (path === '/health') return { ok: true, at: Date.now() }

  // ---- Controllo ogni minuto e Contesto (cron-job.org) ----
  if (path === '/cron/tick') { requireCron(req, url); return tick() }
  if (path === '/cron/context') { requireCron(req, url); return refreshContexts() }

  // ---- Asset ----
  if (path === '/assets' && m === 'GET') {
    const [st, cx] = await Promise.all([
      q(db().from('wt_state').select('symbol, data, updated_at')),
      q(db().from('wt_context').select('symbol, bias, data')),
    ])
    const S = Object.fromEntries(st.map(r => [r.symbol, r.data]))
    const C = Object.fromEntries(cx.map(r => [r.symbol, { bias: r.bias, headline: r.data?.headline ?? null }]))
    const n = nyInfo()
    const inSession = n.inSession && isTradingDay(n.date, n.isWeekday)
    return {
      at: Date.now(), session: { inSession, minutes: n.minutes },
      assets: ASSETS.map(a => {
        const s = S[a.symbol]
        return {
          symbol: a.symbol, name: a.name, kind: a.kind, open: a.kind === 'crypto' || inSession,
          price: s?.price ?? null, chgDay: s?.chgDay ?? null, score: s?.score ?? 0,
          direction: s?.direction ?? null, type: s?.type ?? null, typeLabel: s?.type ? TYPE_LABEL[s.type] : null,
          signal: s?.signal ?? null, spark: s?.spark ?? [], perp: s?.perp ?? null, at: s?.at ?? null,
          bias: C[a.symbol]?.bias ?? null, headline: C[a.symbol]?.headline ?? null,
        }
      }),
    }
  }

  let mm = path.match(/^\/asset\/([A-Z0-9]+)$/)
  if (mm && m === 'GET') {
    const sym = mm[1], a = ASSET_MAP[sym]
    if (!a) throw new HttpError(404, 'Asset sconosciuto')
    const [st, cx, sigs, stats] = await Promise.all([
      q(db().from('wt_state').select('data').eq('symbol', sym).maybeSingle()),
      q(db().from('wt_context').select('data, generated_at, dirty, dirty_reason').eq('symbol', sym).maybeSingle()),
      q(db().from('wt_signals').select('*').eq('symbol', sym).order('started_at', { ascending: false }).limit(200)),
      durationStats(),
    ])
    const state = st?.data || null
    const type = state?.signal?.type || state?.type
    const ended = sigs.filter(x => x.status === 'ended' && x.ret90 !== null)
    return {
      asset: { ...a, open: marketOpen(a) },
      state,
      typeLabel: type ? TYPE_LABEL[type] : null,
      duration: type ? durationText(type, stats) : null,
      context: cx?.data ? { ...cx.data, generatedAt: cx.generated_at, pendingUpdate: !!cx.dirty, pendingReason: cx.dirty_reason } : null,
      signals: sigs.slice(0, 15),
      symbolStats: ended.length ? {
        n: ended.length,
        win: Math.round(ended.filter(x => x.ret90 > 0).length / ended.length * 100),
        avgMin: Math.round(ended.reduce((s, x) => s + (x.ended_at - x.started_at), 0) / ended.length / 60000),
      } : null,
    }
  }

  mm = path.match(/^\/candles\/([A-Z0-9]+)$/)
  if (mm && m === 'GET') {
    const a = ASSET_MAP[mm[1]]
    const tfKey = url.searchParams.get('tf') || '15m', tf = TF[tfKey]
    if (!a || !tf) throw new HttpError(400, 'Parametri non validi')
    const bars = await klinesBack(a.perp, tf.bx, tf.n)
    return { __cache: tf.ttl, symbol: a.symbol, tf: tfKey, bars }
  }

  if (path === '/signals' && m === 'GET') {
    const rows = await q(db().from('wt_signals').select('*').order('started_at', { ascending: false }).limit(40))
    return { signals: rows.map(s => ({ ...s, typeLabel: TYPE_LABEL[s.type] })) }
  }

  if (path === '/events' && m === 'GET') {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await q(db().from('wt_context').select('symbol, next_earnings').gte('next_earnings', today).order('next_earnings').limit(60))
    return { earnings: rows.map(r => ({ symbol: r.symbol, name: ASSET_MAP[r.symbol]?.name, date: r.next_earnings })) }
  }

  // ---- Notifiche push ----
  if (path === '/push/key') return { key: process.env.VAPID_PUBLIC_KEY || null }

  if (path === '/push/subscribe' && m === 'POST') {
    const sub = body.subscription
    if (!sub?.endpoint?.startsWith('https://') || sub.endpoint.length > 1000 || !sub.keys?.p256dh || !sub.keys?.auth) throw new HttpError(400, 'Iscrizione non valida')
    const watch = Array.isArray(body.watchlist) ? body.watchlist.filter(s => ASSET_MAP[s]).slice(0, 60) : []
    const id = crypto.createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 24)
    const now = Date.now()
    // gli avvisi delle operazioni della strategia solo con il codice di controllo
    const tradeAlerts = body.tradeAlerts === true && isAdmin(req)
    await q(db().from('wt_subs').upsert({
      id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, watchlist: watch,
      all_alerts: body.allAlerts !== false, trade_alerts: tradeAlerts, last_seen: now, created_at: now,
    }, { onConflict: 'endpoint' }))
    return { ok: true, id, tradeAlerts }
  }

  if (path === '/push/unsubscribe' && m === 'POST') {
    if (body.endpoint) await q(db().from('wt_subs').delete().eq('endpoint', body.endpoint))
    return { ok: true }
  }

  if (path === '/push/test' && m === 'POST') {
    const sub = body.endpoint ? await q(db().from('wt_subs').select('*').eq('endpoint', body.endpoint).maybeSingle()) : null
    if (!sub) throw new HttpError(404, 'Iscrizione non trovata')
    const status = await sendPush(sub, { title: 'Wisi Trade', body: 'Le notifiche funzionano. Ti avviso quando parte un movimento.', url: '/' })
    return { ok: status >= 200 && status < 300, status }
  }

  // ---- Strategia (solo con il codice di controllo) ----
  if (path === '/admin/check') { requireAdmin(req); return { ok: true } }

  if (path === '/strategy' && m === 'GET') {
    requireAdmin(req)
    const mode = url.searchParams.get('mode') === 'live' ? 'live' : 'paper'
    return strategyView(mode)
  }

  if (path === '/strategy/settings' && m === 'POST') {
    requireAdmin(req)
    const mode = body.mode === 'live' ? 'live' : 'paper'
    const patch = { updated_at: Date.now() }
    if (body.settings) patch.settings = normalizeSettings(body.settings)
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
    await q(db().from('wt_accounts').update(patch).eq('mode', mode))
    return strategyView(mode)
  }

  if (path === '/strategy/reset' && m === 'POST') {
    requireAdmin(req)
    const bal = Number(body.balance)
    if (!(bal > 0 && bal < 1e9)) throw new HttpError(400, 'Saldo non valido')
    const open = await q(db().from('wt_positions').select('id').eq('mode', 'paper').eq('status', 'open'))
    if (open.length) throw new HttpError(400, 'Chiudi prima le posizioni aperte di prova')
    await q(db().from('wt_positions').delete().eq('mode', 'paper'))
    await q(db().from('wt_accounts').update({ balance: bal, start_balance: bal, updated_at: Date.now() }).eq('mode', 'paper'))
    return strategyView('paper')
  }

  if (path === '/strategy/close' && m === 'POST') {
    requireAdmin(req)
    const mode = body.mode === 'live' ? 'live' : 'paper'
    const r = await closeManual(mode, body.id ? Number(body.id) : null)
    return { ...r, view: await strategyView(mode) }
  }

  // ---- Comandi admin per test ----
  if (path === '/admin/tick' && m === 'POST') { requireAdmin(req); return tick() }
  if (path === '/admin/context' && m === 'POST') {
    requireAdmin(req)
    const sym = url.searchParams.get('symbol')
    return sym ? generateContext(sym, 'aggiornamento manuale') : refreshContexts()
  }
  if (path === '/admin/perps' && m === 'GET') {
    requireAdmin(req)
    const set = new Set((await getPairs()).map(p => p.symbol))
    return { available: ASSETS.filter(a => set.has(a.perp)).map(a => a.symbol), missing: ASSETS.filter(a => !set.has(a.perp)).map(a => a.symbol) }
  }

  throw new HttpError(404, 'Non trovato')
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  try {
    const out = await route(req, url)
    if (out && out.__cache) {
      res.setHeader('cache-control', `public, s-maxage=${out.__cache}, stale-while-revalidate=${out.__cache * 2}`)
      delete out.__cache
    } else res.setHeader('cache-control', 'no-store')
    res.status(200).send(JSON.stringify(out))
  } catch (e) {
    res.setHeader('cache-control', 'no-store')
    res.status(e.status || 500).send(JSON.stringify({ error: e.message }))
  }
}
