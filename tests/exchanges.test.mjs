// Prove della strategia su più exchange (node tests/exchanges.test.mjs). Nessuna chiamata vera: Bitget finto via fetch,
// database in memoria. Controlla: chiavi dei conti, separazione tra exchange (prenotazioni, prezzi, aperture del controllo
// veloce, titoli operabili), adattatore Bitget (one-way, margine isolato, leva, stop dentro l'ordine, posizioni manuali).
import assert from 'node:assert/strict'
import { nyTs } from '../shared/time.js'
import { normalizeSettings } from '../shared/opening.js'
import { acctKey, kindOf, exOf, isLive, prepDay, exSuffix, acctName, ACCOUNT_KEYS } from '../shared/venues.js'
import { runFast } from '../server/fast.js'
import { fakeDb } from './fakes.mjs'

const DAY = '2026-11-10'
const T = (min, sec = 0) => nyTs(DAY, 0) + min * 60000 + sec * 1000
const results = []
const test = async (name, fn) => { try { await fn(); results.push(['OK', name]) } catch (e) { results.push(['ERRORE', `${name} · ${e.stack?.split('\n').slice(0, 3).join(' ')}`]) } }

process.env.BITGET_API_KEY = 'k-finta'; process.env.BITGET_API_SECRET = 's-finta'; process.env.BITGET_API_PASSPHRASE = 'p-finta'
const { __setDb } = await import('../server/db.js')

