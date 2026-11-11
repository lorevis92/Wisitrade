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
// area del segmento di cerchio alto h dal fondo, e la sua inversa: gli strati hanno area proporzionale agli USDT
// (in basso la sfera è stretta: a parità di altezza uno strato sul fondo conterrebbe molto meno)
const segArea = (R, h) => { const x = clamp(h, 0, 2 * R); return R * R * Math.acos((R - x) / R) - (R - x) * Math.sqrt(Math.max(0, 2 * R * x - x * x)) }
function segHeight(R, A) {
  let lo = 0, hi = 2 * R
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (segArea(R, mid) < A) lo = mid; else hi = mid }
  return (lo + hi) / 2
}
function depositTargets(sc) {
  const { R } = sc.geo, g = sc.layers.gain, l = sc.layers.loss, tot = g.v + l.v
  if (!(tot > 0)) return [0, 0]
  const fill = sc.kind === 'sim' ? clamp(tot / Math.max(sc.scale, 1e-9), 0, 1) * 0.92 : clamp(tot / Math.max(sc.scale, tot), 0.18, 1)
  const A = segArea(R, R * HMAX) * fill
  const MIN = Math.max(16, R * 0.13) // spazio minimo per scrivere dentro lo strato
  let hg = g.v > 0 ? segHeight(R, A * g.v / tot) : 0
  if (g.n) hg = Math.max(hg, MIN)
  const top = segHeight(R, segArea(R, hg) + A * l.v / tot)
  let hl = l.v > 0 ? top - hg : 0
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

// esplosione in piccole particelle (segnale rimasto fuori)
function burst(sc, b) {
  b.dead = true
  const n = 14, col = [245, 184, 61]
  for (let i = 0; i < n && sc.drops.length < 160; i++) {
    const ang = (i / n) * TAU + Math.random() * 0.4, sp = sc.geo.R * (0.25 + Math.random() * 0.45)
    sc.drops.push({ x: b.x + Math.cos(ang) * b.r * 0.6, y: b.y + Math.sin(ang) * b.r * 0.6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, r: 1.2 + Math.random() * 1.4, col: i % 3 ? COL.calm : col, g: 0.35 })
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
    const ref = sc.refAbs || Math.max(0.5, ...floats.map(b => Math.abs(b.pnl)))
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
    b.c += ((b.state === 'pop' ? 0 : sgn(b.state === 'fall' ? b.value : b.pnl)) - b.c) * ease(b.fast ? 8 : 3, dt)
    if (b.state === 'float') {
      const grow = sc.kind === 'sim' ? 12 : 5 // nella Simulazione il tempo corre: le bolle compaiono più in fretta
      b.a += (1 - b.a) * ease(grow * 0.8, dt)
      b.r += (b.rT - b.r) * ease(grow, dt)
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
    } else if (b.state === 'pop') { // segnale rimasto fuori: compare un attimo, poi esplode
      b.a += (1 - b.a) * ease(10, dt); b.r += (b.rT - b.r) * ease(10, dt); b.life -= dt
      if (b.life <= 0) burst(sc, b)
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
    const touch = d > max && d > 0
    if (touch) { b.x = cx + dx / d * max; b.y = cy + dy / d * max; if (b.state === 'float') { b.vx *= 0.5; b.vy *= 0.5 } }
    // le bolle aperte restano sotto il risultato scritto in alto
    if (b.state === 'float' && b.y - b.r < cy - R * 0.24) { b.y = cy - R * 0.24 + b.r; if (b.vy < 0) b.vy *= -0.3 }
    // una bolla che cade si scioglie appena tocca lo strato o il fondo della sfera: sul fondo non restano mai palline
    if (b.state === 'fall' && (b.y + b.r * 0.45 >= surfaceAt(sc, b.x) || (touch && b.y > cy))) land(sc, b)
  }
  if (sc.bubbles.some(b => b.dead)) sc.bubbles = sc.bubbles.filter(b => !b.dead)

  if (sc.fizz && sc.drops.length < 140) { // preparazione dei dati: bollicine che salgono dal fondo
    for (let n = Math.floor(sc.fizz * 60 * dt + Math.random()); n > 0; n--) {
      const ang = Math.random() * TAU, rr = Math.sqrt(Math.random()) * R * 0.7
      sc.drops.push({ x: cx + Math.cos(ang) * rr, y: cy + R * 0.35 + Math.abs(Math.sin(ang)) * rr * 0.6, vx: (Math.random() - 0.5) * R * 0.08, vy: -R * (0.25 + Math.random() * 0.45), life: 0.6 + Math.random() * 0.4, r: 0.8 + Math.random() * 1.6, col: Math.random() < 0.3 ? COL.long : COL.calm, g: -0.05 })
    }
  }
  for (const p of sc.drops) { p.vy += R * (p.g ?? 3) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.g !== undefined) { p.vx *= Math.exp(-2 * dt); p.vy *= Math.exp(-2 * dt) } p.life -= dt * 1.7 }
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
  for (const p of sc.drops) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.g === undefined ? 1 : 0.4 + 0.6 * p.life), 0, TAU); ctx.fillStyle = rgba(light(p.col, 0.3), p.life * 0.9); ctx.fill() }
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
  ctx.fillText(b.side ? `${b.sym} ${b.side > 0 ? '↑' : '↓'}` : b.sym, x, twoLines ? y - r * 0.17 : y + 0.5, r * 1.75) // lato (long ↑, short ↓) solo nella Simulazione
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
  const col = sc.headline || sc.totalT === 0 ? [232, 236, 245] : light(sgn(sc.totalT) > 0 ? COL.long : COL.short, 0.08)
  ctx.font = `500 ${Math.round(R * 0.2)}px ${FONT_NUM}`; ctx.fillStyle = rgba(col, 1)
  ctx.fillText(sc.headline || money(sc.total), cx, cy - R * 0.46, R * 1.5) // headline: conteggio o % mentre si caricano i dati
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
// Dal vivo: il server manda i giorni appena li ha calcolati (live.days cresce mentre il calcolo gira) e la sfera li gioca
// uno dopo l'altro. Se i giorni arrivano più in fretta di quanto si riesca a mostrarli, se ne gioca più di uno alla volta
// (giorni accorpati); a calcolo finito la sfera arriva in ~2,5 s allo stato finale, con i numeri esatti del riepilogo.
// "Rivedi l'animazione" rigioca invece dal risultato completo, giorno per giorno.
// In un giorno: segnali e posizioni aperte galleggiano (colore dal risultato non realizzato minuto per minuto, tr.path),
// i segnali rimasti fuori esplodono, i trade chiusi cadono e si sciolgono nel loro strato.
const pct95 = list => { const a = list.map(Math.abs).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : 1 }
const dayShort = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-CH', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
// tempo della giornata compresso: 9:30–10:00 (le entrate) è il 40% del giorno, fino alle 16:00 un altro 50%, l'ultimo 10% è la chiusura
const uOf = m => (m <= 600 ? 0.4 * clamp((m - 570) / 30, 0, 1) : 0.4 + 0.5 * Math.sqrt(clamp((m - 600) / 360, 0, 1)))
const minAt = u => (u <= 0.4 ? 570 + 30 * Math.max(0, u) / 0.4 : 600 + 360 * clamp((u - 0.4) / 0.5, 0, 1) ** 2)
function pathAt(t, m) {
  const p = t.path, k = t.kmin ?? 570
  if (!p?.length) return m > k ? t.pnl * 0.5 : 0
  if (m <= p[0][0]) return p[0][1] * clamp((m - k) / Math.max(1, p[0][0] - k), 0, 1)
  for (let i = 1; i < p.length; i++) if (m <= p[i][0]) { const [m0, v0] = p[i - 1], [m1, v1] = p[i]; return lerp(v0, v1, (m - m0) / Math.max(1e-9, m1 - m0)) }
  return p.at(-1)[1]
}
const finalStats = r => ({ win: r.wins, winPnl: r.grossWin, loss: r.n - r.wins, lossPnl: -r.grossLoss })
const MAX_BUBBLES = 14 // in un blocco di giorni accorpati si animano i trade più grandi; gli altri vanno dritti nel loro strato

