// Bitunix: dati di mercato pubblici (tutti gli asset, crypto e titoli) e API private per il trading.
// Documentazione: https://www.bitunix.com/api-docs/futures/
import crypto from 'node:crypto'

const BASE = 'https://fapi.bitunix.com'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- Limite richieste: max ~8 al secondo per stare sotto i 10/s di Bitunix ----------
let slots = []
async function throttle() {
  for (;;) {
    const now = performance.now()
    slots = slots.filter(t => now - t < 1000)
    if (slots.length < 8) { slots.push(now); return }
    await sleep(1000 - (now - slots[0]) + 5)
  }
}

async function getJson(path, { timeout = 10000 } = {}) {
  await throttle()
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(timeout) })
  if (!res.ok) throw new Error(`Bitunix ${path.split('?')[0]} ${res.status}`)
  const j = await res.json()
  if (j.code !== 0) throw new Error(`Bitunix ${path.split('?')[0]}: ${j.msg || j.code}`)
  return j.data
}

const toBar = k => ({ t: Number(k.time), o: +k.open, h: +k.high, l: +k.low, c: +k.close, v: +(k.baseVol ?? k.quoteVol ?? 0) })

// Candele (max 200 per richiesta). interval: 1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M
export async function klines(symbol, interval, limit = 200, { endTime, startTime } = {}) {
  const q = new URLSearchParams({ symbol, interval, limit: String(Math.min(200, limit)), type: 'LAST_PRICE' })
  if (endTime) q.set('endTime', String(endTime))
  if (startTime) q.set('startTime', String(startTime))
  const data = await getJson(`/api/v1/futures/market/kline?${q}`)
  return (Array.isArray(data) ? data : []).map(toBar).sort((a, b) => a.t - b.t)
}

// Più di 200 candele: scorre indietro nel tempo pagina per pagina
export async function klinesBack(symbol, interval, total, { endTime } = {}) {
  let out = [], end = endTime
  while (out.length < total) {
    const page = await klines(symbol, interval, 200, end ? { endTime: end } : {})
    const fresh = page.filter(b => !out.length || b.t < out[0].t)
    if (!fresh.length) break
    out = [...fresh, ...out]
    end = fresh[0].t - 1
    if (page.length < 200) break
  }
  return out.slice(-total)
}

export async function tickers(symbols) {
  const out = {}
  for (let i = 0; i < symbols.length; i += 40) {
    const chunk = symbols.slice(i, i + 40)
    try {
      const data = await getJson(`/api/v1/futures/market/tickers?symbols=${chunk.join(',')}`)
      for (const t of data || []) out[t.symbol] = { last: +t.lastPrice || +t.last, mark: +t.markPrice, open24: +t.open, high24: +t.high, low24: +t.low }
    } catch { /* un blocco fallito non blocca gli altri */ }
  }
  return out
}

// Libro ordini (migliori livelli): { bids: [[prezzo, quantità]], asks: [...] }
export async function depth(symbol, limit = 50) {
  const d = await getJson(`/api/v1/futures/market/depth?symbol=${symbol}&limit=${limit}`)
  const lv = a => (a || []).map(x => [+x[0], +x[1]]).filter(x => x[0] > 0 && x[1] > 0)
  return { bids: lv(d?.bids), asks: lv(d?.asks) }
}

// Ultimo prezzo di TUTTI i perpetual con una sola richiesta: { SIMBOLOUSDT: prezzo }
export async function allTickers() {
  const data = await getJson('/api/v1/futures/market/tickers', { timeout: 4000 })
  const out = {}
  for (const t of data || []) { const p = +t.lastPrice || +t.last; if (p > 0) out[t.symbol] = p }
  return out
}

