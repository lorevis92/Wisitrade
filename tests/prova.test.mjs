// Prove della Prova più vicina al Reale (node tests/prova.test.mjs, docs/be-e-prova-realistica.md):
// entrata al prezzo letto + slittamento misurato, uscite decise dall'app al prezzo letto − slittamento del tipo, freno con
// lo slittamento che cresce con l'ordine di chiusura, stop su Bitunix invariato; misura dello slittamento dai trade del Reale.
import assert from 'node:assert/strict'
import { nyTs } from '../shared/time.js'
import { STRATEGY_SYMBOLS } from '../shared/opening.js'
import { fakeDb, fakeBitunix } from './fakes.mjs'
import { measureSlip, provaEntry, provaExit, slipValues, PSLIP_DEFAULT } from '../server/pslip.js'

const DAY = '2026-11-10'
const T = (min, sec = 0) => nyTs(DAY, 0) + min * 60000 + sec * 1000
const results = []
const test = async (name, fn) => { try { await fn(); results.push(['OK', name]) } catch (e) { results.push(['ERRORE', `${name} · ${e.stack?.split('\n').slice(0, 3).join(' ')}`]) } }
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg || ''} ${a} invece di ${b}`)

await test('misura: entrata letto → eseguito, freno base + passo per posizione, pochi trade = 0,05%', async () => {
  const rows = []
  for (let i = 0; i < 6; i++) rows.push({ day: DAY, side: 1, reason: 'nessuna conferma', closed_at: T(600 + i), exchange: { timing: { src: 'veloce' }, slip: { sigPx: 100, fillIn: 100.02, fillOut: 99.9 }, rec: { exits: [{ kind: 'finale', readPx: 100 }] } } })
  for (let i = 0; i < 5; i++) rows.push({ day: DAY, side: -1, reason: 'freno di mercato', closed_at: T(590, i * 2), exchange: { timing: { src: 'veloce' }, slip: { sigPx: 50, fillIn: 49.99, sigOut: 50, fillOut: 50 * (1 + (0.1 + 0.05 * i) / 100) } } })
  rows.push({ day: DAY, side: 1, reason: 'stop loss (Bitunix)', closed_at: T(620), exchange: { timing: { src: 'minuto' }, slip: { byExchange: true, sigPx: 10, fillIn: 10.01, fillOut: 9.5, sigOut: 9.51 } } })
  const v = measureSlip(rows.sort((a, b) => b.closed_at - a.closed_at))
  near(v.in_veloce.pct, 0.02); assert.equal(v.in_veloce.n, 11); assert.equal(v.in_veloce.src, 'vivo')
  near(v.candela.pct, 0.1); assert.equal(v.candela.n, 6)
  near(v.freno.pct, 0.1); near(v.freno.step, 0.05); assert.equal(v.freno.n, 5)
  assert.equal(v.in_minuto.pct, PSLIP_DEFAULT); assert.equal(v.in_minuto.n, 1); assert.equal(v.in_minuto.src, 'predefinito') // 1 trade: troppo pochi
  assert.equal(v.segue.pct, PSLIP_DEFAULT); assert.equal(v.chiusura.n, 0)                                           // lo stop su Bitunix non conta
  // mai negativo: un'esecuzione media migliore del prezzo letto non rende la Prova più ottimista
  const good = Array.from({ length: 6 }, (_, i) => ({ day: DAY, side: 1, reason: 'resistenza', closed_at: T(600 + i), exchange: { timing: { src: 'veloce' }, slip: { sigPx: 100, fillIn: 99.9, fillOut: 100.2 }, rec: { exits: [{ readPx: 100 }] } } }))
  const g = measureSlip(good)
  assert.equal(g.in_veloce.pct, 0); assert.equal(g.candela.pct, 0)
})

await test('prezzi: entrata e uscite contro di te, long e short; senza valori salvati 0,05%', async () => {
  near(provaEntry(null, 'veloce', 100, 1).px, 100.05); near(provaEntry(null, 'minuto', 100, -1).px, 99.95)
  const saved = { values: { in_veloce: { pct: 0.12, n: 9, src: 'vivo' }, freno: { pct: 0.2, step: 0.04, n: 7, src: 'vivo' } } }
  near(provaEntry(saved, 'veloce', 200, 1).px, 200.24)
  near(provaExit(saved, 'freno', 100, -1, 0).px, 100.2); near(provaExit(saved, 'freno', 100, -1, 3).px, 100.32)
  near(provaExit(saved, 'candela', 100, 1).px, 99.95)
  assert.equal(slipValues(saved).segue.src, 'predefinito')
})

// ---------- percorso completo della Prova (server/strategy.js) con database e Bitunix finti ----------
const SET = { symbols: ['AAPL', 'MSFT'], capitalMode: 'pct', capitalPct: 100, maxPos: 10, leverage: 5, marginPct: 10, movePct: 1, room: 0, sl: 1, trail: 1, giveback: 0, brakePct: 0, maxDayLoss: 0 }
async function setup(extraMeta = []) {
  const realFetch = globalThis.fetch, realNow = Date.now
  const ex = fakeBitunix({ prices: { AAPLUSDT: 101, MSFTUSDT: 50 } })
  globalThis.fetch = ex.fetch
  const lim = Object.fromEntries(STRATEGY_SYMBOLS.map(x => [x, { available: true, maxLev: 50, tiers: null, fundingH: 8 }]))
  const D = fakeDb({
    wt_accounts: [
      { mode: 'paper', enabled: true, balance: 300, start_balance: 300, updated_at: 0, settings: SET },
      { mode: 'live', enabled: false, balance: 0, start_balance: 0, updated_at: 0, settings: {} },
    ],
    wt_prep: ['AAPL', 'MSFT'].map(symbol => ({ day: DAY, symbol, data: { ok: true, unit: 2, levels: [], slotVol: {} }, created_at: 0 })),
    wt_meta: [
      { key: 'pairs', value: { at: realNow(), list: [{ symbol: 'AAPLUSDT', basePrecision: 2, minQty: 0.01, quotePrecision: 2, maxLeverage: 50 }, { symbol: 'MSFTUSDT', basePrecision: 2, minQty: 0.01, quotePrecision: 2, maxLeverage: 50 }] } },
      { key: 'bitunix:limits', value: { at: realNow(), data: lim } },
      ...extraMeta,
    ],
    wt_positions: [],
  })
  const { __setDb } = await import('../server/db.js')
  __setDb(D.client)
  const restore = () => { globalThis.fetch = realFetch; Date.now = realNow }
  return { D, ex, restore }
}
const bar = (min, o, h, l, c) => ({ t: T(min), o, h, l, c, v: 1 })
const SLIP = { key: 'liveslip', value: { at: 1, values: { in_veloce: { pct: 0.1, n: 10, src: 'vivo' }, in_minuto: { pct: 0.1, n: 10, src: 'vivo' }, segue: { pct: 0.2, n: 10, src: 'vivo' }, candela: { pct: 0.3, n: 10, src: 'vivo' }, freno: { pct: 0.2, step: 0.1, n: 7, src: 'vivo' } } } }

await test('Prova: entrata al prezzo letto + slittamento misurato; stop e quantità dal prezzo ottenuto', async () => {
  const { D, restore } = await setup([SLIP])
  try {
    const { entryEnv, accountGate, openSignal } = await import('../server/strategy.js')
    const { settingsFor } = await import('../shared/opening.js')
    const { loadLiveSlip } = await import('../server/pslip.js')
    Date.now = () => T(571, 3)
    const ctx = { today: DAY, nowMin: 571, notes: [], accounts: { paper: D.tables.wt_accounts[0] }, braked: {}, mindex: null, pslip: await loadLiveSlip() }
    const env = await entryEnv(ctx)
    const acc = { ...D.tables.wt_accounts[0], s: settingsFor('paper', SET) }
    const gate = await accountGate(env, ctx, acc, [])
    const sig = { k: { t: T(570), min: 570, o: 100, h: 101.5, l: 100, c: 101.2, v: 1 }, side: 1, entry: 101, open: 100, R: null }
    const row = await openSignal(env, ctx, gate, [], { sym: 'AAPL', sig, prep: { ok: true, unit: 2, levels: [] }, price: 101, timing: { src: 'veloce', signalAt: T(570, 40), sigPx: 101, level: 101.25 } })
    near(row.entry, 101 * 1.001, 'entrata'); near(row.init_stop, 101 * 1.001 - 2, 'stop'); near(row.qty, 30 * 5 / (101 * 1.001), 'quantità')
    assert.deepEqual(row.exchange.prova, { read: 101, kind: 'in_veloce', cost: 0.1 })
    assert.equal(row.exchange.rec.entry.sigPx, 101); near(row.exchange.rec.entry.fillPx, 101.101)
  } finally { restore() }
})

await test('Prova: stop su Bitunix al livello (invariato); stop che segue al prezzo letto nel controllo − slittamento', async () => {
  const { D, restore } = await setup([SLIP])
  try {
    const { runStrategy } = await import('../server/strategy.js')
    const base = { mode: 'paper', day: DAY, status: 'open', qty: 1, margin: 20, capital: 200, leverage: 5, unit: 2, open_price: 100, move_pct: 1.25, level: null, entry_slot: 570, confirmed: false, stale_done: false, halved: false, entry_bar: T(570), opened_at: T(570), liq_price: null, half_done: false, np_done: false, exchange: { timing: { src: 'veloce' } } }
    // AAPL: scende sotto lo stop iniziale (100 − 2 = 98) → stop su Bitunix: al livello, come prima
    // MSFT: sale a 54 (stop che segue a 52), poi scende a 51,5 → uscita dell'app: prezzo letto (ultimo prezzo) − 0,2%
    D.tables.wt_positions.push({ ...base, id: 1, symbol: 'AAPL', side: 1, entry: 100, init_stop: 98, best: 100, last_bar: T(570) - 1 })
    D.tables.wt_positions.push({ ...base, id: 2, symbol: 'MSFT', side: 1, entry: 50, init_stop: 48, best: 50, last_bar: T(570) - 1 })
    Date.now = () => T(573, 20)
    const series = {
      AAPL: { '1m': [bar(570, 100, 100.5, 99.5, 100), bar(571, 100, 100.2, 97.5, 97.8), bar(572, 97.8, 98, 97, 97.4), bar(573, 97.4, 97.5, 97.2, 97.3)] },
      MSFT: { '1m': [bar(570, 50, 51, 49.8, 51), bar(571, 51, 54, 51, 53.8), bar(572, 53.8, 53.9, 51.5, 51.6), bar(573, 51.6, 51.7, 51.2, 51.3)] },
    }
    await runStrategy(series, { date: DAY, minutes: 573, isWeekday: true }, { only: 'exits' })
    const a = D.tables.wt_positions.find(p => p.id === 1), m = D.tables.wt_positions.find(p => p.id === 2)
    assert.equal(a.status, 'closed'); assert.equal(a.exit, 98); assert.equal(a.reason, 'stop loss')
    assert.equal(m.status, 'closed', JSON.stringify(m)); assert.equal(m.reason, 'ritracciamento')
    near(m.exit, 51.3 * (1 - 0.002), 'uscita MSFT') // prezzo letto in questo controllo (51,3), non il livello (52)
  } finally { restore() }
})

await test('Prova: freno di mercato con lo slittamento che cresce con l\'ordine di chiusura', async () => {
  const { D, restore } = await setup([SLIP])
  try {
    const { runStrategy } = await import('../server/strategy.js')
    D.tables.wt_accounts[0].settings = { ...SET, brakePct: 1 }
    const base = { mode: 'paper', day: DAY, status: 'open', margin: 20, capital: 300, leverage: 5, unit: 50, open_price: 100, move_pct: -1.25, level: null, entry_slot: 570, confirmed: true, stale_done: false, halved: false, entry_bar: T(570), opened_at: T(570), liq_price: null, half_done: false, np_done: false, exchange: { timing: { src: 'veloce' } } }
    D.tables.wt_positions.push({ ...base, id: 1, symbol: 'AAPL', side: -1, entry: 100, qty: 1.5, init_stop: 150, best: 100, last_bar: T(571) })
    D.tables.wt_positions.push({ ...base, id: 2, symbol: 'MSFT', side: -1, entry: 50, qty: 3, init_stop: 75, best: 50, last_bar: T(571) })
    Date.now = () => T(573, 20)
    const series = { AAPL: { '1m': [bar(572, 101, 104, 101, 104)] }, MSFT: { '1m': [bar(572, 50.5, 52, 50.5, 52)] } }
    await runStrategy(series, { date: DAY, minutes: 573, isWeekday: true }, { only: 'exits' })
    const a = D.tables.wt_positions.find(p => p.id === 1), m = D.tables.wt_positions.find(p => p.id === 2)
    assert.equal(a.reason, 'freno di mercato'); assert.equal(m.reason, 'freno di mercato')
    near(a.exit, 104 * (1 + 0.002), 'prima chiusa')      // short: si ricompra più caro, base 0,2%
    near(m.exit, 52 * (1 + 0.003), 'seconda chiusa')     // base + passo 0,1%
    assert.equal(m.exchange.rec?.exits?.at(-1)?.rank ?? 1, 1)
  } finally { restore() }
})

for (const [s, n] of results) console.log(s.padEnd(7), n)
if (results.some(r => r[0] !== 'OK')) process.exit(1)
