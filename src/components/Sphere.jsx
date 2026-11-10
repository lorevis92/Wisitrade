// Sfera animata dei risultati: posizioni aperte come bolle che galleggiano, trade chiusi che cadono e si depositano
// sul fondo in due strati (verde guadagni, rosso perdite). LiveSphere per Prova e Reale, SimSphere per la Simulazione.
// Disegno su canvas 2D con requestAnimationFrame: si ferma da solo quando la sfera non è visibile o la scheda è nascosta.
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtSigned, fmtUsd } from '../lib/api.js'

const COL = { long: [0, 229, 199], short: [255, 92, 122], calm: [118, 132, 168] }
const FONT_UI = 'Syne, system-ui, sans-serif'
const FONT_NUM = '"DM Mono", ui-monospace, monospace'
const TAU = Math.PI * 2
const HMAX = 0.5 // altezza massima del deposito, in frazioni del raggio
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const ease = (rate, dt) => 1 - Math.exp(-rate * dt)
const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0)
const mix = c => { const to = c >= 0 ? COL.long : COL.short, k = Math.min(1, Math.abs(c)); return COL.calm.map((v, i) => Math.round(lerp(v, to[i], k))) }
const light = (rgb, k) => rgb.map(v => Math.round(lerp(v, 255, k)))
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(a, 0, 1)})`
const money = v => fmtSigned(v).replace('-', '−')
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ---------- scena ----------
function newScene(kind) {
  return {
    kind, t: 0, geo: null, bubbles: [], byId: new Map(), counted: new Set(), landed: new Set(),
    layers: { gain: { v: 0, n: 0, h: 0, vh: 0 }, loss: { v: 0, n: 0, h: 0, vh: 0 } },
    ripples: [], drops: [], mood: 0, moodT: 0, total: 0, totalT: 0, label: '', sub: '', scale: 1,
    ring: kind === 'sim' ? { p: 0, pT: 0, spin: 0, indet: false } : null, replay: null, onTick: null, tickAt: 0,
  }
}
function clearScene(sc) {
  sc.bubbles = []; sc.byId.clear(); sc.counted.clear(); sc.landed.clear(); sc.ripples = []; sc.drops = []
  for (const l of Object.values(sc.layers)) Object.assign(l, { v: 0, n: 0 })
  sc.totalT = 0; sc.moodT = 0; sc.replay = null
  if (sc.ring) Object.assign(sc.ring, { p: 0, pT: 0 })
}
function setPnl(b, v) { if (b.pnl !== v || b.txt === undefined) { b.pnl = v; b.txt = money(v) } }
function addBubble(sc, o) {
  const b = { x: null, y: null, vx: 0, vy: 0, r: 0, rT: 0, c: 0, a: 0, ph: Math.random() * TAU, state: 'float', count: 1, ...o }
  setPnl(b, o.pnl || 0)
  sc.bubbles.push(b)
  if (b.id !== undefined && b.id !== null) sc.byId.set(b.id, b)
  return b
}
function addToLayer(sc, value, count = 1) {
  const l = value > 0 ? sc.layers.gain : sc.layers.loss
  l.v += Math.abs(value); l.n += count
}

// zona dove galleggiano le bolle e superficie del deposito
const zone = g => ({ x: g.cx, y: g.cy + 0.1 * g.R, rx: 0.64 * g.R, ry: 0.22 * g.R })
function depositTargets(sc) {
  const { R } = sc.geo, g = sc.layers.gain, l = sc.layers.loss, tot = g.v + l.v
  if (!(tot > 0)) return [0, 0]
  const H = R * HMAX
  const fill = sc.kind === 'sim' ? clamp(tot / Math.max(sc.scale, 1e-9), 0, 1) * 0.92 : clamp(tot / Math.max(sc.scale, tot), 0.18, 1)
  const MIN = Math.max(16, R * 0.13) // spazio minimo per scrivere dentro lo strato
  let hg = H * fill * g.v / tot, hl = H * fill * l.v / tot
  if (g.n) hg = Math.max(hg, MIN)
  if (l.n) hl = Math.max(hl, MIN)
  return [hg, hl]
}
function wave(sc, x, idx, h) {
  const t = sc.t, amp = Math.min(1, h / 12) * (sc.geo.R / 150)
  let y = amp * (1.5 * Math.sin(x * 0.045 + t * 1.6 + idx * 2.1) + 0.9 * Math.sin(x * 0.083 - t * 1.15 + idx))
  if (idx === 0) return y * 0.55
  for (const r of sc.ripples) {
    const age = t - r.at, dx = x - r.x, w = sc.geo.R * 0.32
    y += r.amp * Math.exp(-age * 2.4) * Math.sin(dx * 0.12 - age * 9) * Math.exp(-(dx * dx) / (w * w))
  }
  return y
}
function surfaces(sc) {
  const { cy, R } = sc.geo, g = sc.layers.gain, l = sc.layers.loss
  const bottom = cy + R, gainTop = bottom - g.h, lossTop = gainTop - l.h
  return { bottom, gainTop, lossTop }
}
function surfaceAt(sc, x) {
  const s = surfaces(sc), h = sc.layers.gain.h + sc.layers.loss.h
  return s.lossTop + wave(sc, x, 1, h)
}

function land(sc, b) {
  b.dead = true
  if (b.id !== undefined && b.id !== null) { sc.byId.delete(b.id); sc.landed.add(b.id) }
  addToLayer(sc, b.value, b.count)
  const col = mix(sgn(b.value))
  if (sc.ripples.length > 10) sc.ripples.shift()
  sc.ripples.push({ x: b.x, at: sc.t, amp: clamp(1.5 + b.r * 0.18, 2, 7) })
  const n = sc.kind === 'sim' ? 3 : 7
  for (let i = 0; i < n && sc.drops.length < 90; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, sp = sc.geo.R * (0.35 + Math.random() * 0.55)
    sc.drops.push({ x: b.x, y: b.y + b.r * 0.4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, r: 1 + Math.random() * 1.6, col })
  }
}

// ---------- movimento ----------
function step(sc, dt, realDt = dt) {
  const g = sc.geo
  if (!g) return
  sc.t += dt
  const { cx, cy, R } = g, ez = zone(g)
  if (sc.replay) stepReplay(sc, realDt) // i giorni avanzano con il tempo vero, anche se il telefono va a pochi fotogrammi

  // strati: molla leggermente sotto-smorzata (si assestano con un piccolo rimbalzo)
  const [hg, hl] = depositTargets(sc)
  for (const [l, hT] of [[sc.layers.gain, hg], [sc.layers.loss, hl]]) {
    l.vh += ((hT - l.h) * 70 - l.vh * 12) * dt
    l.h = Math.max(0, l.h + l.vh * dt)
  }
  const surfTop = surfaces(sc).lossTop
  const zBottom = Math.min(ez.y + ez.ry, surfTop - R * 0.12)

  // raggio delle bolle aperte: proporzionale alla radice del risultato, ridotto se non ci stanno
  const floats = sc.bubbles.filter(b => b.state === 'float')
  if (floats.length) {
    const ref = Math.max(0.5, ...floats.map(b => Math.abs(b.pnl)))
    const raw = floats.map(b => R * (0.1 + 0.11 * Math.sqrt(Math.abs(b.pnl) / ref)))
    const area = raw.reduce((a, r) => a + Math.PI * r * r, 0), room = Math.PI * ez.rx * (ez.ry + R * 0.08) * 0.78
    const k = Math.min(1, Math.sqrt(room / area))
    floats.forEach((b, i) => { b.rT = raw[i] * k })
  }

  for (const b of sc.bubbles) {
    if (b.x === null) { // posizione iniziale quando la geometria è pronta
      b.x = ez.x + (Math.random() - 0.5) * ez.rx * 1.3
      b.y = b.rise ? zBottom + R * 0.1 : ez.y + (Math.random() - 0.5) * ez.ry
      if (b.rise) b.vy = -R * 0.9
    }
    b.c += (sgn(b.state === 'fall' ? b.value : b.pnl) - b.c) * ease(3, dt)
    if (b.state === 'float') {
      b.a += (1 - b.a) * ease(4, dt)
      b.r += (b.rT - b.r) * ease(5, dt)
      const s = R / 150
      let ax = Math.sin(sc.t * 0.62 + b.ph) * 9 * s, ay = Math.cos(sc.t * 0.81 + b.ph * 1.7) * 7 * s
      // dentro l'ellisse della zona (con il fondo che sale insieme al deposito)
      const ry = Math.max(R * 0.08, (zBottom - (ez.y - ez.ry)) / 2), ey = zBottom - ry
      const dx = (b.x - ez.x) / ez.rx, dy = (b.y - ey) / ry, d = Math.sqrt(dx * dx + dy * dy)
      if (d > 0.82) { const f = (d - 0.82) * 260 * s; ax -= dx / d * f; ay -= dy / d * f * 1.4 }
      ax -= (b.x - ez.x) * 0.15; ay -= (b.y - ey) * 0.25
      b.vx += ax * dt; b.vy += ay * dt
    } else if (b.state === 'fall') {
      b.a += (1 - b.a) * ease(6, dt)
      if (b.rT) b.r += (b.rT - b.r) * ease(8, dt)
      b.vy += R * (b.fast ? 3.4 : 2.3) * dt
      b.vx += Math.sin(sc.t * 5 + b.ph) * R * 0.25 * dt
      b.vx *= Math.exp(-1.5 * dt)
    } else if (b.state === 'fade') {
      b.a += (0 - b.a) * ease(5, dt); b.r *= Math.exp(-1.2 * dt)
      if (b.a < 0.02) b.dead = true
    }
    if (b.state !== 'fall') { const damp = Math.exp(-2.4 * dt); b.vx *= damp; b.vy *= damp }
  }
  // le bolle aperte non si sovrappongono
  for (let i = 0; i < floats.length; i++) for (let j = i + 1; j < floats.length; j++) {
    const p = floats[i], q = floats[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.01, min = p.r + q.r + 3
    if (d < min) { const f = (min - d) * 22, ux = dx / d, uy = dy / d; p.vx -= ux * f * dt * 6; p.vy -= uy * f * dt * 6; q.vx += ux * f * dt * 6; q.vy += uy * f * dt * 6 }
  }
  for (const b of sc.bubbles) {
    b.x += b.vx * dt; b.y += b.vy * dt
    // sempre dentro la sfera
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy), max = R - b.r - 3
    if (d > max && d > 0) { b.x = cx + dx / d * max; b.y = cy + dy / d * max; if (b.state === 'float') { b.vx *= 0.5; b.vy *= 0.5 } }
    // le bolle aperte restano sotto il risultato scritto in alto
    if (b.state === 'float' && b.y - b.r < cy - R * 0.24) { b.y = cy - R * 0.24 + b.r; if (b.vy < 0) b.vy *= -0.3 }
    if (b.state === 'fall' && b.y + b.r * 0.45 >= surfaceAt(sc, b.x)) land(sc, b)
  }
  if (sc.bubbles.some(b => b.dead)) sc.bubbles = sc.bubbles.filter(b => !b.dead)

  for (const p of sc.drops) { p.vy += R * 3 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.7 }
  sc.drops = sc.drops.filter(p => p.life > 0)
  sc.ripples = sc.ripples.filter(r => sc.t - r.at < 2.5)

  sc.total += (sc.totalT - sc.total) * ease(sc.kind === 'sim' ? 9 : 5, dt)
  if (Math.abs(sc.total - sc.totalT) < 0.004) sc.total = sc.totalT
  sc.mood += (sc.moodT - sc.mood) * ease(1.6, dt)
  if (sc.ring) {
    sc.ring.p += (sc.ring.pT - sc.ring.p) * ease(7, dt)
    sc.ring.spin += dt * (4.2 + 1.4 * Math.sin(sc.t * 1.3))
  }
  if (sc.onTick && sc.t - sc.tickAt > 0.15) { sc.tickAt = sc.t; sc.onTick(sc) }
}

// ---------- disegno ----------
function draw(ctx, sc) {
  const g = sc.geo
  if (!g) return
  const { S, cx, cy, R } = g, t = sc.t
  const m = mix(sc.mood), mAbs = Math.min(1, Math.abs(sc.mood))
  ctx.clearRect(0, 0, S, S)

  // alone
  const breathe = 0.82 + 0.18 * Math.sin(t * 1.25)
  let gr = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, S / 2)
  gr.addColorStop(0, rgba(m, (0.1 + 0.26 * mAbs) * breathe)); gr.addColorStop(1, rgba(m, 0))
  ctx.fillStyle = gr; ctx.fillRect(0, 0, S, S)

  // anello dell'avanzamento (Simulazione)
  if (sc.ring) drawRing(ctx, sc, m)

  // corpo della sfera
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU)
  gr = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.38, R * 0.05, cx, cy, R)
  gr.addColorStop(0, '#1B2338'); gr.addColorStop(0.55, '#0E1320'); gr.addColorStop(1, `rgb(${[11, 15, 25].map((v, i) => Math.round(lerp(v, m[i], 0.16 + 0.12 * mAbs))).join(',')})`)
  ctx.fillStyle = gr; ctx.fill()

  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, R - 0.5, 0, TAU); ctx.clip()
  // luce interna sul bordo
  gr = ctx.createRadialGradient(cx, cy, R * 0.72, cx, cy, R)
  gr.addColorStop(0, rgba(m, 0)); gr.addColorStop(1, rgba(m, 0.1 + 0.16 * mAbs))
  ctx.fillStyle = gr; ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
  drawDeposit(ctx, sc)
  for (const b of sc.bubbles) drawBubble(ctx, sc, b)
  for (const p of sc.drops) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fillStyle = rgba(light(p.col, 0.3), p.life * 0.9); ctx.fill() }
  ctx.restore()

  drawHeader(ctx, sc)

  // vetro: bordo, riflesso in alto a sinistra e filo di luce
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU)
  ctx.lineWidth = 1.25; ctx.strokeStyle = rgba(m, 0.35 + 0.35 * mAbs); ctx.stroke()
  ctx.save()
  ctx.translate(cx - R * 0.4, cy - R * 0.55); ctx.rotate(-0.62); ctx.scale(1, 0.46)
  gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.36)
  gr.addColorStop(0, 'rgba(255,255,255,0.11)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R * 0.36, 0, TAU); ctx.fill()
  ctx.restore()
  ctx.beginPath(); ctx.arc(cx, cy, R - 4, Math.PI * 1.08, Math.PI * 1.42)
  ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.stroke()
}

function drawRing(ctx, sc, m) {
  const { cx, cy, R, pad } = sc.geo, rr = R + pad * 0.48, ring = sc.ring
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU)
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(154,166,194,0.13)'; ctx.stroke()
  ctx.lineCap = 'round'
  if (ring.indet) {
    const a0 = ring.spin, len = 1.1 + 0.6 * Math.sin(sc.t * 2.1)
    ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a0 + len)
    ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(COL.calm, 0.95); ctx.stroke()
    return
  }
  if (ring.p <= 0.001) return
  const col = mix(sgn(sc.totalT) * Math.max(0.7, Math.abs(sc.mood)))
  const a0 = -Math.PI / 2, a1 = a0 + TAU * Math.min(1, ring.p)
  ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1)
  ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(col, 0.95); ctx.stroke()
  const hx = cx + Math.cos(a1) * rr, hy = cy + Math.sin(a1) * rr
  const gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9)
  gr.addColorStop(0, rgba(light(col, 0.4), 0.95)); gr.addColorStop(1, rgba(col, 0))
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, TAU); ctx.fill()
}

function drawDeposit(ctx, sc) {
  const { cx, cy, R } = sc.geo, s = surfaces(sc), g = sc.layers.gain, l = sc.layers.loss
  if (g.h + l.h < 0.5) return
  const x0 = cx - R, x1 = cx + R, STEP = Math.max(4, R / 30), htot = g.h + l.h
  const topG = x => s.gainTop + wave(sc, x, l.h > 0.5 ? 0 : 1, l.h > 0.5 ? g.h : htot)
  const topL = x => s.lossTop + wave(sc, x, 1, htot)
  const fillLayer = (top, under, rgb, yTop, yBot) => {
    ctx.beginPath()
    for (let x = x0; x <= x1 + STEP; x += STEP) { const y = top(x); x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
    if (under) for (let x = x1 + STEP; x >= x0; x -= STEP) ctx.lineTo(x, under(x))
    else { ctx.lineTo(x1 + STEP, s.bottom + 2); ctx.lineTo(x0, s.bottom + 2) }
    ctx.closePath()
    const gr = ctx.createLinearGradient(0, yTop - 4, 0, yBot)
    gr.addColorStop(0, rgba(rgb, 0.62)); gr.addColorStop(0.35, rgba(rgb, 0.36)); gr.addColorStop(1, rgba(rgb, 0.2))
    ctx.fillStyle = gr; ctx.fill()
    // filo luminoso sulla superficie
    ctx.beginPath()
    for (let x = x0; x <= x1 + STEP; x += STEP) { const y = top(x); x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
    ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(light(rgb, 0.35), 0.9); ctx.stroke()
  }
  if (g.h > 0.5) fillLayer(topG, null, COL.long, s.gainTop, s.bottom)
  if (l.h > 0.5) fillLayer(topL, g.h > 0.5 ? topG : null, COL.short, s.lossTop, s.gainTop)
  // totale e numero di trade dentro ogni strato
  const label = (layer, yTop, yBot, sign) => {
    if (!layer.n || yBot - yTop < 13) return
    const y = (yTop + yBot) / 2, half = Math.sqrt(Math.max(0, R * R - (Math.max(Math.abs(y - cy), Math.abs(yBot - 4 - cy))) ** 2))
    const val = money(sign * layer.v), trades = `${layer.n} trade`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    if (yBot - yTop >= R * 0.24 && half > R * 0.3) {
      ctx.font = `500 ${Math.round(clamp(R * 0.09, 11, 15))}px ${FONT_NUM}`; ctx.fillStyle = 'rgba(244,247,252,0.96)'
      ctx.fillText(val, cx, y - R * 0.04)
      ctx.font = `700 ${Math.round(clamp(R * 0.06, 9, 11))}px ${FONT_UI}`; ctx.fillStyle = 'rgba(232,236,245,0.72)'
      ctx.fillText(trades.toUpperCase(), cx, y + R * 0.065)
    } else {
      ctx.font = `500 ${Math.round(clamp(R * 0.075, 10, 13))}px ${FONT_NUM}`; ctx.fillStyle = 'rgba(244,247,252,0.95)'
      ctx.fillText(`${val} · ${layer.n}`, cx, y + 0.5, half * 1.8)
    }
  }
  label(g, s.gainTop, s.bottom, 1)
  label(l, s.lossTop, s.gainTop, -1)
}

function drawBubble(ctx, sc, b) {
  if (b.x === null || b.r < 0.8 || b.a < 0.01) return
  const { x, y, r, a } = b, col = mix(b.c), hi = light(col, 0.5)
  const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r)
  gr.addColorStop(0, rgba(hi, 0.5 * a)); gr.addColorStop(0.62, rgba(col, 0.2 * a)); gr.addColorStop(1, rgba(col, 0.46 * a))
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = gr; ctx.fill()
  ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(light(col, 0.15), 0.85 * a); ctx.stroke()
  ctx.save(); ctx.translate(x - r * 0.36, y - r * 0.44); ctx.rotate(-0.6); ctx.scale(1, 0.55)
  ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, TAU); ctx.fillStyle = `rgba(255,255,255,${0.32 * a})`; ctx.fill()
  ctx.restore()
  if (r < 10) return
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const twoLines = r >= 17 && !b.fast
  ctx.font = `700 ${Math.round(clamp(r * (twoLines ? 0.4 : 0.46), 8, 15))}px ${FONT_UI}`
  ctx.fillStyle = `rgba(244,247,252,${0.97 * a})`
  ctx.fillText(b.sym, x, twoLines ? y - r * 0.17 : y + 0.5, r * 1.75)
  if (twoLines) {
    ctx.font = `500 ${Math.round(clamp(r * 0.32, 8, 12))}px ${FONT_NUM}`
    ctx.fillStyle = `rgba(232,236,245,${0.86 * a})`
    ctx.fillText(b.txt, x, y + r * 0.3, r * 1.75)
  }
}

function drawHeader(ctx, sc) {
  const { cx, cy, R } = sc.geo
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px'
  ctx.font = `700 ${Math.round(clamp(R * 0.062, 9, 11))}px ${FONT_UI}`; ctx.fillStyle = '#6B7590'
  ctx.fillText(sc.label.toUpperCase(), cx, cy - R * 0.64)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
  const col = sc.totalT === 0 ? [232, 236, 245] : light(sgn(sc.totalT) > 0 ? COL.long : COL.short, 0.08)
  ctx.font = `500 ${Math.round(R * 0.2)}px ${FONT_NUM}`; ctx.fillStyle = rgba(col, 1)
  ctx.fillText(money(sc.total), cx, cy - R * 0.46, R * 1.5)
  if (sc.sub) {
    ctx.font = `400 ${Math.round(clamp(R * 0.07, 10, 12))}px ${FONT_NUM}`; ctx.fillStyle = '#9AA6C2'
    ctx.fillText(sc.sub, cx, cy - R * 0.3, R * 1.4)
  }
}

// ---------- ciclo di animazione e dimensioni ----------
function useSphere(kind) {
  const canvasRef = useRef(null), boxRef = useRef(null), scRef = useRef(null)
  if (!scRef.current) scRef.current = newScene(kind)
  useEffect(() => {
    const cv = canvasRef.current, box = boxRef.current, ctx = cv.getContext('2d'), sc = scRef.current
    let raf = 0, last = 0, visible = true, alive = true
    const resize = () => {
      const w = Math.max(220, Math.min(box.clientWidth, 400)), dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr); cv.style.width = `${w}px`; cv.style.height = `${w}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const pad = Math.round(w * 0.075), geo = { S: w, cx: w / 2, cy: w / 2, R: w / 2 - pad, pad }
      if (sc.geo && sc.geo.R !== geo.R) { // ridimensionamento: si scala tutto intorno al centro
        const k = geo.R / sc.geo.R
        for (const b of sc.bubbles) if (b.x !== null) { b.x = geo.cx + (b.x - sc.geo.cx) * k; b.y = geo.cy + (b.y - sc.geo.cy) * k; b.r *= k; b.rT *= k }
        for (const l of Object.values(sc.layers)) l.h *= k
      }
      sc.geo = geo
      if (!raf) draw(ctx, sc)
    }
    const frame = now => {
      raf = 0
      if (!alive || !visible || document.hidden) return
      // a riposo (niente che cade, niente in riproduzione) bastano 30 fotogrammi al secondo: meno batteria sul telefono
      const calm = !sc.replay && !sc.drops.length && !sc.ripples.length && !(sc.ring?.indet) && sc.bubbles.every(b => b.state === 'float')
      if (calm && last && now - last < 30) { raf = requestAnimationFrame(frame); return }
      const real = last ? Math.min(0.5, (now - last) / 1000) : 1 / 60
      last = now
      step(sc, Math.min(0.05, real), real); draw(ctx, sc)
      raf = requestAnimationFrame(frame)
    }
    const kick = () => { if (!raf && alive) { last = 0; raf = requestAnimationFrame(frame) } }
    const ro = new ResizeObserver(resize); ro.observe(box); resize()
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick() })
    io.observe(cv)
    const onVis = () => { if (!document.hidden) kick() }
    document.addEventListener('visibilitychange', onVis)
    document.fonts?.ready?.then(() => { if (!raf && alive) draw(ctx, sc) })
    kick()
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return { canvasRef, boxRef, sc: scRef.current }
}