// Coppie disponibili con precisione e quantità minima (servono per gli ordini)
export async function tradingPairs() {
  const data = await getJson('/api/v1/futures/market/trading_pairs')
  return (data || []).filter(p => !p.symbolStatus || p.symbolStatus === 'OPEN').map(p => ({
    symbol: p.symbol,
    maxLeverage: +p.maxLeverage || null,
    basePrecision: Number.isFinite(+p.basePrecision) ? +p.basePrecision : 3,
    minQty: +p.minTradeVolume || 0,
    quotePrecision: Number.isFinite(+p.quotePrecision) ? +p.quotePrecision : null,
    api: p.isApiSupported !== false, // false = Bitunix non accetta ordini via API su questa coppia
  }))
}

// Scaglioni di rischio di un perpetual: margine di mantenimento e leva massima per valore della posizione
export async function positionTiers(symbol) {
  const data = await getJson(`/api/v1/futures/position/get_position_tiers?symbol=${symbol}`)
  return (data || []).map(t => ({ start: +t.startValue || 0, end: +t.endValue || Infinity, lev: +t.leverage || null, mmr: +t.maintenanceMarginRate }))
    .filter(t => Number.isFinite(t.mmr)).sort((a, b) => a.start - b.start)
}

// Funding attuale di tutti i perpetual (fundingRate in %, intervallo in ore)
export async function fundingRates() {
  const data = await getJson('/api/v1/futures/market/funding_rate/batch')
  return Object.fromEntries((data || []).map(f => [f.symbol, { rate: +f.fundingRate, hours: +f.fundingInterval || 8, next: +f.nextFundingTime || null }]))
}

// Scarica tante serie in parallelo (il limite di velocità lo gestisce throttle)
export async function many(jobs) {
  const res = await Promise.allSettled(jobs.map(j => klines(j.symbol, j.interval, j.limit)))
  return jobs.map((j, k) => ({ ...j, bars: res[k].status === 'fulfilled' ? res[k].value : null, error: res[k].reason?.message }))
}

// ---------- API private (firmate) ----------
// Firma: digest = SHA256(nonce + timestamp + apiKey + queryParams + body); sign = SHA256(digest + secretKey)
// queryParams = parametri ordinati per chiave e concatenati "chiavevalore" senza separatori; body = JSON senza spazi.
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')

export const hasKeys = () => !!(process.env.BITUNIX_API_KEY && process.env.BITUNIX_SECRET_KEY)

