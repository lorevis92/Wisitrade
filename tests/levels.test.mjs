// Prova della pagina Livelli (shared/levels.js): livelli di struttura, forte/debole, commento per tutte le combinazioni, avvisi.
// node tests/levels.test.mjs
import assert from 'node:assert/strict'
import { structureLevels, buildLevels, narrate, stochPicture, jumpedLevels } from '../shared/levels.js'

const P = { high: 80, low: 20 }
let ok = 0
const test = (name, fn) => { fn(); ok++; console.log('ok', name) }

// candele a 4 ore che oscillano tra 90 e 110: massimi a 110 e minimi a 90 ripetuti
const H4 = 4 * 3600000, D1 = 864e5, H1 = 3600000
const wave = (n, step, lo, hi, period, t0) => Array.from({ length: n }, (_, i) => {
  const x = lo + (hi - lo) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / period))
  return { t: t0 + i * step, o: x, h: x + 0.5, l: x - 0.5, c: x, v: 100 }
})
const now = Date.UTC(2026, 10, 12, 12)
const b4 = wave(200, H4, 90, 110, 12, now - 200 * H4)
const b1d = wave(120, D1, 90, 110, 10, now - 120 * D1)
// volume concentrato vicino a 110 nell'ultima settimana e mezza (zona ad alto volume sulla resistenza)
const b1h = Array.from({ length: 300 }, (_, i) => {
  const x = i % 3 ? 109.5 + (i % 2) : 90 + (i % 20)
  return { t: now - (300 - i) * H1, o: x, h: x + 0.3, l: x - 0.3, c: x, v: i % 3 ? 500 : 20 }
})

test('struttura: trova 110 e 90 con più tocchi', () => {
  const s = structureLevels(b4, b1d)
  const near = p => s.levels.find(l => Math.abs(l.p - p) < 1.5)
  assert.ok(near(110.5) && near(110.5).n4 >= 3, 'resistenza a 110')
  assert.ok(near(89.5) && near(89.5).n4 >= 3, 'supporto a 90')
})

test('forte dove la struttura coincide con il volume, debole altrove', () => {
  const r = buildLevels({ bars4h: b4, bars1d: b1d, bars1h: b1h, now, price: 100 })
  const top = r.levels.find(l => l.source === 'struttura' && l.p > 105), bot = r.levels.find(l => l.source === 'struttura' && l.p < 95)
  assert.equal(top.strong, true)
  assert.equal(bot.strong, false)
})

// letture dello stocastico costruite a mano
const rd = (state, K, D, cross = null, k = null) => ({ state, K, D, cross, k: k || [K] })
const neutral = () => Object.fromEntries(['4h', '1h', '15m', '5m', '1m'].map(tf => [tf, rd('neutral', 50, 50)]))
const STOCH = {
  cross: () => ({ ...neutral(), '15m': rd('oversold', 15, 12, { dir: 'up', ago: 0, inZone: true }), '5m': rd('oversold', 10, 14) }),
  extreme: () => ({ ...neutral(), '15m': rd('oversold', 12, 15), '5m': rd('oversold', 8, 10) }),
  against: () => ({ ...neutral(), '1h': rd('neutral', 55, 60, { dir: 'down', ago: 0, inZone: false }) }),
  opposite: () => ({ ...neutral(), '15m': rd('overbought', 90, 85), '5m': rd('overbought', 92, 88) }),
  neutral,
}
const sup = strong => ({ p: 99, lo: 98.8, hi: 99.2, strong, source: 'struttura', structure: '3 reazioni a 4 ore', volume: strong ? 'POC sett.' : null })
const far = { p: 80, lo: 79.8, hi: 80.2, strong: true, source: 'struttura', structure: '3 reazioni a 4 ore', volume: 'POC sett.' }
const LEVELS = { strong: [sup(true)], weak: [sup(false)], none: [far] }

test('tutte le combinazioni livello × stocastico danno un commento', () => {
  for (const [lk, levels] of Object.entries(LEVELS)) {
    for (const [sk, make] of Object.entries(STOCH)) {
      const o = narrate({ price: 100, levels, atr4h: 2, reads: make(), params: P, fmt: String })
      assert.ok(o.headline && o.blocks.length >= 3, `${lk}/${sk}`)
      const ins = o.blocks.find(b => b.title === 'Insieme').text
      assert.ok(ins.length > 30 && !/undefined|NaN/.test(ins + o.headline), `${lk}/${sk}: ${ins}`)
      if (lk !== 'none') assert.equal(o.sp.cat, sk, `${lk}/${sk} categoria`)
      if (lk === 'strong' && sk === 'cross') assert.equal(o.tone, 'interesting')
      if (lk === 'none') assert.ok(o.warnings.some(w => /Nessun livello rilevante/.test(w)))
      if (sk === 'against' && lk !== 'none') assert.ok(o.warnings.some(w => /appena girato/.test(w)) && o.tone === 'risk')
    }
  }
})

test('senza dati: nessun errore', () => {
  assert.equal(narrate({ price: null, levels: null, atr4h: null, reads: {}, params: P }).headline, 'Carico i dati…')
  const o = narrate({ price: 100, levels: [], atr4h: 2, reads: {}, params: P, fmt: String })
  assert.ok(o.warnings.length >= 1)
})

test('stocastico 4h incollato in ipercomprato da ore: avviso', () => {
  const r = { ...neutral(), '4h': rd('overbought', 95, 93, null, [50, 85, 90, 92, 95]) }
  const sp = stochPicture(r, ['4h', '1h', '15m', '5m', '1m'], 1, P)
  assert.equal(sp.stuck[0].n, 4)
  const o = narrate({ price: 100, levels: LEVELS.strong, atr4h: 2, reads: r, params: P, fmt: String })
  assert.ok(o.warnings.some(w => /da 4 candele/.test(w)))
})

test('livello saltato senza reazione', () => {
  const b15 = Array.from({ length: 20 }, (_, i) => { const x = 95 + i * 0.5; return { t: i, o: x, h: x + 0.2, l: x - 0.2, c: x } })
  const j = jumpedLevels(b15, [{ p: 100, lo: 99.8, hi: 100.2, strong: true }], 2)
  assert.equal(j.length, 1)
  const back = b15.slice(); back[17] = { ...back[17], c: 99.5 }
  assert.equal(jumpedLevels(back, [{ p: 100, lo: 99.8, hi: 100.2, strong: true }], 2).length, 0)
})

console.log(`${ok} prove passate`)
