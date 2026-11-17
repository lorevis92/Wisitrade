// Prove del motore ICC (shared/icc.js) con candele costruite a mano: swing, zone daily, trend, Indication, Correction,
// Continuation (long e short specchio), invalidazione, scadenza, classificazione e voto, esito del paper tracking, filtri.
// node tests/icc.test.mjs
import assert from 'node:assert/strict'
import { swings, zonesFrom, trendOf, runIcc, outcome, classify, applyFilters, categoryOf, cleanIcc, H1, H4, D1 } from '../shared/icc.js'

let n = 0
const test = (name, fn) => { fn(); n++; console.log('ok', name) }
const T0 = Date.UTC(2026, 0, 5)
// candele 1H da una serie di chiusure (apertura = chiusura prima, ombre di 0,2)
const fromCloses = (cl, t0, start) => cl.map((c, i) => { const o = i ? cl[i - 1] : start; return { t: t0 + i * H1, o, h: Math.max(o, c) + 0.2, l: Math.min(o, c) - 0.2, c } })
const to4h = b1 => { const out = []; for (let i = 0; i + 3 < b1.length; i += 4) { const g = b1.slice(i, i + 4); out.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map(x => x.h)), l: Math.min(...g.map(x => x.l)), c: g[3].c }) } return out }
const lerp = (pts, k) => pts.slice(1).flatMap((p, i) => Array.from({ length: k }, (_, j) => pts[i] + (p - pts[i]) * (j + 1) / k))
// giornaliere: trend rialzista (massimi 108,5 → 108,7, minimi 89,5 → 90,5), zona in alto a 108,5–108,7
const D1M = [95, 100, 108, 98, 90, 98, 108.2, 99, 91, 97, 99]
const b1d = D1M.map((m, i) => ({ t: T0 - (D1M.length - i) * D1, o: m, h: m + 0.5, l: m - 0.5, c: m }))
// 4H: swing high a 100, swing low a 95, rottura sopra 100; poi 1H: estremo 105, correzione fino a 100,9, mini-struttura, continuation
const pre = lerp([96, 97, 98, 99, 100, 99, 98, 97, 96, 95, 96, 97, 98, 99, 101.5], 4)
const post = [102, 103, 104, 105, 104.4, 103.6, 102.8, 102, 101.4, 101.1, 101.4, 101.8, 101.4, 101.1, 101.3, 102.3, 103, 104, 105, 106, 107, 108, 109]
function scenario(postCl = post) {
  const cl = [...pre, ...postCl]
  const b1h = fromCloses(cl, T0, 96)
  return { b1h, b4h: to4h(b1h.slice(0, pre.length)).concat(to4h(b1h.slice(pre.length))), b1d }
}
const mirror = b => b.map(x => ({ ...x, o: 200 - x.o, c: 200 - x.c, h: 200 - x.l, l: 200 - x.h }))

test('swing con due candele per lato, zone daily, trend', () => {
  const sw = swings(b1d, 2, D1)
  assert.deepEqual(sw.map(x => `${x.type}${x.p}`), ['H108.5', 'L89.5', 'H108.7', 'L90.5'])
  assert.equal(sw[0].conf, b1d[4].t + D1) // confermato alla chiusura della seconda candela dopo
  assert.equal(trendOf(sw), 'up')
  const z = zonesFrom(sw, 2, 2)
  assert.deepEqual(z, [{ lo: 89.5, hi: 90.5, n: 2 }, { lo: 108.5, hi: 108.7, n: 2 }])
  assert.equal(trendOf(sw.map(x => ({ ...x, p: 200 - x.p, type: x.type === 'H' ? 'L' : 'H' }))), 'down')
})

test('sequenza long: Indication sulla chiusura 4H, Correction, Continuation; entrata, stop, TP1, TP2, voto A', () => {
  const r = runIcc(scenario())
  assert.equal(r.signals.length, 1, JSON.stringify(r.setups.map(x => [x.stage, x.why])))
  const g = r.signals[0]
  assert.equal(g.side, 1); assert.equal(g.levelKind, 'swing'); assert.ok(Math.abs(g.level - 100.2) < 1e-9)
  assert.ok(Math.abs(g.tp1 - 105.2) < 1e-9) // estremo dell'Indication
  assert.equal(g.tp2, 108.5)                 // prossima zona daily
  assert.equal(g.entry, 102.3)               // chiusura sopra lo swing della mini-struttura (101,8 + 0,2)
  assert.ok(g.stop < 100.9 && g.stop > 100.5) // oltre l'estremo della correzione
  assert.equal(g.trend, 'up'); assert.equal(g.scenario, 'a favore del trend'); assert.equal(g.grade, 'A'); assert.ok(g.rr >= 2)
  assert.equal(g.status, 'TP2'); assert.ok(g.R > 1)
})

