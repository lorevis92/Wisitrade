// Adattatore Bitget per la strategia Apertura USA (stessa interfaccia di server/exchanges/bitunix.js).
// Titoli = perpetui USDT normali (categoria USDT-FUTURES, symbolType "stock"), API v2 dei futures: il conto è "Classic"
// (docs/bitget-verifica-account.md), quindi niente API Unified (v3) per il conto; il catalogo pubblico v3 serve solo a
// riconoscere i titoli. Chiavi: BITGET_API_KEY, BITGET_API_SECRET, BITGET_API_PASSPHRASE (solo variabili d'ambiente).
//
// Differenze da Bitunix e come si gestiscono:
//  - il conto della strategia lavora in modalità one-way (una posizione per titolo): prima di ogni ordine server/live.js
//    imposta e verifica one-way, margine isolato e leva (needOneWay). Se non riesce, il trade si salta;
//  - le posizioni non hanno un positionId: l'identificativo è "titolo|lato|ora di apertura" (cTime di Bitget). Si apre solo
//    se sul titolo non c'è niente, quindi la posizione nuova è riconoscibile con certezza come per Bitunix;
//  - stop loss nell'ordine con presetStopLossPrice (stop della posizione, prezzo di mercato) e verificato dopo tra gli
//    ordini TP/SL attivi del titolo; se manca si mette con place-tpsl-order (loss_plan per la quantità della strategia).
// Firma: ACCESS-SIGN = base64(HMAC-SHA256(secret, timestamp + METODO + percorso[?query] + body)).
import crypto from 'node:crypto'
import { ASSET_MAP } from '../../shared/assets.js'
import { STRATEGY_SYMBOLS, isTradingDay } from '../../shared/opening.js'
import { addDays, weekdayOf, nyTs } from '../../shared/time.js'
import { getMeta, setMeta } from '../db.js'

const BASE = 'https://api.bitget.com'
const PT = 'USDT-FUTURES', MC = 'USDT'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const MIN = 60000

// ---------- Limite richieste (Bitget: dati 20/s, conto e ordini 10/s) ----------
const limiter = per => {
  let slots = []
  return async () => {
    for (;;) {
      const now = performance.now()
      slots = slots.filter(t => now - t < 1000)
      if (slots.length < per) { slots.push(now); return }
      await sleep(1000 - (now - slots[0]) + 5)
    }
  }
}
const pubSlot = limiter(15), privSlot = limiter(8)

export class BitgetError extends Error { constructor(path, code, msg) { super(`Bitget ${path}: ${msg || 'errore'}${code ? ` (${code})` : ''}`); this.code = code } }

async function pub(path, query = {}, { timeout = 10000 } = {}) {
  await pubSlot()
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null)).toString()
  const res = await fetch(BASE + path + (qs ? `?${qs}` : ''), { signal: AbortSignal.timeout(timeout) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.code !== '00000') throw new BitgetError(path, j.code || res.status, j.msg)
  return j.data
}

export const hasKeys = () => !!(process.env.BITGET_API_KEY && process.env.BITGET_API_SECRET && process.env.BITGET_API_PASSPHRASE)

async function signed(method, path, { query = {}, body = null } = {}) {
  if (!hasKeys()) throw new Error('Chiavi API Bitget non configurate')
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
  const rp = path + (qs ? `?${qs}` : '')
  const bodyStr = body ? JSON.stringify(body) : ''
  const ts = String(Date.now())
  const sign = crypto.createHmac('sha256', process.env.BITGET_API_SECRET).update(ts + method + rp + bodyStr).digest('base64')
  await privSlot()
  const res = await fetch(BASE + rp, {
    method,
    headers: {
      'ACCESS-KEY': process.env.BITGET_API_KEY, 'ACCESS-SIGN': sign, 'ACCESS-TIMESTAMP': ts, 'ACCESS-PASSPHRASE': process.env.BITGET_API_PASSPHRASE,
      'Content-Type': 'application/json', locale: 'en-US',
    },
    body: body ? bodyStr : undefined,
    signal: AbortSignal.timeout(10000),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.code !== '00000') throw new BitgetError(path, j.code || res.status, j.msg)
  return j.data
}
const get = (path, query) => signed('GET', path, { query })
const post = (path, body) => signed('POST', path, { body })

const n = v => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : +v)
const decimals = x => { const s = String(x); return s.includes('e-') ? +s.split('e-')[1] : (s.split('.')[1] || '').length }

