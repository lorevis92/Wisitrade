// Prova del riconoscimento dei range P e B (shared/range.js) con candele costruite a mano.
// node tests/range.test.mjs
import assert from 'node:assert/strict'
import { analyze, events, volumeProfile, trend4h, weekProfiles, FEES, gradeAtLeast, isFinal } from '../shared/range.js'

const Q = 15 * 60000, T0 = Date.UTC(2026, 10, 3) // martedì: la settimana in corso parte da lunedì 2 novembre
let bars = []
const bar = (o, h, l, c, v = 100) => bars.push({ t: T0 + bars.length * Q, o, h, l, c, v })
const reset = () => { bars = [] }
// candele a 4 ore prima del range: in salita (trend rialzista), in discesa, o nessuna (trend non chiaro)
const H4 = 4 * 3600000
const trendBars = dir => (dir ? Array.from({ length: 120 }, (_, i) => { const c = 200 + dir * i; return { t: T0 - (120 - i) * H4, o: c - dir * 0.5, h: c + 1, l: c - 1, c, v: 1 } }) : [])

// base piatta (ATR ~1), impulso al rialzo 99,3 → 110,5, range 107–110,5 per 15 ore con tocchi, poi uno scenario finale
function pRange(final, trend = 1, opts = {}) {
  reset()
  for (let i = 0; i < 60; i++) { const c = 100 + (i % 2 ? 0.2 : -0.2); bar(c, c + 0.5, c - 0.5, c) }
  for (let i = 0; i < 8; i++) { const o = 100 + i * 1.3; bar(o, o + 1.4, o - 0.1, o + 1.3) }
  const swing = [109.5, 108.5, 107.5, 108.5, 109.5]
  for (let i = 0; i < 60; i++) { const c = swing[i % 5]; bar(c, Math.min(c + 0.5, 110.0), Math.max(c - 0.5, 107.0), c) }
  final()
  return analyze(bars, {}, { bars4h: trendBars(trend), ...opts })
}
const fakeDown = (v = 100) => { bar(107.4, 107.5, 106.2, 106.6, v); bar(106.6, 107.6, 106.5, 107.5) }
const fakeUp = (v = 100) => { bar(109.6, 110.9, 109.5, 110.6, v); bar(110.6, 110.7, 109.4, 109.6) }

let n = 0
const test = (name, fn) => { fn(); n++; console.log('ok', name) }

test('P valida, falso breakout verso il basso → long limite sul bordo, tre terzi fino ai target', () => {
  const r = pRange(() => {
    fakeDown()
    for (let i = 0; i < 6; i++) bar(107.5, 107.6, 106.9, 107.2) // ritorna sul bordo: entrata limite eseguita
    for (let i = 0; i < 30; i++) { const o = 107.2 + i * 0.5; bar(o, o + 0.6, o - 0.1, o + 0.5) } // risale oltre l'ultimo target
  })
  const rg = r.ranges.find(x => x.type === 'P')
  assert.ok(rg && rg.validIdx !== null, 'range P valido')
  assert.ok(rg.touchUp >= 1 && rg.touchDn >= 1 && rg.touchUp + rg.touchDn >= 3)
  assert.ok(Math.abs(rg.bottom - 107) < 0.01)
  assert.equal(rg.fakeouts.length, 1); assert.equal(rg.fakeouts[0].dir, -1)
  const st = r.setups[0]
  assert.equal(st.kind, 'falso'); assert.equal(st.variant, 'limite')
  assert.equal(st.side, 1); assert.equal(st.entry, rg.bottom); assert.ok(st.stop < 106.2); assert.equal(st.targets[0].p, rg.top)
  assert.equal(st.withImpulse, true); assert.ok(st.targets[1].proj, 'a favore dell\'impulso senza aree: proiezione 1:1')
  assert.equal(st.fit, 'a favore'); assert.ok(st.valid); assert.equal(st.status, 'target')
  assert.ok(Math.abs(st.R - st.rrAll) < 1e-9, 'tre terzi')
  const fees = (FEES.maker * st.entry + st.targets.reduce((x, t) => x + t.frac * FEES.maker * t.p, 0)) / 100 / (st.entry - st.stop)
  assert.ok(Math.abs(st.Rnet - (st.R - fees)) < 1e-9, 'commissioni limite')
  assert.ok(['A', 'B', 'C'].includes(st.grade) && st.reasons.length >= 5)
  assert.ok(events(r).some(e => e.kind === 'setup') && events(r).some(e => e.kind === 'valid'))
})

