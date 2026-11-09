// Prove dei titoli operabili via API e dello stop loss dentro l'ordine (node tests/operable.test.mjs)
// Funzioni vere (server/strategy.js, server/live.js, server/operable.js, server/fast-run.js) su un Bitunix finto e un
// database finto in memoria. Il Bitunix finto rifiuta gli ordini con lo stesso messaggio del primo giorno Reale.
import assert from 'node:assert/strict'
import { nyTs } from '../shared/time.js'
import { STRATEGY_SYMBOLS, normalizeSettings, settingsFor } from '../shared/opening.js'
import { fakeDb, fakeBitunix } from './fakes.mjs'

const DAY = '2026-11-10'
const T = (min, sec = 0) => nyTs(DAY, 0) + min * 60000 + sec * 1000
const results = []
const test = async (name, fn) => { try { await fn(); results.push(['OK', name]) } catch (e) { results.push(['ERRORE', `${name} · ${e.stack?.split('\n').slice(0, 3).join(' ')}`]) } }

process.env.LIVE_TRADING = 'on'; process.env.BITUNIX_API_KEY = 'finta'; process.env.BITUNIX_SECRET_KEY = 'finta'
const { __setDb } = await import('../server/db.js')
const { entryEnv, accountGate, openSignal } = await import('../server/strategy.js')
const { realFastDeps } = await import('../server/fast-run.js')
const { RECHECK_DAYS } = await import('../server/operable.js')

const SYMS = ['AAPL', 'NVDA', 'AAOI', 'IREN', 'TSM']
const PRICES = { AAPLUSDT: 200, NVDAUSDT: 180, AAOIUSDT: 40, IRENUSDT: 30, TSMUSDT: 380 }
const pair = (symbol, api = true) => ({ symbol, basePrecision: 2, minQty: 0.01, quotePrecision: 2, maxLeverage: 50, api })

function setup({ bx = {}, marks = null, clock = T(571, 5), paperOn = true } = {}) {
  const ex = fakeBitunix({ prices: { ...PRICES }, ...bx })
  ex.clock = () => clock
  globalThis.fetch = ex.fetch
  Date.now = () => clock
  const lim = Object.fromEntries(STRATEGY_SYMBOLS.map(x => [x, { available: true, maxLev: 50, tiers: null, fundingH: 8 }]))
  const settings = { symbols: SYMS, capitalMode: 'dedicated', capitalDedicated: 300, maxPos: 10, leverage: 5, marginPct: 10, movePct: 1, room: 0, maxDayLoss: 10, brakePct: 0 }
  const D = fakeDb({
    wt_accounts: [
      { mode: 'live', enabled: true, balance: 0, start_balance: 0, updated_at: 0, settings },
      { mode: 'paper', enabled: paperOn, balance: 300, start_balance: 300, updated_at: 0, settings: { ...settings, capitalMode: 'percent' } },
    ],
    wt_prep: SYMS.map(symbol => ({ day: DAY, symbol, data: { ok: true, unit: 2, levels: [], slotVol: {} }, created_at: 0 })),
    wt_meta: [
      { key: 'pairs', value: { at: clock, list: Object.keys(PRICES).map(p => pair(p, p !== 'IRENUSDT')) } }, // IREN: isApiSupported = false
      { key: 'capital:live', value: { set: 300, start: 300, startAt: 0, current: 300, lossRef: 300, trades: 0, history: [] } },
      { key: 'bitunix:limits', value: { at: clock, data: lim } },
      ...(marks ? [{ key: 'api:marks', value: marks }] : []),
    ],
    wt_positions: [],
  })
  __setDb(D.client)
  return { ex, D }
}

// apertura di un segnale nel Reale come la fa il controllo ogni minuto
async function openLiveSignal(D, sym, price) {
  const row = D.tables.wt_accounts[0]
  const acc = { ...row, s: settingsFor('live', row.settings) }
  const ctx = { today: DAY, nowMin: 571, notes: [], accounts: { live: row }, braked: {}, mindex: null }
  const env = await entryEnv(ctx)
  const gate = await accountGate(env, ctx, acc, [])
  const sig = { k: { t: T(570), min: 570, o: price, h: price, l: price, c: price, v: 1 }, side: 1, entry: price, open: price / 1.0125, R: null }
  const r = await openSignal(env, ctx, gate, [], { sym, sig, prep: { ok: true, unit: 2, levels: [] }, price, timing: { src: 'minuto', signalAt: Date.now() } })
  await env.save()
  return { r, ctx, env }
}
const activeSyms = async mode => (await realFastDeps().loadState(DAY)).active.find(a => a.mode === mode)?.s.symbols || []
const marksOf = D => D.tables.wt_meta.find(m => m.key === 'api:marks')?.value || {}