// ---------- Prova e Reale ----------
function syncLive(sc, open, closed) {
  const first = !sc.synced
  sc.synced = true
  const openIds = new Set(open.map(p => p.id)), closedById = new Map(closed.map(p => [p.id, p]))
  // trade già depositati che non ci sono più (giorno nuovo): si ricostruiscono gli strati
  if ([...sc.landed].some(id => !closedById.has(id))) {
    for (const l of Object.values(sc.layers)) Object.assign(l, { v: 0, n: 0 })
    sc.landed = new Set([...sc.landed].filter(id => closedById.has(id)))
    sc.counted = new Set([...sc.counted].filter(id => closedById.has(id) || openIds.has(id)))
    for (const id of sc.landed) addToLayer(sc, closedById.get(id).pnl || 0)
  }
  for (const p of open) {
    const b = sc.byId.get(p.id)
    if (b && b.state === 'float') { setPnl(b, p.upnl || 0); b.sym = p.symbol }
    else if (!b) addBubble(sc, { id: p.id, sym: p.symbol, pnl: p.upnl || 0, rise: !first })
  }
  for (const b of sc.bubbles) {
    if (b.state !== 'float' || openIds.has(b.id)) continue
    const c = closedById.get(b.id)
    if (c) { b.state = 'fall'; b.value = c.pnl || 0; setPnl(b, b.value); b.vy = -sc.geo?.R * 0.25 || 0; sc.counted.add(b.id) }
    else b.state = 'fade'
  }
  for (const c of closed) {
    if (sc.counted.has(c.id)) continue
    sc.counted.add(c.id)
    if (first) { addToLayer(sc, c.pnl || 0); sc.landed.add(c.id) } // all'apertura della pagina: già sul fondo
    else addBubble(sc, { id: c.id, sym: c.symbol, pnl: c.pnl || 0, value: c.pnl || 0, state: 'fall', rT: sc.geo ? sc.geo.R * 0.14 : 18 })
  }
  const openPnl = open.reduce((a, p) => a + (p.upnl || 0), 0), closedPnl = closed.reduce((a, p) => a + (p.pnl || 0), 0)
  const absAll = open.reduce((a, p) => a + Math.abs(p.upnl || 0), 0) + closed.reduce((a, p) => a + Math.abs(p.pnl || 0), 0)
  sc.totalT = openPnl + closedPnl
  sc.moodT = absAll > 0 ? clamp(sc.totalT / absAll * 1.6, -1, 1) : 0
}

