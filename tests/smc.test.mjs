// Prove delle regole SMC (shared/smc.js) con candele costruite a mano: swing, FVG, order block, direzione, sequenza completa
// short e long (specchio), decadenze, filtri (rischio/rendimento, costi), Simulazione (target, stop e target nella stessa candela).
// node tests/smc.test.mjs
import assert from 'node:assert/strict'
import { swingAt, fvgAt, obAt, flowOf, analyze, checkEntry, simulate, sizeSmc, exitOnBar, cleanSmc } from '../shared/smc.js'

let n = 0
const test = (name, fn) => { fn(); n++; console.log('ok', name) }
const M15 = 9e5, H4 = 144e5, DAY = 864e5
const T0 = Date.UTC(2026, 0, 5) // lunedì
const bar = (t, o, h, l, c) => ({ t, o, h, l, c, v: 1 })

// Candele di direzione 4h ribassiste (massimi 130 → 118, minimi 88 → 80), tutte chiuse prima delle candele d'entrata
const DIRHL = [[110, 100], [130, 105], [115, 95], [112, 88], [118, 96], [117, 90], [108, 85], [100, 80], [110, 90], [109, 91]]
const dirBars = (hl, end) => hl.map(([h, l], k) => bar(end - (hl.length - k) * H4, (h + l) / 2, h, l, (h + l) / 2))
// Candele d'entrata 15m del setup short: piatte, order block rialzista + FVG, salita, presa di 118, inversione, ritorno, rifiuto, discesa
function shortPath({ afterSweep = null, afterInv = null, afterEntry = null } = {}) {
  const P = []
  for (let k = 0; k < 20; k++) P.push([105, 105.5, 104.5, 105])
  P.push([105, 105.2, 104.3, 104.5])  // 20 order block (ribassista)
  P.push([104.5, 106.1, 104.5, 106])  // 21 candela 1 del FVG
  P.push([106, 108.2, 106, 108])      // 22
  P.push([108, 110.2, 107.9, 110])    // 23 candela 3: FVG 106.1 → 107.9
  for (const c of [112, 114, 116, 117.5]) { const o = P.at(-1)[3]; P.push([o, c + 0.2, o - 0.2, c]) }
  P.push([117.5, 118.6, 117.3, 117.6]) // 28 presa di 118
  if (afterSweep) return [...P, ...afterSweep]
  P.push([117.6, 117.7, 113.8, 114])  // 29 candela 1 del FVG ribassista
  P.push([114, 114.1, 109.8, 110])    // 30
  P.push([110, 110.2, 105.8, 106])    // 31 candela 3: FVG 110.2 → 113.8
  P.push([106, 106.1, 103.3, 103.5])  // 32 chiude sotto il minimo dell'order block (104.3): inversione
  if (afterInv) return [...P, ...afterInv]
  P.push([103.5, 104.4, 103.2, 104])  // 33 ritorno nella zona (massimo ≥ 104.3) e chiusura sotto: rifiuto
  P.push(...(afterEntry || [[104, 104.2, 101, 101.5], [101.5, 101.6, 95, 95.5], [95.5, 95.6, 88, 88.5], [88.5, 88.6, 79.5, 80]]))
  return P
}
const toBars = P => P.map(([o, h, l, c], k) => bar(T0 + k * M15, o, h, l, c))
const mirror = bars => bars.map(b => ({ ...b, o: 210 - b.o, c: 210 - b.c, h: 210 - b.l, l: 210 - b.h }))
const S = { entryTf: '15m', dirTf: '4h', fee: 0.02, slip: 0.01 }
const scenario = (opts = {}, D1 = []) => ({ E: toBars(shortPath(opts)), Dd: dirBars(DIRHL, T0), D1 })

test('swing (frattale a tre candele), confermato alla chiusura della terza', () => {
  const b = [bar(0, 1, 2, 1, 1), bar(1, 2, 3, 1.5, 2), bar(2, 1, 2.5, 1.2, 1)]
  assert.equal(swingAt(b, 2).high, 3)  // B.h 3 > A.h 2 e C.l 1.2 < B.l 1.5
  assert.equal(swingAt(b, 2).low, null)
  const c = [bar(0, 1, 2, 1, 1), bar(1, 2, 3, 1.5, 2), bar(2, 1, 2.5, 1.6, 1)]
  assert.equal(swingAt(c, 2).high, null) // C non scende sotto il minimo di B
  const d = [bar(0, 1, 2, 1, 1), bar(1, 1, 1.5, 0.5, 1), bar(2, 1, 1.8, 0.8, 1)]
  assert.equal(swingAt(d, 2).low, 0.5)
  assert.equal(swingAt(d, 1), null) // servono tre candele
})

