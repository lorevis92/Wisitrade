// Operazioni vere su Bitunix per il Reale. Regole di sicurezza (non toglierle):
//  1. Le posizioni manuali non si toccano mai. Prima di aprire si guarda il titolo su Bitunix: se c'è una posizione che non è
//     della strategia, o un ordine in attesa che non è della strategia, il trade si salta (senza cambiare leva o margine).
//  2. La posizione della strategia si riconosce con certezza: è quella con un positionId che prima dell'ordine non c'era,
//     sullo stesso titolo e lato, creata dopo l'invio dell'ordine. Il suo positionId si salva e da lì in poi si usa solo quello:
//     chiusure, metà posizione e stop loss sono sempre per quel positionId e per la quantità della strategia.
//  3. Margine sempre isolato: prima dell'ordine si imposta e si RILEGGE da Bitunix; se non risulta isolato (o la leva non è
//     quella giusta) non si apre e si avvisa. Dopo l'apertura si controlla anche la posizione: se non è isolata si chiude subito.
//  4. Stop loss su Bitunix solo sulla posizione della strategia: va DENTRO l'ordine d'apertura (slPrice) e dopo l'apertura
//     si verifica che ci sia davvero (tpsl/get_pending_orders di quel positionId). Se non c'è si prova con la chiamata tpsl
//     separata; se non si riesce la posizione della strategia si chiude subito (mai posizioni senza stop su Bitunix) e il
//     titolo viene segnato come "stop non accettato via API" (LiveSkip con noSl).
// Le funzioni di Bitunix arrivano da fuori (api), così questo modulo si può provare con un Bitunix finto (scratchpad).
import { roundQty } from './bitunix.js'

const wait = ms => new Promise(r => setTimeout(r, ms))
export const CLIENT_PREFIX = 'wt'
const isOurOrder = o => (o.clientId || '').startsWith(CLIENT_PREFIX)

export class LiveSkip extends Error {
  // notify = va mandata una notifica (es. margine isolato non verificabile); altrimenti è solo un titolo scartato
  // noSl = posizione chiusa perché Bitunix non ha accettato lo stop loss (il titolo va segnato come non operabile)
  constructor(msg, { notify = false, noSl = false } = {}) { super(msg); this.skip = true; this.notify = notify; this.noSl = noSl }
}

const round = (x, prec) => (prec !== null && prec !== undefined ? Number(x.toFixed(prec)) : Number(x.toPrecision(6)))

// Controllo della quantità minima, prima di qualunque chiamata a Bitunix
export function orderQty(pair, notional, price) {
  const qty = roundQty(notional / price, pair.basePrecision)
  if (!(qty > 0) || qty < (pair.minQty || 0)) return { qty, tooSmall: true }
  return { qty, tooSmall: false }
}

// Margine isolato e leva: si impostano solo se servono, poi si rileggono. Qui si arriva solo se sul titolo non ci sono
// posizioni od ordini (quindi non si cambia niente di una posizione manuale).
export async function ensureIsolated(api, perp, leverage) {
  let cur
  try { cur = await api.leverageMarginMode(perp) } catch (e) { throw new LiveSkip(`margine non verificabile su Bitunix (${e.message})`, { notify: true }) }
  if (cur.marginMode !== 'ISOLATION') {
    let setErr = null
    await api.setIsolated(perp).catch(e => { setErr = e })
    try { cur = await api.leverageMarginMode(perp) } catch (e) { throw new LiveSkip(`margine non verificabile su Bitunix (${e.message})`, { notify: true }) }
    if (cur.marginMode !== 'ISOLATION') throw new LiveSkip(`margine isolato non impostabile su Bitunix (risulta ${cur.marginMode || 'sconosciuto'}${setErr ? `: ${setErr.message}` : ''})`, { notify: true })
  }
  if (cur.leverage !== leverage) {
    await api.setLeverage(perp, leverage).catch(() => {})
    try { cur = await api.leverageMarginMode(perp) } catch (e) { throw new LiveSkip(`leva non verificabile su Bitunix (${e.message})`, { notify: true }) }
    if (cur.leverage !== leverage) throw new LiveSkip(`leva ${leverage}x non impostabile su Bitunix (risulta ${cur.leverage}x)`, { notify: true })
    if (cur.marginMode !== 'ISOLATION') throw new LiveSkip('margine non più isolato dopo il cambio di leva', { notify: true })
  }
  return cur
}

