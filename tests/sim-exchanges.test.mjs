// Prove della Simulazione per exchange (node tests/sim-exchanges.test.mjs). Nessuna chiamata vera: Bitget finto via fetch,
// database in memoria. Controlla: archivio per exchange (righe Bitunix intatte, righe Bitget "<titolo>@bitget", nomi diversi
// come CAT, caricamento a pezzi che riprende), lettura per exchange e minimo per ordine nella Simulazione.
import assert from 'node:assert/strict'
import { nyTs, addDays, weekdayOf } from '../shared/time.js'
import { normalizeSettings, isTradingDay } from '../shared/opening.js'
import { runSimulation } from '../shared/engine.js'
import { fakeDb } from './fakes.mjs'

const results = []
const test = async (name, fn) => { try { await fn(); results.push(['OK', name]) } catch (e) { results.push(['ERRORE', `${name} · ${e.stack?.split('\n').slice(0, 3).join(' ')}`]) } }
const { __setDb } = await import('../server/db.js')
const A = await import('../server/archive.js')
const MIN = 60000

// ---------- Bitget finto: solo NVDAUSDT e CATUSDT (Caterpillar), dal 10/11/2026 ----------
const FIRST = '2026-11-10'
const exists = new Set(['NVDAUSDT', 'CATUSDT'])
const pxOf = perp => (perp === 'NVDAUSDT' ? 100 : 500)
const calls = []
const fakeFetch = async url => {
  const u = new URL(url), q = Object.fromEntries(u.searchParams)
  calls.push(u.pathname + ' ' + (q.symbol || ''))
  const ok = data => new Response(JSON.stringify({ code: '00000', msg: 'success', data }), { status: 200 })
  if (u.pathname !== '/api/v2/mix/market/history-candles') return new Response(JSON.stringify({ code: '404', msg: 'finto' }), { status: 400 })
  if (!exists.has(q.symbol)) return new Response(JSON.stringify({ code: '40034', msg: `Parameter ${q.symbol} does not exist` }), { status: 400 })
  const first = q.granularity === '1D' ? Date.parse(FIRST + 'T00:00:00Z') : nyTs(FIRST, 0), end = +q.endTime, step = q.granularity === '1D' ? 86400000 : MIN
  let start = q.startTime ? +q.startTime : end - 200 * step
  start = Math.max(start, first)
  const out = []
  for (let t = Math.ceil(start / step) * step; t < end && out.length < 200; t += step) { const p = pxOf(q.symbol); out.push([String(t), String(p), String(p + 1), String(p - 1), String(p), '10', String(10 * p)]) }
  return ok(out)
}

