// Ordini manuali dalla pagina RSI: aperture e chiusure a mercato su Bitunix decise da Lorenzo, separate dalla strategia.
// Regole (non toglierle):
//  - Solo con il codice di controllo (le rotte in api/index.js chiamano requireAdmin) e solo se gli ordini veri sono
//    permessi (LIVE_TRADING=on e chiavi Bitunix, come il Reale). Non dipendono dal Reale acceso o spento.
//  - Separati dalla strategia: si salvano in wt_meta `manual:<ora d'apertura>` (mai in wt_positions), quindi non entrano
//    nel capitale dedicato, nei limiti di perdita, nel freno né nei risultati della strategia. clientId con prefisso 'wm'
//    (non 'wt'): per la strategia sono ordini e posizioni "non suoi", che non tocca mai (server/live.js, regola 1).
//  - Margine: solo il saldo libero = disponibile su Bitunix meno la parte del capitale dedicato del Reale non ancora
//    impegnata nelle posizioni della strategia (così la strategia trova sempre il suo capitale).
//  - Si apre solo se sul titolo non c'è nessuna posizione né ordine in attesa (di nessun tipo): con le posizioni in modalità
//    ONE_WAY un ordine si sommerebbe o ridurrebbe un'altra posizione. Nella finestra d'apertura della strategia
//    (9:00 → fine entrate, New York) non si apre sui titoli del Reale acceso, per non togliergli il titolo.
//  - Sempre margine isolato, impostato e riletto su Bitunix prima dell'ordine (ensureIsolated di live.js); se la posizione
//    nata dall'ordine non risulta isolata si chiude subito.
//  - Si chiudono solo posizioni registrate qui (per il loro positionId e la loro quantità): mai quelle della strategia.
//  - Niente stop loss (scelta di Lorenzo per lo scalping): il rischio massimo è il margine, la posizione è isolata.
import * as bx from './bitunix.js'
import { ensureIsolated, closeOurs, orderQty, LiveSkip } from './live.js'
import { db, q, getMeta, setMeta } from './db.js'
import { getCapital } from './capital.js'
import { getPairs } from './scanner.js'
import { nyInfo } from './session.js'
import { ASSET_MAP } from '../shared/assets.js'
import { settingsFor, isTradingDay } from '../shared/opening.js'
import { ENTRY_UNTIL } from '../shared/engine.js'

export const MANUAL_PREFIX = 'wm'
const KEY = 'manual:'
const wait = ms => D.wait(ms)
export const manualAllowed = () => process.env.LIVE_TRADING === 'on' && D.bx.hasKeys()

// Dipendenze sostituibili nelle prove (tests/manual.test.mjs usa un Bitunix e un database finti)
export const D = { bx, getPairs, getMeta, setMeta, strategyState: null, listTrades: null, wait: ms => new Promise(r => setTimeout(r, ms)) }
const api = () => D.bx
const nowMs = () => (D.now ? D.now() : Date.now())

export class ManualError extends Error { constructor(msg, status = 400) { super(msg); this.status = status } }

const keyOf = id => KEY + id
async function listTrades() {
  const rows = await q(db().from('wt_meta').select('key, value').like('key', `${KEY}%`).order('key', { ascending: false }).limit(300))
  return rows.map(r => r.value).filter(Boolean)
}
const saveTrade = t => D.setMeta(keyOf(t.id), t)

// Posizioni della strategia ancora aperte nel Reale e capitale dedicato non ancora impegnato
async function strategyState() {
  const [acc, open, ded] = await Promise.all([
    q(db().from('wt_accounts').select('enabled, settings').eq('mode', 'live').maybeSingle()),
    q(db().from('wt_positions').select('symbol, margin, exchange').eq('mode', 'live').eq('status', 'open')),
    getCapital('live').catch(() => null),
  ])
  const s = acc ? settingsFor('live', acc.settings) : null
  const used = open.reduce((x, p) => x + (+p.margin || 0), 0)
  const reserve = acc?.enabled && s?.capitalMode === 'dedicated' && ded?.current > 0 ? Math.max(0, ded.current - used) : 0
  return {
    enabled: !!acc?.enabled, symbols: new Set((acc?.enabled ? s?.symbols || [] : []).map(x => ASSET_MAP[x]?.perp).filter(Boolean)),
    openPerps: new Set(open.map(p => ASSET_MAP[p.symbol]?.perp).filter(Boolean)), reserve, used,
  }
}

