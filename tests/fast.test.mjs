// Prove del controllo veloce dell'apertura (node tests/fast.test.mjs)
// Parte 1: server/fast.js con orologio, prezzi e regole finti. Parte 2: percorso completo nel Reale con le funzioni vere
// (server/fast-run.js, server/strategy.js, server/live.js) su un Bitunix finto e un database finto in memoria.
import assert from 'node:assert/strict'
import { runFast } from '../server/fast.js'
import { nyTs } from '../shared/time.js'
import { normalizeSettings, STRATEGY_SYMBOLS } from '../shared/opening.js'
import { fakeDb, fakeBitunix } from './fakes.mjs'

const DAY = '2026-11-10' // martedì, giorno di borsa
const T = (min, sec = 0) => nyTs(DAY, 0) + min * 60000 + sec * 1000
const results = []
const test = async (name, fn) => { try { await fn(); results.push(['OK', name]) } catch (e) { results.push(['ERRORE', `${name} · ${e.stack?.split('\n').slice(0, 3).join(' ')}`]) } }

// ---------- Parte 1 ----------
function harness({ s, prices, lock = null, maxRun = 6 * 60000, start = T(569, 0) }) {
  let clock = start
  const calls = [], claims = new Set(), dayPos = [], skips = { paper: {}, live: {} }
  let lockV = lock, opens = null
  const S = normalizeSettings(s)
  const deps = {
    now: () => clock, sleep: async ms => { clock += Math.max(ms, 1) }, maxRun,
    nyDay: () => ({ date: DAY, trading: true }),
    getLock: async () => lockV, setLock: async v => { lockV = v; deps.lockHistory.push(v) }, lockHistory: [],
    getOpens: async () => opens, saveOpens: async (d, o) => { opens = { ...o } },
    prices: async () => prices(clock),
    loadState: async () => ({ accounts: {}, active: [{ mode: 'paper', s: S, balance: 300 }, ...(s.extraAccount ? [s.extraAccount] : [])], dayPos, skips, preps: Object.fromEntries(S.symbols.map(x => [x, { ok: true, unit: 1, levels: x === 'NVDA' ? [{ p: 98.5, t: 'minimo di ieri' }] : [] }])), braked: {}, mindex: null }),
    entryEnv: async () => { const env = { skips: {}, skip: (m, sym, why) => { (env.skips[m] ||= {})[sym] = why; skips[m][sym] = why }, save: async () => {} }; return env },
    accountGate: async (env, ctx, acc) => ({ s: acc.s, mode: acc.mode, taken: dayPos.filter(p => p.mode === acc.mode), rule: { maxPos: acc.s.maxPos } }),
    openSignal: async (env, ctx, gate, dp, x) => {
      if (gate.taken.some(p => p.symbol === x.sym)) return null
      if (gate.rule.maxPos > 0 && gate.taken.length >= gate.rule.maxPos) { env.skip(gate.mode, x.sym, 'limite posizioni al giorno'); return null }
      if (claims.has(x.sym)) return null
      claims.add(x.sym)
      calls.push({ sym: x.sym, side: x.sig.side, entry: x.sig.entry, open: x.sig.open, at: x.timing.signalAt, min: x.sig.k.min, src: x.timing.src })
      const row = { mode: gate.mode, symbol: x.sym }
      gate.taken.push(row); dp.push(row)
      return row
    },
    notify: async () => {},
  }
  return { deps, calls, skips, get opens() { return opens }, get lock() { return lockV } }
}
// prezzi: AAPL sale e supera +1,25% alle 9:30:17; AMZN idem; MSFT supera alle 9:31; NVDA scende sotto −1,25% alle 9:30:30 ma ha un livello vicino
const P1 = t => {
  const sec = (t - T(570)) / 1000
  const up = (base, from) => base * (1 + (sec <= from ? 0 : Math.min(0.02, (sec - from) * 0.0008)))
  return { AAPL: sec < 0 ? 99 : up(100, 1), AMZN: sec < 0 ? 49 : up(50, 1), MSFT: sec < 60 ? 80 : 81.2, NVDA: sec < 30 ? 100 : 98.7 }
}