test('variante a mercato alla chiusura della candela di rientro: entrata e commissione diverse', () => {
  const r = pRange(() => { fakeDown(); for (let i = 0; i < 30; i++) { const o = 107.5 + i * 0.5; bar(o, o + 0.6, o - 0.1, o + 0.5) } })
  const st = r.setups[0], mk = st.market
  assert.equal(mk.variant, 'mercato'); assert.equal(mk.entry, 107.5); assert.equal(mk.fillIdx, st.idx)
  assert.ok(mk.rr < st.rr, 'a mercato il rischio/rendimento è più basso')
  assert.ok(r.trades.some(t => t.id === mk.id))
  assert.equal(st.status, 'scaduto', 'il limite sul bordo non è mai stato toccato')
})

test('long nella P con qualunque trend a 4 ore: valido; il trend cambia solo il contesto e il voto', () => {
  const a = pRange(fakeDown, 1).setups[0], b = pRange(fakeDown, 0).setups[0], c = pRange(fakeDown, -1).setups[0]
  assert.ok(a.valid && b.valid && c.valid)
  assert.equal(a.fit, 'a favore'); assert.equal(b.fit, 'neutro'); assert.equal(c.fit, 'contro')
  assert.ok(a.score > b.score && b.score > c.score)
})

test('short nella P (contro l\'impulso): T1 bordo opposto, T3 all\'origine; un terzo a T1 poi pareggio', () => {
  const r = pRange(() => {
    fakeUp()
    bar(109.6, 110.6, 109.5, 109.9)                                  // ritorno sul bordo alto (110,5): entrata limite
    for (let i = 0; i < 6; i++) { const o = 109.9 - i * 0.6; bar(o, o + 0.1, o - 0.7, o - 0.6) } // scende sotto T1 (107)
    for (let i = 0; i < 8; i++) { const o = 106.3 + i * 0.6; bar(o, o + 0.7, o - 0.1, o + 0.6) } // risale fino all'entrata
  }, 0)
  const st = r.setups[0]
  assert.equal(st.side, -1); assert.equal(st.withImpulse, false); assert.ok(st.valid)
  assert.equal(st.targets[0].p, 107)
  assert.ok(st.targets[2].p < 100 && st.targets[2].p > 99, 'T3 = origine dell\'impulso')
  assert.equal(st.status, 'pareggio dopo T1'); assert.ok(Math.abs(st.R - st.rrs[0] / 3) < 1e-9)
})

test('profilo settimanale: range sul POC → più punti nel voto; zone con molto volume', () => {
  const weekBefore = Array.from({ length: 140 }, (_, i) => ({ t: T0 - 8 * 864e5 + i * 3600000, o: 108.5, h: 108.8, l: 108.2, c: 108.5, v: 50 }))
  const spread = Array.from({ length: 30 }, (_, i) => ({ t: T0 - 8 * 864e5 + (140 + i) * 3600000, o: 95 + i, h: 96 + i, l: 95 + i, c: 96 + i, v: 1 }))
  const r = pRange(fakeDown, 1, { bars1h: [...weekBefore, ...spread] })
  const rg = r.ranges.find(x => x.type === 'P' && x.validIdx !== null)
  assert.ok(rg.strong?.some(x => x.name === 'POC sett. prec.'))
  assert.ok(r.setups[0].reasons.some(x => x.pts === 2 && /livello settimanale/.test(x.txt)))
  const wp = weekProfiles([...weekBefore, ...spread], T0 + 3600000)
  assert.ok(wp.prev.hvn.length >= 1 && wp.prev.hvn.some(z => z.lo <= 108.5 && z.hi >= 108.5))
})

test('volume della candela di rottura: debole alza il voto, forte lo abbassa', () => {
  const weak = pRange(() => fakeDown(30)).setups[0], strong = pRange(() => fakeDown(400)).setups[0]
  assert.equal(weak.score - strong.score, 2)
})

test('range trade: limite sul bordo, tutto fuori sul bordo opposto senza parziali', () => {
  const r = pRange(() => {}, 1)
  const rt = r.ranges.find(x => x.type === 'P').alt.inside
  assert.equal(rt.kind, 'range'); assert.equal(rt.targets.length, 1); assert.equal(rt.targets[0].frac, 1)
  assert.ok(rt.fillIdx !== null, 'il range torna sul bordo dopo essere diventato valido')
})

