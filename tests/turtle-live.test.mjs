// Prova di Turtle dal vivo (server/turtle.js) contro un Bitunix e un database finti: Prova e Reale, regole di sicurezza.
// node tests/turtle-live.test.mjs
import assert from 'node:assert/strict'
import { D, runTurtle, saveSettings, getState, closeTurtle } from '../server/turtle.js'

const DAY = 864e5
const NOW = Date.UTC(2026, 10, 16, 12) // lunedì 16 novembre, 12:00 UTC
const flat = (n, end = Date.UTC(2026, 10, 16)) => Array.from({ length: n }, (_, i) => ({ t: end - (n - i) * DAY, o: 100, h: 101, l: 99, c: 100, v: 1 }))

function setup({ price = 105, manual = false, aperturaSyms = [], liqPrice = 60, available = 10000, maxLev = 10 } = {}) {
  let seq = 7000
  const ex = { store: {}, calls: [], positions: [], sl: {}, history: {}, settings: {}, prices: { BTCUSDT: price } }
  if (manual) ex.positions.push({ positionId: '1', symbol: 'BTCUSDT', side: 1, qty: 1, entry: 90 })
  const log = (n, a) => ex.calls.push({ n, a })
  D.getMeta = async k => (k in ex.store ? JSON.parse(JSON.stringify(ex.store[k])) : null)
  D.setMeta = async (k, v) => { ex.store[k] = JSON.parse(JSON.stringify(v)) }
  D.listPos = async mode => Object.keys(ex.store).filter(k => k.startsWith(`turtle:pos:${mode}:`)).sort().reverse().map(k => JSON.parse(JSON.stringify(ex.store[k])))
  D.getPairs = async () => [{ symbol: 'BTCUSDT', maxLeverage: maxLev, minQty: 0.001, basePrecision: 3, quotePrecision: 2, api: true }]
  D.operable = async () => ({ check: () => null })
  D.markNotOperable = async (...a) => log('markNotOperable', a)
  D.liveAllowed = () => true
  const claims = new Set()
  D.claimSymbol = async (mode, day, sym) => { const k = `${mode}:${day}:${sym}`; if (claims.has(k)) return false; claims.add(k); return true }
  D.notifyTrades = async () => ({ sent: 0 })
  D.getLimits = async () => ({})
  D.aperturaLive = async () => ({ symbols: new Set(aperturaSyms), reserve: 0 })
  D.wait = async () => {}
  D.bx = {
    allTickers: async () => ({ ...ex.prices }),
    klinesBack: async perp => (perp === 'BTCUSDT' ? flat(40) : []),
    fundingRates: async () => ({ BTCUSDT: { rate: 0.0001, hours: 8 } }),
    tradingPairs: async () => [{ symbol: 'BTCUSDT', maxLeverage: maxLev }],
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
    modifyStopLoss: async o => { log('modifyStopLoss', o); for (const k in ex.sl) for (const x of ex.sl[k]) if (x.id === o.orderId) x.slPrice = o.slPrice },
    closePosition: async id => { log('closePosition', id); const p = ex.positions.find(x => x.positionId === String(id)); ex.positions = ex.positions.filter(x => x !== p); if (p) ex.history[p.positionId] = { closePrice: ex.prices.BTCUSDT, fee: -0.5, funding: -0.2, liqQty: 0 } },
    closePartial: async () => { throw new Error('non previsto') },
    positionHistory: async (sym, id) => ex.history[id] || null,
  }
  return ex
}
const S = { stocks: false, crypto: true, riskPct: 2, leverage: 5, capital: 1000, entryN: 20, exitM: 10, atrK: 2, atrN: 20 }
let n = 0
const test = async (name, fn) => { await fn(); n++; console.log('ok', name) }

await test('Prova: breakout, stop dal livello, uscita sotto lo stop, niente rientro nello stesso giorno', async () => {
  const ex = setup({ price: 105 })
  await saveSettings('paper', { ...S, active: true }, NOW)
  const r = await runTurtle({ now: NOW, budgetMs: 20000 })
  assert.deepEqual(r.paper.entries, ['BTC aperto'])
  const p = (await D.listPos('paper'))[0]
  assert.equal(p.stop0, 101 - 2 * 2) // max(massimo 20 gg = 101, chiusura di ieri = 100) − 2 ATR
  assert.ok(Math.abs(p.risk - 20) < 1e-6) // 2% di 1000
  ex.prices.BTCUSDT = 96.5
  const r2 = await runTurtle({ now: NOW + 60000, budgetMs: 20000 })
  assert.deepEqual(r2.paper.exits, ['BTC'])
  const st = await getState('paper', NOW + 60000)
  assert.equal(st.open.length, 0); assert.equal(st.history[0].reason, 'stop ATR')
  assert.ok(st.account.balance < 1000 && st.account.balance > 975, String(st.account.balance))
  ex.prices.BTCUSDT = 106
  const r3 = await runTurtle({ now: NOW + 120000, budgetMs: 20000 })
  assert.deepEqual(r3.paper.entries, [])
})

