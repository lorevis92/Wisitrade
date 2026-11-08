// Prova di server/live.js contro un Bitunix finto (modalità HEDGE come da documentazione API):
// una posizione per titolo e per lato (gli ordini nello stesso lato si sommano alla stessa posizione), margine e leva per titolo
// modificabili solo se sul titolo non ci sono posizioni né ordini, chiusure per positionId, reduceOnly che non apre mai niente.
import assert from 'node:assert/strict'
import { openLive, closeOurs, closePart, LiveSkip, orderQty } from '../server/live.js'

function fakeBitunix({ marginMode = 'CROSS', leverage = 10, failSetIsolated = false, failSL = false, failRead = false, notIsolatedPosition = false, wrongSideClose = false } = {}) {
  let idSeq = 1000, t = 1_800_000_000_000
  const ex = {
    calls: [], positions: [], orders: [], tpsl: [], settings: {},
    now: () => t,
  }
  const log = (name, args) => ex.calls.push({ name, args })
  const set = sym => (ex.settings[sym] ||= { marginMode, leverage })
  const busy = sym => ex.positions.some(p => p.symbol === sym) || ex.orders.some(o => o.symbol === sym)
  ex.api = {
    openPositions: async sym => { log('openPositions', sym); return ex.positions.filter(p => !sym || p.symbol === sym).map(p => ({ ...p })) },
    pendingOrders: async sym => { log('pendingOrders', sym); return ex.orders.filter(o => o.symbol === sym).map(o => ({ ...o })) },
    leverageMarginMode: async sym => { log('leverageMarginMode', sym); if (failRead) throw new Error('timeout'); return { ...set(sym) } },
    setIsolated: async sym => { log('setIsolated', sym); if (failSetIsolated || busy(sym)) throw new Error('Existing positions or orders'); set(sym).marginMode = 'ISOLATION' },
    setLeverage: async (sym, lev) => { log('setLeverage', [sym, lev]); if (busy(sym)) throw new Error('Existing positions or orders'); set(sym).leverage = lev },
    openMarket: async ({ symbol, side, qty, clientId }) => {
      log('openMarket', { symbol, side, qty, clientId }); t += 500
      const s = set(symbol)
      const cur = ex.positions.find(p => p.symbol === symbol && p.side === side)
      if (cur) { cur.qty += qty } // HEDGE: stesso lato = stessa posizione
      else ex.positions.push({ positionId: String(++idSeq), symbol, side, qty, entry: 100.1, liqPrice: 80, marginMode: notIsolatedPosition ? 'CROSS' : s.marginMode, leverage: s.leverage, ctime: t })
      return { orderId: String(++idSeq), clientId }
    },
    placeStopLoss: async ({ symbol, positionId, slPrice, qty }) => { log('placeStopLoss', { symbol, positionId, slPrice, qty }); if (failSL) throw new Error('rifiutato'); const id = String(++idSeq); ex.tpsl.push({ id, positionId, slPrice, qty }); return { orderId: id } },
    closePosition: async positionId => { log('closePosition', positionId); ex.positions = ex.positions.filter(p => p.positionId !== String(positionId)) },
    closePartial: async ({ symbol, positionId, side, qty }) => {
      log('closePartial', { symbol, positionId, side, qty })
      const p = ex.positions.find(x => x.positionId === String(positionId))
      if (!p) throw new Error('position not exist')
      // documentazione: in hedge per chiudere un long si manda BUY + CLOSE; con wrongSideClose il finto accetta solo il lato opposto
      const okSide = wrongSideClose ? -p.side : p.side
      if (side !== okSide) throw new Error('side error')
      p.qty = +(p.qty - Math.min(qty, p.qty)).toFixed(8)
      if (p.qty <= 0) ex.positions = ex.positions.filter(x => x !== p)
    },
  }
  return ex
}
const PAIR = { symbol: 'NVDAUSDT', basePrecision: 2, minQty: 0.01, quotePrecision: 2, step: 0.01 }
const base = ex => ({ perp: 'NVDAUSDT', pair: PAIR, side: 1, notional: 150, price: 100, leverage: 5, stopDist: 2, ourIds: new Set(), clientId: 'wt123NVDA', now: ex.now })
const writes = ex => ex.calls.filter(c => !['openPositions', 'pendingOrders', 'leverageMarginMode'].includes(c.name)).map(c => c.name)
const results = []
const test = async (name, fn) => { try { await fn(); results.push(['OK', name]) } catch (e) { results.push(['ERRORE', name + ' · ' + e.message]) } }

