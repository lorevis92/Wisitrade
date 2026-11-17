// Prova di SMC dal vivo (server/smc.js) contro un Bitunix e un database finti: Prova e Reale, regole di sicurezza.
// LIVE_TRADING non serve: liveAllowed è sostituito. node tests/smc-live.test.mjs
import assert from 'node:assert/strict'
import { D, runSmc, saveSettings, getState, closeSmcPos } from '../server/smc.js'

const M15 = 9e5, H4 = 144e5
const T0 = Date.UTC(2026, 0, 5)
const bar = (t, o, h, l, c) => ({ t, o, h, l, c, v: 1 })
// stesso setup short di tests/smc.test.mjs: rifiuto sulla candela 33
const P = []
for (let k = 0; k < 20; k++) P.push([105, 105.5, 104.5, 105])
P.push([105, 105.2, 104.3, 104.5], [104.5, 106.1, 104.5, 106], [106, 108.2, 106, 108], [108, 110.2, 107.9, 110])
for (const c of [112, 114, 116, 117.5]) { const o = P.at(-1)[3]; P.push([o, c + 0.2, o - 0.2, c]) }
P.push([117.5, 118.6, 117.3, 117.6], [117.6, 117.7, 113.8, 114], [114, 114.1, 109.8, 110], [110, 110.2, 105.8, 106], [106, 106.1, 103.3, 103.5], [103.5, 104.4, 103.2, 104])
const E = P.map(([o, h, l, c], k) => bar(T0 + k * M15, o, h, l, c))
const DIRHL = [[110, 100], [130, 105], [115, 95], [112, 88], [118, 96], [117, 90], [108, 85], [100, 80], [110, 90], [109, 91]]
const Dd = DIRHL.map(([h, l], k) => bar(T0 - (DIRHL.length - k) * H4, (h + l) / 2, h, l, (h + l) / 2))
const SIG = T0 + 34 * M15 // chiusura della candela di rifiuto
const NOW = SIG + 30000

function setup({ price = 104, manual = false, aperturaPerps = [], liqPrice = 150, available = 10000, maxLev = 50, tpFails = false } = {}) {
  let seq = 7000
  const ex = { store: {}, calls: [], positions: [], sl: {}, tp: {}, history: {}, settings: {}, prices: { BTCUSDT: price }, pushes: [] }
  if (manual) ex.positions.push({ positionId: '1', symbol: 'BTCUSDT', side: 1, qty: 1, entry: 90 })
  const log = (n, a) => ex.calls.push({ n, a })
  const clone = v => JSON.parse(JSON.stringify(v))
  D.getMeta = async k => (k in ex.store ? clone(ex.store[k]) : null)
  D.setMeta = async (k, v) => { ex.store[k] = clone(v) }
  D.listPos = async mode => Object.keys(ex.store).filter(k => k.startsWith(`smc:pos:${mode}:`)).sort().reverse().map(k => clone(ex.store[k]))
  D.getPairs = async () => [{ symbol: 'BTCUSDT', maxLeverage: maxLev, minQty: 0.001, basePrecision: 3, quotePrecision: 2, api: true }]
  D.liveAllowed = () => true
  const claims = new Set()
  D.claimSymbol = async (mode, day, sym) => { const k = `${mode}:${day}:${sym}`; if (claims.has(k)) return false; claims.add(k); return true }
  D.notifyTrades = async p => { ex.pushes.push(...p); return { sent: p.length } }
  D.loadLiveSlip = async () => null
  D.aperturaLive = async () => ({ perps: new Set(aperturaPerps), reserve: 0 })
  D.wait = async () => {}
  D.bx = {
    allTickers: async () => ({ ...ex.prices }),
    klinesBack: async (perp, tf) => (tf === '15m' ? E : tf === '4h' ? Dd : []),
    klines: async () => [],
    fundingRates: async () => ({ BTCUSDT: { rate: 0.0001, hours: 8 } }),
    positionTiers: async () => [{ start: 0, end: 1e9, lev: maxLev, mmr: 0.005 }],
    account: async () => ({ available }),
    openPositions: async sym => ex.positions.filter(p => p.symbol === sym).map(p => ({ ...p })),
    pendingOrders: async () => [],
    leverageMarginMode: async s => ({ marginMode: 'CROSS', leverage: 1, ...ex.settings[s] }),
    setIsolated: async s => { log('setIsolated', s); ex.settings[s] = { ...ex.settings[s], marginMode: 'ISOLATION' } },
    setLeverage: async (s, l) => { log('setLeverage', [s, l]); ex.settings[s] = { ...ex.settings[s], leverage: l } },
    openMarket: async o => {
      log('openMarket', o)
      const id = String(++seq)
      ex.positions.push({ positionId: id, symbol: o.symbol, side: o.side, qty: o.qty, entry: ex.prices.BTCUSDT, liqPrice, marginMode: 'ISOLATION', ctime: Date.now() })
      ex.sl[id] = [{ id: 'sl' + id, slPrice: o.slPrice }]
      return { orderId: String(++seq) }
    },
    pendingStopLoss: async (sym, id) => ex.sl[id] || [],
    placeStopLoss: async o => { log('placeStopLoss', o); ex.sl[o.positionId] = [{ id: 'sl2', slPrice: o.slPrice }]; return { orderId: 'sl2' } },
    placeTakeProfit: async o => { log('placeTakeProfit', o); if (tpFails) throw new Error('tp non accettato'); ex.tp[o.positionId] = o.tpPrice; return { orderId: 'tp1' } },
    modifyStopLoss: async () => {},
    closePosition: async id => { log('closePosition', id); const p = ex.positions.find(x => x.positionId === String(id)); ex.positions = ex.positions.filter(x => x !== p); if (p) ex.history[p.positionId] = { closePrice: ex.prices.BTCUSDT, fee: -0.5, funding: -0.2, liqQty: 0 } },
    closePartial: async () => { throw new Error('non previsto') },
    positionHistory: async (sym, id) => ex.history[id] || null,
  }
  return ex
}
const S = { symbols: ['BTCUSDT'], entryTf: '15m', dirTf: '4h', fee: 0.02, slip: 0.01, capital: 1000 }
let n = 0
const test = async (name, fn) => { await fn(); n++; console.log('ok', name) }

