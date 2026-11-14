// Range P e B (metodo di Patrick Nill): impulsi, range dopo l'impulso, tocchi, falsi breakout, setup e storico.
// Codice comune tra la pagina Range (src/pages/Range.jsx) e gli avvisi push (server/range-alerts.js). Solo analisi, nessun ordine.
// Candele: { t: ms, o, h, l, c, v }. Si usano solo candele CHIUSE: chi chiama toglie quella in corso.
// Nessun dato futuro: ogni decisione (range valido, falso breakout, setup) usa solo le candele fino a quella che la fa scattare;
// i livelli del volume profile sono quelli della settimana PRIMA del setup, i range precedenti quelli già finiti, il trend a 4 ore
// quello delle candele a 4 ore già chiuse.
import { atr, ema } from './indicators.js'

export const RANGE_DEFAULTS = {
  impulseAtr: 3,     // forza minima dell'impulso: movimento in multipli dell'ATR a 15 minuti (volatilità normale)
  impulseBars: 16,   // l'impulso deve avvenire in al massimo tante candele da 15 minuti (16 = 4 ore)
  minTouches: 3,     // tocchi minimi dei bordi (alto + basso, almeno uno per lato) perché il range sia valido
  minHours: 12,      // durata minima del range in ore (mezza giornata)
  touchTol: 0.25,    // tolleranza per contare un tocco, in multipli dell'ATR
  minRR: 3,          // rapporto rischio/rendimento minimo per un setup valido
}
const MAX_RETRACE = 0.6   // il range non deve ritracciare più del 60% dell'impulso (altrimenti non è una P o una B)
const STOP_BUF = 0.1      // stop oltre l'estremo del falso breakout: + 0,1 ATR
const MIN_RISK = 0.5      // ma almeno mezzo ATR dall'entrata (uno stop più stretto lo prende il rumore e gonfia il rapporto)
const EXPIRY_BARS = 16    // l'entrata limite vale 4 ore, poi il setup scade
const MAX_DAYS = 5        // un range valido dura al massimo 5 giorni
const Q = 15 * 60000

export const LIMITS = { impulseAtr: [1.5, 8], impulseBars: [4, 48], minTouches: [2, 8], minHours: [2, 48], touchTol: [0.05, 1], minRR: [1, 6] }
export function cleanRangeSettings(p) {
  const out = { ...RANGE_DEFAULTS }
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) { const v = +p?.[k]; if (Number.isFinite(v) && v >= lo && v <= hi) out[k] = v }
  out.minTouches = Math.round(out.minTouches); out.impulseBars = Math.round(out.impulseBars)
  return out
}

// ---------- Trend di fondo a 4 ore ----------
// Regola: media esponenziale a 50 candele (circa 8 giorni). Rialzista se il prezzo è sopra la media E la media sale rispetto
// a 10 candele prima (40 ore); ribassista se è sotto e la media scende; altrimenti laterale.
export function trendAt(bars4h, e50, idx) {
  if (idx < 60 || e50[idx] === null || e50[idx - 10] === null) return null
  const c = bars4h[idx].c, now = e50[idx], before = e50[idx - 10]
  const slope = (now / before - 1) * 100
  return { trend: c > now && now > before ? 'up' : c < now && now < before ? 'down' : 'side', price: c, ema: now, slope }
}
export function trend4h(bars4h) {
  const e50 = ema(bars4h.map(b => b.c), 50)
  return { ...(trendAt(bars4h, e50, bars4h.length - 1) || { trend: null }), e50 }
}

