// Wisi Trade — tutte le API in una sola funzione Vercel (vercel.json riscrive /api/* qui).
import crypto from 'node:crypto'
import { ASSETS, ASSET_MAP, TYPE_LABEL } from '../shared/assets.js'
import { normalizeSettings, settingsFor, sizing, isTradingDay, STRATEGY_SYMBOLS, STRATEGY_DEFAULTS } from '../shared/opening.js'
import { getCapital, syncCapitalSetting, restartCapital } from '../server/capital.js'
import { runSimulation, simulationSteps } from '../shared/engine.js'
import { addDays, weekdayOf, nyTs } from '../shared/time.js'
import { archiveStatus, fillArchive, loadDays, dayBars, EXTRA_SYMBOLS } from '../server/archive.js'
import { db, q, getMeta, setMeta } from '../server/db.js'
import { klinesBack, account, hasKeys, tickers } from '../server/bitunix.js'
import { nyInfo } from '../server/session.js'
import { durationStats, durationText, getPairs } from '../server/scanner.js'
import { refreshContexts, generateContext } from '../server/context.js'
import { sendPush } from '../server/push.js'
import { tick } from '../server/tick.js'
import { closeManual, liveAllowed } from '../server/strategy.js'
import { getLimits } from '../server/limits.js'
import { ensureIndex, getIndexRaw, indexOf } from '../server/mindex.js'
import { spreadSummary } from '../server/spreads.js'
import { waitUntil } from '@vercel/functions'
import { fastEntries } from '../server/fast-run.js'
import { operable, keepOperable, operableView, clearMarks } from '../server/operable.js'

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
  const s = settingsFor(mode, acc.settings)
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
  const [skips, mindex, last, prepRows, brake, daystop, active, apiList] = await Promise.all([
    getMeta(`orbskip:${n.date}`),
    getMeta(`mindex:${n.date}`),
    getMeta('last:tick'),
    q(db().from('wt_prep').select('symbol, data').eq('day', n.date)),
    getMeta(`brake:${n.date}`),
    getMeta(`daystop:${mode}:${n.date}`),
    getMeta(`active:${mode}`),
    operableView(s.symbols).catch(e => ({ error: e.message })),
  ])
  // Prova: differenze dalle impostazioni del Reale (capitale escluso), così il confronto Reale–Prova è sugli stessi segnali
  let vsLive = null
  if (mode === 'paper') {
    const liveAcc = await q(db().from('wt_accounts').select('settings').eq('mode', 'live').maybeSingle())
    if (liveAcc) {
      const ls = settingsFor('live', liveAcc.settings)
      const CAP = new Set(['capitalMode', 'capitalFixed', 'capitalPct', 'capitalDedicated', 'slip', 'funding', 'onlyBitunix'])
      const diff = Object.keys(ls).filter(k => !CAP.has(k) && JSON.stringify(ls[k]) !== JSON.stringify(s[k]))
        .map(k => k === 'symbols' ? { key: k, paper: `${s.symbols.length} titoli`, live: `${ls.symbols.length} titoli`, onlyPaper: s.symbols.filter(x => !ls.symbols.includes(x)).length, onlyLive: ls.symbols.filter(x => !s.symbols.includes(x)).length } : { key: k, paper: s[k], live: ls[k] })
      vsLive = { diff, liveSettings: ls }
    }
  }
  let gp = 0, gl = 0, wins = 0
  for (const p of closed) { if (p.pnl > 0) { gp += p.pnl; wins++ } else gl -= p.pnl || 0 }
  // capitale dedicato: attuale, partenza, risultato dalla partenza e storico delle modifiche
  const cap = await getCapital(mode)
  const dayPnl = closed.filter(p => p.day === n.date).reduce((a, p) => a + (p.pnl || 0), 0)
  const capital = cap ? {
    current: cap.current, start: cap.start, startAt: cap.startAt, set: cap.set, lossRef: cap.lossRef, trades: cap.trades || 0,
    net: cap.current - cap.start, pct: cap.start > 0 ? (cap.current / cap.start - 1) * 100 : null,
    halted: cap.halted || null, dayStop: cap.dayStop?.day === n.date ? cap.dayStop : null, dayPnl, history: (cap.history || []).slice().reverse(),
  } : null
  const sizeBase = mode === 'live' && s.capitalMode === 'dedicated' ? (platform.available ?? 0) : (platform.balance ?? 0)
  // slittamento nel Reale: prezzo del segnale e prezzo eseguito su Bitunix, in entrata e in uscita (in % per lato).
  // Segnale = soglia d'entrata (apertura ± 1,25 × movimento) e livello d'uscita (stop, livello che segue, chiusura della candela).
  // Convenzione: negativo = peggio per te. rilevazione = soglia → prezzo letto al segnale (entrata veloce), esecuzione = prezzo letto → eseguito.
  let slippage = null
  if (mode === 'live') {
    const rows = closed.filter(p => p.exchange?.slip?.fillIn && p.exchange.slip.sigIn).slice(0, 300)
    const paper = rows.length ? await q(db().from('wt_positions').select('day, symbol, side, entry, exit, pnl, qty, status').eq('mode', 'paper').in('day', [...new Set(rows.map(r => r.day))])) : []
    const list = rows.map(p => {
      const x = p.exchange.slip
      const inPct = p.side * (x.sigIn - x.fillIn) / x.sigIn * 100
      const outPct = x.fillOut && x.sigOut ? p.side * (x.fillOut - x.sigOut) / x.sigOut * 100 : null
      const detPct = x.sigPx && x.sigPx !== x.sigIn ? p.side * (x.sigIn - x.sigPx) / x.sigIn * 100 : null
      const pp = paper.find(z => z.day === p.day && z.symbol === p.symbol && z.side === p.side)
      const tm = p.exchange.timing || null
      return {
        src: tm?.src || null, signalAt: tm?.signalAt ?? null, orderAt: tm?.orderAt ?? null, fillAt: tm?.fillAt ?? null,
        delay: tm?.fillAt && tm?.signalAt ? (tm.fillAt - tm.signalAt) / 1000 : null, orderDelay: tm?.orderAt && tm?.signalAt ? (tm.orderAt - tm.signalAt) / 1000 : null,
        id: p.id, day: p.day, symbol: p.symbol, side: p.side, sigIn: x.sigIn, fillIn: x.fillIn, sigOut: x.sigOut ?? null, fillOut: x.fillOut ?? null,
        inPct, outPct, detPct, sigPx: x.sigPx ?? null, fee: x.fee ?? p.fees, funding: x.funding ?? null, byExchange: !!x.byExchange, pnl: p.pnl, pct: p.pnl / (p.entry * p.qty) * 100,
        paper: pp ? { entry: pp.entry, exit: pp.exit, pnl: pp.pnl, pct: pp.status === 'closed' && pp.qty ? pp.pnl / (pp.entry * pp.qty) * 100 : null } : null,
      }
    })
    const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
    const outs = list.filter(r => r.outPct !== null)
    const both = list.filter(r => r.paper?.pct !== null && r.paper?.pct !== undefined)
    const dl = list.filter(r => r.delay !== null && r.delay >= 0)
    slippage = { n: list.length, avgIn: avg(list.map(r => r.inPct)), avgOut: avg(outs.map(r => r.outPct)), nOut: outs.length, list,
      avgDelay: avg(dl.map(r => r.delay)), nDelay: dl.length, avgDelayFast: avg(dl.filter(r => r.src === 'veloce').map(r => r.delay)), nFast: dl.filter(r => r.src === 'veloce').length,
      vsPaper: both.length ? { n: both.length, live: avg(both.map(r => r.pct)), paper: avg(both.map(r => r.paper.pct)) } : null }
  }
  return {
    mode, enabled: acc.enabled, settings: s, platform, capital, slippage,
    // titoli scelti non operabili via API su Bitunix (non si tentano: stessa lista per Prova e Reale)
    operable: apiList, vsLive,
    // configurazione attiva: nome (impostazione salvata da cui viene, o "personalizzata") e data dell'ultima modifica
    active: { name: active?.name || (Object.keys(acc.settings || {}).length ? 'personalizzata' : 'default dell\'app'), presetId: active?.presetId ?? null, edited: !!active?.edited, at: active?.at || acc.updated_at || null },
    sizing: sizing(s, sizeBase, s.capitalMode === 'dedicated' ? (cap?.current ?? 0) : undefined),
    open: open.map(p => {
      const px = prices[ASSET_MAP[p.symbol].perp]?.last ?? null
      const hq = p.half_done && p.half_qty > 0 ? p.half_qty : 0 // con "Metà subito" una metà è già chiusa
      return { ...p, price: px, upnl: px ? p.side * (px - p.entry) * (p.qty - hq) + (hq ? p.side * (p.half_px - p.entry) * hq : 0) : null }
    }),
    trades: closed.slice(0, 300),
    days: dailySummary(closed),
    totals: { n: closed.length, wins, net: gp - gl, pf: gl > 0 ? gp / gl : null },
    today: { date: n.date, tradingDay: isTradingDay(n.date, n.isWeekday), minutes: n.minutes, skips: skips?.[mode] || {}, mindex: mindex || null, brake: brake?.[mode] || null, dayStop: !!daystop, prepared: prepRows.filter(r => r.data?.ok).length, prepTotal: prepRows.length },
    status: { liveTrading: process.env.LIVE_TRADING === 'on', keys: hasKeys(), liveAllowed: liveAllowed(), lastTick: last },
  }
}