await test('nessuna entrata prima delle 9:30; apertura = primo prezzo dalle 9:30:00; entra appena supera la soglia', async () => {
  const h = harness({ s: { symbols: ['AAPL', 'MSFT', 'NVDA', 'AMZN'], movePct: 1, room: 1, maxPos: 2 }, prices: P1 })
  await runFast(h.deps)
  assert.equal(h.opens.AAPL, 100)
  assert.deepEqual(h.calls.map(c => c.sym), ['AAPL', 'AMZN'])                // in ordine della lista, una sola volta
  const a = h.calls[0]
  assert.ok(a.at >= T(570, 16) && a.at <= T(570, 19), `segnale alle ${new Date(a.at).toISOString()}`)
  assert.ok(a.entry >= 101.25 && a.entry < 101.4)                       // prezzo letto appena oltre la soglia
  assert.equal(a.src, 'veloce')
  assert.equal(h.skips.paper.MSFT, 'limite posizioni al giorno')
  assert.match(h.skips.paper.NVDA, /troppo vicino/)                        // spazio dal livello
  assert.ok(h.calls.every(c => c.at >= T(570)))
})
await test('ritardo d\'entrata 2 minuti: niente prima delle 9:32, poi entra se è ancora oltre la soglia', async () => {
  const h = harness({ s: { symbols: ['AAPL'], movePct: 1, room: 0, maxPos: 5, entryDelay: 2 }, prices: P1 })
  await runFast(h.deps)
  assert.equal(h.calls.length, 1)
  assert.ok(h.calls[0].at >= T(572) && h.calls[0].at < T(572, 2))
})
await test('niente doppio ordine: il titolo preso non si riapre nei giri successivi', async () => {
  const h = harness({ s: { symbols: ['AAPL'], movePct: 1, room: 0, maxPos: 5 }, prices: P1 })
  await runFast(h.deps)
  assert.equal(h.calls.filter(c => c.sym === 'AAPL').length, 1)
})
await test('un altro controllo veloce attivo: si aspetta che finisca; il blocco dice al controllo ogni minuto quali modalità segue', async () => {
  const h = harness({ s: { symbols: ['AAPL'], movePct: 1, room: 0, maxPos: 5 }, prices: P1, lock: { day: DAY, until: T(569, 40), modes: ['paper'] } })
  await runFast(h.deps)
  const first = h.deps.lockHistory[0]
  assert.deepEqual(first.modes, ['paper'])
  assert.ok(first.until > T(570))
  assert.equal(h.lock.until, 0)                                          // rilasciato alla fine
  assert.equal(h.calls.length, 1)
})
await test('conto con filtro volume: non lo segue il controllo veloce (lo fa il controllo ogni minuto)', async () => {
  const S2 = normalizeSettings({ symbols: ['AAPL'], movePct: 1, room: 0, maxPos: 5, volIn: 1.5 })
  const h = harness({ s: { symbols: ['AAPL'], movePct: 1, room: 0, maxPos: 5, extraAccount: { mode: 'live', s: S2, balance: 300 } }, prices: P1 })
  await runFast(h.deps)
  assert.deepEqual(h.deps.lockHistory[0].modes, ['paper'])
})