const realFetch = globalThis.fetch
try {
  globalThis.fetch = fakeFetch

  await test('archivio Bitget: righe "<titolo>@bitget", Bitunix intatto, CATERPILLAR scaricato da CATUSDT', async () => {
    const bitunixRow = { symbol: 'NVDA', day: FIRST, t0: nyTs(FIRST, 540), n: 450, data: A.encodeDay([{ t: nyTs(FIRST, 570), o: 200, h: 201, l: 199, c: 200, v: 5 }], nyTs(FIRST, 540)).data, created_at: 1 }
    const D = fakeDb({ wt_meta: [], wt_bars: [bitunixRow] }); __setDb(D.client)
    const r = await A.fillArchive({ ex: 'bitget', budgetMs: 120000 })
    assert.ok(r.saved > 0, JSON.stringify(r))
    const rows = D.tables.wt_bars
    assert.deepEqual(rows.find(x => x.symbol === 'NVDA'), bitunixRow) // la riga di Bitunix non cambia
    assert.ok(rows.some(x => x.symbol === 'NVDA@bitget' && x.day === FIRST && x.n === 450))
    assert.ok(rows.some(x => x.symbol === 'CATERPILLAR@bitget'))
    assert.ok(calls.some(c => c.endsWith('CATUSDT')))
    // listing: NVDA dal primo giorno, DIS non disponibile su Bitget
    const L = D.tables.wt_meta.find(x => x.key === 'archive:listing:bitget').value
    assert.equal(L.NVDA.first, FIRST); assert.equal(L.DIS.unavailable, true)
    assert.ok(!D.tables.wt_meta.some(x => x.key === 'archive:listing')) // il listing di Bitunix non si tocca
    // stato per exchange
    const bx = await A.existing('bitunix'), bg = await A.existing('bitget')
    assert.deepEqual(bx.map(x => x.symbol), ['NVDA'])
    assert.ok(bg.every(x => !x.symbol.includes('@')) && bg.some(x => x.symbol === 'NVDA'))
    const st = await A.archiveStatus('bitget')
    assert.equal(st.first, FIRST); assert.equal(st.symbols.find(x => x.symbol === 'CATERPILLAR').perp, 'CATUSDT')
    // lettura per exchange: stesse chiavi per titolo, prezzi dell'exchange giusto
    const dBx = await A.loadDays(['NVDA'], FIRST, FIRST), dBg = await A.loadDays(['NVDA'], FIRST, FIRST, { ex: 'bitget' })
    assert.equal(dBx[FIRST].NVDA[0].o, 200); assert.equal(dBg[FIRST].NVDA[0].o, 100)
    // si riprende da dove si è fermato: il secondo giro non riscarica niente
    const n0 = calls.length
    const r2 = await A.fillArchive({ ex: 'bitget', budgetMs: 120000 })
    assert.equal(r2.saved, 0)
    assert.ok(calls.length - n0 < 5, `${calls.length - n0} richieste in più`)
  })

  await test('archivio Bitget a pezzi: con poco tempo si ferma e il giro dopo continua', async () => {
    const D = fakeDb({ wt_meta: [], wt_bars: [] }); __setDb(D.client)
    const a = await A.fillArchive({ ex: 'bitget', budgetMs: 16000 })
    const b = await A.fillArchive({ ex: 'bitget', budgetMs: 120000 })
    const days = D.tables.wt_bars.filter(x => x.symbol === 'NVDA@bitget').length
    assert.ok(days > 0 && a.saved + b.saved >= days, JSON.stringify({ a, b, days }))
    assert.ok(!b.remaining, JSON.stringify(b))
  })
} finally { globalThis.fetch = realFetch }

// ---------- Minimo per ordine nella Simulazione ----------
await test('Simulazione: il minimo per ordine dell\'exchange blocca i trade troppo piccoli, come nel Reale', async () => {
  // 12 giorni di storico tranquillo, poi un giorno con un salto alle 9:31
  const days = {}
  let d = '2026-10-20', k = 0
  while (k < 13) {
    if (isTradingDay(d, weekdayOf(d))) {
      const bars = []
      for (let m = 540; m < 990; m++) {
        let p = 100 + Math.sin(m / 7) * 0.4
        if (k === 12 && m >= 571) p = 104 + (m - 571) * 0.02
        bars.push({ t: nyTs(d, m), o: p, h: p + 0.15, l: p - 0.15, c: p, v: 100, min: m })
      }
      days[d] = { NVDA: bars }
      k++
    }
    d = addDays(d, 1)
  }
  const last = Object.keys(days).sort().at(-1)
  const s = normalizeSettings({ symbols: ['NVDA'], room: 0, capitalMode: 'fixed', capitalFixed: 100, marginPct: 10, leverage: 5 })
  const base = runSimulation(days, s, { from: last, to: last, capital: 300, analysis: false })
  assert.ok(base.n >= 1, `senza minimo serve almeno un trade (${JSON.stringify(base.skips)})`)
  const blocked = runSimulation(days, s, { from: last, to: last, capital: 300, analysis: false, minOrder: { NVDA: { minQty: 0.01, minNotional: 1000, basePrecision: 2 } } })
  assert.equal(blocked.n, 0)
  assert.ok(blocked.skips.some(x => x.why === 'sotto il minimo per ordine'))
  const okMin = runSimulation(days, s, { from: last, to: last, capital: 300, analysis: false, minOrder: { NVDA: { minQty: 0.01, minNotional: 5, basePrecision: 2 } } })
  assert.equal(okMin.n, base.n); assert.equal(okMin.net, base.net) // sopra il minimo: stesso risultato di prima
})

for (const [k, n] of results) console.log(`${k.padEnd(7)} ${n}`)
const bad = results.filter(r => r[0] !== 'OK').length
console.log(`\n${results.length - bad} prove superate${bad ? `, ${bad} fallite` : ''}`)
if (bad) process.exit(1)