await test('Prova: entrata dopo il rifiuto, stop e target dal setup, uscita al target, tutte le variabili registrate', async () => {
  const ex = setup()
  await saveSettings('paper', { ...S, active: true }, NOW)
  const r = await runSmc({ now: NOW, budgetMs: 20000 })
  assert.deepEqual(r.paper.entries, ['BTCUSDT aperto'], JSON.stringify(r))
  const p = (await D.listPos('paper'))[0]
  assert.equal(p.side, -1); assert.equal(p.target, 80); assert.ok(p.stop > 104.4 && p.entry < 104)
  assert.ok(Math.abs(p.risk - 20) < 1e-6) // 2% di 1000
  assert.equal(p.setup.level.p, 118); assert.deepEqual([p.setup.ob.lo, p.setup.ob.hi], [104.3, 105.2]); assert.ok(p.setup.fvg && p.setup.rej && p.setup.sweep && p.setup.inv)
  assert.ok(ex.pushes.some(x => /SMC Prova · BTCUSDT short/.test(x.title)))
  ex.prices.BTCUSDT = 79.9
  const r2 = await runSmc({ now: NOW + 60000, budgetMs: 20000 })
  assert.deepEqual(r2.paper.exits, ['BTCUSDT: target'])
  const st = await getState('paper', NOW + 60000)
  assert.equal(st.open.length, 0); assert.ok(st.history[0].pnl > 0 && st.history[0].R > 3)
  assert.ok(st.account.balance > 1000)
})

await test('rifiuto visto oltre 3 minuti dopo la chiusura: nessuna entrata, motivo registrato', async () => {
  setup()
  await saveSettings('paper', { ...S, active: true }, NOW)
  const r = await runSmc({ now: SIG + 5 * 60000, budgetMs: 20000 })
  assert.match(r.paper.entries[0], /troppo tardi/)
  const st = await getState('paper', SIG + 5 * 60000)
  assert.equal(st.log[0].kind, 'scartato')
})