// ---------- Parte 2: percorso completo nel Reale ----------
await test('Reale completo: entrata veloce con margine isolato, stop loss solo sulla posizione, tempi salvati; posizione manuale intatta; nessun doppio ordine', async () => {
  process.env.LIVE_TRADING = 'on'; process.env.BITUNIX_API_KEY = 'finta'; process.env.BITUNIX_SECRET_KEY = 'finta'
  let clock = T(569, 50)
  const realNow = Date.now
  Date.now = () => clock
  const ex = fakeBitunix({ prices: { AAPLUSDT: 200, MSFTUSDT: 400 } })
  ex.positions.push({ positionId: '777', symbol: 'MSFTUSDT', side: 1, qty: 1, entry: 390, marginMode: 'CROSS', leverage: 20, ctime: T(500) }) // manuale
  const realFetch = globalThis.fetch
  globalThis.fetch = ex.fetch
  const lim = Object.fromEntries(STRATEGY_SYMBOLS.map(x => [x, { available: true, maxLev: 50, tiers: null, fundingH: 8 }]))
  const D = fakeDb({
    wt_accounts: [
      { mode: 'live', enabled: true, balance: 0, start_balance: 0, updated_at: 0, settings: { symbols: ['AAPL', 'MSFT'], capitalMode: 'dedicated', capitalDedicated: 300, maxPos: 10, leverage: 5, marginPct: 10, movePct: 1, room: 0, maxDayLoss: 10, brakePct: 0 } },
      { mode: 'paper', enabled: false, balance: 300, start_balance: 300, updated_at: 0, settings: {} },
    ],
    wt_prep: ['AAPL', 'MSFT'].map(symbol => ({ day: DAY, symbol, data: { ok: true, unit: 2, levels: [], slotVol: {} }, created_at: 0 })),
    wt_meta: [
      { key: 'pairs', value: { at: clock, list: [{ symbol: 'AAPLUSDT', basePrecision: 2, minQty: 0.01, quotePrecision: 2, maxLeverage: 50 }, { symbol: 'MSFTUSDT', basePrecision: 2, minQty: 0.01, quotePrecision: 2, maxLeverage: 50 }] } },
      { key: 'capital:live', value: { set: 300, start: 300, startAt: 0, current: 300, lossRef: 300, trades: 0, history: [] } },
      { key: 'bitunix:limits', value: { at: clock, data: lim } },
    ],
    wt_positions: [],
  })
  const { __setDb } = await import('../server/db.js')
  __setDb(D.client)
  try {
    const { realFastDeps } = await import('../server/fast-run.js')
    const { entryEnv, accountGate, openSignal, settingsFor: _s } = await import('../server/strategy.js')
    const notes = []
    // prezzi: AAPL apre a 200 e supera +1,25% (202,5) alle 9:30:12; MSFT supera la soglia ma ha una posizione manuale
    const tick = () => { const sec = (clock - T(570)) / 1000; ex.prices.AAPLUSDT = sec < 10 ? 200 : 203; ex.prices.MSFTUSDT = sec < 5 ? 400 : 406 }
    const deps = { ...realFastDeps(), now: () => clock, sleep: async ms => { clock += Math.max(ms, 1); tick() }, maxRun: 90000, notify: async n => { notes.push(...n) } }
    ex.clock = () => clock
    tick()
    const log = await runFast(deps)
    // un solo ordine d'apertura, su AAPL; su MSFT (posizione manuale) nessuna scrittura
    const opens = ex.calls.filter(c => c.path.endsWith('/place_order') && c.body.tradeSide === 'OPEN')
    assert.equal(opens.length, 1, JSON.stringify(log))
    assert.equal(opens[0].body.symbol, 'AAPLUSDT')
    assert.ok(!ex.calls.some(c => c.method === 'POST' && c.body.symbol === 'MSFTUSDT'), 'scrittura su MSFT')
    assert.equal(ex.positions.find(p => p.positionId === '777').qty, 1)
    assert.equal(ex.settings.MSFTUSDT, undefined) // margine e leva di MSFT mai letti né cambiati
    // margine isolato e leva impostati e verificati prima dell'ordine
    const order = ex.writes()
    assert.ok(order.indexOf('account/change_margin_mode AAPLUSDT') < order.indexOf('trade/place_order AAPLUSDT'))
    assert.equal(ex.settings.AAPLUSDT.marginMode, 'ISOLATION'); assert.equal(ex.settings.AAPLUSDT.leverage, 5)
    // stop loss solo sulla posizione nata dall'ordine e per la sua quantità
    const pos = ex.positions.find(p => p.symbol === 'AAPLUSDT')
    assert.equal(ex.tpsl.length, 1); assert.equal(ex.tpsl[0].positionId, pos.positionId); assert.equal(ex.tpsl[0].qty, pos.qty)
    // posizione salvata con i tempi (segnale, ordine, esecuzione) e i prezzi
    const rows = D.tables.wt_positions.filter(p => p.mode === 'live')
    assert.equal(rows.length, 1)
    const tm = rows[0].exchange.timing
    assert.equal(tm.src, 'veloce')
    assert.ok(tm.signalAt >= T(570, 10) && tm.signalAt <= T(570, 12), new Date(tm.signalAt).toISOString())
    assert.ok(tm.orderAt >= tm.signalAt && tm.fillAt >= tm.orderAt)
    assert.equal(tm.sigPx, 203); assert.equal(rows[0].exchange.positionId, pos.positionId)
    // prezzo del segnale per lo slittamento = soglia (200 × 1,0125), prezzo letto a parte
    assert.equal(rows[0].exchange.slip.sigIn, 202.5); assert.equal(rows[0].exchange.slip.sigPx, 203); assert.equal(tm.level, 202.5)
    assert.ok(D.tables.wt_meta.some(m => m.key === `claim:live:${DAY}:AAPL`))
    const sk = D.tables.wt_meta.find(m => m.key === `orbskip:${DAY}`).value.live
    assert.match(sk.MSFT, /posizione aperta/)
    // registrazione (docs/dati-dal-vivo.md): dati d'entrata nel trade, segnali con ora e prezzo, primo prezzo oltre la soglia
    const rec = rows[0].exchange.rec
    assert.equal(rec.threshold, 202.5); assert.equal(rec.open, 200); assert.equal(rec.entry.sigPx, 203); assert.equal(rec.entry.orderId, rows[0].exchange.orderId)
    assert.ok(rec.entry.delayMs >= 0); assert.equal(rec.state.takenToday, 0); assert.equal(rec.size.leverage, 5); assert.deepEqual(rec.exits, [])
    assert.equal(rec.stop0, rows[0].init_stop)
    const evA = D.tables.wt_meta.find(m => m.key === `sig:${DAY}:live:AAPL`).value
    assert.equal(evA.at(-1).kind, 'aperto'); assert.equal(evA.at(-1).px, 203)
    const evM = D.tables.wt_meta.find(m => m.key === `sig:${DAY}:live:MSFT`).value
    assert.equal(evM[0].kind, 'scartato'); assert.match(evM[0].why, /posizione aperta/); assert.equal(evM[0].px, 406); assert.equal(evM[0].side, 1)
    const fi = D.tables.wt_meta.find(m => m.key === `fast:first:${DAY}`).value.live
    assert.equal(fi.AAPL.px, 203); assert.equal(fi.AAPL.before.px, 200); assert.ok(fi.AAPL.at >= T(570, 10) && fi.AAPL.at <= T(570, 12))
    assert.equal(fi.MSFT.px, 406); assert.ok(fi.MSFT.at < fi.AAPL.at)
    assert.ok(!ex.calls.some(c => c.method === 'POST' && c.body.symbol === 'MSFTUSDT'), 'scrittura su MSFT (dopo la registrazione)')
    // il controllo ogni minuto non riapre AAPL: anche con l'elenco del giorno vuoto (corsa) la prenotazione lo blocca
    const before = ex.calls.length
    const acc = { ...D.tables.wt_accounts[0], s: (await import('../shared/opening.js')).settingsFor('live', D.tables.wt_accounts[0].settings) }
    const ctx = { today: DAY, nowMin: 571, notes: [], accounts: { live: D.tables.wt_accounts[0] }, braked: {}, mindex: null }
    const env = await entryEnv(ctx)
    const gate = await accountGate(env, ctx, acc, [])
    const sig = { k: { t: T(571), min: 571, o: 203, h: 203, l: 203, c: 203, v: 1 }, side: 1, entry: 202.5, open: 200, R: null }
    const r2 = await openSignal(env, ctx, gate, [], { sym: 'AAPL', sig, prep: { ok: true, unit: 2, levels: [] }, price: 203, timing: { src: 'minuto', signalAt: clock } })
    assert.equal(r2, null)
    assert.ok(!ex.calls.slice(before).some(c => c.path.endsWith('/place_order')), 'secondo ordine inviato')
    assert.equal(D.tables.wt_positions.filter(p => p.mode === 'live').length, 1)
    // il blocco del controllo veloce è stato rilasciato alla fine
    assert.equal(D.tables.wt_meta.find(m => m.key === 'fast:lock').value.until, 0)
    // uscita (controllo ogni minuto): un minuto sale a 205, poi scende sotto lo stop → registrati massimo, minimo e uscita
    const { runStrategy } = await import('../server/strategy.js')
    const pos0 = D.tables.wt_positions[0]
    const bar = (min, o, h, l, c) => ({ t: T(min), o, h, l, c, v: 1 })
    clock = T(572, 5)
    const s1 = { AAPL: { '1m': [bar(570, 202.6, 203.5, 202.6, 203.2), bar(571, 203.2, 204, 203, 203.8)] } }
    await runStrategy(s1, { date: DAY, minutes: 572, isWeekday: true }, { only: 'exits' })
    const mid = D.tables.wt_positions[0]
    assert.equal(mid.status, 'open'); assert.equal(mid.exchange.rec.mx.hi, 204); assert.equal(mid.exchange.rec.mx.k.h, 203.5)
    assert.equal(mid.exchange.orderId, pos0.exchange.orderId) // il resto di exchange resta com'era
    clock = T(574, 5)
    const s2 = { AAPL: { '1m': [...s1.AAPL['1m'], bar(572, 203.8, 203.9, 196, 196.5), bar(573, 196.5, 197, 195, 196)] } }
    const lg2 = await runStrategy(s2, { date: DAY, minutes: 574, isWeekday: true }, { only: 'exits' })
    const done = D.tables.wt_positions[0]
    assert.equal(done.status, 'closed', JSON.stringify(lg2) + JSON.stringify(done))
    const x = done.exchange.rec.exits.at(-1)
    assert.equal(x.kind, 'finale'); assert.ok(x.level > 0); assert.equal(x.bar, T(572)); assert.equal(x.sigAt, T(573))
    assert.ok(x.sentAt >= x.sigAt); assert.equal(done.exchange.rec.mx.lo, 196)
    assert.equal(done.exchange.slip.sigIn, 202.5) // dati del Reale già salvati prima: invariati
  } finally {
    globalThis.fetch = realFetch
    Date.now = realNow
  }
})