// Dati per la scheda ordini: coppia (precisione, minimo, leva massima, scaglioni), saldo libero, blocchi
export async function manualInfo(perp) {
  const allowed = manualAllowed()
  const [pairs, tiers, st] = await Promise.all([D.getPairs(), D.bx.positionTiers(perp).catch(() => null), D.strategyState()])
  const pair = pairs.find(p => p.symbol === perp) || null
  let acc = null, accErr = null
  if (allowed) { try { acc = await D.bx.account() } catch (e) { accErr = e.message } }
  const info = D.nyInfo ? D.nyInfo() : nyInfo()
  return {
    allowed, perp,
    pair: pair && { maxLev: pair.maxLeverage, minQty: pair.minQty, basePrecision: pair.basePrecision, quotePrecision: pair.quotePrecision, api: pair.api },
    tiers: tiers?.length ? tiers : null,
    available: acc?.available ?? null, reserve: st.reserve, free: acc ? Math.max(0, acc.available - st.reserve) : null, accErr,
    strategyOpen: st.openPerps.has(perp),
    strategyWindow: windowBlock(perp, st, info),
  }
}

// Finestra d'apertura della strategia: niente manuali sui titoli del Reale acceso (dalle 9:00 alla fine delle entrate)
function windowBlock(perp, st, info) {
  if (!st.enabled || !st.symbols.has(perp)) return null
  if (!isTradingDay(info.date, info.isWeekday) || info.minutes < 540 || info.minutes > ENTRY_UNTIL) return null
  return `dalle 9:00 alle ${Math.floor(ENTRY_UNTIL / 60)}:${String(ENTRY_UNTIL % 60).padStart(2, '0')} di New York questo titolo è riservato alla strategia`
}

const clip = (s, n) => String(s ?? '').slice(0, n)
// Stato dello Stocastico RSI mandato dalla pagina: si tiene solo quello che serve, con limiti di dimensione
function cleanSnapshot(x) {
  const num = v => (Number.isFinite(+v) ? Math.round(+v * 10) / 10 : null)
  const tfs = {}
  for (const [tf, r] of Object.entries(x?.tfs || {}).slice(0, 10)) {
    if (!/^\d{1,2}[mhd]$/.test(tf)) continue
    tfs[tf] = {
      k: num(r?.k), d: num(r?.d), state: ['oversold', 'overbought', 'neutral'].includes(r?.state) ? r.state : null,
      cross: r?.cross ? { dir: r.cross.dir === 'up' ? 'up' : 'down', ago: Math.max(0, Math.min(9, Math.round(+r.cross.ago || 0))), inZone: !!r.cross.inZone } : null,
    }
  }
  const sg = x?.suggestion
  return {
    tfs,
    suggestion: { side: sg?.side === 1 || sg?.side === -1 ? sg.side : null, reason: clip(sg?.reason, 300), score: num(sg?.score) },
    params: x?.params && typeof x.params === 'object' ? Object.fromEntries(Object.entries(x.params).slice(0, 8).map(([k, v]) => [clip(k, 10), num(v)])) : null,
  }
}