const realFetch = globalThis.fetch, realNow = Date.now
try {
  await test('stop loss dentro l\'ordine: con la chiamata tpsl separata rifiutata (come AAPL) lo stop c\'è lo stesso, solo su quella posizione', async () => {
    const { ex, D } = setup({ bx: { noTpsl: ['AAPLUSDT'] } })
    const { r } = await openLiveSignal(D, 'AAPL', 200)
    assert.ok(r, 'trade non aperto')
    const open = ex.calls.find(c => c.path.endsWith('/place_order') && c.body.tradeSide === 'OPEN')
    assert.ok(+open.body.slPrice > 0 && +open.body.slPrice < 200, 'stop non dentro l\'ordine')
    assert.equal(open.body.slStopType, 'LAST_PRICE')
    const pos = ex.positions.find(p => p.symbol === 'AAPLUSDT')
    assert.ok(pos, 'posizione chiusa')
    assert.equal(ex.tpsl.length, 1); assert.equal(ex.tpsl[0].positionId, pos.positionId); assert.equal(ex.tpsl[0].qty, pos.qty)
    assert.ok(!ex.calls.some(c => c.path.endsWith('/tpsl/place_order')), 'chiamata tpsl separata inutile')
    const row = D.tables.wt_positions[0]
    assert.equal(row.exchange.slVia, 'ordine'); assert.equal(row.exchange.slOrderId, ex.tpsl[0].id)
    assert.deepEqual(marksOf(D), {})
  })

  await test('stop dentro l\'ordine ignorato e tpsl rifiutato: posizione chiusa subito, titolo segnato "stop", poi escluso da Prova e Reale', async () => {
    const { ex, D } = setup({ bx: { noTpsl: ['NVDAUSDT'], attachSl: { NVDAUSDT: false } } })
    const { r, ctx } = await openLiveSignal(D, 'NVDA', 180)
    assert.equal(r, null)
    assert.equal(ex.positions.filter(p => p.symbol === 'NVDAUSDT').length, 0, 'posizione senza stop rimasta aperta')
    assert.equal(D.tables.wt_positions.length, 0)
    assert.equal(marksOf(D).NVDA.kind, 'stop')
    assert.equal(ctx.notes.filter(n => /non operabile via API/.test(n.title)).length, 1)
    // costo vero dell'apertura e chiusura immediata (dallo storico di Bitunix) contato nel capitale dedicato
    const cost = D.tables.wt_meta.find(m => m.key === `closecost:${DAY}`).value[0]
    assert.equal(cost.symbol, 'NVDA'); assert.ok(cost.pnl < 0 && cost.fee > 0, JSON.stringify(cost))
    const cap = D.tables.wt_meta.find(m => m.key === 'capital:live').value
    assert.ok(Math.abs(cap.current - (300 + cost.pnl)) < 1e-9, `capitale ${cap.current}`)
    assert.ok(!(await activeSyms('live')).includes('NVDA')); assert.ok(!(await activeSyms('paper')).includes('NVDA'))
  })

  await test('ordine rifiutato "does not currently support trading via OpenAPI" (come AXTI): nessuna posizione, segnato "ordini", non si ritenta', async () => {
    const { ex, D } = setup({ bx: { noApi: ['TSMUSDT'] } })
    const { r, ctx } = await openLiveSignal(D, 'TSM', 380)
    assert.equal(r, null)
    assert.equal(ex.positions.length, 0)
    assert.equal(marksOf(D).TSM.kind, 'ordini')
    assert.equal(ctx.notes.length, 1); assert.match(ctx.notes[0].body, new RegExp(`${RECHECK_DAYS} giorni`))
    assert.ok(!(await activeSyms('live')).includes('TSM')); assert.ok(!(await activeSyms('paper')).includes('TSM'))
  })

  await test('coppia con isApiSupported = false (IREN): esclusa da Prova e Reale senza nessuna chiamata a Bitunix', async () => {
    const { ex } = setup()
    const live = await activeSyms('live'), paper = await activeSyms('paper')
    assert.deepEqual(live, ['AAPL', 'NVDA', 'AAOI', 'TSM']); assert.deepEqual(paper, live)
    assert.ok(!ex.calls.some(c => c.body?.symbol === 'IRENUSDT' || c.q?.symbol === 'IRENUSDT'))
  })

  await test(`segno più vecchio di ${RECHECK_DAYS} giorni: il titolo torna nella lista e si riprova`, async () => {
    const now = T(571, 5)
    setup({ marks: { AAOI: { kind: 'ordini', why: 'x', at: now - (RECHECK_DAYS + 0.1) * 86400000 }, AAPL: { kind: 'stop', why: 'x', at: now - 2 * 86400000 } } })
    const live = await activeSyms('live')
    assert.ok(live.includes('AAOI'), 'AAOI non riprovato'); assert.ok(!live.includes('AAPL'), 'AAPL riprovato troppo presto')
  })

  await test('stop non verificabile (lettura e tpsl rifiutate): posizione chiusa subito, mai posizioni senza stop sicuro', async () => {
    const { ex, D } = setup({ bx: { noTpsl: ['AAPLUSDT'], tpslReadFails: ['AAPLUSDT'] } })
    const { r } = await openLiveSignal(D, 'AAPL', 200)
    assert.equal(r, null)
    assert.equal(ex.positions.filter(p => p.symbol === 'AAPLUSDT').length, 0)
    assert.equal(marksOf(D).AAPL.kind, 'stop')
  })

  await test('stop dentro l\'ordine non creato ma tpsl accettato: stop con la chiamata separata, posizione tenuta', async () => {
    const { ex, D } = setup({ bx: { attachSl: { AAPLUSDT: false } } })
    const { r } = await openLiveSignal(D, 'AAPL', 200)
    assert.ok(r)
    assert.equal(ex.tpsl.length, 1); assert.equal(ex.tpsl[0].via, 'tpsl')
    assert.equal(D.tables.wt_positions[0].exchange.slVia, 'tpsl')
  })

  await test('Simulazione: opzione "solo titoli operabili via API" attiva di default', async () => {
    assert.equal(normalizeSettings({}).apiOnly, true)
    assert.equal(normalizeSettings({ apiOnly: false }).apiOnly, false)
  })
} finally {
  globalThis.fetch = realFetch
  Date.now = realNow
}

for (const [r, n] of results) console.log(r.padEnd(7), n)
if (results.some(r => r[0] !== 'OK')) process.exit(1)