async function signed(method, path, { query = {}, body = null } = {}) {
  if (!hasKeys()) throw new Error('Chiavi API Bitunix non configurate')
  const apiKey = process.env.BITUNIX_API_KEY, secret = process.env.BITUNIX_SECRET_KEY
  const nonce = crypto.randomBytes(16).toString('hex')
  const timestamp = String(Date.now())
  const keys = Object.keys(query).filter(k => query[k] !== undefined && query[k] !== null).sort()
  const qp = keys.map(k => k + query[k]).join('')
  const bodyStr = body ? JSON.stringify(body) : ''
  const sign = sha256(sha256(nonce + timestamp + apiKey + qp + bodyStr) + secret)
  const qs = keys.length ? '?' + keys.map(k => `${k}=${encodeURIComponent(query[k])}`).join('&') : ''
  await throttle()
  const res = await fetch(BASE + path + qs, {
    method,
    headers: { 'api-key': apiKey, nonce, timestamp, sign, 'content-type': 'application/json', language: 'en-US' },
    body: body ? bodyStr : undefined,
    signal: AbortSignal.timeout(10000),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.code !== 0) throw new Error(`Bitunix ${path}: ${j.msg || res.status}`)
  return j.data
}

// Saldo del conto futures in USDT
export async function account() {
  const d = await signed('GET', '/api/v1/futures/account', { query: { marginCoin: 'USDT' } })
  const a = Array.isArray(d) ? d[0] : d
  const available = +a?.available || 0, margin = +a?.margin || 0, frozen = +a?.frozen || 0
  const upnl = (+a?.crossUnrealizedPNL || 0) + (+a?.isolationUnrealizedPNL || 0)
  return { available, margin, frozen, upnl, equity: available + margin + frozen + upnl, raw: a }
}

export const setLeverage = (symbol, leverage) =>
  signed('POST', '/api/v1/futures/account/change_leverage', { body: { symbol, leverage: Math.round(leverage), marginCoin: 'USDT' } })

export const setIsolated = symbol =>
  signed('POST', '/api/v1/futures/account/change_margin_mode', { body: { symbol, marginMode: 'ISOLATION', marginCoin: 'USDT' } })

// Modalità delle posizioni del conto: ONE_WAY (una posizione per titolo) o HEDGE (una per titolo e per lato)
export async function positionMode() {
  const d = await signed('GET', '/api/v1/futures/account/position_mode')
  return (Array.isArray(d) ? d[0] : d)?.positionMode || null
}

// Leva e modalità di margine impostate per un titolo: { leverage, marginMode: 'ISOLATION' | 'CROSS' }
export async function leverageMarginMode(symbol) {
  const d = await signed('GET', '/api/v1/futures/account/get_leverage_margin_mode', { query: { symbol, marginCoin: 'USDT' } })
  const x = Array.isArray(d) ? d[0] : d
  return { leverage: +x?.leverage || null, marginMode: x?.marginMode || null }
}

// Ordine a mercato in apertura, con lo stop loss dentro l'ordine (slPrice: Bitunix lo lega alla posizione nata dall'ordine).
// Dopo l'apertura lo stop si verifica sempre con pendingStopLoss (server/live.js).
export const openMarket = ({ symbol, side, qty, clientId, slPrice }) =>
  signed('POST', '/api/v1/futures/trade/place_order', {
    body: {
      symbol, qty: String(qty), side: side > 0 ? 'BUY' : 'SELL', tradeSide: 'OPEN', orderType: 'MARKET', reduceOnly: false, ...(clientId ? { clientId } : {}),
      ...(slPrice ? { slPrice: String(slPrice), slStopType: 'LAST_PRICE', slOrderType: 'MARKET' } : {}),
    },
  })

// Stop loss attivi di una posizione (tpsl/get_pending_orders)
export async function pendingStopLoss(symbol, positionId) {
  const d = await signed('GET', '/api/v1/futures/tpsl/get_pending_orders', { query: { symbol, positionId: String(positionId), limit: 100 } })
  const list = Array.isArray(d) ? d : (d?.orderList || [])
  return list.filter(o => String(o.positionId) === String(positionId) && +o.slPrice > 0)
    .map(o => ({ id: String(o.id ?? o.orderId), positionId: String(o.positionId), slPrice: +o.slPrice, slQty: +o.slQty || null }))
}

export async function openPositions(symbol) {
  const d = await signed('GET', '/api/v1/futures/position/get_pending_positions', { query: symbol ? { symbol } : {} })
  return (Array.isArray(d) ? d : []).map(p => ({
    positionId: String(p.positionId), symbol: p.symbol, side: p.side === 'SHORT' || p.side === 'SELL' ? -1 : 1,
    qty: +p.qty, entry: +p.avgOpenPrice || +p.entryValue / +p.qty || null, liqPrice: +p.liqPrice > 0 ? +p.liqPrice : null,
    marginMode: p.marginMode || null, leverage: +p.leverage || null, ctime: +p.ctime || null, raw: p,
  }))
}

// Ordini in attesa su un titolo (limite, non ancora eseguiti)
export async function pendingOrders(symbol) {
  const d = await signed('GET', '/api/v1/futures/trade/get_pending_orders', { query: { ...(symbol ? { symbol } : {}), limit: 100 } })
  return (d?.orderList || (Array.isArray(d) ? d : [])).map(o => ({ orderId: String(o.orderId), symbol: o.symbol, clientId: o.clientId || '', side: o.side, qty: +o.qty, status: o.status }))
}

// Dettaglio di un ordine (quantità eseguita, stato, commissione)
export async function orderDetail(orderId) {
  const d = await signed('GET', '/api/v1/futures/trade/get_order_detail', { query: { orderId } })
  return d ? { orderId: String(d.orderId), status: d.status, qty: +d.qty, tradeQty: +d.tradeQty, fee: +d.fee || 0, marginMode: d.marginMode, leverage: +d.leverage || null } : null
}

// Stop loss di una sola posizione e per una quantità precisa (non tocca le altre posizioni)
export const placeStopLoss = ({ symbol, positionId, slPrice, qty }) =>
  signed('POST', '/api/v1/futures/tpsl/place_order', {
    body: { symbol, positionId: String(positionId), slPrice: String(slPrice), slStopType: 'LAST_PRICE', slOrderType: 'MARKET', slQty: String(qty) },
  })
export const modifyStopLoss = ({ orderId, slPrice, qty }) =>
  signed('POST', '/api/v1/futures/tpsl/modify_order', { body: { orderId: String(orderId), slPrice: String(slPrice), slStopType: 'LAST_PRICE', slOrderType: 'MARKET', slQty: String(qty) } })
export const cancelStopLoss = ({ symbol, orderId }) =>
  signed('POST', '/api/v1/futures/tpsl/cancel_order', { body: { symbol, orderId: String(orderId) } })

// Posizione chiusa dallo storico di Bitunix: prezzo d'uscita, commissioni, funding e liquidazione veri (se forniti)
export async function positionHistory(symbol, positionId) {
  const d = await signed('GET', '/api/v1/futures/position/get_history_positions', { query: { symbol, ...(positionId ? { positionId } : {}), limit: 20 } })
  const list = Array.isArray(d) ? d : (d?.positionList || [])
  const p = positionId ? list.find(x => String(x.positionId) === String(positionId)) : list[0]
  if (!p) return null
  const n = v => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : +v)
  return { closePrice: n(p.closePrice), fee: n(p.fee), funding: n(p.funding), realizedPNL: n(p.realizedPNL), liqQty: n(p.liqQty), liqPrice: n(p.liqPrice), raw: p }
}