// ---------- Titoli ----------
// Nome diverso da quello di Bitunix (docs/bitget-stock-futures-verifica.md)
const RENAME = { CATERPILLAR: 'CAT', GAMESTOP: 'GME' }
export const perpOf = sym => (ASSET_MAP[sym] ? `${RENAME[sym] || sym}USDT` : null)
const symOfPerp = Object.fromEntries(Object.keys(ASSET_MAP).map(s => [perpOf(s), s]))

// Catalogo dei perpetui sui titoli (pubblico), rifatto una volta al giorno: precisione, minimi, leva massima, commissioni
const PAIRS_KEY = 'bitget:pairs'
let pairsMem = null
export async function instruments() {
  const data = await pub('/api/v3/market/instruments', { category: PT }, { timeout: 15000 })
  return (data || []).filter(i => i.symbolType === 'stock').map(i => {
    const tick = n(i.priceMultiplier) || 10 ** -(n(i.pricePrecision) ?? 2)
    const step = n(i.quantityMultiplier) || 10 ** -(n(i.quantityPrecision) ?? 2)
    return {
      symbol: i.symbol, kind: i.instrumentType || 'stock', name: i.fullName || null,
      maxLeverage: n(i.maxLeverage), quotePrecision: n(i.pricePrecision) ?? decimals(tick), basePrecision: n(i.quantityPrecision) ?? decimals(step),
      tick, step, minQty: n(i.minOrderQty) || step, minNotional: n(i.minOrderAmount) || 0, fundingH: n(i.fundInterval) || 8,
      takerFee: n(i.takerFeeRate) !== null ? +i.takerFeeRate * 100 : 0.06, status: i.status || null, api: !i.status || i.status === 'online',
    }
  })
}
async function pairs() {
  if (pairsMem && Date.now() - pairsMem.at < 3600000) return pairsMem.list
  const v = await getMeta(PAIRS_KEY).catch(() => null)
  if (v && Date.now() - v.at < 24 * 3600000 && v.list?.length) { pairsMem = v; return v.list }
  try {
    const list = await instruments()
    pairsMem = { at: Date.now(), list }
    await setMeta(PAIRS_KEY, pairsMem).catch(() => {})
    return list
  } catch { return v?.list || [] }
}

// ---------- Candele e prezzi ----------
const GRAN = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1D' }
const toBar = k => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] || 0 })
// Ultime candele: fino a 1000 per richiesta; con startTime/endTime lo storico (fino a 200 per richiesta)
export async function klines(perp, interval, limit = 200, { endTime, startTime } = {}) {
  const hist = !!(endTime || startTime)
  const data = await pub(hist ? '/api/v2/mix/market/history-candles' : '/api/v2/mix/market/candles', {
    symbol: perp, productType: PT, granularity: GRAN[interval] || interval, limit: String(Math.min(hist ? 200 : 1000, limit)),
    ...(startTime ? { startTime: String(startTime) } : {}), ...(endTime ? { endTime: String(endTime) } : {}),
  })
  return (Array.isArray(data) ? data : []).map(toBar).sort((a, b) => a.t - b.t)
}
export async function klinesBack(perp, interval, total, { endTime } = {}) {
  let out = endTime ? [] : await klines(perp, interval, Math.min(1000, total))
  let end = endTime || (out.length ? out[0].t - 1 : null)
  while (out.length < total && end) {
    const page = await klines(perp, interval, 200, { endTime: end })
    const fresh = page.filter(b => !out.length || b.t < out[0].t)
    if (!fresh.length) break
    out = [...fresh, ...out]
    end = fresh[0].t - 1
    if (page.length < 200) break
  }
  return out.slice(-total)
}
export async function many(jobs) {
  const res = await Promise.allSettled(jobs.map(j => klines(j.symbol, j.interval, j.limit)))
  return jobs.map((j, k) => ({ ...j, bars: res[k].status === 'fulfilled' ? res[k].value : null, error: res[k].reason?.message }))
}
// Tutti i ticker dei futures USDT con una sola richiesta: { PERP: prezzo }
export async function allPrices() {
  const data = await pub('/api/v2/mix/market/tickers', { productType: PT }, { timeout: 4000 })
  const out = {}
  for (const t of data || []) { const p = +t.lastPr; if (p > 0) out[t.symbol] = p }
  return out
}
export async function tickers(perps) {
  const want = new Set(perps)
  const data = await pub('/api/v2/mix/market/tickers', { productType: PT }, { timeout: 8000 }).catch(() => [])
  const out = {}
  for (const t of data || []) if (want.has(t.symbol)) out[t.symbol] = { last: +t.lastPr, mark: +t.markPrice, open24: +t.open24h, high24: +t.high24h, low24: +t.low24h }
  return out
}