// Apertura. ourIds = positionId delle posizioni della strategia ancora aperte (dal database).
// Restituisce i dati della posizione oppure lancia LiveSkip (trade saltato, con il motivo).
export async function openLive(api, { perp, pair, side, notional, price, leverage, stopDist, ourIds, clientId, now = Date.now }) {
  // 1. quantità minima (nessuna chiamata a Bitunix se è troppo piccola)
  const { qty, tooSmall } = orderQty(pair, notional, price)
  if (tooSmall) throw new LiveSkip(`ordine troppo piccolo: ${qty} sotto il minimo di Bitunix (${pair.minQty})`)

  // 2. sul titolo non ci devono essere posizioni né ordini in attesa che non sono della strategia
  const before = await api.openPositions(perp)
  const manual = before.filter(x => !ourIds.has(String(x.positionId)))
  if (manual.length) throw new LiveSkip('hai una posizione aperta su questo titolo: la strategia non lo tocca (né leva né margine)')
  if (before.length) throw new LiveSkip('la strategia ha già una posizione aperta su questo titolo')
  const orders = await api.pendingOrders(perp)
  if (orders.some(o => !isOurOrder(o))) throw new LiveSkip('hai un ordine in attesa su questo titolo: la strategia non lo tocca')

  // 3. margine isolato e leva, verificati su Bitunix
  await ensureIsolated(api, perp, leverage)

  // 4. ordine a mercato con lo stop loss dentro l'ordine (dal prezzo attuale; dopo l'esecuzione si sposta su quello eseguito)
  const sentAt = now()
  const slAtt = round(price - side * stopDist, pair.quotePrecision)
  const order = await api.openMarket({ symbol: perp, side, qty, clientId, slPrice: slAtt })
  const orderId = order?.orderId ? String(order.orderId) : null

  // 5. la posizione nata da questo ordine: positionId nuovo, stesso lato, creata dopo l'invio
  const beforeIds = new Set(before.map(x => String(x.positionId)))
  let pos = null, candidates = []
  for (let i = 0; i < 6 && !pos; i++) {
    if (i) await wait(400)
    const list = await api.openPositions(perp).catch(() => [])
    candidates = list.filter(x => !beforeIds.has(String(x.positionId)) && x.side === side && (!x.ctime || x.ctime >= sentAt - 2000))
    if (candidates.length === 1) pos = candidates[0]
    if (candidates.length > 1) break
  }
  if (!pos) {
    // ordine inviato ma posizione non riconoscibile con certezza: non si tocca niente, si avvisa
    return { unidentified: true, orderId, qty, sentAt, why: candidates.length > 1 ? 'più posizioni nuove sul titolo' : 'posizione non trovata dopo l\'ordine' }
  }
  const positionId = String(pos.positionId)
  const ourQty = pos.qty || qty

  // 6. la posizione deve risultare isolata: altrimenti si chiude subito (è tutta della strategia: è nuova)
  if (pos.marginMode && pos.marginMode !== 'ISOLATION') {
    await closeOurs(api, { perp, positionId, side, qty: ourQty, step: pair.step })
    throw new LiveSkip(`la posizione risultava in margine ${pos.marginMode}: chiusa subito`, { notify: true })
  }

  // 7. stop loss di sicurezza solo su questa posizione: si verifica quello messo nell'ordine, altrimenti chiamata separata
  const entry = pos.entry || price
  const slPrice = round(entry - side * stopDist, pair.quotePrecision)
  const sl = await secureStop(api, { perp, positionId, slPrice, qty: ourQty, tick: 10 ** -(pair.quotePrecision ?? 6) })
  if (!sl.ok) {
    await closeOurs(api, { perp, positionId, side, qty: ourQty, step: pair.step }).catch(() => {})
    throw new LiveSkip(`stop loss non impostabile su Bitunix (${sl.why}): posizione chiusa subito`, { notify: true, noSl: true })
  }
  const slOrderId = sl.id
  return {
    qty: ourQty, entry, liqPrice: pos.liqPrice || null, leverage,
    exchange: { orderId, clientId, positionId, slOrderId, sl: sl.price, slVia: sl.via, sentAt, fillAt: pos.ctime || now(), marginMode: pos.marginMode || 'ISOLATION', positionMode: pos.raw?.positionMode || null },
  }
}

