// RSI · Prova: ordini manuali con capitale fittizio. Stesso pannello e stesso diario degli ordini veri (server/manual.js), ma
// nessun ordine parte: si eseguono al prezzo di Bitunix di quel momento (dati pubblici, servono solo il codice di controllo,
// non le chiavi Bitunix), con commissione a mercato (0,06% per lato), slittamento (0,05% per lato) e liquidazione simulata in
// margine isolato (si perde il margine). Indipendente da tutto il resto: conto in wt_meta `manualp:account`
// ({ start, balance, epoch, startAt, curve }), trade in `manualp:t:<ora d'apertura>`. Azzerare apre un nuovo conto (epoch).
import * as bx from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { getPairs } from './scanner.js'
import { orderQty } from './live.js'
import { ManualError } from './manual.js'
import { liqPriceOf } from '../shared/opening.js'

export const PAPER = { fee: 0.06, slip: 0.05, liqFee: 0.1 }
const ACC = 'manualp:account', KEY = 'manualp:t:'
const LIQ_CHECK = 30000 // ogni 30 secondi si guardano le candele da 1 minuto per la liquidazione

async function getAccount(now = Date.now()) {
  return (await getMeta(ACC)) || { start: 300, balance: 300, epoch: 1, startAt: now, curve: [{ t: now, balance: 300 }] }
}
async function listTrades() {
  const rows = await q(db().from('wt_meta').select('key, value').like('key', `${KEY}%`).order('key', { ascending: false }).limit(500))
  return rows.map(r => r.value).filter(Boolean)
}
const saveTrade = t => setMeta(KEY + t.id, t)
const tierFor = (tiers, notional) => tiers?.find(t => notional >= t.start && notional < t.end) || tiers?.at(-1) || null

export async function paperInfo(perp) {
  const [pairs, tiers, acc, all] = await Promise.all([getPairs(), bx.positionTiers(perp).catch(() => null), getAccount(), listTrades()])
  const pair = pairs.find(p => p.symbol === perp) || null
  const used = all.filter(t => t.status === 'open' && t.epoch === acc.epoch).reduce((s, t) => s + t.margin, 0)
  return {
    allowed: true, paper: true, perp,
    pair: pair && { maxLev: pair.maxLeverage, minQty: pair.minQty, basePrecision: pair.basePrecision, quotePrecision: pair.quotePrecision, api: true },
    tiers: tiers?.length ? tiers : null, available: acc.balance, reserve: 0, free: Math.max(0, acc.balance - used),
    strategyOpen: false, strategyWindow: null,
  }
}

export async function paperOpen({ symbol, side, leverage, margin, snapshot }, now = Date.now()) {
  const perp = String(symbol || '').toUpperCase()
  if (!/^[A-Z0-9]{2,24}$/.test(perp) || (side !== 1 && side !== -1)) throw new ManualError('Ordine non valido')
  const lev = Math.round(+leverage), mg = +margin
  if (!(lev >= 1 && lev <= 200)) throw new ManualError('Leva non valida')
  if (!(mg >= 1 && mg < 1e7)) throw new ManualError('Margine non valido (minimo 1 USDT)')
  const [pairs, tiers, tick, acc, all] = await Promise.all([getPairs(), bx.positionTiers(perp).catch(() => null), bx.tickers([perp]), getAccount(now), listTrades()])
  const pair = pairs.find(p => p.symbol === perp)
  if (!pair) throw new ManualError(`${perp} non è una coppia aperta su Bitunix`)
  const open = all.filter(t => t.status === 'open' && t.epoch === acc.epoch)
  if (open.some(t => t.perp === perp)) throw new ManualError('Hai già una posizione di prova su questo titolo: chiudila prima')
  const free = acc.balance - open.reduce((s, t) => s + t.margin, 0)
  if (mg > free) throw new ManualError(`Margine oltre il capitale di prova libero: ${free.toFixed(2)} USDT`)
  const price = tick[perp]?.last || tick[perp]?.mark
  if (!(price > 0)) throw new ManualError('Prezzo non disponibile su Bitunix')
  const notional = mg * lev, tier = tierFor(tiers, notional)
  const maxLev = Math.min(pair.maxLeverage || Infinity, tier?.lev || Infinity)
  if (lev > maxLev) throw new ManualError(`Leva ${lev}x oltre il massimo di Bitunix per questa posizione (${maxLev}x)`)
  const entry = price * (1 + side * PAPER.slip / 100)
  const { qty, tooSmall } = orderQty(pair, notional, entry)
  if (tooSmall) throw new ManualError(`Posizione troppo piccola: ${qty} sotto il minimo di Bitunix (${pair.minQty})`)
  const t = {
    id: String(now), mode: 'paper', epoch: acc.epoch, perp, side, leverage: lev, margin: mg, qty, entry, priceAtSend: price,
    feeIn: qty * entry * PAPER.fee / 100, liqPrice: liqPriceOf({ side, entry, qty, margin: mg }, tier?.mmr ?? 0.005, PAPER.liqFee),
    openedAt: now, fillAt: now, liqCheckAt: now, status: 'open', snapshot: snapshot && typeof snapshot === 'object' ? JSON.parse(JSON.stringify(snapshot).slice(0, 20000)) : null, choice: side,
  }
  await saveTrade(t)
  return t
}