// Ultimi n giorni di borsa prima di oggi (volume normale minuto per minuto: shared/engine.js minuteNormals): dall'archivio
// di Bitget (server/archive.js) se ha abbastanza giorni, altrimenti dalle API (9:25–10:10 di New York, una richiesta per giorno)
async function prevDays(sym, today, nDays = 10) {
  try {
    const { loadDays } = await import('../archive.js')
    const d = await loadDays([sym], addDays(today, -21), addDays(today, -1), { ex: 'bitget' })
    const arch = Object.keys(d).sort().slice(-nDays).map(x => d[x][sym]).filter(b => b?.length)
    if (arch.length >= Math.min(nDays, 5)) return arch
  } catch { /* archivio non disponibile: API */ }
  const perp = perpOf(sym), out = []
  for (let d = addDays(today, -1), k = 0; out.length < nDays && k < 25; d = addDays(d, -1), k++) {
    if (!isTradingDay(d, weekdayOf(d))) continue
    const bars = await klines(perp, '1m', 200, { startTime: nyTs(d, 565), endTime: nyTs(d, 610) }).catch(() => [])
    if (bars.length) out.unshift(bars)
    else out.unshift([])
  }
  return out.filter(b => b.length)
}
// Candele da 1 minuto di un giorno, 9:00–16:30 di New York (grafico della posizione)
async function dayBars(sym, day) {
  try { const { dayBars: arch } = await import('../archive.js'); const b = await arch(sym, day, 'bitget'); if (b.length) return b } catch { /* API */ }
  const perp = perpOf(sym), out = []
  const end = Math.min(Date.now(), nyTs(day, 990))
  for (let t = nyTs(day, 540); t < end; t += 200 * MIN) {
    const page = await klines(perp, '1m', 200, { startTime: t, endTime: Math.min(end, t + 200 * MIN) }).catch(() => [])
    out.push(...page)
  }
  const seen = new Set()
  return out.filter(b => !seen.has(b.t) && seen.add(b.t) && b.t < nyTs(day, 990)).sort((a, b) => a.t - b.t)
}

