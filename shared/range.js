// Range P e B (metodo di Patrick Nill): impulsi, range dopo l'impulso, tocchi, falsi breakout, setup, voto di qualità ed esito.
// Codice comune tra la pagina Range (src/pages/Range.jsx) e il server (server/range-alerts.js: avvisi push e registro).
// Solo analisi, nessun ordine. Regole spiegate in claude/strategia-range-pb-patrick.md ("Regole dell'app").
// Candele: { t: ms, o, h, l, c, v }. Si usano solo candele CHIUSE: chi chiama toglie quella in corso.
// Nessun dato futuro: ogni decisione usa solo le candele fino a quella che la fa scattare; il profilo della settimana in corso
// è quello fino a quel momento, i range precedenti quelli già finiti, il trend a 4 ore quello delle candele già chiuse.
import { atr, ema } from './indicators.js'

export const RANGE_DEFAULTS = {
  impulseAtr: 3,     // forza minima dell'impulso: movimento in multipli dell'ATR a 15 minuti (volatilità normale)
  impulseBars: 16,   // l'impulso deve avvenire in al massimo tante candele da 15 minuti (16 = 4 ore)
  minTouches: 3,     // tocchi minimi dei bordi (alto + basso, almeno uno per lato) perché il range sia valido
  minHours: 12,      // durata minima del range in ore (mezza giornata)
  touchTol: 0.25,    // tolleranza per contare un tocco, in multipli dell'ATR
  minRR: 3,          // rapporto rischio/rendimento minimo (fino all'ultimo target) per un setup valido
}
const MAX_RETRACE = 0.6   // il range non deve ritracciare più del 60% dell'impulso (altrimenti non è una P o una B)
const STOP_BUF = 0.1      // stop oltre l'estremo: + 0,1 ATR
const MIN_RISK = 0.5      // ma almeno mezzo ATR dall'entrata (uno stop più stretto lo prende il rumore e gonfia il rapporto)
const EXPIRY_BARS = 16    // un'entrata in attesa vale 4 ore, poi il setup scade
const MAX_DAYS = 5        // un range valido dura al massimo 5 giorni
const LEVEL_TOL = 0.5     // un livello settimanale "tocca" il range o il falso breakout entro mezzo ATR
// commissioni di Bitunix (futures, livello base): ordine limite (maker) 0,02%, a mercato o stop (taker) 0,06%
export const FEES = { maker: 0.02, taker: 0.06 }
const Q = 15 * 60000, H1 = 3600000

export const LIMITS = { impulseAtr: [1.5, 8], impulseBars: [4, 48], minTouches: [2, 8], minHours: [2, 48], touchTol: [0.05, 1], minRR: [1, 6] }
export function cleanRangeSettings(p) {
  const out = { ...RANGE_DEFAULTS }
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) { const v = +p?.[k]; if (Number.isFinite(v) && v >= lo && v <= hi) out[k] = v }
  out.minTouches = Math.round(out.minTouches); out.impulseBars = Math.round(out.impulseBars)
  return out
}
export const GRADES = ['A', 'B', 'C']
export const gradeAtLeast = (g, min) => GRADES.indexOf(g) >= 0 && GRADES.indexOf(g) <= GRADES.indexOf(min || 'C')

