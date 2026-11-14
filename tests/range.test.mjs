// Prova del riconoscimento dei range P e B (shared/range.js) con candele costruite a mano.
// node tests/range.test.mjs
import assert from 'node:assert/strict'
import { analyze, events, volumeProfile, trend4h } from '../shared/range.js'

const Q = 15 * 60000, T0 = Date.UTC(2026, 10, 2)
let bars = []
const bar = (o, h, l, c) => bars.push({ t: T0 + bars.length * Q, o, h, l, c, v: 100 })
const reset = () => { bars = [] }

// base piatta (ATR ~1), impulso al rialzo 100 → 110,5, range 107–110 per 15 ore con tocchi, poi uno scenario finale
function pRange(final) {
  reset()
  for (let i = 0; i < 60; i++) { const c = 100 + (i % 2 ? 0.2 : -0.2); bar(c, c + 0.5, c - 0.5, c) }
  for (let i = 0; i < 8; i++) { const o = 100 + i * 1.3; bar(o, o + 1.4, o - 0.1, o + 1.3) }
  const swing = [109.5, 108.5, 107.5, 108.5, 109.5]
  for (let i = 0; i < 60; i++) { const c = swing[i % 5]; bar(c, Math.min(c + 0.5, 110.0), Math.max(c - 0.5, 107.0), c) }
  final()
  return analyze(bars, {}, {})
}

let n = 0
const test = (name, fn) => { fn(); n++; console.log('ok', name) }

test('P valida, falso breakout verso il basso → setup long con entrata, stop, T1, T2 e target raggiunto', () => {
  const r = pRange(() => {
    bar(107.4, 107.5, 106.2, 106.6)          // chiude sotto il range
    bar(106.6, 107.6, 106.5, 107.5)          // e la successiva chiude di nuovo dentro: falso breakout
    for (let i = 0; i < 6; i++) bar(107.5, 107.6, 106.9, 107.2) // ritorna sul bordo: entrata limite eseguita
    for (let i = 0; i < 30; i++) { const o = 107.2 + i * 0.5; bar(o, o + 0.6, o - 0.1, o + 0.5) } // risale oltre T2
  })
  const rg = r.ranges.find(x => x.type === 'P')
  assert.ok(rg, 'range P trovato'); assert.ok(rg.validIdx !== null, 'range valido')
  assert.ok(rg.touchUp >= 1 && rg.touchDn >= 1 && rg.touchUp + rg.touchDn >= 3)
  assert.ok(Math.abs(rg.top - 110) < 0.6 && Math.abs(rg.bottom - 107) < 0.01)
  assert.equal(rg.fakeouts.length, 1); assert.equal(rg.fakeouts[0].dir, -1)
  const st = r.setups[0]
  assert.equal(st.side, 1); assert.equal(st.entry, rg.bottom); assert.ok(st.stop < 106.2); assert.equal(st.t1, rg.top)
  assert.ok(st.t2 > st.t1 && st.proj, 'nessun livello sopra: proiezione 1:1')
  assert.ok(st.rr >= 3 && st.valid); assert.equal(st.status, 'target'); assert.ok(st.R > 3)
  assert.ok(events(r).some(e => e.kind === 'setup') && events(r).some(e => e.kind === 'valid'))
})

test('falso breakout ma poi stop: −1R', () => {
  const r = pRange(() => {
    bar(107.4, 107.5, 106.2, 106.6); bar(106.6, 107.6, 106.5, 107.5)
    bar(107.5, 107.5, 104.0, 104.5)
  })
  const st = r.setups[0]
  assert.equal(st.status, 'stop'); assert.equal(st.R, -1)
})

test('entrata limite mai eseguita: scaduto', () => {
  const r = pRange(() => {
    bar(107.4, 107.5, 106.2, 106.6); bar(106.6, 107.9, 106.5, 107.8)
    for (let i = 0; i < 20; i++) bar(108.2, 108.6, 108.0, 108.3)
  })
  assert.equal(r.setups[0].status, 'scaduto')
})

test('breakout confermato (due chiusure fuori): range finito, nessun setup', () => {
  const r = pRange(() => { bar(110, 111.5, 109.9, 111.2); bar(111.2, 112.5, 111, 112.3) })
  const rg = r.ranges.find(x => x.type === 'P')
  assert.equal(rg.state, 'breakout'); assert.equal(r.setups.length, 0)
})

test('range troppo corto (meno di 12 ore): in formazione, nessun setup', () => {
  reset()
  for (let i = 0; i < 60; i++) { const c = 100 + (i % 2 ? 0.2 : -0.2); bar(c, c + 0.5, c - 0.5, c) }
  for (let i = 0; i < 8; i++) { const o = 100 + i * 1.3; bar(o, o + 1.4, o - 0.1, o + 1.3) }
  const swing = [109.5, 108.5, 107.5, 108.5, 109.5]
  for (let i = 0; i < 20; i++) { const c = swing[i % 5]; bar(c, Math.min(c + 0.5, 110.0), Math.max(c - 0.5, 107.0), c) }
  const r = analyze(bars, {}, {})
  const rg = r.ranges.find(x => x.type === 'P')
  assert.equal(rg.state, 'in formazione'); assert.equal(r.setups.length, 0)
})

test('ritracciamento oltre il 60%: non è una P', () => {
  const r = pRange(() => {})
  reset()
  for (let i = 0; i < 60; i++) { const c = 100 + (i % 2 ? 0.2 : -0.2); bar(c, c + 0.5, c - 0.5, c) }
  for (let i = 0; i < 8; i++) { const o = 100 + i * 1.3; bar(o, o + 1.4, o - 0.1, o + 1.3) }
  for (let i = 0; i < 30; i++) { const c = 110 - i * 0.3; bar(c, c + 0.4, c - 0.4, c - 0.3) }
  const r2 = analyze(bars, {}, {})
  assert.ok(!r2.ranges.some(x => x.type === 'P' && !x.dropped)); assert.ok(r.ranges.length > 0)
})

test('volume profile e trend a 4 ore', () => {
  const vb = [{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 10 }, ...Array.from({ length: 20 }, (_, i) => ({ t: i, o: 5, h: 5.2, l: 4.8, c: 5, v: 100 }))]
  const vp = volumeProfile(vb)
  assert.ok(Math.abs(vp.poc - 5) < 0.2 && vp.val <= 5 && vp.vah >= 5)
  const up = Array.from({ length: 120 }, (_, i) => ({ t: i, o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: 1 }))
  assert.equal(trend4h(up).trend, 'up')
  assert.equal(trend4h(up.map(b => ({ ...b, o: 400 - b.o, h: 400 - b.l, l: 400 - b.h, c: 400 - b.c }))).trend, 'down')
})
console.log(`\n${n} prove superate`)