// ---------- Volume profile ----------
// Volume di ogni candela distribuito in parti uguali sulle fasce di prezzo che tocca. POC = fascia con più volume;
// area di valore = fasce attorno al POC con il 70% del volume.
export function volumeProfile(bars, bins = 60) {
  if (bars.length < 10) return null
  const lo = Math.min(...bars.map(b => b.l)), hi = Math.max(...bars.map(b => b.h))
  if (!(hi > lo)) return null
  const step = (hi - lo) / bins, vol = new Array(bins).fill(0)
  for (const b of bars) {
    const a = Math.max(0, Math.min(bins - 1, Math.floor((b.l - lo) / step))), z = Math.max(0, Math.min(bins - 1, Math.floor((b.h - lo) / step)))
    for (let i = a; i <= z; i++) vol[i] += (b.v || 0) / (z - a + 1)
  }
  const total = vol.reduce((s, x) => s + x, 0)
  if (!(total > 0)) return null
  let poc = 0
  for (let i = 1; i < bins; i++) if (vol[i] > vol[poc]) poc = i
  let a = poc, z = poc, acc = vol[poc]
  while (acc < total * 0.7 && (a > 0 || z < bins - 1)) {
    const down = a > 0 ? vol[a - 1] : -1, up = z < bins - 1 ? vol[z + 1] : -1
    if (up >= down) acc += vol[++z]; else acc += vol[--a]
  }
  return { poc: lo + (poc + 0.5) * step, val: lo + a * step, vah: lo + (z + 1) * step }
}
// lunedì 00:00 UTC della settimana di t
export const weekStart = t => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) }
// volume profile della settimana completa prima di t (da candele a 1 ora)
export function prevWeekProfile(bars1h, t) {
  const w1 = weekStart(t), w0 = w1 - 7 * 864e5
  const vp = volumeProfile(bars1h.filter(b => b.t >= w0 && b.t < w1))
  return vp && { ...vp, from: w0, to: w1 }
}

// ---------- Riconoscimento ----------
const pathOf = b => (Math.abs(b.h - b.o) < Math.abs(b.l - b.o) ? [b.o, b.h, b.l, b.c] : [b.o, b.l, b.h, b.c])