// Apertura a mercato, senza stop loss. side 1 = long, -1 = short; margin in USDT; leverage intero.
export async function manualOpen({ symbol, side, leverage, margin, snapshot }) {
  if (!manualAllowed()) throw new ManualError('Ordini veri disattivati: servono LIVE_TRADING=on e le chiavi Bitunix', 403)
  const perp = String(symbol || '').toUpperCase()
  if (!/^[A-Z0-9]{2,24}$/.test(perp) || (side !== 1 && side !== -1)) throw new ManualError('Ordine non valido')
  const lev = Math.round(+leverage), mg = +margin
  if (!(lev >= 1 && lev <= 200)) throw new ManualError('Leva non valida')
  if (!(mg >= 1 && mg < 1e6)) throw new ManualError('Margine non valido (minimo 1 USDT)')

  const [pairs, st, acc, tiers, tick] = await Promise.all([D.getPairs(), D.strategyState(), D.bx.account(), D.bx.positionTiers(perp).catch(() => null), D.bx.tickers([perp])])
  const pair = pairs.find(p => p.symbol === perp)
  if (!pair) throw new ManualError(`${perp} non è una coppia aperta su Bitunix`)
  if (pair.api === false) throw new ManualError(`Bitunix non accetta ordini via API su ${perp}`)
  if (st.openPerps.has(perp)) throw new ManualError('La strategia ha una posizione aperta su questo titolo: non si apre niente qui')
  const wb = windowBlock(perp, st, D.nyInfo ? D.nyInfo() : nyInfo())
  if (wb) throw new ManualError(wb[0].toUpperCase() + wb.slice(1))
  const free = Math.max(0, acc.available - st.reserve)
  if (mg > free) throw new ManualError(`Margine oltre il saldo libero: ${free.toFixed(2)} USDT (disponibile ${acc.available.toFixed(2)}${st.reserve ? `, ${st.reserve.toFixed(2)} riservati alla strategia` : ''})`)
  const price = tick[perp]?.last || tick[perp]?.mark
  if (!(price > 0)) throw new ManualError('Prezzo non disponibile su Bitunix')
  const notional = mg * lev
  const tier = tiers?.find(t => notional >= t.start && notional < t.end) || tiers?.at(-1)
  const maxLev = Math.min(pair.maxLeverage || Infinity, tier?.lev || Infinity)
  if (lev > maxLev) throw new ManualError(`Leva ${lev}x oltre il massimo di Bitunix per questa posizione (${maxLev}x)`)
  const { qty, tooSmall } = orderQty(pair, notional, price)
  if (tooSmall) throw new ManualError(`Posizione troppo piccola: ${qty} sotto il minimo di Bitunix (${pair.minQty})`)

  // nessuna posizione e nessun ordine sul titolo (di nessun tipo)
  const [before, orders] = await Promise.all([D.bx.openPositions(perp), D.bx.pendingOrders(perp)])
  if (before.length) throw new ManualError('C\'è già una posizione aperta su questo titolo: chiudila prima')
  if (orders.length) throw new ManualError('C\'è un ordine in attesa su questo titolo: annullalo prima su Bitunix')

  try { await ensureIsolated(api(), perp, lev) } catch (e) { throw new ManualError(e instanceof LiveSkip ? e.message : `Margine o leva non impostabili: ${e.message}`) }

  const sentAt = nowMs()
  const clientId = `${MANUAL_PREFIX}${sentAt.toString(36)}`
  const order = await D.bx.openMarket({ symbol: perp, side, qty, clientId })
  const orderId = order?.orderId ? String(order.orderId) : null
  const snap = cleanSnapshot(snapshot)
  const base = { id: String(sentAt), perp, side, leverage: lev, margin: mg, qty, priceAtSend: price, openedAt: sentAt, orderId, clientId, snapshot: snap, choice: side }

  // posizione nata dall'ordine: positionId nuovo, stesso lato, creata dopo l'invio
  let pos = null, cands = []
  for (let i = 0; i < 8 && !pos; i++) {
    if (i) await wait(350)
    const list = await D.bx.openPositions(perp).catch(() => [])
    cands = list.filter(x => x.side === side && (!x.ctime || x.ctime >= sentAt - 2000))
    if (cands.length === 1) pos = cands[0]
    if (cands.length > 1) break
  }
  if (!pos) {
    const t = { ...base, status: 'unknown', note: cands.length > 1 ? 'più posizioni nuove sul titolo' : 'posizione non trovata dopo l\'ordine' }
    await saveTrade(t)
    throw new ManualError(`Ordine inviato ma ${t.note}: controlla su Bitunix`, 502)
  }
  const t = {
    ...base, status: 'open', positionId: String(pos.positionId), qty: pos.qty || qty, entry: pos.entry || price,
    liqPrice: pos.liqPrice, marginMode: pos.marginMode || 'ISOLATION', margin: +pos.raw?.margin || mg, fillAt: pos.ctime || nowMs(),
  }
  if (pos.marginMode && pos.marginMode !== 'ISOLATION') {
    await closeOurs(api(), { perp, positionId: t.positionId, side, qty: t.qty, step: 10 ** -pair.basePrecision }).catch(() => {})
    await saveTrade(t); await finishClose(t, 'non isolata: chiusa subito')
    throw new ManualError(`La posizione risultava in margine ${pos.marginMode}: chiusa subito`, 502)
  }
  await saveTrade(t)
  return t
}