export function LiveSphere({ open, closed, capital, mode, onBubble }) {
  const { canvasRef, boxRef, sc } = useSphere('live')
  useEffect(() => {
    sc.label = mode === 'live' ? 'Reale · oggi' : 'Prova · oggi'
    sc.scale = capital > 0 ? capital * 0.04 : 0 // il deposito si riempie del tutto con il 4% del capitale tra guadagni e perdite
    syncLive(sc, open, closed)
    const tot = open.reduce((a, p) => a + (p.upnl || 0), 0) + closed.reduce((a, p) => a + (p.pnl || 0), 0)
    sc.sub = capital > 0 ? `${fmtSigned(tot / capital * 100)}% del capitale`.replace('-', '−') : 'USDT'
  }, [sc, open, closed, capital, mode])

  const st = useMemo(() => {
    const w = closed.filter(p => p.pnl > 0), l = closed.filter(p => !(p.pnl > 0))
    return {
      open: open.length, openPnl: open.reduce((a, p) => a + (p.upnl || 0), 0),
      win: w.length, winPnl: w.reduce((a, p) => a + p.pnl, 0), loss: l.length, lossPnl: l.reduce((a, p) => a + (p.pnl || 0), 0),
    }
  }, [open, closed])

  const hit = e => {
    const r = canvasRef.current.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
    return sc.bubbles.find(b => b.state === 'float' && b.x !== null && Math.hypot(b.x - x, b.y - y) <= b.r + 4)
  }
  return (
    <div className="card sphere-card">
      <div className="sphere-box" ref={boxRef}>
        <canvas ref={canvasRef} role="img" aria-label={`Risultato di oggi ${money(st.openPnl + st.winPnl + st.lossPnl)} USDT`}
          onClick={e => { const b = hit(e); if (b) onBubble?.(b.id) }}
          onMouseMove={e => { e.currentTarget.style.cursor = hit(e) ? 'pointer' : 'default' }} />
      </div>
      <div className="sphere-stats">
        <div><span className="lab">In gioco</span><b className={`mono ${st.openPnl > 0 ? 'up' : st.openPnl < 0 ? 'down' : ''}`}>{money(st.openPnl)}</b><span className="note">{st.open} {st.open === 1 ? 'posizione' : 'posizioni'}</span></div>
        <div><span className="lab">Chiusi in guadagno</span><b className="mono up">{money(st.winPnl)}</b><span className="note">{st.win} trade</span></div>
        <div><span className="lab">Chiusi in perdita</span><b className={`mono ${st.lossPnl < 0 ? 'down' : ''}`}>{money(st.lossPnl)}</b><span className="note">{st.loss} trade</span></div>
      </div>
      {open.length > 0 && <div className="note sphere-hint">Tocca una bolla per il grafico della giornata.</div>}
    </div>
  )
}