function buildReplay(r) {
  const byDay = new Map()
  for (const t of r.trades) { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t) }
  return { r, cap: r.capital, days: r.daily, total: r.daily.length, byDay, i: 0, time: 0, nextStart: 0, cur: null, dayDur: clamp(40 / Math.max(1, r.daily.length), 0.35, 2.6) }
}
function buildLive(lv, capital) {
  return { live: lv, r: null, cap: capital, days: lv.days, i: 0, time: 0, nextStart: 0, cur: null, seen: 0, absSum: 0, pnls: [] }
}
// quanti giorni giocare insieme e per quanto tempo
function pace(rp) {
  const backlog = rp.days.length - rp.i
  if (!rp.live) return { k: 1, dur: rp.dayDur }
  const total = Math.max(rp.live.total || 0, rp.days.length), base = clamp(40 / Math.max(1, total), 0.35, 2.6)
  if (rp.live.status === 'done') { const blocks = Math.min(backlog, 6); return { k: Math.ceil(backlog / blocks), dur: Math.min(base, 2.5 / blocks) } }
  if (backlog <= 2) return { k: 1, dur: base }
  return { k: Math.ceil(backlog / 2), dur: Math.max(0.35, base * 0.7) } // indietro: si accorpa per raggiungere il calcolo
}
function startBlock(sc, rp) {
  const { k, dur } = pace(rp)
  const ds = rp.days.slice(rp.i, rp.i + k), ev = []
  const list = ds.flatMap(d => (rp.live ? d.trades : rp.byDay.get(d.day) || []))
  const shown = list.length > MAX_BUBBLES ? [...list].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, MAX_BUBBLES) : list
  const shownSet = new Set(shown)
  for (const t of shown) {
    const km = t.kmin ?? 570, cm = km + Math.max(1, Math.round((t.closed_at - t.opened_at) / 60000))
    ev.push({ u: uOf(km), type: 'open', t }, { u: Math.max(uOf(km) + 0.04, uOf(cm)), type: 'close', t })
  }
  if (ds.length === 1) for (const [sym, m] of (ds[0].skipped || []).slice(0, 14)) ev.push({ u: uOf(m) + 0.005, type: 'skip', sym })
  ev.sort((a, b) => a.u - b.u)
  const rest = list.filter(t => !shownSet.has(t))
  // giorni senza l'elenco dei trade (elenco tagliato nel risultato completo): conta il risultato del giorno
  const cut = rp.live ? [] : ds.filter(d => d.n > 0 && !(rp.byDay.get(d.day) || []).length)
  rp.cur = { ds, k: ds.length, d: ds.at(-1), ev, e: 0, start: rp.nextStart, dur, live: new Map(), closedPnl: 0, startBal: ds[0].balance - ds[0].pnl, rest, cut }
}
function finishReplay(sc, rp) {
  // fine: restano solo i due strati, con i valori esatti di tutta la simulazione
  for (const b of sc.bubbles) if (b.sim) b.dead = true
  sc.bubbles = sc.bubbles.filter(b => !b.dead)
  const r = rp.r, f = finalStats(r), g = sc.layers.gain, l = sc.layers.loss
  g.v = f.winPnl; g.n = f.win; l.v = -f.lossPnl; l.n = f.loss
  sc.scale = Math.max(1e-9, r.grossWin + r.grossLoss)
  sc.replay = null; sc.done = true; sc.final = f
  sc.totalT = r.net; sc.ring.indet = false; sc.ring.pT = 1; sc.dayIdx = r.daily.length; sc.dayTotal = r.daily.length
  sc.label = 'Risultato finale'
  sc.sub = `${fmtSigned(r.pct, 1)}% · ${r.daily.length} giorni`.replace('-', '−')
  const tot = g.v + l.v
  sc.moodT = tot > 0 ? clamp(sc.totalT / tot * 1.4, -1, 1) : 0
  sc.onTick?.(sc)
}
// annullata o in errore: niente più eventi; le bolle ancora aperte svaniscono, gli strati restano come sono
function stopLive(sc, rp) {
  const st = rp.live.status
  for (const b of sc.bubbles) if (b.sim && b.state !== 'fall') b.state = 'fade'
  sc.replay = null; sc.stopped = st; sc.ring.indet = false
  sc.label = st === 'cancelled' ? 'Simulazione annullata' : 'Simulazione non riuscita'
  const played = rp.days[rp.i - 1]
  sc.totalT = played ? played.balance - rp.cap : 0
  sc.sub = played ? `fino al ${dayShort(played.day)}` : ''
  sc.moodT = 0
  sc.onTick?.(sc)
}
// dal vivo: scala del deposito e misura delle bolle dai trade arrivati finora (il totale si stima dai giorni mancanti)
function absorb(sc, rp) {
  if (rp.seen === rp.days.length) return
  for (; rp.seen < rp.days.length; rp.seen++) for (const t of rp.days[rp.seen].trades) { rp.absSum += Math.abs(t.pnl); rp.pnls.push(t.pnl) }
  const total = Math.max(rp.live.total || 0, rp.days.length)
  sc.scale = Math.max(1e-9, rp.absSum * total / Math.max(1, rp.days.length))
  sc.refAbs = Math.max(0.01, pct95(rp.pnls))
}
// Prima del primo giorno: i titoli scaricati entrano come bolle col loro nome ed esplodono (conteggio al centro,
// anello pieno in proporzione), poi la preparazione delle candele (percentuale, mese preparato, bollicine dal fondo)
const monthShort = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-CH', { month: 'short', year: 'numeric', timeZone: 'UTC' })
function popIntro(sc) { for (const b of sc.bubbles) if (b.intro && !b.dead && b.state !== 'pop') { b.state = 'pop'; b.life = 0.02; b.rT = b.r } }
function stepIntro(sc, rp, dt) {
  const lv = rp.live
  let floating = 0
  for (const b of sc.bubbles) {
    if (!b.intro || b.dead || b.state === 'pop') continue
    b.ttl -= dt
    if (b.ttl <= 0) { b.state = 'pop'; b.life = 0.02; b.rT = b.r } else floating++
  }
  if (lv.prep) {
    if (!rp.prepAt) { rp.prepAt = 1; sc.ring.p = 0; popIntro(sc) }
    sc.fizz = 1; sc.ring.indet = false; sc.ring.pT = lv.prep.p
    sc.label = 'Preparo i dati'; sc.headline = `${Math.round(lv.prep.p * 100)}%`
    sc.sub = `candele da 15 minuti · ${monthShort(lv.prep.day)}`
    return
  }
  if (lv.load) {
    sc.ring.indet = false; sc.ring.pT = lv.load.done / Math.max(1, lv.load.total)
    sc.label = 'Carico le candele'; sc.headline = `${lv.load.done} / ${lv.load.total}`; sc.sub = "titoli dall'archivio"
    // se i titoli arrivano a raffica si mostrano solo gli ultimi
    rp.loadSeen ||= 0
    if (lv.loaded.length - rp.loadSeen > 10) rp.loadSeen = lv.loaded.length - 10
    rp.loadWait = (rp.loadWait || 0) - dt
    if (rp.loadSeen < lv.loaded.length && rp.loadWait <= 0 && floating < 9) {
      addBubble(sc, { sym: lv.loaded[rp.loadSeen], pnl: 0, sim: true, intro: true, fast: true, rise: true, ttl: 1.1 + Math.random() * 0.6 })
      rp.loadSeen++; rp.loadWait = 0.09
    }
    return
  }
  sc.ring.indet = true; sc.headline = null; sc.sub = lv.phase || 'carico i dati…'
}
function endIntro(sc, rp) {
  if (rp.introDone) return
  rp.introDone = true; sc.fizz = 0; sc.headline = null; sc.label = 'Simulazione in corso'
  popIntro(sc)
  sc.ring.indet = false; sc.ring.p = 0
}
function stepReplay(sc, dt) {
  const rp = sc.replay, { R } = sc.geo, cap = rp.cap, lv = rp.live
  if (lv) {
    if (lv.status === 'cancelled' || lv.status === 'error') { sc.fizz = 0; sc.headline = null; popIntro(sc); return stopLive(sc, rp) }
    absorb(sc, rp)
    sc.dayTotal = Math.max(lv.total || 0, rp.days.length)
    if (!rp.days.length) return stepIntro(sc, rp, dt) // ancora in preparazione
    endIntro(sc, rp)
  }
  if (rp.skip) { // "Salta alla fine" o movimento ridotto: si aspetta solo il risultato
    if (!lv || lv.status === 'done') { if (lv) rp.r = lv.result; return finishReplay(sc, rp) }
    for (const b of sc.bubbles) if (b.sim && b.state === 'float') b.state = 'fade'
    const d = rp.days.at(-1)
    sc.ring.pT = rp.days.length / sc.dayTotal; sc.dayIdx = rp.days.length; sc.totalT = d.balance - cap
    sc.sub = `${fmtSigned(cap > 0 ? (d.balance - cap) / cap * 100 : 0, 1)}% · ${dayShort(d.day)}`.replace('-', '−')
    return
  }
  rp.time += dt
  for (;;) {
    if (!rp.cur) {
      if (rp.i >= rp.days.length) {
        if (lv && lv.status !== 'done') { rp.time = rp.nextStart; return } // in attesa dei prossimi giorni dal calcolo
        if (lv) rp.r = lv.result
        return finishReplay(sc, rp)
      }
      startBlock(sc, rp)
    }
    const c = rp.cur, u = (rp.time - c.start) / c.dur
    while (c.e < c.ev.length && c.ev[c.e].u <= u) {
      const e = c.ev[c.e++]
      if (e.type === 'open') c.live.set(e.t, addBubble(sc, { sym: e.t.symbol, side: e.t.side, pnl: 0, sim: true }))
      else if (e.type === 'close') {
        const b = c.live.get(e.t)
        if (b && !b.dead) { b.state = 'fall'; b.value = e.t.pnl; setPnl(b, e.t.pnl); b.vy = -R * 0.2 }
        c.closedPnl += e.t.pnl
      } else addBubble(sc, { sym: e.sym, pnl: 0, state: 'pop', rT: R * 0.075, life: clamp(c.dur * 0.14, 0.2, 0.45), fast: true, sim: true })
    }
    // risultato non realizzato delle posizioni aperte al minuto raggiunto
    const m = minAt(Math.min(u, 0.9))
    let openPnl = 0, openAbs = 0
    for (const [t, b] of c.live) if (b.state === 'float' && !b.dead) { const v = pathAt(t, m); setPnl(b, v); openPnl += v; openAbs += Math.abs(v) }
    // nei giorni accorpati il resto dei trade conta in proporzione al tempo del blocco
    const restPnl = c.rest.reduce((a, t) => a + t.pnl, 0) * clamp(u, 0, 1) + c.cut.reduce((a, d) => a + d.pnl, 0) * clamp(u, 0, 1)
    const now = c.startBal + c.closedPnl + openPnl + restPnl
    sc.totalT = now - cap
    sc.ring.pT = (rp.i + c.k * clamp(u, 0, 1)) / Math.max(1, sc.dayTotal || rp.total || rp.days.length)
    sc.dayIdx = rp.i + c.k
    const when = c.k > 1 ? `${dayShort(c.ds[0].day)} – ${dayShort(c.d.day)}` : dayShort(c.d.day)
    sc.sub = `${fmtSigned(cap > 0 ? (now - cap) / cap * 100 : 0, 1)}% · ${when}`.replace('-', '−')
    const tot = sc.layers.gain.v + sc.layers.loss.v + openAbs
    sc.moodT = tot > 0 ? clamp(sc.totalT / tot * 1.4, -1, 1) : 0
    if (u < 1) return
    // fine del blocco: i trade ancora in caduta si sciolgono negli strati, che così crescono giorno per giorno
    for (const b of c.live.values()) {
      if (b.dead) continue
      if (b.x === null) { b.x = sc.geo.cx; b.y = sc.geo.cy }
      if (b.value === undefined) b.value = b.pnl
      land(sc, b)
    }
    for (const t of c.rest) addToLayer(sc, t.pnl)
    for (const d of c.cut) addToLayer(sc, d.pnl, d.n)
    sc.totalT = c.d.balance - cap
    rp.nextStart = c.start + c.dur
    rp.i += c.k; rp.cur = null
  }
}