await test('preparazione prima delle 9:30: margine isolato e leva impostati e verificati solo dove non hai posizioni né ordini', async () => {
  process.env.LIVE_TRADING = 'on'; process.env.BITUNIX_API_KEY = 'finta'; process.env.BITUNIX_SECRET_KEY = 'finta'
  const realNow = Date.now, realFetch = globalThis.fetch
  const clock = T(560); Date.now = () => clock
  const ex = fakeBitunix({ prices: { AAPLUSDT: 200, MSFTUSDT: 400, NVDAUSDT: 150 } })
  ex.positions.push({ positionId: '888', symbol: 'MSFTUSDT', side: -1, qty: 2, entry: 410, marginMode: 'CROSS', leverage: 20, ctime: T(400) })
  ex.orders.push({ orderId: '9', symbol: 'NVDAUSDT', clientId: 'manuale', side: 'BUY', qty: 1 })
  globalThis.fetch = ex.fetch
  const pairs = ['AAPL', 'MSFT', 'NVDA'].map(x => ({ symbol: x + 'USDT', basePrecision: 2, minQty: 0.01, quotePrecision: 2, maxLeverage: 50 }))
  const D = fakeDb({
    wt_accounts: [{ mode: 'live', enabled: true, balance: 0, start_balance: 0, updated_at: 0, settings: { symbols: ['AAPL', 'MSFT', 'NVDA'], leverage: 5 } }],
    wt_meta: [{ key: 'pairs', value: { at: clock, list: pairs } }], wt_positions: [],
  })
  const { __setDb } = await import('../server/db.js'); __setDb(D.client)
  try {
    const { presetLive } = await import('../server/strategy.js')
    await presetLive({ date: DAY, minutes: 560 }, 15000)
    const st = D.tables.wt_meta.find(m => m.key === `preset:${DAY}`).value
    assert.equal(st.AAPL, 'ok'); assert.match(st.MSFT, /posizione manuale/); assert.match(st.NVDA, /ordine in attesa/)
    assert.deepEqual(ex.settings.AAPLUSDT, { marginMode: 'ISOLATION', leverage: 5 })
    assert.ok(!ex.calls.some(c => c.method === 'POST' && ['MSFTUSDT', 'NVDAUSDT'].includes(c.body.symbol)))
    assert.equal(ex.settings.MSFTUSDT, undefined); assert.equal(ex.settings.NVDAUSDT, undefined)
  } finally { globalThis.fetch = realFetch; Date.now = realNow }
})

for (const [ok, name] of results) console.log(ok.padEnd(7), name)
process.exit(results.some(r => r[0] !== 'OK') ? 1 : 0)
