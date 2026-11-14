// Prova degli ordini manuali della pagina RSI (server/manual.js) contro un Bitunix e un database finti.
// node tests/manual.test.mjs
import assert from 'node:assert/strict'
import { D, manualOpen, manualClose, manualPositions, manualInfo, ManualError } from '../server/manual.js'

function setup({ positions = [], orders = [], marginMode = 'CROSS', available = 100, reserve = 0, strategyOpen = [], strategySyms = [], strategyOn = false, minutes = 700, notIsolated = false } = {}) {
  let seq = 5000, t = 1_800_000_000_000
  const ex = { calls: [], positions: positions.map(p => ({ ...p })), orders: [...orders], settings: {}, history: {}, store: {} }
  const log = (n, a) => ex.calls.push({ n, a })
  const set = s => (ex.settings[s] ||= { marginMode, leverage: 10 })
  const busy = s => ex.positions.some(p => p.symbol === s) || ex.orders.some(o => o.symbol === s)
  D.bx = {
    hasKeys: () => true,
    account: async () => ({ available }),
    positionTiers: async () => [{ start: 0, end: 50000, lev: 50, mmr: 0.005 }, { start: 50000, end: Infinity, lev: 20, mmr: 0.01 }],
    tickers: async syms => Object.fromEntries(syms.map(s => [s, { last: 100, mark: 100 }])),
    openPositions: async sym => { log('openPositions', sym); return ex.positions.filter(p => !sym || p.symbol === sym).map(p => ({ ...p, raw: { margin: p.margin, unrealizedPNL: p.upnl ?? 0 } })) },
    pendingOrders: async sym => ex.orders.filter(o => o.symbol === sym),
    leverageMarginMode: async s => ({ ...set(s) }),
    setIsolated: async s => { log('setIsolated', s); if (busy(s)) throw new Error('busy'); set(s).marginMode = 'ISOLATION' },
    setLeverage: async (s, l) => { log('setLeverage', [s, l]); if (busy(s)) throw new Error('busy'); set(s).leverage = l },
    openMarket: async o => {
      log('openMarket', o); t += 300
      ex.positions.push({ positionId: String(++seq), symbol: o.symbol, side: o.side, qty: o.qty, entry: 100.05, liqPrice: 91, marginMode: notIsolated ? 'CROSS' : set(o.symbol).marginMode, ctime: t, margin: 10 })
      return { orderId: String(++seq) }
    },
    closePosition: async id => { log('closePosition', id); const p = ex.positions.find(x => x.positionId === String(id)); ex.positions = ex.positions.filter(x => x !== p); if (p) ex.history[p.positionId] = { closePrice: 101, fee: 0.05, funding: 0, realizedPNL: null, liqQty: 0 } },
    closePartial: async o => { log('closePartial', o); throw new Error('non previsto') },
    positionHistory: async (sym, id) => ex.history[id] || null,
  }
  D.getPairs = async () => [{ symbol: 'BTCUSDT', maxLeverage: 100, minQty: 0.001, basePrecision: 3, quotePrecision: 1, api: true }, { symbol: 'NVDAUSDT', maxLeverage: 20, minQty: 0.01, basePrecision: 2, quotePrecision: 2, api: true }]
  D.getMeta = async k => (ex.store[k] ? JSON.parse(JSON.stringify(ex.store[k])) : null)
  D.setMeta = async (k, v) => { ex.store[k] = JSON.parse(JSON.stringify(v)) }
  D.listTrades = async () => Object.keys(ex.store).sort().reverse().map(k => JSON.parse(JSON.stringify(ex.store[k])))
  D.strategyState = async () => ({ enabled: strategyOn, symbols: new Set(strategySyms), openPerps: new Set(strategyOpen), reserve, used: 0 })
  D.wait = async () => {}
  D.now = () => t
  D.nyInfo = () => ({ date: '2026-11-16', minutes, isWeekday: true })
  return ex
}
const snap = { tfs: { '1m': { k: 12.345, d: 18, state: 'oversold', cross: { dir: 'up', ago: 0, inZone: true } }, 'evil<script>': { k: 1 } }, suggestion: { side: 1, reason: 'Long: test', score: 3 }, params: { rsi: 14 } }
const rejects = async (p, re) => { await assert.rejects(p, e => e instanceof ManualError && re.test(e.message)) }
process.env.LIVE_TRADING = 'on'
let n = 0
const test = async (name, fn) => { await fn(); n++; console.log('ok', name) }

