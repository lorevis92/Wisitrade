// Prove del controllo leggero della pagina Range (server/range-alerts.js, fastCheck): usa solo range e livelli già calcolati.
// node tests/range-fast.test.mjs
import assert from 'node:assert/strict'
import { fastCheck, NEAR_ATR } from '../server/range-alerts.js'

const st = { atr: 10, price: 150, ranges: [{ type: 'P', top: 200, bottom: 100 }], levels: [{ p: 170, name: 'POC settimana' }] }
let n = 0
const test = (name, fn) => { fn(); n++; console.log('ok', name) }

test('prezzo calmo dentro il range: niente', () => {
  assert.deepEqual(fastCheck(st, { px: 150, near: false }, 152), { near: false, why: null })
})
test('prezzo che si avvicina a un bordo: segnalato una volta sola', () => {
  const px = 200 - NEAR_ATR * 10 + 1
  const r = fastCheck(st, { px: 180, near: false }, px)
  assert.equal(r.near, true); assert.match(r.why, /vicino al bordo alto del range P/)
  assert.equal(fastCheck(st, { px, near: true }, px + 0.5).why, null) // resta vicino: nessun nuovo segnale
})
test('livello noto attraversato (POC) e rottura del bordo', () => {
  assert.match(fastCheck(st, { px: 165, near: false }, 172).why, /POC settimana/)
  assert.match(fastCheck(st, { px: 198, near: true }, 203).why, /oltre bordo alto del range P/)
  assert.equal(fastCheck(st, { px: 203, near: true }, 205).why, null) // già fuori: nessun nuovo segnale
})
test('senza ATR o prezzo: niente', () => {
  assert.equal(fastCheck({ ...st, atr: null }, null, 199).why, null)
})
console.log(`${n} prove passate`)