// ---------- Simulazione ----------
const pct95 = list => { const a = list.map(Math.abs).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : 1 }
const dayShort = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-CH', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })

// Ripasso dei giorni simulati: ogni giorno i suoi trade cadono come bolle veloci (i più grandi) e il resto va dritto negli strati
function buildReplay(r, instant) {
  const byDay = new Map()
  for (const t of r.trades) { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t) }
  const days = r.daily, N = Math.max(1, r.trades.length), BUDGET = 260
  const T = instant ? 0 : clamp(days.length * 0.045, 3.5, 9)
  return { r, days, byDay, i: 0, time: 0, T, slot: days.length ? T / days.length : 0, pending: [], ref: Math.max(0.01, pct95(r.trades.map(t => t.pnl))), share: Math.min(1, BUDGET / N), instant }
}
function stepReplay(sc, dt) {
  const rp = sc.replay, { R, cx, cy } = sc.geo
  rp.time += dt
  while (rp.i < rp.days.length && (rp.instant || rp.time >= rp.i * rp.slot)) {
    const d = rp.days[rp.i], list = rp.byDay.get(d.day) || []
    if (list.length) {
      const k = rp.instant ? 0 : Math.max(1, Math.round(list.length * rp.share))
      const big = new Set(list.slice().sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, k))
      for (const t of list) {
        if (big.has(t)) rp.pending.push({ t, at: rp.time + Math.random() * rp.slot * 0.9 })
        else addToLayer(sc, t.pnl)
      }
    } else if (d.n > 0) addToLayer(sc, d.pnl, d.n) // trade non arrivati (elenco tagliato): il risultato del giorno
    sc.totalT = d.balance - rp.r.capital
    sc.sub = `${fmtSigned(rp.r.capital > 0 ? (d.balance / rp.r.capital - 1) * 100 : 0, 1)}% · ${dayShort(d.day)}`.replace('-', '−')
    sc.ring.pT = (rp.i + 1) / rp.days.length
    sc.dayIdx = rp.i + 1
    rp.i++
  }
  if (rp.pending.length) {
    const now = rp.pending.filter(p => p.at <= rp.time)
    if (now.length) {
      rp.pending = rp.pending.filter(p => p.at > rp.time)
      for (const { t } of now) {
        const r = R * (0.05 + 0.065 * Math.sqrt(Math.min(1.6, Math.abs(t.pnl) / rp.ref)))
        const half = R * 0.55
        addBubble(sc, { sym: t.symbol, pnl: t.pnl, value: t.pnl, state: 'fall', fast: true, r, rT: r, a: 0,
          x: cx + (Math.random() - 0.5) * 2 * half, y: cy - R * 0.2 + Math.random() * R * 0.1, vy: R * (0.5 + Math.random() * 0.4) })
      }
    }
  }
  const absAll = sc.layers.gain.v + sc.layers.loss.v
  sc.moodT = absAll > 0 ? clamp(sc.totalT / absAll * 1.4, -1, 1) : 0
  if (rp.i >= rp.days.length && !rp.pending.length) {
    sc.replay = null
    sc.totalT = rp.r.net
    sc.sub = `${fmtSigned(rp.r.pct, 1)}% · ${rp.days.length} giorni`.replace('-', '−')
    sc.label = 'Risultato finale'
    sc.done = true
    sc.onTick?.(sc)
  }
}