// Esecuzioni (fill) di una posizione dallo storico di Bitunix: ordine, lato, quantità, prezzo, commissione, ora.
// Solo lettura, per la registrazione serale (server/compare.js). Se Bitunix non filtra per positionId si filtra qui.
export async function historyTrades(symbol, { positionId = null, startTime, endTime } = {}) {
  const d = await signed('GET', '/api/v1/futures/trade/get_history_trades', { query: { symbol, ...(positionId ? { positionId: String(positionId) } : {}), startTime, endTime, limit: 100 } })
  const list = Array.isArray(d) ? d : (d?.tradeList || d?.list || [])
  const n = v => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : +v)
  return list
    .filter(t => !positionId || !t.positionId || String(t.positionId) === String(positionId))
    .map(t => ({
      tradeId: t.tradeId ? String(t.tradeId) : null, orderId: t.orderId ? String(t.orderId) : null, clientId: t.clientId || null,
      side: t.side || null, tradeSide: t.tradeSide || t.effect || null, qty: n(t.qty), price: n(t.price), fee: n(t.fee),
      realizedPNL: n(t.realizedPNL), role: t.roleType || null, orderType: t.orderType || null, reduceOnly: t.reduceOnly ?? null, at: n(t.ctime),
      positionId: t.positionId ? String(t.positionId) : null,
    }))
    .sort((a, b) => (a.at || 0) - (b.at || 0))
}

// Chiusura a mercato di una parte di UNA posizione precisa (positionId), solo in riduzione (reduceOnly: non può aprire niente).
// side = valore del campo side dell'ordine (1 BUY, -1 SELL): la documentazione Bitunix in hedge indica il lato della posizione.
export const closePartial = ({ symbol, positionId, side, qty }) =>
  signed('POST', '/api/v1/futures/trade/place_order', {
    body: { symbol, qty: String(qty), side: side > 0 ? 'BUY' : 'SELL', tradeSide: 'CLOSE', positionId: String(positionId), orderType: 'MARKET', reduceOnly: true },
  })

// Chiusura immediata a mercato di tutta la posizione
export const closePosition = positionId =>
  signed('POST', '/api/v1/futures/trade/flash_close_position', { body: { positionId } })

export function roundQty(qty, precision) {
  const f = 10 ** precision
  return Math.floor(qty * f) / f
}