// ---------- Bitget finto (v2 dei futures USDT) ----------
function fakeBitget({ prices = {}, posMode = 'hedge_mode', available = 100 } = {}) {
  let seq = 9000
  const ex = { calls: [], positions: [], orders: [], plans: [], posMode, settings: {}, prices, available, clock: () => Date.now() }
  const set = sym => (ex.settings[sym] ||= { marginMode: 'crossed', long: 10, short: 10 })
  const busyAll = () => ex.positions.length || ex.orders.length
  const busy = sym => ex.positions.some(p => p.symbol === sym) || ex.orders.some(o => o.symbol === sym)
  const ok = data => new Response(JSON.stringify({ code: '00000', msg: 'success', data }), { status: 200 })
  const err = (code, msg) => new Response(JSON.stringify({ code, msg, data: null }), { status: 400 })
  const posOut = p => ({ symbol: p.symbol, holdSide: p.side > 0 ? 'long' : 'short', total: String(p.qty), openPriceAvg: String(p.entry), marginMode: p.marginMode, posMode: ex.posMode, leverage: String(p.lev), liquidationPrice: '0', cTime: String(p.cTime) })
  ex.fetch = async (url, init = {}) => {
    const u = new URL(url), path = u.pathname, q = Object.fromEntries(u.searchParams), body = init.body ? JSON.parse(init.body) : {}
    const method = init.method || 'GET'
    ex.calls.push({ path, q, body, method, signed: !!init.headers?.['ACCESS-SIGN'] })
    if (path === '/api/v2/mix/account/accounts') return ok([{ marginCoin: 'USDT', available: String(ex.available), accountEquity: String(ex.available), locked: '0', unrealizedPL: '0' }])
    if (path === '/api/v2/mix/account/account') { const s = set(q.symbol); return ok({ symbol: q.symbol, marginMode: s.marginMode, posMode: ex.posMode, isolatedLongLever: String(s.long), isolatedShortLever: String(s.short), crossedMarginLeverage: String(s.long) }) }
    if (path === '/api/v2/mix/account/set-position-mode') { if (busyAll()) return err('40920', 'positions or orders exist'); ex.posMode = body.posMode; return ok({}) }
    if (path === '/api/v2/mix/account/set-margin-mode') { if (busy(body.symbol)) return err('45117', 'positions or orders exist'); set(body.symbol).marginMode = body.marginMode; return ok({}) }
    if (path === '/api/v2/mix/account/set-leverage') { const s = set(body.symbol); if (!body.holdSide || body.holdSide === 'long') s.long = +body.leverage; if (!body.holdSide || body.holdSide === 'short') s.short = +body.leverage; return ok({}) }
    if (path === '/api/v2/mix/position/single-position') return ok(ex.positions.filter(p => p.symbol === q.symbol).map(posOut))
    if (path === '/api/v2/mix/position/all-position') return ok(ex.positions.map(posOut))
    if (path === '/api/v2/mix/order/orders-pending') return ok({ entrustedList: ex.orders.filter(o => !q.symbol || o.symbol === q.symbol) })
    if (path === '/api/v2/mix/order/orders-plan-pending') {
      if (q.planType === 'normal_plan') return ok({ entrustedList: [] })
      return ok({ entrustedList: ex.plans.filter(o => o.symbol === q.symbol && ex.positions.some(p => p.symbol === o.symbol)) })
    }
    if (path === '/api/v2/mix/order/place-order') {
      if (ex.posMode !== 'one_way_mode' && !body.tradeSide) return err('40774', 'The order type for unilateral position must also be the unilateral position type.')
      const side = body.side === 'buy' ? 1 : -1, qty = +body.size, sym = body.symbol
      if (body.reduceOnly === 'YES') {
        const p = ex.positions.find(x => x.symbol === sym && x.side === -side)
        if (!p) return err('22002', 'No position to close')
        p.qty = +(p.qty - Math.min(qty, p.qty)).toFixed(8); if (p.qty <= 0) ex.positions = ex.positions.filter(x => x !== p)
        return ok({ orderId: String(++seq) })
      }
      const s = set(sym)
      const cur = ex.positions.find(x => x.symbol === sym)
      if (cur) cur.qty += qty
      else {
        ex.positions.push({ symbol: sym, side, qty, entry: ex.prices[sym] * (1 + side * 0.0005), marginMode: s.marginMode, lev: side > 0 ? s.long : s.short, cTime: ex.clock() + 120 })
        if (body.presetStopLossPrice) ex.plans.push({ orderId: String(++seq), symbol: sym, planType: 'pos_loss', triggerPrice: body.presetStopLossPrice, size: '' })
      }
      return ok({ orderId: String(++seq), clientOid: body.clientOid })
    }
    if (path === '/api/v2/mix/order/place-tpsl-order') { const id = String(++seq); ex.plans.push({ orderId: id, symbol: body.symbol, planType: body.planType, triggerPrice: body.triggerPrice, size: body.size }); return ok({ orderId: id }) }
    if (path === '/api/v2/mix/order/modify-tpsl-order') { const o = ex.plans.find(x => x.orderId === body.orderId); if (!o) return err('40109', 'order not exist'); o.triggerPrice = body.triggerPrice; return ok({ orderId: o.orderId }) }
    if (path === '/api/v2/mix/order/close-positions') { ex.positions = ex.positions.filter(p => p.symbol !== body.symbol); return ok({ successList: [] }) }
    return err('404', `finto: ${path}`)
  }
  ex.writes = () => ex.calls.filter(c => c.method === 'POST').map(c => `${c.path.split('/').slice(-1)[0]}${c.body.symbol ? ' ' + c.body.symbol : ''}`)
  return ex
}
const PAIR = { symbol: 'AAPLUSDT', basePrecision: 2, quotePrecision: 2, tick: 0.01, step: 0.01, minQty: 0.01, minNotional: 5, maxLeverage: 20, api: true }

// ---------- Chiavi dei conti ----------
await test('chiavi dei conti: Bitunix come prima (paper, live), Bitget con il suo nome', async () => {
  assert.equal(acctKey('paper', 'bitunix'), 'paper'); assert.equal(acctKey('live', 'bitget'), 'live:bitget')
  assert.equal(kindOf('live:bitget'), 'live'); assert.equal(exOf('live:bitget'), 'bitget'); assert.equal(exOf('paper'), 'bitunix')
  assert.ok(isLive('live:bitget') && !isLive('paper:bitget'))
  assert.equal(prepDay('bitunix', DAY), DAY); assert.equal(prepDay('bitget', DAY), `${DAY}@bitget`)
  assert.equal(exSuffix('bitunix'), ''); assert.equal(acctName('live:bitget'), 'Reale Bitget')
  assert.deepEqual(ACCOUNT_KEYS, ['paper', 'live', 'paper:bitget', 'live:bitget'])
  const { settingsFor } = await import('../shared/opening.js')
  assert.equal(settingsFor('live:bitget', {}).capitalMode, 'dedicated') // il Reale di ogni exchange parte con il capitale dedicato
})

