// Prova della strategia Turtle (shared/turtle.js) con candele giornaliere costruite a mano.
// node tests/turtle.test.mjs
import assert from 'node:assert/strict'
import { simulate, levelsOf, sizeTrade, cleanTurtle, TURTLE_DEFAULTS } from '../shared/turtle.js'

const D = 864e5, T0 = Date.UTC(2026, 0, 1)
let ok = 0
const test = (name, fn) => { fn(); ok++; console.log('ok', name) }
const day = (i, o, h, l, c) => ({ t: T0 + i * D, o, h, l, c, v: 1 })
// 30 giorni laterali tra 99 e 101 (ATR circa 2), poi breakout
const flat = n => Array.from({ length: n }, (_, i) => day(i, 100, 101, 99, 100))
const S = { ...TURTLE_DEFAULTS, slip: 0, fee: 0, funding: 0, leverage: 1, capital: 10000 }
const LIM = { X: { maxLev: 20, tiers: null, fundingH: 8 } }

test('livelli: massimo 20 giorni, minimo 10, ATR di Wilder', () => {
  const L = levelsOf(flat(30), S)
  assert.equal(L.hiN, 101); assert.equal(L.loM, 99); assert.ok(Math.abs(L.atr - 2) < 1e-9)
})

test('entrata al livello, stop = livello − 2 ATR, uscita al minimo trailing', () => {
  const b = flat(30)
  b.push(day(30, 100.5, 104, 100.4, 103)) // breakout: entra a 101, stop 97
  for (let i = 31; i < 40; i++) b.push(day(i, 103 + (i - 31), 105 + (i - 31), 102 + (i - 31), 104 + (i - 31)))
  b.push(day(40, 110, 110.5, 100, 101)) // minimo sotto il minimo dei 10 giorni → esce al livello
  const r = simulate({ X: b }, LIM, S)
  const tr = r.trades[0]
  assert.equal(tr.entry, 101)
  assert.equal(r.trades.length, 1)
  assert.ok(/minimo 10 giorni/.test(tr.reason), tr.reason)
  assert.equal(tr.exit, Math.min(110, Math.max(97, 100.4))) // minimo dei 10 giorni prima = 100,4 (giorno 30)
  // rischio 2% di 10000 = 200 su 4 punti di distanza = 50 unità
  assert.ok(Math.abs(tr.qty - 50) < 1e-9)
})

test('gap in apertura sopra il livello: entrata e stop calcolati dall\'apertura', () => {
  const b = flat(30)
  b.push(day(30, 106, 107, 105.5, 106.5))
  const r = simulate({ X: b }, LIM, S)
  assert.equal(r.open[0].entry, 106); assert.equal(r.open[0].stop0, 102)
})

test('giorno del breakout: esce solo se il minimo va sotto lo stop, al prezzo dello stop', () => {
  const b = flat(30)
  b.push(day(30, 100, 102, 96, 97)) // entra a 101, stop 97, minimo 96 → esce a 97
  b.push(day(31, 97, 103, 96.5, 102)) // nuovo breakout il giorno dopo (massimo 20 gg = 102 dal giorno 30) → no: 103 > 102
  const r = simulate({ X: b }, LIM, S)
  assert.equal(r.trades[0].exit, 97); assert.ok(/breakout/.test(r.trades[0].reason))
  assert.equal(r.trades.length + r.open.length, 2)
})

test('apertura sotto il livello d\'uscita: esce all\'apertura', () => {
  const b = flat(30)
  b.push(day(30, 100.5, 104, 100.4, 103))
  b.push(day(31, 95, 96, 94, 95))
  const r = simulate({ X: b }, LIM, S)
  assert.equal(r.trades[0].exit, 95); assert.ok(/apertura sotto/.test(r.trades[0].reason))
})

test('niente rientro nello stesso giorno dell\'uscita', () => {
  const b = flat(30)
  b.push(day(30, 100.5, 104, 100.4, 103))
  b.push(day(31, 99, 120, 94, 119)) // esce all'apertura (sotto 100,4? no: livello = max(97, 99) = 99 → minimo 94 < 99) e fa anche un nuovo massimo
  const r = simulate({ X: b }, LIM, S)
  assert.equal(r.trades.length, 1); assert.equal(r.open.length, 0)
})

test('leva entro il massimo di Bitunix e stop mai oltre la liquidazione', () => {
  const s = cleanTurtle({ ...S, leverage: 50 })
  const z = sizeTrade({ entry: 100, atr: 2, balance: 1000, free: 1000, s, lim: { maxLev: 5, tiers: null } })
  assert.equal(z.leverage, 5)
  // stop lontano (ATR grande) con leva alta: la liquidazione arriva prima dello stop → trade saltato
  const z2 = sizeTrade({ entry: 100, atr: 10, balance: 1e6, free: 2000, s: cleanTurtle({ ...S, leverage: 20, riskPct: 10 }), lim: { maxLev: 20, tiers: null } })
  assert.ok(z2.skip && /liquidazione/.test(z2.skip), JSON.stringify(z2))
})

test('rischio sul capitale attuale (dopo una perdita la posizione è più piccola)', () => {
  const s = cleanTurtle(S)
  const a = sizeTrade({ entry: 100, atr: 2, balance: 10000, free: 10000, s, lim: LIM.X })
  const b = sizeTrade({ entry: 100, atr: 2, balance: 8000, free: 8000, s, lim: LIM.X })
  assert.ok(Math.abs(b.qty / a.qty - 0.8) < 1e-9)
})

console.log(`${ok} prove passate`)