// ---------- Trend di fondo a 4 ore (solo contesto) ----------
// Media esponenziale a 50 candele (circa 8 giorni). Rialzista se il prezzo è sopra la media e la media sale rispetto a
// 10 candele prima (40 ore); ribassista se è sotto e la media scende; altrimenti laterale.
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
// area di valore (VAL–VAH) = fasce attorno al POC con il 70% del volume. Zone con molto volume (HVN, almeno 1,5 volte la media:
// il prezzo rallenta) e con poco volume (LVN, al massimo 0,35 volte la media, non agli estremi: il prezzo le attraversa in fretta).
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
  const mean = total / bins
  const zones = pred => {
    const out = []
    let s0 = -1
    for (let i = 0; i <= bins; i++) {
      const ok = i < bins && pred(vol[i])
      if (ok && s0 < 0) s0 = i
      if (!ok && s0 >= 0) { out.push({ lo: lo + s0 * step, hi: lo + i * step, a: s0, z: i, v: vol.slice(s0, i).reduce((s, x) => s + x, 0) }); s0 = -1 }
    }
    return out
  }
  const hvn = zones(v => v >= 1.5 * mean).sort((x, y) => y.v - x.v).slice(0, 4).map(({ lo: l, hi: h }) => ({ lo: l, hi: h }))
  const lvn = zones(v => v <= 0.35 * mean).filter(x => x.a > 1 && x.z < bins - 1 && x.z - x.a >= 2).map(({ lo: l, hi: h }) => ({ lo: l, hi: h }))
  return { poc: lo + (poc + 0.5) * step, val: lo + a * step, vah: lo + (z + 1) * step, lo, hi, hvn, lvn }
}
// lunedì 00:00 UTC della settimana di t
export const weekStart = t => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) }
// profilo della settimana precedente (completa) e di quella in corso fino a t (candele da 1 ora già chiuse)
export function weekProfiles(bars1h, t) {
  const w1 = weekStart(t), w0 = w1 - 7 * 864e5
  const prev = volumeProfile(bars1h.filter(b => b.t >= w0 && b.t < w1))
  const curBars = bars1h.filter(b => b.t >= w1 && b.t + H1 <= t)
  const cur = curBars.length >= 12 ? volumeProfile(curBars) : null
  return { prev: prev && { ...prev, from: w0, to: w1 }, cur: cur && { ...cur, from: w1, to: t } }
}
export function weekLevels(wp) {
  const out = []
  if (wp?.prev) out.push({ name: 'POC sett. prec.', p: wp.prev.poc }, { name: 'VAH sett. prec.', p: wp.prev.vah }, { name: 'VAL sett. prec.', p: wp.prev.val })
  if (wp?.cur) out.push({ name: 'POC sett.', p: wp.cur.poc }, { name: 'VAH sett.', p: wp.cur.vah }, { name: 'VAL sett.', p: wp.cur.val })
  return out
}

// ---------- Riconoscimento ----------
const pathOf = b => (Math.abs(b.h - b.o) < Math.abs(b.l - b.o) ? [b.o, b.h, b.l, b.c] : [b.o, b.l, b.h, b.c])
const KIND = { falso: 'falso breakout', range: 'range trade', breakout: 'breakout con conferma' }
export const KIND_LABEL = KIND