test('FVG rialzista e ribassista con ampiezza minima', () => {
  const up = [bar(0, 1, 2, 1, 2), bar(1, 2, 4, 2, 4), bar(2, 4, 5, 2.5, 5)]
  assert.deepEqual([fvgAt(up, 2).side, fvgAt(up, 2).lo, fvgAt(up, 2).hi], [1, 2, 2.5])
  assert.equal(fvgAt(up, 2, 0.6), null) // gap 0.5 sotto il minimo
  const dn = [bar(0, 5, 5, 4, 4), bar(1, 4, 4, 2, 2), bar(2, 2, 3.5, 1, 1)]
  assert.deepEqual([fvgAt(dn, 2).side, fvgAt(dn, 2).lo, fvgAt(dn, 2).hi], [-1, 3.5, 4])
})

test('order block: ultima candela contraria prima del FVG, con chiusura oltre il suo estremo', () => {
  const E = toBars(shortPath())
  const f = fvgAt(E, 23, 0)
  const ob = obAt(E, 23, f, 5)
  assert.equal(ob.j, 20); assert.equal(ob.lo, 104.3); assert.equal(ob.hi, 105.2)
  // senza candela ribassista nelle 5 prima: niente order block
  const E2 = E.map((b, k) => (k === 20 ? { ...b, c: 105.1 } : b))
  assert.equal(obAt(E2, 23, fvgAt(E2, 23, 0), 5), null)
})

test('direzione: due massimi e due minimi decrescenti = ribassista, crescenti = rialzista, altrimenti neutra', () => {
  assert.equal(flowOf([130, 118], [88, 80]), -1)
  assert.equal(flowOf([118, 130], [80, 88]), 1)
  assert.equal(flowOf([130, 118], [80, 88]), 0)
  assert.equal(flowOf([130], [80, 88]), 0)
})

test('sequenza short completa: presa, inversione, ritorno, rifiuto; stop e target', () => {
  const r = analyze({ ...scenario(), s0: S })
  assert.equal(r.signals.length, 1, JSON.stringify(r.decayed))
  const g = r.signals[0]
  assert.equal(g.side, -1); assert.equal(g.i, 33)
  assert.equal(g.level.p, 118); assert.match(g.level.kinds, /direzione/)
  assert.deepEqual([g.ob.lo, g.ob.hi], [104.3, 105.2]); assert.deepEqual([g.fvg.lo, g.fvg.hi], [105.2, 106]) // il primo FVG del movimento (candele 20–22)
  assert.equal(g.sweep.i, 28); assert.equal(g.inv.i, 32)
  assert.ok(Math.abs(g.stop - (104.4 + 0.25 * g.atr)) < 1e-9)
  assert.equal(g.targets[0].p, 80) // minimo importante non preso sotto (timeframe di direzione)
  const ck = checkEntry(g, 104, S)
  assert.equal(ck.target, 80); assert.ok(ck.rr > 3)
})

test('sequenza long: specchio esatto dello short', () => {
  const sc = scenario()
  const r = analyze({ E: mirror(sc.E), Dd: mirror(sc.Dd), D1: [], s0: S })
  assert.equal(r.signals.length, 1)
  const g = r.signals[0]
  assert.equal(g.side, 1); assert.equal(g.i, 33); assert.equal(g.level.p, 92)
  assert.deepEqual([g.ob.lo, g.ob.hi], [104.8, 105.7])
  assert.ok(Math.abs(g.stop - (210 - 104.4 - 0.25 * g.atr)) < 1e-9)
  assert.equal(g.targets[0].p, 130)
})

test('direzione neutra: nessun setup (salvo interruttore)', () => {
  const sc = scenario()
  const Dd = dirBars([[110, 100], [130, 105], [115, 95], [112, 88], [118, 96], [117, 90], [108, 89.5], [100, 89], [110, 92], [109, 93]], T0)
  assert.equal(flowOf([130, 118], [88, 89]), 0)
  assert.equal(analyze({ ...sc, Dd, s0: S }).signals.length, 0)
  assert.equal(analyze({ ...sc, Dd, s0: { ...S, allowNeutral: true } }).signals.length, 1)
})