// ---------- Simulazione ----------
// Controlli, dati dell'archivio, limiti di Bitunix e indice di attività: comuni a /sim/run e /sim/stream
async function prepareSim(body, phase = () => {}) {
  const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  if (!isDate(body.from) || !isDate(body.to) || body.from > body.to) throw new HttpError(400, 'Periodo non valido')
  const capital = Number(body.capital)
  if (!(capital > 0 && capital < 1e9)) throw new HttpError(400, 'Capitale iniziale non valido')
  const s0 = normalizeSettings(body.settings || {})
  if (!s0.symbols.length) throw new HttpError(400, 'Scegli almeno un titolo')
  // opzione "Solo titoli operabili su Bitunix" (lista di oggi, la stessa di Prova e Reale)
  let s = s0, apiExcluded = []
  if (s0.onlyBitunix) {
    const op = await operable()
    apiExcluded = s0.symbols.filter(x => op.check(x)).map(x => ({ symbol: x, why: op.check(x).why }))
    s = { ...s0, symbols: keepOperable(s0.symbols, op) }
    if (!s.symbols.length) throw new HttpError(400, 'Nessuno dei titoli scelti è operabile via API su Bitunix')
  }
  const t0 = Date.now()
  phase('carico le candele')
  // 40 giorni prima dell'inizio: preparazione (livelli, volatilità, volume normale) e Analisi (volatilità a 20 giorni).
  // QQQ, SPY e BTC servono solo per l'Analisi.
  const days = await loadDays([...s.symbols, ...EXTRA_SYMBOLS], addDays(body.from, -40), body.to)
  phase("preparo i limiti di Bitunix e l'indice di mercato")
  const limits = await getLimits().catch(() => ({})) // margine di mantenimento e orari del funding di Bitunix
  // indice di attività del mercato di ogni giorno (calcola i giorni che mancano)
  await ensureIndex({ budgetMs: 90000 }).catch(() => null)
  const raw = await getIndexRaw()
  const mindex = {}
  for (const d of Object.keys(days)) { const x = indexOf(raw, d); if (x) mindex[d] = x }
  // giorni che il motore simulerà: di borsa, nel periodo, con almeno un titolo scelto con dati (come in runSimulation)
  const inPeriod = Object.keys(days).filter(d => d >= body.from && d <= body.to).sort()
  const simDays = inPeriod.filter(d => isTradingDay(d, weekdayOf(d)) && s.symbols.some(sym => sym in days[d])).length
  return { body, s0, s, apiExcluded, days, inPeriod, simDays, t0, loadMs: Date.now() - t0, opts: { from: body.from, to: body.to, capital, limits, mindex, story: true } }
}
function simPayload(p, r) {
  const MAX_TRADES = 4000
  // titoli scelti che hanno davvero dati nel periodo (senza decomprimere niente)
  const withData = p.s.symbols.filter(sym => p.inPeriod.some(d => sym in p.days[d]))
  return { ...r, trades: r.trades.slice(-MAX_TRADES), tradesCut: Math.max(0, r.trades.length - MAX_TRADES), settings: p.s0, symbolsUsed: p.s.symbols, apiExcluded: p.apiExcluded, symbolsWithData: withData, ms: { load: p.loadMs, run: Date.now() - p.t0 - p.loadMs } }
}