await test('Reale: margine isolato, leva entro il massimo, stop dentro l\'ordine, target su Bitunix', async () => {
  const ex = setup({ maxLev: 10 })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runSmc({ now: NOW, budgetMs: 20000 })
  assert.deepEqual(r.live.entries, ['BTCUSDT aperto'], JSON.stringify(r))
  assert.equal(ex.settings.BTCUSDT.marginMode, 'ISOLATION'); assert.ok(ex.settings.BTCUSDT.leverage <= 10)
  const o = ex.calls.find(c => c.n === 'openMarket').a
  assert.equal(o.side, -1); assert.ok(o.slPrice > 104.4); assert.ok(o.clientId.startsWith('wt'))
  assert.equal(ex.calls.find(c => c.n === 'placeTakeProfit').a.tpPrice, 80)
  const p = (await D.listPos('live'))[0]
  assert.equal(p.exchange.tpOrderId, 'tp1'); assert.ok(!p.tpByApp)
})

await test('Reale: target non accettato da Bitunix, lo gestisce l\'app (chiusura a mercato al target)', async () => {
  const ex = setup({ tpFails: true })
  await saveSettings('live', { ...S, active: true }, NOW)
  await runSmc({ now: NOW, budgetMs: 20000 })
  assert.ok((await D.listPos('live'))[0].tpByApp)
  ex.prices.BTCUSDT = 79.5
  const r = await runSmc({ now: NOW + 60000, budgetMs: 20000 })
  assert.deepEqual(r.live.exits, ['BTCUSDT: chiusa'])
  const h = (await getState('live', NOW + 60000)).history[0]
  assert.equal(h.reason, 'target'); assert.equal(h.real, true); assert.ok(Math.abs(h.fees - 0.5) < 1e-9)
})

await test('Reale: posizione manuale sul titolo, nessun ordine e nessun cambio di leva', async () => {
  const ex = setup({ manual: true })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runSmc({ now: NOW, budgetMs: 20000 })
  assert.match(r.live.entries[0], /non lo tocca/)
  assert.ok(!ex.calls.some(c => ['openMarket', 'setLeverage', 'setIsolated'].includes(c.n)))
})

await test('Reale: titolo di Apertura USA nel Reale, saltato', async () => {
  const ex = setup({ aperturaPerps: ['BTCUSDT'] })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runSmc({ now: NOW, budgetMs: 20000 })
  assert.match(r.live.entries[0], /Apertura USA/)
  assert.ok(!ex.calls.some(c => c.n === 'openMarket'))
})

await test('Reale: liquidazione di Bitunix oltre lo stop, chiusa subito', async () => {
  const ex = setup({ liqPrice: 104.6 })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runSmc({ now: NOW, budgetMs: 20000 })
  assert.match(r.live.entries[0], /liquidazione/)
  assert.equal(ex.positions.length, 0)
})

await test('Reale: saldo libero insufficiente, nessun ordine', async () => {
  const ex = setup({ available: 1 })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runSmc({ now: NOW, budgetMs: 20000 })
  assert.match(r.live.entries[0], /saldo libero/)
  assert.ok(!ex.calls.some(c => c.n === 'openMarket'))
})

await test('perdita massima del giorno raggiunta: niente nuove entrate', async () => {
  const ex = setup()
  await saveSettings('paper', { ...S, active: true }, NOW)
  const acc = ex.store['smc:acc:paper']
  ex.store['smc:acc:paper'] = { ...acc, day: new Date(NOW).toISOString().slice(0, 10), dayStart: 1000, dayPnl: -61 }
  const r = await runSmc({ now: NOW, budgetMs: 20000 })
  assert.match(r.paper.entries[0], /perdita massima del giorno/)
})

await test('apertura USA in corso: entrate sospese', async () => {
  setup()
  await saveSettings('paper', { ...S, active: true }, NOW)
  const r = await runSmc({ now: NOW, budgetMs: 20000, entries: false })
  assert.match(r.paper.entries[0], /apertura USA/)
})

await test('chiusura a mano della Prova', async () => {
  const ex = setup()
  await saveSettings('paper', { ...S, active: true }, NOW)
  await runSmc({ now: NOW, budgetMs: 20000 })
  const p = (await D.listPos('paper'))[0]
  ex.prices.BTCUSDT = 100
  const st = await closeSmcPos('paper', p.id, NOW + 1000)
  assert.equal(st.history[0].reason, 'chiusa da te'); assert.ok(st.history[0].pnl > 0)
})

console.log(`${n} prove passate`)