await test('apertura long: margine isolato, leva, clientId wm, stato salvato', async () => {
  const ex = setup()
  const t = await manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 10, snapshot: snap })
  assert.equal(ex.settings.BTCUSDT.marginMode, 'ISOLATION'); assert.equal(ex.settings.BTCUSDT.leverage, 5)
  const o = ex.calls.find(c => c.n === 'openMarket').a
  assert.ok(o.clientId.startsWith('wm')); assert.equal(o.slPrice, undefined); assert.equal(o.qty, 0.5)
  assert.equal(t.status, 'open'); assert.equal(t.positionId, '5001')
  assert.equal(t.snapshot.tfs['1m'].k, 12.3); assert.equal(t.snapshot.tfs['evil<script>'], undefined); assert.equal(t.snapshot.suggestion.side, 1)
})
await test('posizione già aperta sul titolo (anche fatta sull\'app di Bitunix): niente ordine, niente leva', async () => {
  const ex = setup({ positions: [{ positionId: '1', symbol: 'BTCUSDT', side: -1, qty: 1, entry: 100 }] })
  await rejects(manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 10 }), /già una posizione/)
  assert.ok(!ex.calls.some(c => ['openMarket', 'setLeverage', 'setIsolated'].includes(c.n)))
})
await test('ordine in attesa sul titolo: rifiutato', async () => {
  const ex = setup({ orders: [{ symbol: 'BTCUSDT', clientId: 'x' }] })
  await rejects(manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 10 }), /ordine in attesa/)
  assert.ok(!ex.calls.some(c => c.n === 'openMarket'))
})
await test('posizione della strategia sul titolo: rifiutato', async () => {
  const ex = setup({ strategyOpen: ['NVDAUSDT'] })
  await rejects(manualOpen({ symbol: 'NVDAUSDT', side: 1, leverage: 5, margin: 10 }), /strategia ha una posizione/)
  assert.ok(!ex.calls.some(c => c.n === 'openMarket'))
})
await test('finestra d\'apertura della strategia sui titoli del Reale acceso: rifiutato; fuori finestra o altro titolo: ok', async () => {
  setup({ strategyOn: true, strategySyms: ['NVDAUSDT'], minutes: 575 })
  await rejects(manualOpen({ symbol: 'NVDAUSDT', side: 1, leverage: 5, margin: 10 }), /riservato alla strategia/)
  setup({ strategyOn: true, strategySyms: ['NVDAUSDT'], minutes: 575 })
  assert.equal((await manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 10 })).status, 'open')
  setup({ strategyOn: true, strategySyms: ['NVDAUSDT'], minutes: 700 })
  assert.equal((await manualOpen({ symbol: 'NVDAUSDT', side: -1, leverage: 5, margin: 10 })).status, 'open')
})
await test('saldo libero = disponibile − capitale della strategia non impegnato', async () => {
  setup({ available: 100, reserve: 80 })
  await rejects(manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 25 }), /saldo libero: 20\.00/)
  setup({ available: 100, reserve: 80 })
  assert.equal((await manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 20 })).status, 'open')
})
await test('leva oltre il massimo di Bitunix (coppia e scaglione): rifiutata', async () => {
  setup()
  await rejects(manualOpen({ symbol: 'NVDAUSDT', side: 1, leverage: 25, margin: 10 }), /massimo di Bitunix .*20x/)
  setup({ available: 10000 })
  await rejects(manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 30, margin: 2000 }), /massimo di Bitunix .*20x/) // 60000 USDT: scaglione 20x
})
await test('posizione non isolata dopo l\'ordine: chiusa subito', async () => {
  const ex = setup({ notIsolated: true })
  await rejects(manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 10 }), /chiusa subito/)
  assert.equal(ex.positions.length, 0)
})
await test('LIVE_TRADING spento: niente ordini', async () => {
  const ex = setup(); process.env.LIVE_TRADING = 'off'
  await rejects(manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 10 }), /disattivati/)
  await rejects(manualClose('1'), /disattivati/)
  process.env.LIVE_TRADING = 'on'
  assert.equal(ex.calls.length, 0)
})
await test('chiusura: solo la posizione registrata, con risultato e durata; le altre restano', async () => {
  const ex = setup({ positions: [{ positionId: '77', symbol: 'NVDAUSDT', side: 1, qty: 3, entry: 100 }] })
  const t = await manualOpen({ symbol: 'BTCUSDT', side: 1, leverage: 5, margin: 10, snapshot: snap })
  const c = await manualClose(t.id)
  assert.equal(c.status, 'closed'); assert.ok(Math.abs(c.pnl - ((101 - 100.05) * 0.5 - 0.05)) < 1e-9); assert.ok(c.durationMs >= 0); assert.equal(c.final, true)
  assert.deepEqual(ex.positions.map(p => p.positionId), ['77'])
  await rejects(manualClose(t.id), /già chiusa/)
})
await test('non si può chiudere una posizione non registrata qui (es. della strategia)', async () => {
  const ex = setup({ positions: [{ positionId: '77', symbol: 'NVDAUSDT', side: 1, qty: 3, entry: 100 }] })
  await rejects(manualClose('77'), /non trovata/)
  assert.equal(ex.positions.length, 1)
})
await test('posizione chiusa fuori dall\'app: segnata chiusa solo alla seconda lettura senza', async () => {
  const ex = setup()
  const t = await manualOpen({ symbol: 'BTCUSDT', side: -1, leverage: 5, margin: 10 })
  let r = await manualPositions(); assert.equal(r.open.length, 1)
  ex.positions = []; ex.history[t.positionId] = { closePrice: 99, fee: 0.04, funding: -0.01, realizedPNL: null, liqQty: 0 }
  r = await manualPositions(); assert.equal(r.open.length, 1); assert.equal(r.open[0].upnl, null)
  r = await manualPositions(); assert.equal(r.open.length, 0); assert.equal(r.history[0].status, 'closed')
  assert.ok(Math.abs(r.history[0].pnl - ((100.05 - 99) * 0.5 - 0.04 - 0.01)) < 1e-9)
})
await test('info: saldo libero e blocchi', async () => {
  setup({ available: 50, reserve: 20, strategyOpen: ['NVDAUSDT'] })
  const i = await manualInfo('NVDAUSDT')
  assert.equal(i.free, 30); assert.equal(i.strategyOpen, true); assert.equal(i.pair.maxLev, 20)
})
console.log(`\n${n} prove superate`)