await test('prenotazioni per conto: lo stesso titolo si può aprire su Bitunix e su Bitget, mai due volte nello stesso conto', async () => {
  const D = fakeDb({ wt_meta: [] }); __setDb(D.client)
  const { claimSymbol } = await import('../server/strategy.js')
  assert.equal(await claimSymbol('live', DAY, 'AAPL', 'veloce'), true)
  assert.equal(await claimSymbol('live:bitget', DAY, 'AAPL', 'veloce'), true)
  assert.equal(await claimSymbol('live:bitget', DAY, 'AAPL', 'minuto'), false)
  assert.equal(await claimSymbol('live', DAY, 'AAPL', 'minuto'), false)
})

await test('eventi dei segnali: chiavi con il conto di Bitget lette correttamente', async () => {
  const D = fakeDb({ wt_meta: [] }); __setDb(D.client)
  const { saveEvents, dayEvents } = await import('../server/record.js')
  await saveEvents(DAY, [{ mode: 'live:bitget', sym: 'AAPL', kind: 'aperto' }, { mode: 'live', sym: 'AAPL', kind: 'scartato', why: 'x' }])
  const ev = await dayEvents(DAY)
  assert.equal(ev['live:bitget'].AAPL[0].kind, 'aperto'); assert.equal(ev.live.AAPL[0].kind, 'scartato')
})

await test('titoli operabili per exchange: su Bitget esclusi quelli senza perpetuo, segni separati da Bitunix', async () => {
  const D = fakeDb({ wt_meta: [
    { key: 'bitget:pairs', value: { at: Date.now(), list: [PAIR, { ...PAIR, symbol: 'NVDAUSDT' }] } },
    { key: 'pairs', value: { at: Date.now(), list: [{ symbol: 'AAPLUSDT', api: true }, { symbol: 'DISUSDT', api: true }] } },
  ] }); __setDb(D.client)
  const { operable, keepOperable, markNotOperable } = await import('../server/operable.js')
  const bg = await operable(Date.now(), 'bitget')
  assert.deepEqual(keepOperable(['AAPL', 'NVDA', 'DIS'], bg), ['AAPL', 'NVDA']) // DIS non c'è su Bitget
  await markNotOperable('NVDA', 'ordini', 'rifiutato', Date.now(), 'bitget')
  assert.deepEqual(keepOperable(['AAPL', 'NVDA'], await operable(Date.now(), 'bitget')), ['AAPL'])
  assert.deepEqual(keepOperable(['AAPL', 'NVDA', 'DIS'], await operable(Date.now(), 'bitunix')), ['AAPL', 'NVDA', 'DIS']) // Bitunix non cambia
  assert.ok(D.tables.wt_meta.some(r => r.key === 'api:marks:bitget') && !D.tables.wt_meta.some(r => r.key === 'api:marks'))
})