export function analyze(bars, settings = RANGE_DEFAULTS, { bars1h = [], bars4h = [] } = {}) {
  const s = cleanRangeSettings(settings)
  const n = bars.length
  const A = atr(bars, 14)
  const e50 = ema(bars4h.map(b => b.c), 50)
  const trendOf = t => { let i = -1; for (let k = 0; k < bars4h.length && bars4h[k].t + 4 * 3600000 <= t; k++) i = k; return i >= 0 ? trendAt(bars4h, e50, i)?.trend ?? null : null }
  const impulses = [], ranges = [], setups = []
  const minBars = Math.round(s.minHours * 4)

  // impulso che finisce alla candela j (massimo/minimo nuovo), dal punto più lontano nelle ultime impulseBars candele
  const impulseAt = j => {
    let best = null
    for (const d of [1, -1]) {
      let i0 = -1, ext = d > 0 ? Infinity : -Infinity
      for (let i = Math.max(0, j - s.impulseBars); i < j; i++) { const x = d > 0 ? bars[i].l : bars[i].h; if (d > 0 ? x < ext : x > ext) { ext = x; i0 = i } }
      if (i0 < 0) continue
      const top = d > 0 ? bars[j].h : bars[j].l
      let isExt = true
      for (let i = i0; i < j; i++) if (d > 0 ? bars[i].h >= top : bars[i].l <= top) { isExt = false; break }
      if (!isExt) continue
      const base = A[Math.max(14, i0 - 1)] ?? A[j]
      if (!base) continue
      const size = Math.abs(top - ext)
      if (size >= s.impulseAtr * base && (!best || size / base > best.strength)) best = { dir: d, start: i0, end: j, from: ext, to: top, size, atr: base, strength: size / base }
    }
    return best
  }

  // tocchi dei bordi tra le candele a e b (un tocco nuovo solo dopo essersi allontanati dal bordo)
  const touches = (a, b, top, bottom, tol) => {
    let up = 0, dn = 0, inUp = false, inDn = false
    for (let k = a; k <= b; k++) {
      const hu = bars[k].h >= top - tol, hd = bars[k].l <= bottom + tol
      if (hu && !inUp) up++
      if (hd && !inDn) dn++
      inUp = hu; inDn = hd
    }
    return { up, dn }
  }

  // aree di valore conosciute al momento k: range precedenti già finiti e volume profile della settimana prima
  const valueLevels = (k, rg) => {
    const cands = []
    for (const r of ranges) if (r !== rg && r.endIdx !== null && r.endIdx < k) { cands.push({ p: r.top, why: 'range precedente (bordo alto)' }); cands.push({ p: r.bottom, why: 'range precedente (bordo basso)' }) }
    const vp = prevWeekProfile(bars1h, bars[k].t)
    if (vp) { cands.push({ p: vp.poc, why: 'POC del volume settimanale' }); cands.push({ p: vp.vah, why: 'alto dell\'area di valore settimanale' }); cands.push({ p: vp.val, why: 'basso dell\'area di valore settimanale' }) }
    return cands
  }

  // Target in tre parti come Patrick: T1 bordo opposto del range; T2 prossima area di valore; T3 origine dell'impulso.
  // Inversione (contro l'impulso del range: short in una P, long in una B): T3 = origine dell'impulso, T2 = prima area di valore
  // tra T1 e l'origine (se non c'è, anche T2 all'origine). A favore dell'impulso l'origine è dall'altra parte: T2 e T3 sono le due
  // aree di valore successive; senza aree oltre (come ai massimi storici) si proietta l'impulso 1:1 dal bordo.
  const targets = (side, t1, k, rg) => {
    const min = 0.25 * rg.atr
    const beyond = (from, list) => list.filter(c => side * (c.p - from) > min).sort((x, y) => side * (x.p - y.p))
    const lv = valueLevels(k, rg)
    const reversal = (rg.type === 'P') === (side < 0)
    if (reversal) {
      const t3 = { p: rg.imp.from, why: 'origine dell\'impulso' }
      const mid = beyond(t1, lv).filter(c => side * (t3.p - c.p) > min)
      const t2 = mid[0] || { ...t3, why: 'origine dell\'impulso (nessuna area di valore prima)' }
      return { reversal, t2, t3 }
    }
    const proj = { p: side > 0 ? rg.top + rg.imp.size : rg.bottom - rg.imp.size, why: 'proiezione 1:1 dell\'impulso (nessuna area oltre)', proj: true }
    const t2 = beyond(t1, lv)[0] || proj
    const t3 = beyond(t2.p, lv)[0] || (side * (proj.p - t2.p) > min ? proj : { ...t2 })
    return { reversal, t2, t3 }
  }

  // setup dal falso breakout: limite sul bordo, stop oltre l'estremo, tre target; poi cosa è successo
  const makeSetup = (rg, fb) => {
    const side = -fb.dir, k = fb.idx
    const entry = fb.dir > 0 ? rg.top : rg.bottom
    let stop = fb.ext + fb.dir * STOP_BUF * rg.atr
    if (fb.dir * (stop - entry) < MIN_RISK * rg.atr) stop = entry + fb.dir * MIN_RISK * rg.atr
    const t1 = fb.dir > 0 ? rg.bottom : rg.top
    const tg = targets(side, t1, k, rg)
    const risk = side * (entry - stop)
    if (!(risk > 0)) return null
    const rr1 = side * (t1 - entry) / risk, rr2 = side * (tg.t2.p - entry) / risk, rr = side * (tg.t3.p - entry) / risk
    const tr = trendOf(bars[k].t + Q)
    const fit = !tr || tr === 'side' ? 'neutro' : (tr === 'up') === (side > 0) ? 'a favore' : 'contro'
    // validità: rapporto fino all'ultimo target almeno minRR e trend a 4 ore a favore; con il trend non chiaro vale solo
    // l'inversione dopo un impulso forte che si è fermato (il range stesso); contro il trend non si entra
    let invalid = null
    if (rr < s.minRR) invalid = `rischio/rendimento ${rr.toFixed(1)} sotto ${s.minRR}`
    else if (fit === 'contro') invalid = 'contro il trend a 4 ore'
    else if (fit === 'neutro' && !tg.reversal) invalid = 'trend a 4 ore non chiaro e non è un\'inversione'
    const st = {
      id: `${rg.id}:${bars[k].t}`, range: rg.id, type: rg.type, side, at: bars[k].t + Q, idx: k, entry, stop, t1,
      t2: tg.t2.p, t2why: tg.t2.why, t3: tg.t3.p, t3why: tg.t3.why, proj: !!(tg.t2.proj || tg.t3.proj), reversal: tg.reversal,
      rr, rr1, rr2, rrAll: (rr1 + rr2 + rr) / 3, valid: !invalid, invalid, trend: tr, fit, strong: rg.strong || null,
      status: 'pronto', fillIdx: null, exitIdx: null, R: null, parts: 0,
    }
    // dopo il setup: entrata limite (4 ore), poi un terzo a T1 con lo stop a pareggio, un terzo a T2, un terzo a T3
    const lv = [t1, tg.t2.p, tg.t3.p], rrs = [rr1, rr2, rr]
    let stopNow = stop, got = 0
    for (let m = k + 1; m < n; m++) {
      const pts = pathOf(bars[m])
      for (const p of pts) {
        if (st.fillIdx === null) {
          if (side * (p - t1) >= 0) { st.status = 'scaduto'; st.why = 'arrivato al bordo opposto senza entrare'; st.exitIdx = m; break }
          if (side * (p - entry) <= 0) { st.fillIdx = m; st.status = 'in corso' }
          continue
        }
        if (side * (p - stopNow) <= 0) { st.R = st.parts ? got : -1; st.status = st.parts ? `pareggio dopo T${st.parts}` : 'stop'; st.exitIdx = m; break }
        while (st.parts < 3 && side * (p - lv[st.parts]) >= 0) { got += rrs[st.parts] / 3; st.parts++; stopNow = entry }
        if (st.parts === 3) { st.R = got; st.status = 'target'; st.exitIdx = m; break }
      }
      if (st.exitIdx !== null) break
      if (st.fillIdx === null && m - k >= EXPIRY_BARS) { st.status = 'scaduto'; st.why = 'entrata limite mai eseguita'; st.exitIdx = m; break }
    }
    if (st.status === 'in corso') st.openR = got + (3 - st.parts) / 3 * side * (bars[n - 1].c - entry) / risk
    return st
  }

  // Breakout con conferma (secondo modo, meno importante): chiusura fuori dal range (candela di breakout), ritorno sul bordo,
  // poi una candela che rompe l'estremo della candela di breakout → entrata lì, stop oltre il minimo (o massimo) del ritorno,
  // obiettivo l'ampiezza del range proiettata dal bordo. Se una candela richiude dentro il range è un falso breakout: annullato.
  const breakoutConfirm = rg => {
    if (rg.validIdx === null) return null
    const tol = s.touchTol * rg.atr, h = rg.top - rg.bottom
    const until = Math.min(n - 1, (rg.endIdx ?? n - 1) + EXPIRY_BARS)
    let w = null, last = null
    for (let k = rg.validIdx + 1; k <= until; k++) {
      const b = bars[k]
      if (!w) { if (b.c > rg.top) w = { dir: 1, B: k }; else if (b.c < rg.bottom) w = { dir: -1, B: k }; continue }
      const d = w.dir, B = bars[w.B]
      if (k - w.B > EXPIRY_BARS) { last = { ...w, status: 'scaduto' }; w = null; continue }
      if (d > 0 ? b.c <= rg.top : b.c >= rg.bottom) { last = { ...w, status: 'richiuso dentro il range (falso breakout)' }; w = null; continue }
      if (!w.retest && (d > 0 ? b.l <= rg.top + tol : b.h >= rg.bottom - tol)) w.retest = k
      if (w.retest && (d > 0 ? b.h > B.h : b.l < B.l)) {
        const entry = d > 0 ? B.h : B.l
        const seg = bars.slice(w.B + 1, k + 1)
        let stop = d > 0 ? Math.min(...seg.map(x => x.l)) - STOP_BUF * rg.atr : Math.max(...seg.map(x => x.h)) + STOP_BUF * rg.atr
        if (d * (entry - stop) < MIN_RISK * rg.atr) stop = entry - d * MIN_RISK * rg.atr
        const target = d > 0 ? rg.top + h : rg.bottom - h
        const risk = d * (entry - stop), rr = d * (target - entry) / risk
        const bo = { ...w, status: 'entrata', idx: k, entry, stop, target, rr, R: null }
        for (let m = k + 1; m < n && bo.R === null; m++) for (const p of pathOf(bars[m])) {
          if (d * (p - stop) <= 0) { bo.R = -1; bo.status = 'stop'; break }
          if (d * (p - target) >= 0) { bo.R = rr; bo.status = 'target'; break }
        }
        return bo
      }
    }
    if (w) return { ...w, status: w.retest ? 'ritorno sul bordo fatto: si aspetta la rottura dell\'estremo della candela di breakout' : 'chiusura fuori: si aspetta il ritorno sul bordo', trigger: w.dir > 0 ? bars[w.B].h : bars[w.B].l }
    return last
  }

  let j = 15
  while (j < n) {
    const imp = impulseAt(j)
    if (!imp) { j++; continue }
    // l'impulso continua finché le candele seguenti fanno nuovi estremi
    while (imp.end + 1 < n && (imp.dir > 0 ? bars[imp.end + 1].h > imp.to : bars[imp.end + 1].l < imp.to)) { imp.end++; imp.to = imp.dir > 0 ? bars[imp.end].h : bars[imp.end].l; imp.size = Math.abs(imp.to - imp.from) }
    imp.id = `${imp.dir > 0 ? 'P' : 'B'}${bars[imp.end].t}`
    impulses.push(imp)
    const e = imp.end, tol = s.touchTol * imp.atr
    const rg = {
      id: imp.id, type: imp.dir > 0 ? 'P' : 'B', imp, atr: imp.atr, startIdx: e, endIdx: null,
      top: imp.dir > 0 ? imp.to : -Infinity, bottom: imp.dir > 0 ? Infinity : imp.to,
      status: 'in formazione', validIdx: null, fakeouts: [], breakout: null, touchUp: 0, touchDn: 0, out: null,
    }
    let next = null
    for (let k = e + 1; k < n; k++) {
      const b = bars[k]
      if (rg.validIdx === null) {
        // formazione: il bordo dal lato dell'impulso è fisso (estremo dell'impulso), l'altro si allarga
        if (imp.dir > 0 ? b.c > rg.top + tol : b.c < rg.bottom - tol) { rg.status = 'annullato'; rg.why = 'l\'impulso è ripartito prima che il range fosse valido'; rg.endIdx = k; next = k; break }
        if (imp.dir > 0) rg.bottom = Math.min(rg.bottom, b.l); else rg.top = Math.max(rg.top, b.h)
        if (rg.top - rg.bottom > MAX_RETRACE * imp.size) { rg.status = 'annullato'; rg.why = 'ritracciamento oltre il 60% dell\'impulso'; rg.endIdx = k; next = k; break }
        const tc = touches(e, k, rg.top, rg.bottom, tol)
        rg.touchUp = tc.up; rg.touchDn = tc.dn
        if (k - e >= minBars && tc.up + tc.dn >= s.minTouches && tc.up >= 1 && tc.dn >= 1) {
          rg.validIdx = k; rg.status = 'valido'; rg.validAt = b.t + Q; rg.validTrend = trendOf(b.t + Q)
          // rafforzato: il range si è formato su un livello del volume profile della settimana prima (POC, VAH o VAL)
          const vp = prevWeekProfile(bars1h, b.t)
          if (vp) {
            const on = [['POC', vp.poc], ['VAH', vp.vah], ['VAL', vp.val]].filter(([, p]) => p >= rg.bottom - tol && p <= rg.top + tol)
            if (on.length) rg.strong = on.map(([name, p]) => ({ name, p }))
          }
        }
        else if (k - e > MAX_DAYS * 96) { rg.status = 'annullato'; rg.why = 'nessun range valido in 5 giorni'; rg.endIdx = k; next = k; break }
        continue
      }
      // range valido: bordi fermi
      const tc = touches(e, k, rg.top, rg.bottom, tol); rg.touchUp = tc.up; rg.touchDn = tc.dn
      if (rg.out) {
        const back = rg.out.dir > 0 ? b.c <= rg.top : b.c >= rg.bottom
        if (back) {
          const seg = bars.slice(rg.out.idx, k + 1)
          const fb = { dir: rg.out.dir, outIdx: rg.out.idx, idx: k, at: b.t + Q, ext: rg.out.dir > 0 ? Math.max(...seg.map(x => x.h)) : Math.min(...seg.map(x => x.l)) }
          rg.fakeouts.push(fb)
          const st = makeSetup(rg, fb)
          if (st) { setups.push(st); fb.setup = st.id }
          rg.out = null
          rg.status = 'falso breakout'
        } else {
          rg.breakout = { dir: rg.out.dir, idx: k, at: b.t + Q }
          rg.status = 'breakout'; rg.endIdx = k; next = k; break
        }
        continue
      }
      if (b.c > rg.top) rg.out = { dir: 1, idx: k }
      else if (b.c < rg.bottom) rg.out = { dir: -1, idx: k }
      if (k - rg.validIdx > MAX_DAYS * 96) { rg.status = 'scaduto'; rg.why = 'range valido da più di 5 giorni'; rg.endIdx = k; next = k; break }
    }
    // i range mai diventati validi restano (chiari sul grafico, con il motivo) se sono durati almeno 2 ore: servono a confrontare
    // quello che vede l'app con quello che si vede a occhio; non danno setup
    if (rg.status !== 'annullato') ranges.push(rg)
    else if (rg.endIdx - rg.startIdx >= 8 && Number.isFinite(rg.top) && Number.isFinite(rg.bottom)) { rg.dropped = true; ranges.push(rg) }
    if (next === null) break // range ancora aperto fino all'ultima candela
    j = Math.max(next, e + 1)
  }

  // stato attuale dei range ancora aperti (o finiti da poco)
  const lastIdx = n - 1
  for (const rg of ranges) {
    rg.active = !rg.dropped && (rg.endIdx === null || lastIdx - rg.endIdx <= 8)
    const st = setups.filter(x => x.range === rg.id).at(-1)
    rg.lastSetup = st || null
    if (rg.endIdx === null) {
      if (rg.out) rg.state = 'breakout'
      else if (st && st.status === 'pronto') rg.state = st.valid ? 'setup pronto' : 'falso breakout in corso'
      else if (st && st.status === 'in corso') rg.state = st.valid ? 'setup in corso' : 'falso breakout in corso'
      else if (st && st.status === 'scaduto' && lastIdx - st.exitIdx <= 8) rg.state = 'setup scaduto'
      else rg.state = rg.validIdx === null ? 'in formazione' : 'valido'
    } else rg.state = rg.dropped ? `non valido: ${rg.why}` : rg.status
    // gli altri due modi di operare il range (meno importanti): dentro il range e breakout con conferma
    if (rg.validIdx !== null) {
      // range trade: limite sul bordo, obiettivo il bordo opposto, senza parziali; stop oltre il bordo (mezzo ATR)
      const sb = MIN_RISK * rg.atr
      rg.alt = {
        inside: { long: { entry: rg.bottom, stop: rg.bottom - sb, target: rg.top }, short: { entry: rg.top, stop: rg.top + sb, target: rg.bottom } },
        breakout: breakoutConfirm(rg),
      }
    }
  }
  return { atr: A, impulses, ranges, setups, settings: s, last: bars[n - 1] }
}

// Eventi per gli avvisi push: range diventato valido, setup valido pronto (con il momento in cui è successo)
export function events(res) {
  const out = []
  for (const rg of res.ranges) if (rg.validAt) out.push({ key: `valid:${rg.id}`, at: rg.validAt, kind: 'valid', range: rg })
  for (const st of res.setups) if (st.valid) out.push({ key: `setup:${st.id}`, at: st.at, kind: 'setup', setup: st })
  return out
}