// Risultato vero dallo storico di Bitunix (con qualche tentativo: arriva dopo qualche istante)
async function finishClose(t, reason, { tries = 3 } = {}) {
  let h = null
  for (let i = 0; i < tries && !h; i++) { if (i) await wait(600); h = await D.bx.positionHistory(t.perp, t.positionId).catch(() => null) }
  const now = nowMs()
  const exit = h?.closePrice ?? t.exitEst ?? null
  const fee = h?.fee !== null && h?.fee !== undefined ? Math.abs(h.fee) : null
  const funding = h?.funding ?? null
  const gross = exit ? t.side * (exit - t.entry) * t.qty : null
  // come la strategia: (uscita − entrata) × quantità − commissioni vere (+ funding); realizedPNL di Bitunix se manca il resto
  const pnl = gross !== null && fee !== null ? gross - fee + (funding || 0) : (h?.realizedPNL ?? null)
  Object.assign(t, {
    status: 'closed', reason: t.reason || reason, closedAt: t.closedAt || now, exit, fee, funding, pnl,
    pnlPct: pnl !== null && t.margin ? pnl / t.margin * 100 : null, durationMs: (t.closedAt || now) - (t.fillAt || t.openedAt),
    final: !!h, liquidated: !!(h?.liqQty > 0),
  })
  if (t.liquidated) t.reason = 'liquidazione'
  await saveTrade(t)
  return t
}

// Chiusura a mercato di una posizione manuale (solo quelle registrate qui)
export async function manualClose(id) {
  if (!manualAllowed()) throw new ManualError('Ordini veri disattivati: servono LIVE_TRADING=on e le chiavi Bitunix', 403)
  const t = await D.getMeta(keyOf(String(id)))
  if (!t || !t.positionId) throw new ManualError('Posizione manuale non trovata', 404)
  if (t.status !== 'open') throw new ManualError('Posizione già chiusa')
  const tick = await D.bx.tickers([t.perp]).catch(() => ({}))
  t.exitEst = tick[t.perp]?.last || null
  t.closedAt = nowMs()
  const r = await closeOurs(api(), { perp: t.perp, positionId: t.positionId, side: t.side, qty: t.qty })
  return finishClose(t, r.gone ? 'già chiusa su Bitunix' : 'chiusa da te')
}

// Posizioni aperte (con il risultato in tempo reale) e storico. Le posizioni sparite da Bitunix (chiuse sull'app di
// Bitunix o liquidate) si segnano chiuse con i dati veri; i risultati non ancora definitivi si ricompletano.
export async function manualPositions() {
  const all = await D.listTrades()
  const open = all.filter(t => t.status === 'open')
  let live = null, err = null, prices = {}
  if (open.length && manualAllowed()) {
    try {
      ;[live, prices] = await Promise.all([D.bx.openPositions(), D.bx.tickers([...new Set(open.map(t => t.perp))]).catch(() => ({}))])
    } catch (e) { err = e.message }
  }
  const out = []
  for (const t of open) {
    if (!live) { out.push({ ...t, upnl: null }); continue }
    const p = live.find(x => String(x.positionId) === String(t.positionId))
    if (!p) {
      // sparita da Bitunix: chiusa solo dopo due letture di fila senza (una lettura vuota per errore non chiude niente)
      t.missing = (t.missing || 0) + 1
      if (t.missing >= 2) { t.exitEst = prices[t.perp]?.last || null; await finishClose(t, 'chiusa fuori dall\'app', { tries: 2 }); continue }
      await saveTrade(t); out.push({ ...t, upnl: null }); continue
    }
    if (t.missing) { t.missing = 0; await saveTrade(t) }
    const upnl = Number.isFinite(+p.raw?.unrealizedPNL) ? +p.raw.unrealizedPNL : (prices[t.perp]?.last ? t.side * (prices[t.perp].last - t.entry) * t.qty : null)
    const margin = +p.raw?.margin || t.margin
    out.push({ ...t, qty: p.qty, liqPrice: p.liqPrice ?? t.liqPrice, last: prices[t.perp]?.last ?? null, upnl, upnlPct: upnl !== null && margin ? upnl / margin * 100 : null, marginNow: margin })
  }
  // risultati provvisori (storico di Bitunix non ancora pronto): un nuovo tentativo, al massimo per un'ora
  for (const t of all.filter(x => x.status === 'closed' && !x.final && (x.retries || 0) < 6 && nowMs() - x.closedAt < 3600000).slice(0, 2)) {
    t.retries = (t.retries || 0) + 1
    await finishClose(t, t.reason, { tries: 1 })
  }
  const history = all.filter(t => t.status !== 'open').slice(0, 100)
  return { allowed: manualAllowed(), open: out, history, error: err, at: nowMs() }
}

D.strategyState = strategyState
D.listTrades = listTrades