// Simulazione in streaming (NDJSON, una riga JSON per evento) per la sfera animata, mentre il calcolo gira:
// { t: 'phase', msg } · { t: 'start', total } · { t: 'days', list: [giorno…] } · { t: 'result', result } · { t: 'error', error }
// Il calcolo si ferma un attimo solo ogni ~100 ms per spedire i giorni pronti (accorpati); la grafica non lo rallenta mai.
// Se il browser chiude la richiesta (Annulla), il calcolo si interrompe.
const r2 = x => Math.round(x * 100) / 100
const dayEvent = ({ row, trades }) => ({
  day: row.day, n: row.n, pnl: r2(row.pnl), balance: r2(row.balance),
  trades: trades.map(t => ({ symbol: t.symbol, side: t.side, kmin: t.kmin, opened_at: t.opened_at, closed_at: t.closed_at, pnl: r2(t.pnl), path: t.path })),
  skipped: (row.skipped || []).slice(0, 14).map(([sym, min]) => [sym, min]),
})
async function streamSim(req, res, url) {
  res.statusCode = 200
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-accel-buffering', 'no')
  let closed = false
  res.on('close', () => { if (!res.writableEnded) closed = true })
  const send = obj => { if (!closed) res.write(JSON.stringify(obj) + '\n') }
  const pause = () => new Promise(r => setImmediate(r))
  try {
    requireAdmin(req)
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    send({ t: 'phase', msg: 'controllo le impostazioni' })
    const p = await prepareSim(body, msg => send({ t: 'phase', msg }))
    if (closed) return res.end()
    send({ t: 'start', total: p.simDays })
    await pause()
    const g = simulationSteps(p.days, p.s, p.opts)
    let buf = [], last = Date.now(), x
    for (;;) {
      x = g.next()
      if (x.done) break
      buf.push(dayEvent(x.value))
      if (Date.now() - last >= 100) {
        send({ t: 'days', list: buf }); buf = []
        await pause() // lascia partire i dati verso il browser e sente un eventuale annullamento
        last = Date.now()
        if (closed) { g.return(); return res.end() }
      }
    }
    if (buf.length) send({ t: 'days', list: buf })
    send({ t: 'result', result: simPayload(p, x.value) })
  } catch (e) {
    send({ t: 'error', error: e.message, status: e.status || 500 })
  }
  res.end()
}