// Leva massima, scaglioni (margine di mantenimento) e intervallo del funding per i titoli della strategia, una volta al giorno
const LIM_KEY = 'bitget:limits'
let limMem = null
async function limits() {
  const fresh = c => c && Date.now() - c.at < 24 * 3600000
  if (fresh(limMem)) return limMem.data
  const cached = await getMeta(LIM_KEY).catch(() => null)
  if (fresh(cached)) { limMem = cached; return cached.data }
  try {
    const list = await pairs()
    const byPerp = new Map(list.map(p => [p.symbol, p]))
    const data = {}
    const queue = STRATEGY_SYMBOLS.filter(s => byPerp.has(perpOf(s)))
    for (const s of STRATEGY_SYMBOLS) if (!byPerp.has(perpOf(s))) data[s] = { available: false, maxLev: null, tiers: null, fundingH: 8 }
    const worker = async () => {
      while (queue.length) {
        const sym = queue.shift(), perp = perpOf(sym), pair = byPerp.get(perp)
        const old = cached?.data?.[sym]
        let tiers = null
        try {
          const t = await pub('/api/v2/mix/market/query-position-lever', { symbol: perp, productType: PT })
          tiers = (t || []).map(x => ({ start: +x.startUnit || 0, end: +x.endUnit || Infinity, lev: +x.leverage || null, mmr: +x.keepMarginRate })).filter(x => Number.isFinite(x.mmr)).sort((a, b) => a.start - b.start)
        } catch { tiers = old?.tiers ?? null }
        data[sym] = { available: true, maxLev: pair.maxLeverage, tiers: tiers?.length ? tiers : null, fundingH: pair.fundingH || 8 }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    limMem = { at: Date.now(), data }
    await setMeta(LIM_KEY, limMem).catch(() => {})
    return data
  } catch { return cached?.data || {} }
}

// ---------- Conto ----------
export async function account() {
  const d = await get('/api/v2/mix/account/accounts', { productType: PT })
  const a = (d || []).find(x => x.marginCoin === MC) || {}
  const available = n(a.available) || 0, equity = n(a.accountEquity) ?? n(a.usdtEquity) ?? 0, upnl = n(a.unrealizedPL) || 0, frozen = n(a.locked) || 0
  return { available, margin: Math.max(0, equity - available - upnl - frozen), frozen, upnl, equity, raw: a }
}

// ---------- Posizioni, ordini, margine, leva ----------
const sideOf = holdSide => (holdSide === 'short' || holdSide === 'sell' ? -1 : 1)
const mm = m => (m === 'isolated' ? 'ISOLATION' : m === 'crossed' ? 'CROSS' : m || null)
const pm = m => (m === 'one_way_mode' ? 'ONE_WAY' : m === 'hedge_mode' ? 'HEDGE' : m || null)
// identificativo della posizione: titolo|lato|ora di apertura
export const posId = (symbol, side, cTime) => `${symbol}|${side > 0 ? 'long' : 'short'}|${cTime || ''}`
const parseId = id => { const [symbol, s, c] = String(id).split('|'); return { symbol, side: s === 'short' ? -1 : 1, cTime: n(c) } }

export async function openPositions(perp) {
  const d = perp
    ? await get('/api/v2/mix/position/single-position', { symbol: perp, productType: PT, marginCoin: MC })
    : await get('/api/v2/mix/position/all-position', { productType: PT, marginCoin: MC })
  return (Array.isArray(d) ? d : []).filter(p => +p.total > 0).map(p => {
    const side = sideOf(p.holdSide)
    return {
      positionId: posId(p.symbol, side, p.cTime), symbol: p.symbol, side, qty: +p.total, entry: n(p.openPriceAvg),
      liqPrice: n(p.liquidationPrice) > 0 ? +p.liquidationPrice : null, marginMode: mm(p.marginMode), leverage: n(p.leverage), ctime: n(p.cTime),
      raw: { ...p, positionMode: pm(p.posMode) },
    }
  })
}
// Ordini in attesa sul titolo: normali e condizionati (un ordine condizionato manuale aprirebbe una posizione)
export async function pendingOrders(perp) {
  const [a, b] = await Promise.all([
    get('/api/v2/mix/order/orders-pending', { productType: PT, symbol: perp }),
    get('/api/v2/mix/order/orders-plan-pending', { productType: PT, planType: 'normal_plan', symbol: perp }),
  ])
  return [...(a?.entrustedList || []), ...(b?.entrustedList || [])].map(o => ({ orderId: String(o.orderId), symbol: o.symbol, clientId: o.clientOid || '', side: o.side, qty: +o.size, status: o.status || o.planStatus || null }))
}
// Margine, leva e modalità delle posizioni di un titolo: { leverage, marginMode: 'ISOLATION' | 'CROSS', posMode: 'ONE_WAY' | 'HEDGE' }
export async function leverageMarginMode(perp) {
  const a = await get('/api/v2/mix/account/account', { symbol: perp, productType: PT, marginCoin: MC })
  const marginMode = mm(a?.marginMode)
  const lo = n(a?.isolatedLongLever), sh = n(a?.isolatedShortLever)
  const leverage = marginMode === 'ISOLATION' ? (lo === sh ? lo : null) : n(a?.crossedMarginLeverage)
  return { leverage, marginMode, posMode: pm(a?.posMode), longLev: lo, shortLev: sh }
}
export const setIsolated = perp => post('/api/v2/mix/account/set-margin-mode', { symbol: perp, productType: PT, marginCoin: MC, marginMode: 'isolated' })
// Leva su entrambi i lati (one-way: un'impostazione sola; se il conto risulta ancora in hedge, lato per lato)
export async function setLeverage(perp, leverage) {
  const base = { symbol: perp, productType: PT, marginCoin: MC, leverage: String(Math.round(leverage)) }
  await post('/api/v2/mix/account/set-leverage', base)
  const cur = await leverageMarginMode(perp).catch(() => null)
  if (cur && cur.marginMode === 'ISOLATION' && (cur.longLev !== Math.round(leverage) || cur.shortLev !== Math.round(leverage))) {
    for (const holdSide of ['long', 'short']) await post('/api/v2/mix/account/set-leverage', { ...base, holdSide }).catch(() => {})
  }
}
// Modalità one-way per tutti i futures USDT del conto (Bitget la accetta solo senza posizioni né ordini aperti)
export const setOneWay = () => post('/api/v2/mix/account/set-position-mode', { productType: PT, posMode: 'one_way_mode' })

const pairOfPerp = async perp => (await pairs()).find(p => p.symbol === perp) || null
const roundTick = (x, pair) => {
  const tick = pair?.tick || 0.01, dec = Math.max(pair?.quotePrecision ?? 2, decimals(tick))
  return (Math.round(x / tick) * tick).toFixed(dec)
}
const sizeStr = (qty, pair) => Number(qty).toFixed(pair?.basePrecision ?? 4).replace(/\.?0+$/, '') || '0'

// Ordine a mercato in apertura (one-way), con lo stop loss della posizione dentro l'ordine (presetStopLossPrice, prezzo di mercato)
export async function openMarket({ symbol, side, qty, clientId, slPrice }) {
  const pair = await pairOfPerp(symbol)
  return post('/api/v2/mix/order/place-order', {
    symbol, productType: PT, marginMode: 'isolated', marginCoin: MC, size: sizeStr(qty, pair), side: side > 0 ? 'buy' : 'sell', orderType: 'market',
    reduceOnly: 'NO', ...(clientId ? { clientOid: clientId } : {}), ...(slPrice ? { presetStopLossPrice: roundTick(slPrice, pair) } : {}),
  })
}
// Stop loss attivi del titolo (in one-way c'è una sola posizione per titolo: quella della strategia, se si è aperto)
const planTypes = new Map() // orderId → tipo di stop (pos_loss = stop della posizione, loss_plan = stop per una quantità)
export async function pendingStopLoss(perp, positionId) {
  const d = await get('/api/v2/mix/order/orders-plan-pending', { productType: PT, planType: 'profit_loss', symbol: perp })
  return (d?.entrustedList || []).filter(o => o.symbol === perp && (o.planType === 'pos_loss' || o.planType === 'loss_plan') && +o.triggerPrice > 0)
    .map(o => { planTypes.set(String(o.orderId), o.planType); return { id: String(o.orderId), positionId: String(positionId), slPrice: +o.triggerPrice, slQty: n(o.size), planType: o.planType } })
}
export async function placeStopLoss({ symbol, positionId, slPrice, qty }) {
  const pair = await pairOfPerp(symbol)
  const { side } = parseId(positionId)
  const r = await post('/api/v2/mix/order/place-tpsl-order', {
    marginCoin: MC, productType: PT, symbol, planType: 'loss_plan', triggerPrice: roundTick(slPrice, pair), triggerType: 'fill_price',
    executePrice: '0', holdSide: side > 0 ? 'buy' : 'sell', size: sizeStr(qty, pair),
  })
  if (r?.orderId) planTypes.set(String(r.orderId), 'loss_plan')
  return r
}
async function planTypeOf(symbol, orderId) {
  if (!planTypes.has(String(orderId))) await pendingStopLoss(symbol, '').catch(() => [])
  return planTypes.get(String(orderId)) || 'loss_plan'
}
export async function modifyStopLoss({ orderId, slPrice, qty, symbol }) {
  if (!symbol) throw new Error('titolo mancante per modificare lo stop su Bitget')
  const pair = await pairOfPerp(symbol)
  const pos = (await planTypeOf(symbol, orderId)) === 'pos_loss'
  return post('/api/v2/mix/order/modify-tpsl-order', {
    orderId: String(orderId), marginCoin: MC, productType: PT, symbol, triggerPrice: roundTick(slPrice, pair), triggerType: 'fill_price',
    executePrice: '0', size: pos ? '' : sizeStr(qty, pair),
  })
}
export const cancelStopLoss = ({ symbol, orderId }) =>
  post('/api/v2/mix/order/cancel-plan-order', { orderIdList: [{ orderId: String(orderId) }], symbol, productType: PT, marginCoin: MC, planType: 'profit_loss' })
// Chiusura a mercato di tutta la posizione del titolo (one-way: è quella della strategia; server/live.js la usa solo se la
// quantità sul titolo non è più grande di quella della strategia)
export const closePosition = positionId => post('/api/v2/mix/order/close-positions', { symbol: parseId(positionId).symbol, productType: PT })
// Chiusura di una parte, solo in riduzione. side = lato della posizione da ridurre (come per Bitunix): l'ordine è dal lato opposto
export async function closePartial({ symbol, side, qty }) {
  const pair = await pairOfPerp(symbol)
  return post('/api/v2/mix/order/place-order', {
    symbol, productType: PT, marginMode: 'isolated', marginCoin: MC, size: sizeStr(qty, pair), side: side > 0 ? 'sell' : 'buy', orderType: 'market', reduceOnly: 'YES',
  })
}

// ---------- Storico (solo lettura) ----------
// Posizione chiusa: si riconosce dal titolo, dal lato e dall'ora di apertura dentro l'identificativo
export async function positionHistory(perp, positionId) {
  const { side, cTime } = parseId(positionId || '')
  const d = await get('/api/v2/mix/position/history-position', { productType: PT, symbol: perp, limit: '50', ...(cTime ? { startTime: String(cTime - 10 * MIN), endTime: String(Date.now()) } : {}) })
  const list = (d?.list || []).filter(x => x.symbol === perp && (!positionId || sideOf(x.holdSide) === side))
  const p = cTime ? list.slice().sort((a, b) => Math.abs(+a.cTime - cTime) - Math.abs(+b.cTime - cTime)).find(x => Math.abs(+x.cTime - cTime) < 5 * MIN) : list[0]
  if (!p) return null
  const fee = n(p.openFee) !== null || n(p.closeFee) !== null ? -(Math.abs(n(p.openFee) || 0) + Math.abs(n(p.closeFee) || 0)) : null
  return { closePrice: n(p.closeAvgPrice), fee, funding: n(p.totalFunding), realizedPNL: n(p.netProfit), liqQty: null, liqPrice: null, raw: { ...p, entryPrice: p.openAvgPrice, closePrice: p.closeAvgPrice, maxQty: p.openTotalPos, realizedPNL: p.netProfit, funding: p.totalFunding, fee, ctime: p.cTime, mtime: p.uTime } }
}
// Esecuzioni del titolo in un intervallo (confronto serale)
export async function historyTrades(perp, { startTime, endTime } = {}) {
  const d = await get('/api/v2/mix/order/fill-history', { productType: PT, symbol: perp, startTime: startTime ? String(startTime) : undefined, endTime: endTime ? String(endTime) : undefined, limit: '100' })
  return (d?.fillList || []).map(t => ({
    tradeId: t.tradeId ? String(t.tradeId) : null, orderId: t.orderId ? String(t.orderId) : null, clientId: null, side: t.side || null,
    tradeSide: t.tradeSide === 'open' || /open/i.test(t.tradeSide || '') ? 'OPEN' : t.tradeSide || null, qty: n(t.baseVolume), price: n(t.price),
    fee: (t.feeDetail || []).reduce((a, f) => a + (n(f.totalFee) || 0), 0), realizedPNL: n(t.profit), role: t.tradeScope || null, orderType: t.orderType || null,
    reduceOnly: null, at: n(t.cTime), positionId: null,
  })).sort((a, b) => (a.at || 0) - (b.at || 0))
}

export const roundQty = (qty, precision) => { const f = 10 ** precision; return Math.floor(qty * f + 1e-9) / f }

export const bitget = {
  id: 'bitget',
  name: 'Bitget',
  takerFee: 0.06,
  clientPrefix: 'wt',
  needOneWay: true,
  hasKeys,
  perpOf: sym => perpOf(sym),
  pairs: async () => pairs(),
  pairsAt: async () => pairsMem?.at || (await getMeta(PAIRS_KEY).catch(() => null))?.at || null,
  resetPairs: async () => { pairsMem = null; await setMeta(PAIRS_KEY, null) },
  notTradable: (sym, byPerp) => {
    const p = byPerp.get(perpOf(sym))
    if (!p) return 'Bitget: titolo non disponibile come perpetuo USDT'
    if (p.api === false) return `Bitget: perpetuo non negoziabile (stato ${p.status || 'sconosciuto'})`
    return null
  },
  symOfPerp: perp => symOfPerp[perp] || null,
  klines, klinesBack, many, tickers, allPrices, limits, prevDays, dayBars,
  account,
  api: {
    name: 'Bitget', needOneWay: true,
    openPositions, pendingOrders, leverageMarginMode, setIsolated, setLeverage, setOneWay, openMarket, placeStopLoss,
    pendingStopLoss, modifyStopLoss, cancelStopLoss, closePosition, closePartial,
  },
  positionHistory, historyTrades, tpslHistory: null, roundQty,
  // titolo non accettato via API da Bitget (prodotto, regione o verifica dell'identità): si esclude per qualche giorno
  isApiReject: msg => /not support.*api|does not support|symbol.*(not (exist|open|support|available))|restricted|not allowed|region|jurisdiction|compliance|kyc|identity/i.test(String(msg || '')),
}