await test('posizione manuale sul titolo: trade saltato, nessuna modifica (né leva, né margine, né ordini)', async () => {
  const ex = fakeBitunix()
  ex.positions.push({ positionId: '1', symbol: 'NVDAUSDT', side: 1, qty: 3, marginMode: 'CROSS', leverage: 10, ctime: 1 })
  await assert.rejects(openLive(ex.api, base(ex)), e => e instanceof LiveSkip && /posizione aperta/.test(e.message) && !e.notify)
  assert.deepEqual(writes(ex), [])
  assert.deepEqual(ex.settings.NVDAUSDT ?? null, null)
  assert.equal(ex.positions[0].qty, 3)
})
await test('posizione manuale nel lato opposto: trade saltato, nessuna modifica', async () => {
  const ex = fakeBitunix()
  ex.positions.push({ positionId: '1', symbol: 'NVDAUSDT', side: -1, qty: 3, marginMode: 'ISOLATION', leverage: 5, ctime: 1 })
  await assert.rejects(openLive(ex.api, base(ex)), e => e instanceof LiveSkip)
  assert.deepEqual(writes(ex), [])
})
await test('ordine manuale in attesa sul titolo: trade saltato, nessuna modifica', async () => {
  const ex = fakeBitunix()
  ex.orders.push({ orderId: '9', symbol: 'NVDAUSDT', clientId: 'manuale', side: 'BUY', qty: 1 })
  await assert.rejects(openLive(ex.api, base(ex)), e => e instanceof LiveSkip && /ordine in attesa/.test(e.message))
  assert.deepEqual(writes(ex), [])
})
await test('quantità sotto il minimo: trade saltato senza nessuna chiamata a Bitunix', async () => {
  const ex = fakeBitunix()
  await assert.rejects(openLive(ex.api, { ...base(ex), notional: 0.5 }), e => e instanceof LiveSkip && /troppo piccolo/.test(e.message) && !e.notify)
  assert.equal(ex.calls.length, 0)
  assert.equal(orderQty(PAIR, 0.5, 100).tooSmall, true)
})
await test('margine cross: impostato isolato e leva 5x, verificati, poi ordine e stop loss solo su quella posizione', async () => {
  const ex = fakeBitunix({ marginMode: 'CROSS', leverage: 10 })
  const r = await openLive(ex.api, base(ex))
  assert.deepEqual(writes(ex), ['setIsolated', 'setLeverage', 'openMarket', 'placeStopLoss'])
  assert.equal(ex.settings.NVDAUSDT.marginMode, 'ISOLATION')
  assert.equal(ex.positions.length, 1)
  assert.equal(r.exchange.positionId, ex.positions[0].positionId)
  assert.equal(ex.tpsl[0].positionId, r.exchange.positionId)
  assert.equal(ex.tpsl[0].qty, 1.5)
  assert.equal(ex.tpsl[0].slPrice, 98.1) // dal prezzo eseguito 100,1 − 2
})
await test('margine non impostabile: niente ordine, notifica', async () => {
  const ex = fakeBitunix({ failSetIsolated: true })
  await assert.rejects(openLive(ex.api, base(ex)), e => e instanceof LiveSkip && e.notify && /isolato/.test(e.message))
  assert.ok(!writes(ex).includes('openMarket'))
})
await test('margine non verificabile (lettura che fallisce): niente ordine, notifica', async () => {
  const ex = fakeBitunix({ failRead: true })
  await assert.rejects(openLive(ex.api, base(ex)), e => e instanceof LiveSkip && e.notify)
  assert.deepEqual(writes(ex), [])
})
await test('posizione risultata non isolata: chiusa subito solo lei, notifica', async () => {
  const ex = fakeBitunix({ marginMode: 'ISOLATION', leverage: 5, notIsolatedPosition: true })
  await assert.rejects(openLive(ex.api, base(ex)), e => e instanceof LiveSkip && e.notify)
  assert.equal(ex.positions.length, 0)
})
await test('stop loss non impostabile: la posizione della strategia si chiude subito, notifica', async () => {
  const ex = fakeBitunix({ marginMode: 'ISOLATION', leverage: 5, failSL: true })
  await assert.rejects(openLive(ex.api, base(ex)), e => e instanceof LiveSkip && e.notify && /stop loss/.test(e.message))
  assert.equal(ex.positions.length, 0)
})
await test('chiusura: posizione tutta della strategia → chiusura di quella posizione (per positionId)', async () => {
  const ex = fakeBitunix({ marginMode: 'ISOLATION', leverage: 5 })
  const r = await openLive(ex.api, base(ex))
  ex.positions.push({ positionId: '77', symbol: 'AAPLUSDT', side: 1, qty: 2, ctime: 1 }) // manuale su un altro titolo
  await closeOurs(ex.api, { perp: 'NVDAUSDT', positionId: r.exchange.positionId, side: 1, qty: r.qty, step: 0.01 })
  assert.deepEqual(ex.positions.map(p => p.positionId), ['77'])
  assert.deepEqual(ex.calls.filter(c => c.name === 'closePosition').map(c => c.args), [r.exchange.positionId])
})
await test('chiusura: posizione unita a una manuale (stesso titolo e lato) → chiude SOLO la quantità della strategia', async () => {
  const ex = fakeBitunix({ marginMode: 'ISOLATION', leverage: 5 })
  const r = await openLive(ex.api, base(ex))
  ex.positions[0].qty += 4 // l'utente apre a mano nello stesso lato dopo la strategia: Bitunix unisce le posizioni
  await closeOurs(ex.api, { perp: 'NVDAUSDT', positionId: r.exchange.positionId, side: 1, qty: r.qty, step: 0.01 })
  assert.equal(ex.positions.length, 1)
  assert.equal(ex.positions[0].qty, 4)
  assert.ok(!ex.calls.some(c => c.name === 'closePosition'))
})
await test('chiusura parziale con il lato al contrario rispetto alla documentazione: riprova in riduzione, quantità giusta', async () => {
  const ex = fakeBitunix({ marginMode: 'ISOLATION', leverage: 5, wrongSideClose: true })
  const r = await openLive(ex.api, base(ex))
  const out = await closePart(ex.api, { perp: 'NVDAUSDT', positionId: r.exchange.positionId, side: 1, qty: 0.75 })
  assert.equal(out.left, 0.75)
})
await test('chiusura: posizione già chiusa da Bitunix → nessuna azione su altre posizioni', async () => {
  const ex = fakeBitunix({ marginMode: 'ISOLATION', leverage: 5 })
  ex.positions.push({ positionId: '55', symbol: 'NVDAUSDT', side: 1, qty: 9, ctime: 1 }) // manuale, stesso titolo e lato
  const out = await closeOurs(ex.api, { perp: 'NVDAUSDT', positionId: '1234', side: 1, qty: 1.5, step: 0.01 })
  assert.equal(out.gone, true)
  assert.equal(ex.positions[0].qty, 9)
  assert.ok(!ex.calls.some(c => ['closePosition', 'closePartial'].includes(c.name)))
})
for (const [ok, name] of results) console.log(ok.padEnd(7), name)
process.exit(results.some(r => r[0] !== 'OK') ? 1 : 0)