async function closeTrade(t, { px = null, reason, liquidated = false, now = Date.now() }) {
  const acc = await getAccount(now)
  const exit = liquidated ? t.liqPrice : px * (1 - t.side * PAPER.slip / 100)
  const feeOut = liquidated ? 0 : t.qty * exit * PAPER.fee / 100
  const gross = t.side * (exit - t.entry) * t.qty
  const pnl = liquidated ? -t.margin - t.feeIn : gross - t.feeIn - feeOut
  Object.assign(t, { status: 'closed', exit, fee: t.feeIn + feeOut, funding: null, pnl, pnlPct: pnl / t.margin * 100, closedAt: now, durationMs: now - t.openedAt, reason, liquidated, final: true })
  await saveTrade(t)
  if (t.epoch === acc.epoch) {
    acc.balance = Math.max(0, acc.balance + pnl)
    acc.curve = [...(acc.curve || []), { t: now, balance: acc.balance }].slice(-500)
    await setMeta(ACC, acc)
  }
  return t
}

export async function paperClose(id, now = Date.now()) {
  const t = await getMeta(KEY + String(id))
  if (!t) throw new ManualError('Posizione di prova non trovata', 404)
  if (t.status !== 'open') throw new ManualError('Posizione già chiusa')
  const tick = await bx.tickers([t.perp])
  const px = tick[t.perp]?.last || tick[t.perp]?.mark
  if (!(px > 0)) throw new ManualError('Prezzo non disponibile su Bitunix')
  const liq = t.liqPrice && t.side * (px - t.liqPrice) <= 0
  return closeTrade(t, { px, reason: liq ? 'liquidazione' : 'chiusa da te', liquidated: liq, now })
}

export async function paperPositions(now = Date.now()) {
  const [acc, all] = await Promise.all([getAccount(now), listTrades()])
  const open = all.filter(t => t.status === 'open' && t.epoch === acc.epoch)
  let prices = {}
  if (open.length) prices = await bx.tickers([...new Set(open.map(t => t.perp))]).catch(() => ({}))
  const out = []
  for (const t of open) {
    const last = prices[t.perp]?.last || null
    // liquidazione simulata: prezzo attuale, e ogni 30 secondi minimi/massimi delle candele da 1 minuto dall'ultimo controllo
    let hit = last !== null && t.liqPrice && t.side * (last - t.liqPrice) <= 0
    if (!hit && t.liqPrice && now - (t.liqCheckAt || t.openedAt) > LIQ_CHECK) {
      const bars = await bx.klines(t.perp, '1m', 200, { startTime: t.liqCheckAt || t.openedAt }).catch(() => null)
      if (bars) {
        hit = bars.some(b => (t.side > 0 ? b.l : b.h) * t.side <= t.liqPrice * t.side)
        t.liqCheckAt = now; if (!hit) await saveTrade(t)
      }
    }
    if (hit) { await closeTrade(t, { reason: 'liquidazione', liquidated: true, now }); continue }
    const upnl = last !== null ? t.side * (last - t.entry) * t.qty - t.feeIn : null
    out.push({ ...t, last, upnl, upnlPct: upnl !== null ? upnl / t.margin * 100 : null })
  }
  const acc2 = open.length !== out.length ? await getAccount(now) : acc
  const history = (await listTrades()).filter(t => t.status !== 'open' && t.epoch === acc2.epoch).slice(0, 200)
  return { allowed: true, paper: true, account: acc2, open: out, history, at: now }
}

export async function paperReset(capital, now = Date.now()) {
  const c = +capital
  if (!(c >= 10 && c < 1e9)) throw new ManualError('Capitale di prova non valido (minimo 10 USDT)')
  const acc = await getAccount(now)
  for (const t of (await listTrades()).filter(x => x.status === 'open')) { t.status = 'azzerato'; t.closedAt = now; await saveTrade(t) }
  const next = { start: c, balance: c, epoch: (acc.epoch || 1) + 1, startAt: now, curve: [{ t: now, balance: c }] }
  await setMeta(ACC, next)
  return next
}