export function analyze(bars, settings = RANGE_DEFAULTS, { bars1h = [], bars4h = [] } = {}) {
  const s = cleanRangeSettings(settings)
  const n = bars.length
  const A = atr(bars, 14)
  const e50 = ema(bars4h.map(b => b.c), 50)
  const trendOf = t => { let i = -1; for (let k = 0; k < bars4h.length && bars4h[k].t + 4 * H1 <= t; k++) i = k; return i >= 0 ? trendAt(bars4h, e50, i)?.trend ?? null : null }
  const wpCache = new Map()
  const wpAt = t => { const key = Math.floor(t / H1); if (!wpCache.has(key)) wpCache.set(key, weekProfiles(bars1h, t)); return wpCache.get(key) }
  const impulses = [], ranges = [], setups = [], trades = []
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

  // aree di valore conosciute alla candela k: range precedenti già finiti e livelli del profilo settimanale (precedente e in corso)
  const valueLevels = (k, rg) => {
    const cands = []
    for (const r of ranges) if (r !== rg && !r.dropped && r.endIdx !== null && r.endIdx < k) { cands.push({ p: r.top, why: 'range precedente (bordo alto)' }); cands.push({ p: r.bottom, why: 'range precedente (bordo basso)' }) }
    for (const l of weekLevels(wpAt(bars[k].t + Q))) cands.push({ p: l.p, why: l.name })
    return cands
  }
  const beyond = (side, from, list, min) => list.filter(c => side * (c.p - from) > min).sort((x, y) => side * (x.p - y.p))

  // Voto di qualità (A, B, C) con i motivi: livelli settimanali, tocchi e durata, rischio/rendimento, contesto a 4 ore,
  // volume della candela di rottura, strada verso il target (zone con poco volume) o ostacoli (zone con molto volume, POC).
  const gradeOf = ({ rg, k, side, entry, path, rr, fit, outIdx = null, ext = null, kind }) => {
    const reasons = []
    let sc = 0
    const add = (pts, txt) => { sc += pts; reasons.push({ pts, txt }) }
    const wp = wpAt(bars[k].t + Q), lv = weekLevels(wp), tol = LEVEL_TOL * rg.atr
    const on = lv.filter(l => (l.p >= rg.bottom - tol && l.p <= rg.top + tol) || (ext !== null && Math.abs(l.p - ext) <= tol))
    if (on.length) add(2, `su livello settimanale: ${[...new Set(on.map(l => l.name))].join(', ')}`)
    else add(0, lv.length ? 'lontano dai livelli settimanali' : 'profilo settimanale non disponibile')
    const tt = rg.touchUp + rg.touchDn, hours = (k - rg.startIdx) / 4
    add(tt >= 5 ? 1 : 0, `${tt} tocchi`)
    add(hours >= 24 ? 1 : 0, `range di ${Math.round(hours)} ore`)
    add(rr >= 5 ? 1 : rr < s.minRR ? -1 : 0, `rischio/rendimento ${rr.toFixed(1)}`)
    add(fit === 'a favore' ? 1 : fit === 'contro' ? -1 : 0, `trend a 4 ore ${fit}`)
    if (outIdx !== null) {
      const prev = bars.slice(Math.max(0, outIdx - 20), outIdx).map(b => b.v || 0)
      const avg = prev.reduce((x, y) => x + y, 0) / (prev.length || 1)
      const ratio = avg > 0 ? (bars[outIdx].v || 0) / avg : 1
      if (kind === 'falso') add(ratio <= 0.8 ? 1 : ratio >= 1.5 ? -1 : 0, `volume della rottura ${ratio.toFixed(1)}× la media${ratio <= 0.8 ? ' (debole: rottura poco convinta)' : ratio >= 1.5 ? ' (forte: la rottura potrebbe essere vera)' : ''}`)
      else add(ratio >= 1.5 ? 1 : ratio <= 0.8 ? -1 : 0, `volume del breakout ${ratio.toFixed(1)}× la media`)
    }
    // strada verso il target: tratto dopo il primo target (dentro il range il percorso è noto)
    const [a, b] = [Math.min(path[0], path[1]), Math.max(path[0], path[1])]
    if (b - a > tol) {
      const zonesH = [...(wp.prev?.hvn || []), ...(wp.cur?.hvn || [])], zonesL = [...(wp.prev?.lvn || []), ...(wp.cur?.lvn || [])]
      const inside = z => z.hi > a + tol && z.lo < b - tol
      const pocs = lv.filter(l => l.name.startsWith('POC') && l.p > a + tol && l.p < b - tol)
      if (zonesH.some(inside) || pocs.length) add(-1, `ostacolo verso il target: ${pocs.length ? pocs.map(l => l.name).join(', ') : 'zona con molto volume'}`)
      else if (zonesL.some(inside)) add(1, 'strada libera: zona con poco volume verso il target')
      else add(0, 'nessuna zona di volume rilevante verso il target')
    }
    const grade = sc >= 4 ? 'A' : sc >= 2 ? 'B' : 'C'
    void entry; void side
    return { grade, score: sc, reasons, weekLevels: on.map(l => l.name) }
  }

  // esito di un trade dopo la candela k: entrata (limite in attesa o già eseguita), poi target in parti con lo stop a pareggio
  // dopo il primo, o stop. Commissioni di Bitunix: entrata limite 0,02% o a mercato 0,06%, target (limite) 0,02%, stop 0,06%.
  const runTrade = (tr, k, { limit, cancelAt = null, until = n - 1, expiry = EXPIRY_BARS }) => {
    const side = tr.side, entry = tr.entry, risk = side * (entry - tr.stop)
    tr.status = limit ? 'pronto' : 'in corso'; tr.fillIdx = limit ? null : k; tr.exitIdx = null; tr.R = null; tr.parts = 0
    let stopNow = tr.stop, got = 0, left = 1, fees = (limit ? FEES.maker : FEES.taker) * entry
    for (let m = k + 1; m < n; m++) {
      for (const p of pathOf(bars[m])) {
        if (tr.fillIdx === null) {
          if (cancelAt !== null && side * (p - cancelAt) >= 0) { tr.status = 'scaduto'; tr.why = 'arrivato al primo target senza entrare'; tr.exitIdx = m; break }
          if (side * (p - entry) <= 0) { tr.fillIdx = m; tr.status = 'in corso' }
          continue
        }
        if (side * (p - stopNow) <= 0) {
          got += left * side * (stopNow - entry) / risk; fees += left * FEES.taker * stopNow; left = 0
          tr.status = tr.parts ? `pareggio dopo T${tr.parts}` : 'stop'; tr.exitIdx = m; break
        }
        while (tr.parts < tr.targets.length && side * (p - tr.targets[tr.parts].p) >= 0) {
          const t = tr.targets[tr.parts]
          got += t.frac * side * (t.p - entry) / risk; fees += t.frac * FEES.maker * t.p; left -= t.frac; tr.parts++; stopNow = entry
        }
        if (left <= 1e-9) { tr.status = 'target'; tr.exitIdx = m; break }
      }
      if (tr.exitIdx !== null) break
      if (tr.fillIdx === null && (m - k >= expiry || m >= until)) { tr.status = 'scaduto'; tr.why = m >= until && m - k < expiry ? 'range finito senza entrare' : 'entrata mai eseguita'; tr.exitIdx = m; break }
    }
    tr.feesR = fees / 100 / risk
    if (tr.fillIdx !== null && tr.exitIdx !== null) { tr.R = got; tr.Rnet = got - tr.feesR }
    if (tr.status === 'in corso') tr.openR = got + left * side * (bars[n - 1].c - entry) / risk
    tr.fillAt = tr.fillIdx !== null ? bars[tr.fillIdx].t + Q : null
    tr.exitAt = tr.exitIdx !== null ? bars[tr.exitIdx].t + Q : null
    return tr
  }

  const base = (rg, kind, variant, k, side) => {
    const tr = trendOf(bars[k].t + Q)
    return {
      kind, variant, range: rg.id, type: rg.type, side, withImpulse: side === rg.imp.dir, at: bars[k].t + Q, idx: k,
      trend: tr, fit: !tr || tr === 'side' ? 'neutro' : (tr === 'up') === (side > 0) ? 'a favore' : 'contro',
    }
  }
  const finish = (tr, rg, k, gradeArgs) => {
    const risk = tr.side * (tr.entry - tr.stop)
    tr.rrs = tr.targets.map(t => tr.side * (t.p - tr.entry) / risk)
    tr.rr = tr.rrs.at(-1)
    tr.rrAll = tr.targets.reduce((x, t, i) => x + t.frac * tr.rrs[i], 0)
    tr.valid = tr.rr >= s.minRR
    tr.invalid = tr.valid ? null : `rischio/rendimento ${tr.rr.toFixed(1)} sotto ${s.minRR}`
    Object.assign(tr, gradeOf({ rg, k, side: tr.side, entry: tr.entry, rr: tr.rr, fit: tr.fit, kind: tr.kind, path: [tr.targets[0].p, tr.targets.at(-1).p], ...gradeArgs }))
    return tr
  }

  // Falso breakout: long dopo un falso breakout verso il basso, short verso l'alto, nelle P e nelle B, con qualunque trend.
  // Entrata limite sul bordo (o a mercato alla chiusura della candela di rientro), stop oltre l'estremo del falso breakout,
  // un terzo a ogni target. Contro l'impulso: T1 bordo opposto, T2 prima area di valore prima dell'origine (o l'origine),
  // T3 origine dell'impulso. A favore dell'impulso: T1 bordo opposto, poi le aree di valore successive o la proiezione 1:1
  // dell'impulso; senza nessun riferimento, 2 volte il rischio.
  const fakeTargets = (side, t1, k, rg, entry, risk) => {
    const min = 0.25 * rg.atr, lv = valueLevels(k, rg), withImp = side === rg.imp.dir
    let t2, t3
    if (!withImp) {
      t3 = { p: rg.imp.from, why: 'origine dell\'impulso' }
      t2 = beyond(side, t1.p, lv, min).filter(c => side * (t3.p - c.p) > min)[0] || { ...t3, why: 'origine dell\'impulso (nessuna area di valore prima)' }
    } else {
      const proj = { p: side > 0 ? rg.top + rg.imp.size : rg.bottom - rg.imp.size, why: 'proiezione 1:1 dell\'impulso', proj: true }
      t2 = beyond(side, t1.p, lv, min)[0] || proj
      t3 = beyond(side, t2.p, lv, min)[0] || (side * (proj.p - t2.p) > min ? proj : { ...t2 })
    }
    if (!(side * (t3.p - t1.p) > min)) { const p = entry + side * 2 * risk; t2 = t3 = { p, why: '2 volte il rischio (nessun riferimento)' } }
    return [{ ...t1, frac: 1 / 3 }, { ...t2, frac: 1 / 3 }, { ...t3, frac: 1 / 3 }]
  }
  const makeFake = (rg, fb) => {
    const side = -fb.dir, k = fb.idx
    let stopLvl = fb.ext + fb.dir * STOP_BUF * rg.atr
    const t1 = { p: fb.dir > 0 ? rg.bottom : rg.top, why: 'bordo opposto del range' }
    const one = (variant, entry) => {
      let stop = stopLvl
      if (fb.dir * (stop - entry) < MIN_RISK * rg.atr) stop = entry + fb.dir * MIN_RISK * rg.atr
      const risk = side * (entry - stop)
      if (!(risk > 0) || side * (t1.p - entry) <= 0) return null
      const tr = { id: `${rg.id}:${bars[k].t}:${variant}`, ...base(rg, 'falso', variant, k, side), entry, stop, targets: fakeTargets(side, t1, k, rg, entry, risk), ext: fb.ext }
      finish(tr, rg, k, { outIdx: fb.outIdx, ext: fb.ext })
      return runTrade(tr, k, { limit: variant === 'limite', cancelAt: variant === 'limite' ? t1.p : null })
    }
    const lim = one('limite', fb.dir > 0 ? rg.top : rg.bottom)
    const mkt = one('mercato', bars[k].c)
    if (lim) { lim.market = mkt; setups.push(lim); trades.push(lim) }
    if (mkt) trades.push(mkt)
    return lim
  }

  // Range trade: ordine limite sui due bordi appena il range è valido; il primo eseguito vale, tutto fuori sul bordo opposto
  // (senza parziali), stop mezzo ATR oltre il bordo. Se il range finisce prima, non eseguito.
  const makeRangeTrade = rg => {
    const k = rg.validIdx, sb = MIN_RISK * rg.atr, until = rg.endIdx ?? n - 1
    let fill = null
    for (let m = k + 1; m <= until && !fill; m++) for (const p of pathOf(bars[m])) {
      if (p <= rg.bottom) { fill = { m, side: 1 }; break }
      if (p >= rg.top) { fill = { m, side: -1 }; break }
    }
    const side = fill?.side ?? 1
    const entry = side > 0 ? rg.bottom : rg.top
    const tr = { id: `${rg.id}:range`, ...base(rg, 'range', null, k, side), entry, stop: entry - side * sb, targets: [{ p: side > 0 ? rg.top : rg.bottom, why: 'bordo opposto del range', frac: 1 }] }
    finish(tr, rg, k, {})
    if (!fill) {
      tr.status = until < n - 1 ? 'scaduto' : 'pronto'; tr.why = until < n - 1 ? 'range finito senza entrare' : null
      tr.fillIdx = null; tr.exitIdx = until < n - 1 ? until : null; tr.R = null; tr.feesR = 0; tr.alsoShort = { entry: rg.top, stop: rg.top + sb, target: rg.bottom }
    } else {
      runTrade(tr, fill.m, { limit: false })
      tr.fillIdx = fill.m; tr.fillAt = bars[fill.m].t + Q
      tr.feesR = (FEES.maker * entry + (tr.status === 'stop' ? FEES.taker * tr.stop : FEES.maker * tr.targets[0].p)) / 100 / (side * (entry - tr.stop))
      if (tr.R !== null) tr.Rnet = tr.R - tr.feesR
    }
    trades.push(tr)
    return tr
  }

  // Breakout con conferma: chiusura fuori dal range (candela di breakout), ritorno sul bordo, poi una candela che rompe l'estremo
  // della candela di breakout → entrata lì (ordine stop, a mercato). Stop oltre il minimo (o massimo) del ritorno. Circa il 30%
  // al primo target (prossima area di valore o ampiezza del range), stop a pareggio, il resto corre fino alla successiva
  // (o la proiezione 1:1 dell'impulso, o il doppio dell'ampiezza del range). Se una candela richiude dentro: annullato.
  const breakoutConfirm = rg => {
    if (rg.validIdx === null) return null
    const tol = s.touchTol * rg.atr, h = rg.top - rg.bottom, min = 0.25 * rg.atr
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
        const lv = valueLevels(k, rg), edge = d > 0 ? rg.top : rg.bottom
        const t1 = beyond(d, entry, lv, min)[0] || { p: edge + d * h, why: 'ampiezza del range' }
        const far = d === rg.imp.dir ? { p: edge + d * rg.imp.size, why: 'proiezione 1:1 dell\'impulso' } : { p: edge + d * 2 * h, why: 'due volte l\'ampiezza del range' }
        const t2 = beyond(d, t1.p, lv, min)[0] || (d * (far.p - t1.p) > min ? far : { p: t1.p + d * h, why: 'ampiezza del range oltre il primo target' })
        const tr = { id: `${rg.id}:bo:${bars[w.B].t}`, ...base(rg, 'breakout', null, k, d), entry, stop, targets: [{ ...t1, frac: 0.3 }, { ...t2, frac: 0.7 }], retest: w.retest, B: w.B }
        finish(tr, rg, k, { outIdx: w.B })
        runTrade(tr, k, { limit: false })
        trades.push(tr)
        return tr
      }
    }
    if (w) return { ...w, status: w.retest ? 'ritorno sul bordo fatto: si aspetta la rottura dell\'estremo della candela di breakout' : 'chiusura fuori: si aspetta il ritorno sul bordo', trigger: w.dir > 0 ? bars[w.B].h : bars[w.B].l }
    return last
  }

  let j = 15
  while (j < n) {
    const imp = impulseAt(j)
    if (!imp) { j++; continue }
    // l'impulso continua finché le candele seguenti fanno nuovi estremi (Patrick non opera mai l'impulso, solo il range dopo)
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
          // sul profilo settimanale: dentro il range (± mezzo ATR) c'è un POC, VAH o VAL della settimana precedente o in corso
          const lt = LEVEL_TOL * rg.atr
          const on = weekLevels(wpAt(b.t + Q)).filter(l => l.p >= rg.bottom - lt && l.p <= rg.top + lt)
          if (on.length) rg.strong = on
        } else if (k - e > MAX_DAYS * 96) { rg.status = 'annullato'; rg.why = 'nessun range valido in 5 giorni'; rg.endIdx = k; next = k; break }
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
          const st = makeFake(rg, fb)
          if (st) fb.setup = st.id
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
    // i range mai diventati validi restano (chiari sul grafico, con il motivo) se sono durati almeno 2 ore; non danno setup
    if (rg.status !== 'annullato') ranges.push(rg)
    else if (rg.endIdx - rg.startIdx >= 8 && Number.isFinite(rg.top) && Number.isFinite(rg.bottom)) { rg.dropped = true; ranges.push(rg) }
    if (next === null) break // range ancora aperto fino all'ultima candela
    j = Math.max(next, e + 1)
  }

  // stato attuale dei range e gli altri due modi di operare
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
    if (rg.validIdx !== null && !rg.dropped) rg.alt = { inside: makeRangeTrade(rg), breakout: breakoutConfirm(rg) }
  }
  trades.sort((a, b) => a.at - b.at)
  return { atr: A, impulses, ranges, setups, trades, settings: s, last: bars[n - 1] }
}

// Eventi per gli avvisi push: range diventato valido, setup di falso breakout valido pronto (con il voto)
export function events(res) {
  const out = []
  for (const rg of res.ranges) if (rg.validAt && !rg.dropped) out.push({ key: `valid:${rg.id}`, at: rg.validAt, kind: 'valid', range: rg })
  for (const st of res.setups) if (st.valid) out.push({ key: `setup:${st.id}`, at: st.at, kind: 'setup', setup: st })
  return out
}
// trade concluso (per il registro): entrata mai eseguita, target, stop o pareggio
export const isFinal = t => t.status === 'scaduto' || t.status === 'target' || t.status === 'stop' || String(t.status).startsWith('pareggio')