test('decadenze: chiusura oltre la presa, nessuna inversione, chiusura oltre la zona, nessun ritorno, target toccato', () => {
  let r = analyze({ ...scenario({ afterSweep: [[117.6, 119, 117.5, 118.8]] }), s0: S })
  assert.equal(r.decayed[0].reason, 'chiusura oltre la presa')
  r = analyze({ ...scenario({ afterSweep: Array.from({ length: 22 }, () => [117.6, 117.8, 117.4, 117.6]) }), s0: S })
  assert.match(r.decayed[0].reason, /nessuna inversione entro 20/)
  r = analyze({ ...scenario({ afterInv: [[103.5, 105.5, 103.4, 105.4]] }), s0: S })
  assert.equal(r.decayed[0].reason, 'chiusura oltre la zona dell\'order block')
  r = analyze({ ...scenario({ afterInv: Array.from({ length: 42 }, () => [103.5, 103.8, 103.2, 103.5]) }), s0: S })
  assert.match(r.decayed[0].reason, /nessun ritorno con rifiuto entro 40/)
  // minimo del giorno prima a 102 (importante): toccato durante il ritorno, prima del rifiuto
  const D1 = [bar(T0 - DAY, 150, 300, 102, 150)]
  r = analyze({ ...scenario({ afterInv: [[103.5, 103.6, 101.9, 103], [103, 104.4, 102.9, 104]] }, D1), s0: S })
  assert.equal(r.signals.length, 0)
  assert.equal(r.decayed[0].reason, 'prezzo arrivato al target prima dell\'entrata')
})

test('filtri: rischio/rendimento sotto 3, primo target con R ≥ 3, costi oltre il 20% del rischio', () => {
  const D1 = [bar(T0 - DAY, 150, 300, 102.5, 150)] // minimo del giorno prima a 102.5: target vicino
  const g = analyze({ ...scenario({}, D1), s0: S }).signals[0]
  assert.equal(g.targets[0].p, 102.5)
  assert.match(checkEntry(g, 104, S).skip, /rischio\/rendimento .* sotto 3/)
  assert.equal(checkEntry(g, 104, { ...S, firstRRTarget: true }).target, 80)
  const ck = checkEntry(g, 104, { ...S, fee: 0.06, slip: 0.05, firstRRTarget: true }) // costi veri: stop troppo stretto per 104
  assert.match(ck.skip, /commissioni e slittamento .* oltre il 20%/)
  assert.match(checkEntry(g, 106, S).skip, /oltre lo stop/)
})

test('dimensione: perdita allo stop = 2% del capitale, leva entro il massimo di Bitunix, stop oltre la liquidazione', () => {
  const s = cleanSmc({})
  const z = sizeSmc({ side: -1, entry: 100, stop: 101, balance: 1000, free: 1000, s, lim: { maxLev: 50 } })
  assert.ok(Math.abs(z.risk - 20) < 1e-9); assert.equal(z.leverage, 6) // 2000 di valore su 333 di margine
  const z2 = sizeSmc({ side: -1, entry: 100, stop: 101, balance: 1000, free: 1000, s, lim: { maxLev: 3 } })
  assert.equal(z2.leverage, 3); assert.ok(z2.risk < 20) // posizione ridotta: mai oltre la leva massima
  const z3 = sizeSmc({ side: 1, entry: 100, stop: 60, balance: 1000, free: 1000, s: { ...s, riskPct: 10, maxPos: 20 }, lim: { maxLev: 50 } })
  assert.match(z3.skip, /liquidazione/)
})

test('Simulazione: entrata all\'apertura dopo il rifiuto, uscita al target; stop e target nella stessa candela', () => {
  const data = { X: scenario() }
  const r = simulate(data, { X: { maxLev: 50 } }, { ...S, capital: 1000 })
  assert.equal(r.trades.length, 1)
  const t = r.trades[0]
  assert.equal(t.side, -1); assert.equal(t.reason, 'target'); assert.equal(t.signal, 104); assert.ok(t.entry < 104)
  assert.ok(t.pnl > 0 && t.R > 3, String(t.R)); assert.equal(r.summary.trades, 1); assert.equal(r.bySide.short.n, 1)
  // candela dopo l'entrata che tocca sia lo stop sia il target: senza candele da 1 minuto vale lo stop
  const both = { X: scenario({ afterEntry: [[104, 110, 79, 100]] }) }
  const r2 = simulate(both, { X: { maxLev: 50 } }, S)
  assert.equal(r2.trades[0].reason, 'stop'); assert.equal(r2.needM1.length, 1)
  const key = r2.needM1[0], t1 = +key.split(':')[1]
  const m1 = { [key]: [bar(t1, 104, 104.1, 79, 80), bar(t1 + 6e4, 80, 110, 80, 100)] } // prima il target
  assert.equal(simulate(both, { X: { maxLev: 50 } }, S, { m1 }).trades[0].reason, 'target')
})

test('uscita su candela: apertura già oltre lo stop = uscita all\'apertura', () => {
  const p = { side: -1, stop: 105, target: 90 }
  assert.deepEqual(exitOnBar(p, bar(0, 106, 107, 104, 105)), { px: 106, why: 'stop' })
  assert.deepEqual(exitOnBar(p, bar(0, 100, 101, 89, 95)), { px: 90, why: 'target' })
  assert.equal(exitOnBar(p, bar(0, 100, 101, 95, 96)), null)
})

console.log(`${n} prove passate`)