// Stop loss della posizione: { ok, id, price, via: 'ordine' | 'tpsl', why }.
// 1. stop messo nell'ordine: si cerca tra gli stop attivi di quel positionId (qualche tentativo, Bitunix può metterci un attimo);
//    se il prezzo è diverso da quello calcolato sul prezzo eseguito si prova a spostarlo (se non si riesce resta quello dell'ordine).
// 2. se non c'è (o non si può leggere): chiamata tpsl separata, solo per questo positionId e la sua quantità.
export async function secureStop(api, { perp, positionId, slPrice, qty, tick }) {
  let found = null, readErr = null
  if (api.pendingStopLoss) {
    for (let i = 0; i < 3 && !found; i++) {
      if (i) await wait(400)
      try { found = (await api.pendingStopLoss(perp, positionId))[0] || null; readErr = null } catch (e) { readErr = e }
    }
  }
  if (found) {
    let price = found.slPrice
    if (Math.abs(price - slPrice) > tick / 2 && api.modifyStopLoss) {
      try { await api.modifyStopLoss({ orderId: found.id, slPrice, qty }); price = slPrice } catch { /* resta lo stop dell'ordine */ }
    }
    return { ok: true, id: found.id, price, via: 'ordine' }
  }
  try {
    const r = await api.placeStopLoss({ symbol: perp, positionId, slPrice, qty })
    return { ok: true, id: r?.orderId ? String(r.orderId) : null, price: slPrice, via: 'tpsl' }
  } catch (e) {
    return { ok: false, why: readErr ? `stop non verificabile: ${readErr.message}; chiamata separata: ${e.message}` : e.message }
  }
}

// Chiude SOLO la quantità della strategia della posizione positionId. Se la posizione è tutta della strategia
// (quantità uguale) usa la chiusura immediata di quella posizione; se è più grande (si è unita a qualcos'altro)
// chiude a mercato solo la quantità della strategia, in riduzione. Non cerca mai altre posizioni.
export async function closeOurs(api, { perp, positionId, side, qty, step = 0 }) {
  const list = await api.openPositions(perp)
  const pos = list.find(x => String(x.positionId) === String(positionId))
  if (!pos) return { gone: true }
  const tol = Math.max(step || 0, pos.qty * 1e-6)
  if (pos.qty <= qty + tol) { await api.closePosition(positionId); return { closed: pos.qty } }
  return closePart(api, { perp, positionId, side, qty, pos })
}

// Chiusura di una parte della posizione positionId, con verifica che la quantità sia scesa di quanto chiesto.
// reduceOnly: anche se Bitunix interpretasse il lato al contrario, l'ordine non può aprire niente.
export async function closePart(api, { perp, positionId, side, qty, pos }) {
  const start = pos || (await api.openPositions(perp)).find(x => String(x.positionId) === String(positionId))
  if (!start) throw new Error('posizione non trovata')
  for (const dir of [side, -side]) { // documentazione Bitunix (hedge): side = lato della posizione; poi l'altro, sempre in riduzione
    try { await api.closePartial({ symbol: perp, positionId, side: dir, qty }) } catch { continue }
    await wait(500)
    const cur = (await api.openPositions(perp)).find(x => String(x.positionId) === String(positionId))
    if (!cur) return { closed: start.qty }
    if (cur.qty < start.qty - qty / 2) return { closed: start.qty - cur.qty, left: cur.qty }
  }
  throw new Error('chiusura parziale rifiutata da Bitunix')
}