function resetSim(sc) {
  clearScene(sc); sc.done = false; sc.final = null; sc.stopped = null; sc.dayIdx = 0; sc.dayTotal = 0; sc.refAbs = 0; sc.fizz = 0; sc.headline = null; sc.total = 0
  sc.ring.indet = false
}

// live: oggetto della simulazione in corso (days cresce, total, phase, status 'running' | 'done' | 'cancelled' | 'error',
// result a calcolo finito), scritto da Simulation.jsx mentre arrivano gli eventi; result: il risultato completo
export function SimSphere({ live, result, capital }) {
  const { canvasRef, boxRef, sc } = useSphere('sim')
  const [prog, setProg] = useState(null)
  const [replayKey, setReplayKey] = useState(0)
  useEffect(() => {
    sc.onTick = s => {
      const lv = s.replay?.live || null
      setProg({
        day: s.dayIdx || 0, total: s.dayTotal || 0, done: !!s.final, stopped: s.stopped,
        ...(s.final || { win: s.layers.gain.n, winPnl: s.layers.gain.v, loss: s.layers.loss.n, lossPnl: -s.layers.loss.v }),
        calc: lv ? { computed: lv.days.length, total: lv.total || 0, phase: lv.phase, last: lv.days.at(-1)?.day || null, load: lv.load, prep: lv.prep } : null,
      })
    }
    return () => { sc.onTick = null }
  }, [sc])
  // nuova simulazione: la sfera segue il calcolo dal vivo
  useEffect(() => {
    if (!live) return
    resetSim(sc); setProg(null)
    sc.ring.indet = true; sc.label = 'Simulazione in corso'; sc.sub = 'carico i dati…'
    sc.replay = buildLive(live, capital)
    if (reducedMotion()) sc.replay.skip = true
  }, [sc, live]) // eslint-disable-line react-hooks/exhaustive-deps
  // "Rivedi l'animazione" (o risultato senza simulazione dal vivo): si rigioca dal risultato completo
  useEffect(() => {
    if (!result || (live && !replayKey)) return
    resetSim(sc); setProg(null)
    sc.label = 'Risultato accumulato'
    sc.scale = Math.max(1e-9, result.grossWin + result.grossLoss)
    sc.refAbs = Math.max(0.01, pct95(result.trades.map(t => t.pnl)))
    sc.dayTotal = result.daily.length
    sc.replay = buildReplay(result)
    if (reducedMotion()) sc.replay.skip = true
  }, [sc, replayKey, live ? null : result]) // eslint-disable-line react-hooks/exhaustive-deps

  const playing = !!sc.replay && !prog?.done && !prog?.stopped
  const calc = prog?.calc, calcOn = live?.status === 'running'
  // barra: giorni calcolati, altrimenti preparazione, altrimenti titoli caricati (null = in attesa, barra che scorre)
  const barW = !calc ? null : calc.computed > 0 && calc.total ? Math.min(100, calc.computed / calc.total * 100)
    : calc.prep ? calc.prep.p * 100 : calc.load ? calc.load.done / Math.max(1, calc.load.total) * 100 : null
  return (
    <div className="sphere-card sim">
      <div className="sphere-box" ref={boxRef}>
        <canvas ref={canvasRef} role="img" aria-label={prog?.done && result ? `Risultato della simulazione ${money(result.net)} USDT` : 'Simulazione in corso'} />
      </div>
      {calcOn && (
        <div className="sim-progress" aria-live="polite">
          <div className="sim-progress-bar"><span className={barW === null ? 'indet' : ''} style={barW === null ? undefined : { width: `${barW}%` }} /></div>
          <div className="sim-steps">
            {[['carico le candele', calc?.load && !calc.prep && !calc.computed ? `${calc.load.done} / ${calc.load.total} titoli` : null, !!(calc?.prep || calc?.computed)],
              ['preparo i dati', calc?.prep && !calc.computed ? `${Math.round(calc.prep.p * 100)}%` : null, !!calc?.computed],
              ['calcolo', calc?.computed ? `${calc.last ? dayShort(calc.last) : ''} · ${calc.computed} / ${calc.total} giorni` : null, false]]
              .map(([name, val, done], i) => (
                <span key={i} className={`note mono ${val ? 'on' : done ? 'done' : ''}`}>{done ? '✓ ' : `${i + 1} · `}{name}{val && <b> {val}</b>}</span>
              ))}
          </div>
        </div>
      )}
      {prog && (prog.day > 0 || prog.done) && (
        <div className="sphere-stats">
          <div><span className="lab">Giorni</span><b className="mono">{`${prog.day} / ${prog.total || '—'}`}</b><span className="note">{prog.done ? 'simulazione finita' : prog.stopped === 'cancelled' ? 'annullata' : prog.stopped ? 'interrotta' : 'giorno per giorno'}</span></div>
          <div><span className="lab">Trade vinti</span><b className="mono up">{money(prog.winPnl)}</b><span className="note">{`${fmtUsd(prog.win, 0)} trade`}</span></div>
          <div><span className="lab">Trade persi</span><b className={`mono ${prog.lossPnl < 0 ? 'down' : ''}`}>{money(prog.lossPnl)}</b><span className="note">{`${fmtUsd(prog.loss, 0)} trade`}</span></div>
        </div>
      )}
      {playing && prog?.day > 0 && <button className="btn ghost small sphere-replay" onClick={() => { if (sc.replay) sc.replay.skip = true }}>Salta alla fine</button>}
      {result && prog?.done && <button className="btn ghost small sphere-replay" onClick={() => setReplayKey(x => x + 1)}>Rivedi l'animazione</button>}
    </div>
  )
}