// ---------- Router ----------
async function route(req, url) {
  const m = req.method
  const path = '/' + (url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '')).replace(/\/+$/, '')
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

  if (path === '/health') return { ok: true, at: Date.now() }

  // ---- Controllo ogni minuto e Contesto (cron-job.org) ----
  if (path === '/cron/tick') { requireCron(req, url); return tick() }
  // Controllo veloce dell'apertura (cron-job.org 9:29 e 9:41 New York): risponde subito e continua a lavorare
  // in background fino a ~12 minuti (waitUntil, entro il limite di 800 s delle funzioni Vercel Pro)
  if (path === '/cron/fast') {
    requireCron(req, url)
    // ogni chiamata resta nel registro del giorno (fast:runs:<giorno>), non solo l'ultima
    const save = async r => {
      await setMeta('last:fast', r)
      const k = `fast:runs:${r.day || nyInfo().date}`
      await setMeta(k, [...((await getMeta(k)) || []), r].slice(-10))
    }
    const job = fastEntries().then(r => save({ at: Date.now(), ...r })).catch(e => save({ at: Date.now(), error: e.message }))
    waitUntil(job)
    return { started: true, at: Date.now() }
  }
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
    if (body.settings) patch.settings = settingsFor(mode, body.settings)
    // Reale: niente leva più alta della leva massima di Bitunix per i titoli scelti
    if (mode === 'live' && patch.settings) {
      const lim = await getLimits().catch(() => ({}))
      const over = patch.settings.symbols.filter(x => lim[x]?.maxLev && patch.settings.leverage > lim[x].maxLev)
      if (over.length) throw new HttpError(400, `Leva ${patch.settings.leverage}x oltre il massimo di Bitunix per ${over.map(x => `${x} (${lim[x].maxLev}x)`).join(', ')}`)
    }
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
    await q(db().from('wt_accounts').update(patch).eq('mode', mode))
    // capitale dedicato: una cifra nuova diventa il nuovo punto di partenza (con storico); riavvio dopo lo stop per perdita
    if (patch.settings) {
      await syncCapitalSetting(mode, patch.settings)
      // nome della configurazione attiva in questa scheda (solo quando si preme Salva in questa scheda)
      const name = String(body.name || '').trim().slice(0, 80) || 'personalizzata'
      await setMeta(`active:${mode}`, { name, presetId: body.presetId ?? null, edited: !!body.edited, at: Date.now() })
    }
    if (body.enabled === true) await restartCapital(mode)
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

  // Ricontrollo dei titoli non operabili via API: rilegge le coppie di Bitunix e toglie i segni del Reale
  // (al prossimo segnale si riprova davvero)
  if (path === '/strategy/operable/recheck' && m === 'POST') {
    requireAdmin(req)
    await setMeta('pairs', null)
    await clearMarks(body.symbol ? String(body.symbol) : null)
    const mode = body.mode === 'live' ? 'live' : 'paper'
    return strategyView(mode)
  }

  // ---- Simulazione (solo con il codice di controllo) ----
  if (path === '/sim/status' && m === 'GET') { requireAdmin(req); return archiveStatus() }

  if (path === '/sim/fill' && m === 'POST') {
    requireAdmin(req)
    const r = await fillArchive({ budgetMs: 150000, source: 'manual' })
    if (!r.busy) r.index = await ensureIndex({ budgetMs: 60000 }).catch(e => ({ error: e.message }))
    return { ...r, status: r.busy ? null : await archiveStatus() }
  }

  if (path === '/sim/run' && m === 'POST') {
    requireAdmin(req)
    const p = await prepareSim(body)
    const r = runSimulation(p.days, p.s, p.opts)
    return simPayload(p, r)
  }

  // ---- Valore minimo di un ordine per titolo (quantità minima di Bitunix × prezzo attuale), in cache per un'ora ----
  if (path === '/minnotional' && m === 'GET') {
    const c = await getMeta('mins')
    if (c && Date.now() - c.at < 3600000) return { mins: c.mins, at: c.at }
    const pairs = await getPairs()
    const byPerp = Object.fromEntries(pairs.map(p => [p.symbol, p]))
    const perps = STRATEGY_SYMBOLS.map(x => ASSET_MAP[x]?.perp).filter(x => x && byPerp[x])
    const tk = await tickers(perps)
    const mins = {}
    for (const sym of STRATEGY_SYMBOLS) {
      const perp = ASSET_MAP[sym]?.perp, pair = byPerp[perp], px = tk[perp]?.last
      if (pair && px) mins[sym] = +(Math.max(pair.minQty || 0, 10 ** -(pair.basePrecision ?? 3)) * px).toFixed(4)
    }
    await setMeta('mins', { at: Date.now(), mins }).catch(() => {})
    return { mins, at: Date.now() }
  }

  // ---- Spread e profondità registrati alle 9:30–9:35 (mediana per titolo degli ultimi giorni di borsa) ----
  if (path === '/spreads' && m === 'GET') {
    requireAdmin(req)
    const n = Math.min(Math.max(+url.searchParams.get('days') || 20, 1), 120)
    const dates = []
    for (let d = nyInfo().date; dates.length < n && d > '2026-11-01'; d = addDays(d, -1)) if (isTradingDay(d, weekdayOf(d))) dates.push(d)
    return { days: dates, symbols: await spreadSummary(dates) }
  }

  // Grafico della giornata di una posizione di Prova o Reale: la posizione, le impostazioni della modalità e le candele da 1 minuto
  // (dall'archivio; per la giornata in corso o non ancora archiviata da Bitunix, dalle 9:00 alle 16:30 di New York). Solo lettura.
  if (path === '/strategy/day' && m === 'GET') {
    requireAdmin(req)
    const id = Number(url.searchParams.get('id'))
    if (!(id > 0)) throw new HttpError(400, 'Posizione non valida')
    const p = await q(db().from('wt_positions').select('*').eq('id', id).maybeSingle())
    if (!p) throw new HttpError(404, 'Posizione non trovata')
    const acc = await q(db().from('wt_accounts').select('settings').eq('mode', p.mode).maybeSingle())
    const perp = ASSET_MAP[p.symbol]?.perp
    let bars = p.status === 'closed' ? await dayBars(p.symbol, p.day).catch(() => []) : []
    let source = 'archivio'
    if (!bars.length && perp) {
      const start = nyTs(p.day, 540), end = Math.min(Date.now(), nyTs(p.day, 990))
      const n = Math.max(1, Math.ceil((end - start) / 60000) + 1)
      bars = (await klinesBack(perp, '1m', Math.min(n, 460), { endTime: end }).catch(() => [])).filter(b => b.t >= start && b.t < nyTs(p.day, 990))
      source = 'Bitunix'
    }
    let price = null
    if (p.status === 'open' && perp) price = (await tickers([perp]).catch(() => ({})))[perp]?.last ?? null
    return { position: p, settings: settingsFor(p.mode, acc?.settings), bars, source, price, at: Date.now() }
  }

  if (path === '/sim/day' && m === 'GET') {
    requireAdmin(req)
    const sym = url.searchParams.get('symbol'), day = url.searchParams.get('day') || ''
    if (!STRATEGY_SYMBOLS.includes(sym) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'Parametri non validi')
    return { symbol: sym, day, bars: await dayBars(sym, day) }
  }

  // ---- Impostazioni salvate (le stesse per Prova, Reale e Simulazione) ----
  if (path === '/presets' && m === 'GET') {
    requireAdmin(req)
    const rows = await q(db().from('wt_presets').select('*').order('created_at', { ascending: false }))
    const def = rows.find(r => r.is_default)
    const [aLive, aPaper] = await Promise.all([getMeta('active:live'), getMeta('active:paper')])
    return { presets: rows, defaults: def ? normalizeSettings(def.settings) : normalizeSettings(STRATEGY_DEFAULTS), defaultId: def?.id ?? null, active: { live: aLive || null, paper: aPaper || null } }
  }

  if (path === '/presets' && m === 'POST') {
    requireAdmin(req)
    const name = String(body.name || '').trim().slice(0, 60)
    if (!name) throw new HttpError(400, 'Dai un nome alle impostazioni')
    // stesso nome: si sovrascrive solo con conferma (overwrite). Sovrascrivere non cambia mai Prova o Reale:
    // le loro impostazioni sono una copia, che cambia solo premendo Salva nella loro pagina.
    const same = await q(db().from('wt_presets').select('id').eq('name', name))
    if (same.length && body.overwrite !== true) {
      const [aLive, aPaper] = await Promise.all([getMeta('active:live'), getMeta('active:paper')])
      const ids = same.map(x => x.id)
      return { exists: true, id: ids[0], activeIn: [...(ids.includes(aLive?.presetId) || aLive?.name === name ? ['Reale'] : []), ...(ids.includes(aPaper?.presetId) || aPaper?.name === name ? ['Prova'] : [])] }
    }
    if (same.length) await q(db().from('wt_presets').update({ settings: normalizeSettings(body.settings || {}), created_at: Date.now() }).eq('id', same[0].id))
    else await q(db().from('wt_presets').insert({ name, settings: normalizeSettings(body.settings || {}), created_at: Date.now() }))
    return { ok: true, overwritten: !!same.length }
  }

  if (path === '/presets/delete' && m === 'POST') {
    requireAdmin(req)
    await q(db().from('wt_presets').delete().eq('id', Number(body.id)))
    return { ok: true }
  }

  if (path === '/presets/default' && m === 'POST') {
    requireAdmin(req)
    // id = null → si torna alle impostazioni di default originali
    await q(db().from('wt_presets').update({ is_default: false }).eq('is_default', true))
    if (body.id) await q(db().from('wt_presets').update({ is_default: true }).eq('id', Number(body.id)))
    return { ok: true }
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
  const path = '/' + (url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '')).replace(/\/+$/, '')
  if (path === '/sim/stream' && req.method === 'POST') return streamSim(req, res, url)
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