await test('Reale: margine isolato, leva entro il massimo di Bitunix, stop dentro l\'ordine', async () => {
  const ex = setup({ price: 105, maxLev: 3 })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runTurtle({ now: NOW, budgetMs: 20000 })
  assert.deepEqual(r.live.entries, ['BTC aperto'])
  assert.equal(ex.settings.BTCUSDT.marginMode, 'ISOLATION'); assert.equal(ex.settings.BTCUSDT.leverage, 3)
  const o = ex.calls.find(c => c.n === 'openMarket').a
  assert.equal(o.slPrice, 97); assert.ok(o.clientId.startsWith('wt'))
})

await test('Reale: posizione manuale sul titolo, nessun ordine e nessun cambio di leva', async () => {
  const ex = setup({ manual: true })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runTurtle({ now: NOW, budgetMs: 20000 })
  assert.match(r.live.entries[0], /non lo tocca/)
  assert.ok(!ex.calls.some(c => ['openMarket', 'setLeverage', 'setIsolated'].includes(c.n)))
})

await test('Reale: titolo di Apertura USA nel Reale, saltato', async () => {
  const ex = setup({ aperturaSyms: ['BTC'] })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runTurtle({ now: NOW, budgetMs: 20000 })
  assert.match(r.live.entries[0], /Apertura USA/)
  assert.ok(!ex.calls.some(c => c.n === 'openMarket'))
})

await test('Reale: liquidazione di Bitunix sopra lo stop, chiusa subito', async () => {
  const ex = setup({ liqPrice: 98 })
  await saveSettings('live', { ...S, active: true }, NOW)
  const r = await runTurtle({ now: NOW, budgetMs: 20000 })
  assert.match(r.live.entries[0], /liquidazione/)
  assert.equal(ex.positions.length, 0)
})

await test('Reale: il giorno dopo lo stop su Bitunix sale al minimo di M giorni; chiusura dallo stop con i dati veri', async () => {
  const ex = setup({ price: 105 })
  await saveSettings('live', { ...S, active: true }, NOW)
  await runTurtle({ now: NOW, budgetMs: 20000 })
  const T1 = NOW + DAY
  const end = Date.UTC(2026, 10, 17)
  D.bx.klinesBack = async perp => (perp === 'BTCUSDT' ? [...flat(30, end - 11 * DAY), ...Array.from({ length: 11 }, (_, i) => ({ t: end - (11 - i) * DAY, o: 104, h: 106, l: 103, c: 105 }))] : [])
  await runTurtle({ now: T1, budgetMs: 20000 })
  const mod = ex.calls.find(c => c.n === 'modifyStopLoss')
  assert.ok(mod && mod.a.slPrice === 103, JSON.stringify(mod))
  ex.positions = []; ex.sl = {}; ex.history['7001'] = { closePrice: 103, fee: -0.4, funding: -0.1, liqQty: 0 }
  const T2 = Date.UTC(2026, 10, 17, 12, 3)
  await runTurtle({ now: T2, budgetMs: 20000 })
  const st = await getState('live', T2)
  assert.equal(st.open.length, 0)
  const h = st.history[0]
  assert.equal(h.exit, 103); assert.equal(h.real, true); assert.ok(Math.abs(h.fees - 0.4) < 1e-9); assert.ok(Math.abs(h.funding - 0.1) < 1e-9)
})

await test('chiusura a mano della Prova', async () => {
  const ex = setup({ price: 105 })
  await saveSettings('paper', { ...S, active: true }, NOW)
  await runTurtle({ now: NOW, budgetMs: 20000 })
  const p = (await D.listPos('paper'))[0]
  ex.prices.BTCUSDT = 110
  const st = await closeTurtle('paper', p.id, NOW + 1000)
  assert.equal(st.history[0].reason, 'chiusa da te'); assert.ok(st.history[0].pnl > 0)
})

console.log(`${n} prove passate`)