test('sequenza short: specchio esatto', () => {
  const sc = scenario()
  const r = runIcc({ b1h: mirror(sc.b1h), b4h: mirror(sc.b4h), b1d: mirror(sc.b1d) })
  assert.equal(r.signals.length, 1)
  const g = r.signals[0]
  assert.equal(g.side, -1); assert.ok(Math.abs(g.entry - 97.7) < 1e-9); assert.equal(g.tp2, 91.5); assert.equal(g.grade, 'A'); assert.equal(g.status, 'TP2')
})

test('invalidazione: chiusura oltre l\'origine della rottura durante la correzione', () => {
  const r = runIcc(scenario([102, 103, 104, 105, 103, 101, 99, 97, 95, 94]))
  assert.equal(r.signals.length, 0)
  assert.equal(r.setups[0].stage, 'invalidato'); assert.match(r.setups[0].why, /origine/)
})

test('scadenza: nessuna correzione entro il limite', () => {
  const up = Array.from({ length: 80 }, (_, i) => 102 + i * 0.5)
  const r = runIcc({ ...scenario(up), s0: { maxIndBars: 72 } })
  assert.equal(r.setups[0].stage, 'scaduto'); assert.match(r.setups[0].why, /nessuna correzione/)
})

test('R:R sotto il minimo: setup scartato, nessun segnale', () => {
  const r = runIcc({ ...scenario(), s0: { minRR: 5 } })
  assert.equal(r.signals.length, 0); assert.equal(r.setups[0].stage, 'scartato')
})

test('classificazione e voto', () => {
  const s = cleanIcc({})
  assert.equal(classify({ side: 1, trend: 'up', levelKind: 'swing', rr: 2.5 }, s).grade, 'A')
  assert.equal(classify({ side: 1, trend: 'up', levelKind: 'swing', rr: 1.6 }, s).grade, 'B')
  assert.deepEqual([classify({ side: -1, trend: 'up', levelKind: 'zona', rr: 3 }, s).scenario, classify({ side: -1, trend: 'up', levelKind: 'zona', rr: 3 }, s).grade], ['inversione', 'C'])
  assert.deepEqual([classify({ side: 1, trend: 'range', levelKind: 'zona', rr: 2 }, s).scenario, classify({ side: 1, trend: 'range', levelKind: 'zona', rr: 2 }, s).grade], ['rottura di range', 'B'])
})

test('esito: metà a TP1 poi pareggio; stop e TP nella stessa candela = stop; senza TP2 tutto a TP1', () => {
  const s = cleanIcc({ fee: 0 })
  const sig = { side: 1, entry: 100, stop: 98, tp1: 104, tp2: 110 }
  const bar = (h, l, c = (h + l) / 2) => ({ t: 0, o: c, h, l, c })
  assert.deepEqual([outcome(sig, [bar(105, 101), bar(101, 99.5)], 0, s).status, outcome(sig, [bar(105, 101), bar(101, 99.5)], 0, s).R], ['TP1 poi pareggio', 1])
  assert.equal(outcome(sig, [bar(105, 97)], 0, s).status, 'stop')
  assert.equal(outcome(sig, [bar(105, 101), bar(111, 104)], 0, s).R, 3.5)
  assert.equal(outcome({ ...sig, tp2: null }, [bar(105, 101)], 0, s).R, 2)
  assert.equal(outcome(sig, [bar(101, 99)], 0, s).status, 'aperto')
})

test('filtri: trend di BTC per le altcoin e limite di segnali nella stessa direzione', () => {
  const s = cleanIcc({ maxSameDir: 1 })
  const sigs = [
    { symbol: 'SOLUSDT', category: 'crypto', side: 1, at: 1, exitAt: 10 },
    { symbol: 'ETHUSDT', category: 'crypto', side: 1, at: 2, exitAt: null },
    { symbol: 'NVDAUSDT', category: 'stock', side: -1, at: 3, exitAt: null },
    { symbol: 'XRPUSDT', category: 'crypto', side: -1, at: 4, exitAt: null },
  ]
  const r = applyFilters(sigs, s, { btcTrendAt: () => 'up' })
  assert.equal(r[0].filtered, null)
  assert.match(r[1].filtered, /già 1 segnali attivi long/)
  assert.equal(r[2].filtered, null) // azione: il filtro BTC non vale
  assert.match(r[3].filtered, /trend daily di BTC/)
})

test('categorie', () => {
  assert.equal(categoryOf('XAUUSDT'), 'commodity'); assert.equal(categoryOf('NVDAUSDT', new Set(['NVDAUSDT'])), 'stock')
  assert.equal(categoryOf('PENGSTOCKUSDT'), 'stock'); assert.equal(categoryOf('SOLUSDT'), 'crypto')
})

console.log(`${n} prove passate`)