// ---------- Controllo veloce con due exchange ----------
await test('controllo veloce: ogni conto usa prezzi, aperture e preparazione del suo exchange', async () => {
  let clock = T(569, 50)
  const calls = [], dayPos = [], claims = new Set(), saved = {}
  const S = normalizeSettings({ symbols: ['AAPL'], movePct: 1, room: 0, maxPos: 5 })
  // AAPL apre a 100 su Bitunix e a 101 su Bitget; supera la soglia su Bitunix dopo 5 s, su Bitget dopo 20 s
  const prices = () => { const sec = (clock - T(570)) / 1000; return { bitunix: { AAPL: sec < 5 ? 100 : 102 }, bitget: { AAPL: sec < 0 ? 100 : sec < 20 ? 101 : 103 } } }
  const prep = { ok: true, unit: 1, levels: [] }
  const deps = {
    now: () => clock, sleep: async ms => { clock += Math.max(ms, 1) }, maxRun: 60000,
    nyDay: () => ({ date: DAY, trading: true }),
    getLock: async () => null, setLock: async () => {},
    getOpens: async (d, ex) => saved[ex] || null, saveOpens: async (d, o, ex) => { saved[ex] = { ...o } },
    prices: async exs => { assert.deepEqual(exs, ['bitunix', 'bitget']); return prices() },
    loadState: async () => ({ accounts: {}, active: [{ mode: 'paper', s: S, balance: 300 }, { mode: 'paper:bitget', s: S, balance: 300 }], dayPos, skips: { paper: {}, 'paper:bitget': {} }, preps: { bitunix: { AAPL: prep }, bitget: { AAPL: prep } }, braked: {}, mindex: null }),
    entryEnv: async (ctx, ex) => { const env = { ex, ctxEx: ctx.ex, skips: {}, skip: () => {}, save: async () => {} }; return env },
    accountGate: async (env, ctx, acc) => ({ s: acc.s, mode: acc.mode, taken: dayPos.filter(p => p.mode === acc.mode), rule: { maxPos: 5 } }),
    openSignal: async (env, ctx, gate, dp, x) => {
      const k = `${gate.mode}:${x.sym}`
      if (claims.has(k)) return null
      claims.add(k)
      calls.push({ mode: gate.mode, envEx: env.ex, ctxEx: ctx.ex, open: x.sig.open, entry: x.sig.entry, sec: (x.timing.signalAt - T(570)) / 1000 })
      const row = { mode: gate.mode, symbol: x.sym }; dp.push(row); gate.taken.push(row); return row
    },
    notify: async () => {},
  }
  const log = await runFast(deps)
  assert.equal(calls.length, 2, JSON.stringify(log))
  const bx = calls.find(c => c.mode === 'paper'), bg = calls.find(c => c.mode === 'paper:bitget')
  assert.equal(bx.open, 100); assert.equal(bx.entry, 102); assert.equal(bx.envEx, 'bitunix'); assert.equal(bx.ctxEx, 'bitunix')
  assert.equal(bg.open, 101); assert.equal(bg.entry, 103); assert.equal(bg.envEx, 'bitget'); assert.equal(bg.ctxEx, 'bitget')
  assert.ok(bx.sec < bg.sec)
  assert.deepEqual(saved, { bitunix: { AAPL: 100 }, bitget: { AAPL: 101 } }) // aperture salvate per exchange
})

// ---------- Adattatore Bitget con server/live.js ----------
const realFetch = globalThis.fetch
const bgSetup = opts => {
  const ex = fakeBitget({ prices: { AAPLUSDT: 200 }, ...opts })
  globalThis.fetch = ex.fetch
  const D = fakeDb({ wt_meta: [{ key: 'bitget:pairs', value: { at: Date.now(), list: [PAIR] } }] }); __setDb(D.client)
  return ex
}
const { bitget } = await import('../server/exchanges/bitget.js')
const { openLive, closeOurs, checkStop, LiveSkip } = await import('../server/live.js')
const open = (extra = {}) => openLive(bitget.api, { perp: 'AAPLUSDT', pair: PAIR, side: 1, notional: 100, price: 200, leverage: 5, stopDist: 4, ourIds: new Set(), clientId: 'wt1AAPL', ...extra })