test('breakout con conferma: chiusura fuori, ritorno sul bordo, rottura del massimo della candela di breakout; 30% al primo target', () => {
  const r = pRange(() => {
    bar(109.8, 111.0, 109.7, 110.8)         // candela di breakout (massimo 111,0)
    bar(110.8, 111.0, 110.4, 110.6)         // resta fuori
    bar(110.6, 110.8, 110.1, 110.6)         // ritorno sul bordo (minimo sotto 110,5, chiusura sopra)
    bar(110.6, 111.6, 110.4, 111.4)         // rompe il massimo della candela di breakout → entrata a 111,0
    for (let i = 0; i < 40; i++) { const o = 111.4 + i * 0.4; bar(o, o + 0.5, o - 0.1, o + 0.4) }
  })
  const bo = r.ranges.find(x => x.type === 'P').alt.breakout
  assert.equal(bo.kind, 'breakout'); assert.equal(bo.side, 1); assert.equal(bo.entry, 111.0)
  assert.deepEqual(bo.targets.map(t => t.frac), [0.3, 0.7])
  assert.equal(bo.status, 'target'); assert.ok(bo.R > 0)
})

test('breakout con conferma annullato se una candela richiude dentro', () => {
  const r = pRange(() => { bar(109.8, 111.0, 109.7, 110.8); bar(110.8, 110.9, 109.0, 109.5) })
  assert.match(r.ranges.find(x => x.type === 'P').alt.breakout.status, /richiuso dentro/)
})

test('falso breakout ma poi stop: −1R e commissione dello stop', () => {
  const r = pRange(() => { fakeDown(); bar(107.5, 107.5, 104.0, 104.5) })
  const st = r.setups[0]
  assert.equal(st.status, 'stop'); assert.equal(st.R, -1); assert.ok(st.Rnet < -1); assert.ok(isFinal(st))
})

test('entrata limite mai eseguita: scaduto', () => {
  const r = pRange(() => { bar(107.4, 107.5, 106.2, 106.6); bar(106.6, 107.9, 106.5, 107.8); for (let i = 0; i < 20; i++) bar(108.2, 108.6, 108.0, 108.3) })
  assert.equal(r.setups[0].status, 'scaduto')
})

test('breakout confermato (due chiusure fuori): range finito, nessun falso breakout', () => {
  const r = pRange(() => { bar(110, 111.5, 109.9, 111.2); bar(111.2, 112.5, 111, 112.3) })
  assert.equal(r.ranges.find(x => x.type === 'P').state, 'breakout'); assert.equal(r.setups.length, 0)
})

test('range troppo corto (meno di 12 ore): in formazione, nessun setup', () => {
  reset()
  for (let i = 0; i < 60; i++) { const c = 100 + (i % 2 ? 0.2 : -0.2); bar(c, c + 0.5, c - 0.5, c) }
  for (let i = 0; i < 8; i++) { const o = 100 + i * 1.3; bar(o, o + 1.4, o - 0.1, o + 1.3) }
  const swing = [109.5, 108.5, 107.5, 108.5, 109.5]
  for (let i = 0; i < 20; i++) { const c = swing[i % 5]; bar(c, Math.min(c + 0.5, 110.0), Math.max(c - 0.5, 107.0), c) }
  const r = analyze(bars, {}, {})
  assert.equal(r.ranges.find(x => x.type === 'P').state, 'in formazione'); assert.equal(r.setups.length, 0)
})

test('ritracciamento oltre il 60%: non è una P', () => {
  reset()
  for (let i = 0; i < 60; i++) { const c = 100 + (i % 2 ? 0.2 : -0.2); bar(c, c + 0.5, c - 0.5, c) }
  for (let i = 0; i < 8; i++) { const o = 100 + i * 1.3; bar(o, o + 1.4, o - 0.1, o + 1.3) }
  for (let i = 0; i < 30; i++) { const c = 110 - i * 0.3; bar(c, c + 0.4, c - 0.4, c - 0.3) }
  assert.ok(!analyze(bars, {}, {}).ranges.some(x => x.type === 'P' && !x.dropped))
})

test('volume profile, trend a 4 ore e voto minimo', () => {
  const vb = [{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 10 }, ...Array.from({ length: 20 }, (_, i) => ({ t: i, o: 5, h: 5.2, l: 4.8, c: 5, v: 100 }))]
  const vp = volumeProfile(vb)
  assert.ok(Math.abs(vp.poc - 5) < 0.2 && vp.val <= 5 && vp.vah >= 5)
  const up = Array.from({ length: 120 }, (_, i) => ({ t: i, o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: 1 }))
  assert.equal(trend4h(up).trend, 'up')
  assert.equal(trend4h(up.map(b => ({ ...b, o: 400 - b.o, h: 400 - b.l, l: 400 - b.h, c: 400 - b.c }))).trend, 'down')
  assert.ok(gradeAtLeast('A', 'B') && gradeAtLeast('B', 'B') && !gradeAtLeast('C', 'B') && gradeAtLeast('C', 'C'))
})
console.log(`\n${n} prove superate`)