export function SimSphere({ running, result }) {
  const { canvasRef, boxRef, sc } = useSphere('sim')
  const [prog, setProg] = useState(null)
  const [runId, setRunId] = useState(0)
  useEffect(() => {
    sc.onTick = s => setProg({
      day: s.dayIdx || 0, days: s.replay?.days.length ?? result?.daily.length ?? 0, done: !!s.done && !s.replay,
      win: s.layers.gain.n, winPnl: s.layers.gain.v, loss: s.layers.loss.n, lossPnl: -s.layers.loss.v,
    })
    return () => { sc.onTick = null }
  }, [sc, result])
  useEffect(() => {
    if (running) {
      clearScene(sc); sc.done = false; sc.dayIdx = 0
      sc.ring.indet = true; sc.label = 'Simulazione in corso'; sc.sub = 'calcolo i giorni…'
      setProg(null)
      return
    }
    if (!result) return
    clearScene(sc); sc.done = false; sc.dayIdx = 0
    sc.ring.indet = false
    sc.label = 'Risultato accumulato'
    sc.scale = Math.max(1e-9, result.trades.reduce((a, t) => a + Math.abs(t.pnl), 0) + result.daily.filter(d => d.n && !result.trades.some(t => t.day === d.day)).reduce((a, d) => a + Math.abs(d.pnl), 0))
    sc.replay = buildReplay(result, reducedMotion())
  }, [sc, running, result, runId])

  return (
    <div className="sphere-card sim">
      <div className="sphere-box" ref={boxRef}>
        <canvas ref={canvasRef} role="img" aria-label={result && !running ? `Risultato della simulazione ${money(result.net)} USDT` : 'Simulazione in corso'} />
      </div>
      {!running && result && (
        <div className="sphere-stats">
          <div><span className="lab">Giorni</span><b className="mono">{prog ? `${prog.day} / ${prog.days}` : '—'}</b><span className="note">{prog?.done ? 'completata' : 'in riproduzione'}</span></div>
          <div><span className="lab">In guadagno</span><b className="mono up">{prog ? money(prog.winPnl) : '—'}</b><span className="note">{prog ? `${fmtUsd(prog.win, 0)} trade` : ''}</span></div>
          <div><span className="lab">In perdita</span><b className={`mono ${prog?.lossPnl < 0 ? 'down' : ''}`}>{prog ? money(prog.lossPnl) : '—'}</b><span className="note">{prog ? `${fmtUsd(prog.loss, 0)} trade` : ''}</span></div>
        </div>
      )}
      {!running && result && prog?.done && <button className="btn ghost small sphere-replay" onClick={() => setRunId(x => x + 1)}>Rivedi l'animazione</button>}
    </div>
  )
}