try {
  await test('Bitget: prima dell\'ordine one-way, margine isolato e leva 5 impostati e verificati; stop dentro l\'ordine e verificato', async () => {
    const ex = bgSetup()
    const r = await open()
    assert.equal(ex.posMode, 'one_way_mode')
    assert.equal(ex.settings.AAPLUSDT.marginMode, 'isolated'); assert.equal(ex.settings.AAPLUSDT.long, 5); assert.equal(ex.settings.AAPLUSDT.short, 5)
    const order = ex.calls.find(c => c.path.endsWith('/place-order'))
    assert.equal(order.body.marginMode, 'isolated'); assert.equal(order.body.orderType, 'market'); assert.equal(order.body.side, 'buy'); assert.ok(order.body.presetStopLossPrice)
    assert.equal(order.body.size, '0.5')
    assert.ok(ex.calls.every(c => c.signed))
    assert.equal(r.qty, 0.5); assert.ok(r.exchange.positionId.startsWith('AAPLUSDT|long|'))
    assert.ok(r.exchange.slOrderId); assert.equal(r.exchange.slVia, 'ordine')
    assert.deepEqual(ex.writes(), ['set-position-mode', 'set-margin-mode AAPLUSDT', 'set-leverage AAPLUSDT', 'place-order AAPLUSDT', 'modify-tpsl-order AAPLUSDT'])
    // stop verificato al minuto dopo: c'è
    assert.equal((await checkStop(bitget.api, { perp: 'AAPLUSDT', positionId: r.exchange.positionId, slPrice: r.exchange.sl, qty: r.qty })).state, 'ok')
    // chiusura: la posizione è tutta della strategia → chiusura della posizione del titolo
    const c = await closeOurs(bitget.api, { perp: 'AAPLUSDT', positionId: r.exchange.positionId, side: 1, qty: r.qty, step: 0.01 })
    assert.equal(c.closed, 0.5); assert.equal(ex.positions.length, 0)
  })

  await test('Bitget: posizione manuale sul titolo → trade saltato senza toccare modalità, margine o leva', async () => {
    const ex = bgSetup()
    ex.positions.push({ symbol: 'AAPLUSDT', side: -1, qty: 1, entry: 199, marginMode: 'crossed', lev: 10, cTime: 1 })
    await assert.rejects(open(), e => e instanceof LiveSkip && /posizione aperta/.test(e.message))
    assert.deepEqual(ex.writes(), [])
    assert.equal(ex.posMode, 'hedge_mode')
  })

  await test('Bitget: one-way non impostabile (posizione su un altro titolo) → trade saltato, nessun ordine', async () => {
    const ex = bgSetup()
    ex.positions.push({ symbol: 'NVDAUSDT', side: 1, qty: 1, entry: 150, marginMode: 'crossed', lev: 10, cTime: 1 })
    await assert.rejects(open(), e => e instanceof LiveSkip && /one-way non impostabile su Bitget/.test(e.message))
    assert.ok(!ex.calls.some(c => c.path.endsWith('/place-order')))
    assert.equal(ex.positions.find(p => p.symbol === 'NVDAUSDT').qty, 1)
  })

  await test('Bitget: ordine sotto il minimo di 5 USDT → nessuna chiamata', async () => {
    const ex = bgSetup()
    await assert.rejects(open({ notional: 4 }), e => e instanceof LiveSkip && /5 USDT/.test(e.message))
    assert.equal(ex.calls.length, 0)
  })

  await test('Bitget: stop sparito → rimesso per la quantità della strategia (loss_plan)', async () => {
    const ex = bgSetup()
    const r = await open()
    ex.plans = []
    const c = await checkStop(bitget.api, { perp: 'AAPLUSDT', positionId: r.exchange.positionId, slPrice: r.exchange.sl, qty: r.qty })
    assert.equal(c.state, 'replaced')
    const pl = ex.calls.find(x => x.path.endsWith('/place-tpsl-order'))
    assert.equal(pl.body.planType, 'loss_plan'); assert.equal(pl.body.holdSide, 'buy'); assert.equal(pl.body.size, '0.5')
  })
} finally { globalThis.fetch = realFetch }

for (const [k, n] of results) console.log(`${k.padEnd(7)} ${n}`)
const bad = results.filter(r => r[0] !== 'OK').length
console.log(`\n${results.length - bad} prove superate${bad ? `, ${bad} fallite` : ''}`)
if (bad) process.exit(1)
