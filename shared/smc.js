// Strategia SMC (liquidità → order flow → order block + FVG → entrata sul ritorno, rischio/rendimento 1:3).
// Regole comuni a Simulazione, Prova e Reale (server/smc.js, src/pages/Smc.jsx). Spiegazione completa in docs/smc.md.
// Si decide solo su candele chiuse e senza dati futuri: uno swing esiste dalla chiusura della candela che lo conferma, un livello
// del timeframe di direzione dalla chiusura della sua candela C, massimo/minimo del giorno e della settimana prima dall'inizio
// del giorno / della settimana dopo. Candele: { t: ms (inizio), o, h, l, c }. Il long è lo specchio esatto dello short.
import { atr } from './indicators.js'
import { liqPriceOf, tierFor } from './opening.js'

export const TF_MS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 }
export const DIR_TFS = ['1h', '4h', '1d']
export const ENTRY_TFS = ['5m', '15m', '1h']
const DAY = 864e5, WEEK = 7 * DAY

export const SMC_DEFAULTS = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  dirTf: '4h',          // timeframe di direzione (order flow)
  entryTf: '15m',       // timeframe d'entrata
  allowNeutral: false,  // trade anche con direzione neutra (in entrambi i versi)
  atrN: 14,             // ATR di Wilder sul timeframe d'entrata
  mergeAtr: 0.15,       // livelli entro questa frazione di ATR si uniscono (tocchi multipli)
  fvgMinAtr: 0.1,       // ampiezza minima del FVG in ATR
  obBack: 5,            // candele indietro per cercare la candela dell'order block
  riseMax: 60,          // la salita verso il livello: dal minimo (massimo per il long) delle ultime N candele prima della presa
  invBars: 20,          // inversione entro N candele dalla presa
  retBars: 40,          // ritorno nella zona entro N candele dall'inversione
  rejBars: 2,           // il rifiuto: la candela del ritorno o una delle N successive chiude fuori dalla zona
  stopAtr: 0.25,        // stop: oltre la candela di rifiuto (o la presa) di questa frazione di ATR
  stopAtSweep: false,   // stop oltre il massimo/minimo della presa invece che della candela di rifiuto
  minRR: 3,             // rischio/rendimento minimo sul prezzo d'entrata vero
  maxCost: 20,          // commissioni + slittamento stimati al massimo questa % del rischio (come la pagina Range)
  firstRRTarget: false, // target = il primo livello che dà rischio/rendimento ≥ minRR invece di scartare il setup
  ageE: 500,            // un livello del timeframe d'entrata vale per N candele d'entrata dall'ultimo tocco
  ageD: 100,            // un livello del timeframe di direzione vale per N candele di direzione dall'ultimo tocco
  riskPct: 2,           // perdita allo stop in % del capitale attuale
  maxPos: 3,            // posizioni aperte insieme al massimo (sempre una per titolo)
  maxDayLoss: 6,        // perdita massima del giorno (UTC) in % del capitale di inizio giorno: poi niente entrate fino al giorno dopo
  capital: 1000,        // capitale iniziale (USDT)
  fee: 0.06,            // commissione taker per lato in % (Simulazione e Prova; nel Reale quella vera)
  slip: 0.05,           // slittamento per lato in % (Simulazione; la Prova usa quello misurato nel Reale)
  funding: 0.01,        // funding stimato per periodo in % del valore, sempre pagato (solo Simulazione)
  mmr: 1,               // margine di mantenimento in % se Bitunix non lo fornisce
  liqFee: 0.1,          // commissione di liquidazione in %
  notifySetup: true, notifyEntry: true, notifyExit: true, notifyDecay: false,
}
export const SMC_LIMITS = {
  atrN: [5, 50], mergeAtr: [0.01, 1], fvgMinAtr: [0, 2], obBack: [1, 20], riseMax: [5, 300], invBars: [2, 200], retBars: [2, 300], rejBars: [0, 10],
  stopAtr: [0, 3], minRR: [0.5, 20], maxCost: [1, 100], ageE: [20, 5000], ageD: [5, 1000], riskPct: [0.1, 10], maxPos: [1, 20], maxDayLoss: [0.5, 100],
  capital: [50, 1e8], fee: [0, 0.2], slip: [0, 1], funding: [-0.1, 0.2], mmr: [0.2, 10], liqFee: [0, 2],
}
const BOOLS = ['allowNeutral', 'stopAtSweep', 'firstRRTarget', 'notifySetup', 'notifyEntry', 'notifyExit', 'notifyDecay']
const INTS = ['atrN', 'obBack', 'riseMax', 'invBars', 'retBars', 'rejBars', 'ageE', 'ageD', 'maxPos']
export function cleanSmc(raw = {}) {
  const out = { ...SMC_DEFAULTS }
  for (const [k, [lo, hi]] of Object.entries(SMC_LIMITS)) { const v = +raw?.[k]; if (raw?.[k] !== '' && raw?.[k] !== null && Number.isFinite(v) && v >= lo && v <= hi) out[k] = v }
  for (const k of INTS) out[k] = Math.round(out[k])
  for (const k of BOOLS) if (typeof raw?.[k] === 'boolean') out[k] = raw[k]
  if (DIR_TFS.includes(raw?.dirTf)) out.dirTf = raw.dirTf
  if (ENTRY_TFS.includes(raw?.entryTf)) out.entryTf = raw.entryTf
  if (TF_MS[out.dirTf] <= TF_MS[out.entryTf]) { out.dirTf = SMC_DEFAULTS.dirTf; out.entryTf = SMC_DEFAULTS.entryTf }
  if (Array.isArray(raw?.symbols)) {
    const s = [...new Set(raw.symbols.map(x => String(x).toUpperCase().trim()).filter(x => /^[A-Z0-9]{2,24}$/.test(x)))].slice(0, 30)
    if (s.length) out.symbols = s
  }
  if (typeof raw?.active === 'boolean') out.active = raw.active
  return out
}

export const dayKey = t => new Date(t).toISOString().slice(0, 10)
const weekStart = t => { const d = Math.floor(t / DAY) * DAY; return d - ((new Date(d).getUTCDay() + 6) % 7) * DAY } // lunedì 00:00 UTC

// ---------- Mattoni (esportati per le prove) ----------
// Swing (frattale del video) con le candele A = i−2, B = i−1, C = i: confermato alla chiusura di C.
//  high in B: B.h > A.h e C.l < B.l; low in B: B.l < A.l e C.h > B.h.
export function swingAt(bars, i) {
  if (i < 2) return null
  const A = bars[i - 2], B = bars[i - 1], C = bars[i]
  return { high: B.h > A.h && C.l < B.l ? B.h : null, low: B.l < A.l && C.h > B.h ? B.l : null }
}
// FVG con le candele 1 = i−2, 2 = i−1, 3 = i: rialzista se 3.l > 1.h, ribassista se 3.h < 1.l; ampiezza ≥ minGap
export function fvgAt(bars, i, minGap = 0) {
  if (i < 2) return null
  const a = bars[i - 2], c = bars[i]
  if (c.l > a.h && c.l - a.h >= minGap) return { side: 1, lo: a.h, hi: c.l, i, t: bars[i].t, from: i - 2 }
  if (c.h < a.l && a.l - c.h >= minGap) return { side: -1, lo: c.h, hi: a.l, i, t: bars[i].t, from: i - 2 }
  return null
}
// Order block formato alla candela i (che chiude il FVG): l'ultima candela contraria (al massimo `back` candele indietro dalla
// prima del FVG) prima del movimento che crea il FVG e chiude oltre il suo estremo (una candela fino alla i). Rialzista:
// ultima candela ribassista (c < o), poi una chiusura sopra il suo massimo. Zona = dal minimo al massimo della candela.
export function obAt(bars, i, fvg, back = 5) {
  if (!fvg) return null
  for (let j = fvg.from; j >= Math.max(0, fvg.from - back + 1); j--) {
    const b = bars[j]
    if (fvg.side > 0 ? b.c < b.o : b.c > b.o) {
      for (let k = j + 1; k <= i; k++) {
        if (fvg.side > 0 ? bars[k].c > b.h : bars[k].c < b.l) return { side: fvg.side, lo: b.l, hi: b.h, j, t: b.t, i, fvg }
      }
      return null
    }
  }
  return null
}
// Direzione (order flow) dagli ultimi due swing confermati: 1 rialzista, −1 ribassista, 0 neutra
export function flowOf(highs, lows) {
  if (highs.length < 2 || lows.length < 2) return 0
  const [h1, h2] = highs.slice(-2), [l1, l2] = lows.slice(-2)
  if (h2 < h1 && l2 < l1) return -1
  if (h2 > h1 && l2 > l1) return 1
  return 0
}
const KIND_RANK = { entry: 1, dir: 2, day: 3, week: 4 }
export const isImportant = lv => lv.kinds.dir || lv.kinds.day || lv.kinds.week || (lv.kinds.entry && lv.touches >= 2)
export const strengthOf = lv => Math.max(...Object.keys(lv.kinds).map(k => KIND_RANK[k] || 0)) + lv.touches
const kindsLabel = k => ['week', 'day', 'dir', 'entry'].filter(x => k[x]).map(x => ({ week: 'settimana prima', day: 'giorno prima', dir: 'direzione', entry: 'entrata' })[x]).join(' + ')

// ---------- Analisi di un titolo (stessa funzione per Simulazione, Prova e Reale) ----------
// E = candele chiuse del timeframe d'entrata, Dd = del timeframe di direzione, D1 = giornaliere (giorno e settimana prima).
// Scorre le candele una alla volta e restituisce:
//  signals   setup arrivati al rifiuto (entrata alla chiusura della candela i): lato, livello preso, order block, FVG, presa,
//            inversione, rifiuto, stop, target possibili (livelli importanti non presi oltre il prezzo)
//  decayed   setup decaduti prima dell'entrata, con il motivo
//  pending   setup ancora in corso all'ultima candela (in attesa dell'inversione o del ritorno)
//  levels    livelli di liquidità (anche quelli presi, con l'ora), obs e fvgs recenti, direzione per candela (flow)
export function analyze({ E, Dd = [], D1 = [], s0, keepFrom = 0 }) {
  const s = cleanSmc(s0)
  const tfE = TF_MS[s.entryTf], tfD = TF_MS[s.dirTf]
  const n = E.length
  const A = atr(E, s.atrN)
  const levels = [], dead = []
  const signals = [], decayed = [], obs = [], fvgs = []
  const flowArr = new Array(n).fill(0)
  const setups = { '1': null, '-1': null } // lato del trade → setup attivo (uno per lato)
  // swing del timeframe di direzione, in ordine di conferma (chiusura della candela C)
  const dsw = []
  for (let k = 2; k < Dd.length; k++) { const w = swingAt(Dd, k); if (w && (w.high !== null || w.low !== null)) dsw.push({ at: Dd[k].t + tfD, k, ...w, tB: Dd[k - 1].t, C: Dd[k] }) }
  const dHighs = [], dLows = []
  let dp = 0
  const D1i = new Map(D1.map((b, i) => [b.t, i]))

  const addLevel = (side, price, kind, i, t, a) => {
    const tol = s.mergeAtr * a
    const lv = levels.find(x => x.side === side && Math.abs(x.p - price) <= tol)
    if (lv) {
      lv.touches++; lv.kinds[kind] = true; lv.last = t; lv.lastI = i
      if (kind === 'dir') lv.lastD = t
      lv.p = side > 0 ? Math.max(lv.p, price) : Math.min(lv.p, price)
      return lv
    }
    const nl = { id: `${side > 0 ? 'H' : 'L'}${t}:${price}`, side, p: price, kinds: { [kind]: true }, touches: 1, t, last: t, lastI: i, lastD: kind === 'dir' ? t : null, taken: null }
    levels.push(nl)
    return nl
  }
  const alive = (lv, t) => {
    const okE = lv.kinds.entry && t - lv.last <= s.ageE * tfE
    const okD = lv.kinds.dir && t - (lv.lastD ?? lv.last) <= s.ageD * tfD
    return okE || okD || lv.kinds.day || lv.kinds.week
  }
  const kill = (lv, why) => { levels.splice(levels.indexOf(lv), 1); if (why === 'taken') dead.push(lv) }
  // livelli importanti non presi oltre il prezzo, dal più vicino (dir > 0: sopra, < 0: sotto)
  const targetsFrom = (price, dir) => levels.filter(lv => isImportant(lv) && (dir > 0 ? lv.side > 0 && lv.p > price : lv.side < 0 && lv.p < price))
    .sort((a, b) => (dir > 0 ? a.p - b.p : b.p - a.p))
    .map(lv => ({ p: lv.p, kinds: kindsLabel(lv.kinds), touches: lv.touches, strength: strengthOf(lv) }))
  const snap = b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })

  let curDay = null, curWeek = null, dayTodo = false, weekTodo = false
  for (let i = 0; i < n; i++) {
    const b = E[i], tEnd = b.t + tfE, a = A[i]
    // 1. giorno / settimana nuovi: massimo e minimo del giorno prima e della settimana prima (dalle giornaliere chiuse)
    const dK = Math.floor(b.t / DAY) * DAY, wK = weekStart(b.t)
    if (dK !== curDay) {
      curDay = dK; dayTodo = true
      for (const lv of [...levels]) if (lv.kinds.day) { delete lv.kinds.day; if (!Object.keys(lv.kinds).length) kill(lv) }
    }
    if (wK !== curWeek) {
      curWeek = wK; weekTodo = true
      for (const lv of [...levels]) if (lv.kinds.week) { delete lv.kinds.week; if (!Object.keys(lv.kinds).length) kill(lv) }
    }
    // (livelli aggiunti appena c'è l'ATR; il prezzo del giorno fino a qui può averli già presi)
    const seen = (side, p) => { for (let k = i - 1; k >= 0 && E[k].t >= dK; k--) if (side > 0 ? E[k].h > p : E[k].l < p) return true; return false }
    const seenW = (side, p) => { for (let k = i - 1; k >= 0 && E[k].t >= wK; k--) if (side > 0 ? E[k].h > p : E[k].l < p) return true; return false }
    if (dayTodo && a > 0) {
      dayTodo = false
      const pd = D1i.get(dK - DAY)
      if (pd !== undefined) { if (!seen(1, D1[pd].h)) addLevel(1, D1[pd].h, 'day', i, b.t, a); if (!seen(-1, D1[pd].l)) addLevel(-1, D1[pd].l, 'day', i, b.t, a) }
    }
    if (weekTodo && a > 0) {
      weekTodo = false
      let hi = -Infinity, lo = Infinity, got = 0
      for (let d = wK - WEEK; d < wK; d += DAY) { const x = D1i.get(d); if (x !== undefined) { hi = Math.max(hi, D1[x].h); lo = Math.min(lo, D1[x].l); got++ } }
      if (got >= 3) { if (!seenW(1, hi)) addLevel(1, hi, 'week', i, b.t, a); if (!seenW(-1, lo)) addLevel(-1, lo, 'week', i, b.t, a) }
    }
    // 2. swing del timeframe di direzione confermati prima dell'apertura di questa candela (la candela C chiusa)
    while (a > 0 && dp < dsw.length && dsw[dp].at <= b.t) {
      const w = dsw[dp++]
      // un massimo già superato dalla candela C non è più liquidità (stessa regola per il minimo)
      // già superato dalle candele di direzione chiuse dopo la conferma (prima di questa candela d'entrata)?
      let hi = w.C.h, lo = w.C.l
      for (let m = w.k + 1; m < Dd.length && Dd[m].t + tfD <= b.t; m++) { hi = Math.max(hi, Dd[m].h); lo = Math.min(lo, Dd[m].l) }
      if (w.high !== null) { dHighs.push(w.high); if (a > 0 && !(hi > w.high)) addLevel(1, w.high, 'dir', i, w.at, a) }
      if (w.low !== null) { dLows.push(w.low); if (a > 0 && !(lo < w.low)) addLevel(-1, w.low, 'dir', i, w.at, a) }
    }
    const flow = flowOf(dHighs, dLows)
    flowArr[i] = flow
    // scadenza dei livelli vecchi
    for (const lv of [...levels]) if (!alive(lv, b.t)) kill(lv)

    // 3. setup in corso (prima della presa dei livelli di questa candela)
    const fv = a > 0 ? fvgAt(E, i, s.fvgMinAtr * a) : null
    const fired = []
    for (const key of ['1', '-1']) {
      const st = setups[key]
      if (!st) continue
      const side = +key // lato del trade: −1 short (presa di un massimo), 1 long (presa di un minimo)
      const ob = st.ob
      const decay = why => { decayed.push({ ...pub(st), reason: why, at: tEnd, i }); setups[key] = null }
      // close oltre l'estremo della candela della presa
      if (side < 0 ? b.c > st.sweep.h : b.c < st.sweep.l) { decay('chiusura oltre la presa'); continue }
      st.ext = side < 0 ? Math.max(st.ext, b.h) : Math.min(st.ext, b.l)
      if (st.stage === 'inv') {
        if (fv && fv.side === side && fv.from >= st.sweep.i && !st.fvg2) st.fvg2 = fv
        if (!st.broke && (side < 0 ? b.c < ob.lo : b.c > ob.hi)) st.broke = { i, t: b.t, c: b.c }
        if (st.fvg2 && st.broke) { st.stage = 'ret'; st.inv = { i, t: tEnd }; st.notify = 'ret'; continue }
        if (i - st.sweep.i >= s.invBars) decay(`nessuna inversione entro ${s.invBars} candele`)
        continue
      }
      // ritorno: chiusura oltre l'altro estremo della zona, target toccato, finestre scadute
      if (side < 0 ? b.c > ob.hi : b.c < ob.lo) { decay('chiusura oltre la zona dell\'order block'); continue }
      const T = targetsFrom(side < 0 ? Math.min(b.o, ob.lo) : Math.max(b.o, ob.hi), side > 0 ? 1 : -1)[0]
      if (T && (side < 0 ? b.l <= T.p : b.h >= T.p)) { decay('prezzo arrivato al target prima dell\'entrata'); continue }
      if (i - st.inv.i <= s.retBars && (side < 0 ? b.h >= ob.lo : b.l <= ob.hi)) st.touch = i
      if (st.touch !== null && i - st.touch <= s.rejBars && (side < 0 ? b.c < ob.lo : b.c > ob.hi)) { fired.push(key); continue }
      if (i - st.inv.i > s.retBars && (st.touch === null || i - st.touch >= s.rejBars)) decay(`nessun ritorno con rifiuto entro ${s.retBars} candele`)
    }

    // 4. presa dei livelli da questa candela
    const takenNow = []
    for (const lv of [...levels]) {
      if (lv.t >= tEnd) continue
      if (lv.side > 0 ? b.h > lv.p : b.l < lv.p) { lv.taken = tEnd; lv.takenI = i; takenNow.push(lv); kill(lv, 'taken') }
    }
    // 5. segnali (rifiuto su questa candela): target dai livelli rimasti dopo la presa
    for (const key of fired) {
      const st = setups[key], side = +key
      const stopBase = s.stopAtSweep ? st.ext : (side < 0 ? b.h : b.l)
      const stop = side < 0 ? stopBase + s.stopAtr * a : stopBase - s.stopAtr * a
      signals.push({ ...pub(st), i, t: tEnd, rej: { ...snap(b), i }, touch: st.touch, stop, atr: a, targets: targetsFrom(b.c, side).slice(0, 8), flow })
      setups[key] = null
    }
    // 6. nuove prese: livello importante preso con la direzione giusta e un order block nella salita verso il livello
    for (const dirSide of [1, -1]) { // 1 = presa di un massimo (setup short), −1 = presa di un minimo (setup long)
      const side = -dirSide
      if (!(a > 0)) continue
      if (!(flow === side || (flow === 0 && s.allowNeutral))) continue
      const cand = takenNow.filter(lv => lv.side === dirSide && isImportant(lv))
      if (!cand.length) continue
      const lv = cand.sort((x, y) => (dirSide > 0 ? y.p - x.p : x.p - y.p))[0]
      const cur = setups[String(side)]
      if (cur && cur.stage === 'ret') continue // un setup già in attesa del ritorno resta quello
      // la salita (discesa per il long) verso il livello: dall'estremo opposto delle ultime riseMax candele (dopo la nascita del livello)
      let start = i
      for (let k = i - 1; k >= Math.max(0, i - s.riseMax) && E[k].t >= lv.t - tfE; k--) if (dirSide > 0 ? E[k].l <= E[start].l : E[k].h >= E[start].h) start = k
      const ob = [...obs].reverse().find(o => o.side === dirSide && o.i <= i && o.j >= start - s.obBack && (dirSide > 0 ? o.hi < lv.p : o.lo > lv.p) && o.broken === undefined)
      if (!ob) continue
      if (cur) decayed.push({ ...pub(cur), reason: 'nuova presa prima dell\'inversione', at: tEnd, i })
      setups[String(side)] = {
        id: `${side > 0 ? 'L' : 'S'}${b.t}`, side, stage: 'inv', flow,
        level: { p: lv.p, kinds: kindsLabel(lv.kinds), touches: lv.touches, strength: strengthOf(lv), t: lv.t },
        ob: { lo: ob.lo, hi: ob.hi, t: ob.t, j: ob.j, i: ob.i }, fvg: { lo: ob.fvg.lo, hi: ob.fvg.hi, t: ob.fvg.t, side: ob.fvg.side },
        sweep: { ...snap(b), i }, ext: dirSide > 0 ? b.h : b.l, fvg2: null, broke: null, inv: null, touch: null, notify: 'inv',
      }
    }
    // 7. swing del timeframe d'entrata confermati da questa candela (C = i): livelli dalla candela dopo
    const w = a > 0 ? swingAt(E, i) : null
    if (w?.high !== null && w?.high !== undefined && !(b.h > w.high)) addLevel(1, w.high, 'entry', i, tEnd, a)
    if (w?.low !== null && w?.low !== undefined && !(b.l < w.low)) addLevel(-1, w.low, 'entry', i, tEnd, a)
    // FVG e order block che si chiudono su questa candela (servono alle prese successive); order block rotti
    for (const o of obs) if (o.broken === undefined && (o.side > 0 ? b.c < o.lo : b.c > o.hi) && o.i < i) o.broken = i
    if (fv) {
      if (i >= keepFrom) fvgs.push(fv)
      const o = obAt(E, i, fv, s.obBack)
      if (o && !obs.some(x => x.j === o.j && x.side === o.side)) obs.push(o) // stessa candela: vale il primo FVG, quello del movimento
      if (obs.length > 400) obs.splice(0, obs.length - 300)
    }
  }
  const pending = Object.values(setups).filter(Boolean).map(pub)
  const last = E[n - 1]
  const pub2 = lv => ({ side: lv.side, p: lv.p, kinds: kindsLabel(lv.kinds), important: isImportant(lv), touches: lv.touches, strength: strengthOf(lv), t: lv.t, taken: lv.taken })
  return {
    signals, decayed, pending, flow: flowArr[n - 1] || 0, flowArr, atr: A[n - 1] ?? null, lastT: last ? last.t + tfE : null,
    levels: levels.map(pub2), taken: dead.filter(lv => lv.taken >= (E[keepFrom]?.t ?? 0)).map(pub2),
    obs: obs.filter(o => o.i >= keepFrom).map(o => ({ side: o.side, lo: o.lo, hi: o.hi, t: o.t, i: o.i, broken: o.broken !== undefined ? E[o.broken].t : null })), fvgs: fvgs.map(f => ({ side: f.side, lo: f.lo, hi: f.hi, t: E[f.from].t, i: f.i })),
  }
  function pub(st) {
    return { id: st.id, side: st.side, stage: st.stage, flow: st.flow, level: st.level, ob: st.ob, fvg: st.fvg, sweep: st.sweep, ext: st.ext, fvg2: st.fvg2 ? { lo: st.fvg2.lo, hi: st.fvg2.hi, t: st.fvg2.t } : null, inv: st.inv, touch: st.touch, notify: st.notify }
  }
}

// ---------- Entrata: filtri sul prezzo d'entrata vero ----------
// sig = segnale di analyze, entry = prezzo eseguito (con lo slittamento), costPct = commissione + slittamento per lato in %.
// Restituisce { stop, target, rr, costPct } oppure { skip: motivo }.
export function checkEntry(sig, entry, s0, costSide) {
  const s = cleanSmc(s0)
  const side = sig.side, stop = sig.stop
  const risk = side < 0 ? stop - entry : entry - stop
  if (!(risk > 0)) return { skip: 'prezzo d\'entrata già oltre lo stop' }
  const cs = costSide ?? (s.fee + s.slip)
  const costPct = cs * (entry + stop) / 100 / risk * 100 // andata + uscita allo stop, in % del rischio (come la pagina Range)
  const tg = sig.targets.filter(x => (side < 0 ? x.p < entry : x.p > entry))
  if (!tg.length) return { skip: 'nessun livello di liquidità importante non preso come target' }
  const rrOf = x => (side < 0 ? entry - x.p : x.p - entry) / risk
  let T = tg[0]
  if (rrOf(T) < s.minRR && s.firstRRTarget) T = tg.find(x => rrOf(x) >= s.minRR) || T
  const rr = rrOf(T)
  if (rr < s.minRR) return { skip: `rischio/rendimento ${rr.toFixed(2)} sotto ${s.minRR}`, rr, costPct }
  if (costPct > s.maxCost) return { skip: `commissioni e slittamento ${costPct.toFixed(0)}% del rischio, oltre il ${s.maxCost}%`, rr, costPct }
  return { stop, target: T.p, targetInfo: T, rr, costPct, risk }
}

// Dimensione: perdita allo stop = riskPct del capitale; leva ricavata dalla dimensione (margine al massimo capitale / maxPos),
// mai oltre il massimo di Bitunix (se non basta la posizione si riduce); trade saltato se lo stop è oltre la liquidazione.
export function sizeSmc({ side, entry, stop, balance, free, s, lim }) {
  const dist = Math.abs(entry - stop)
  const risk = balance * s.riskPct / 100
  let qty = risk / dist, notional = qty * entry
  const allot = balance / s.maxPos
  const t0 = tierFor(lim, notional)
  const maxLev = Math.max(1, Math.floor(Math.min(t0?.maxLev || lim?.maxLev || 20, lim?.maxLev || 1e9)))
  let lev = Math.max(1, Math.ceil(notional / allot - 1e-9))
  if (lev > maxLev) { lev = maxLev; notional = allot * lev; qty = notional / entry }
  let margin = notional / lev
  if (margin > free + 1e-9) {
    if (free < 1) return { skip: 'capitale libero esaurito' }
    margin = free; notional = margin * lev; qty = notional / entry
  }
  if (notional < 5) return { skip: 'posizione troppo piccola' }
  const tier = tierFor(lim, notional)
  const mmr = tier?.mmr ?? s.mmr / 100
  const liq = liqPriceOf({ side, entry, qty, margin }, mmr, s.liqFee)
  if (liq && (side > 0 ? stop <= liq : stop >= liq)) return { skip: 'stop oltre il prezzo di liquidazione' }
  return { qty, notional, margin, leverage: lev, liq, risk: qty * dist, mmr, maxLev }
}

// Risultato di una posizione chiusa (funding positivo = pagato)
export function closeSmc(pos, exit, s, { liq = false, funding = 0, feeIn = null, feeOut = null } = {}) {
  const fin = feeIn ?? pos.qty * pos.entry * s.fee / 100
  const fout = liq ? 0 : (feeOut ?? pos.qty * exit * s.fee / 100)
  const gross = liq ? -pos.margin : (exit - pos.entry) * pos.qty * pos.side
  const pnl = gross - fin - fout - funding
  return { gross, fees: fin + fout, funding, pnl, R: pos.risk > 0 ? pnl / pos.risk : null }
}

// Uscita su una candela: stop e target (e liquidazione). Stessa candela con entrambi: candele da 1 minuto (m1) se ci sono,
// altrimenti lo stop. Restituisce null oppure { px, why } (px = livello toccato o apertura se la candela apre già oltre).
export function exitOnBar(pos, b, m1 = null) {
  const sd = pos.side
  const hitStop = x => (sd < 0 ? x.h >= pos.stop : x.l <= pos.stop)
  const hitTgt = x => (sd < 0 ? x.l <= pos.target : x.h >= pos.target)
  const at = (x, lvl, why) => ({ px: sd < 0 ? (why === 'stop' ? Math.max(x.o, lvl) : Math.min(x.o, lvl)) : (why === 'stop' ? Math.min(x.o, lvl) : Math.max(x.o, lvl)), why })
  if (pos.liq && (sd < 0 ? b.h >= pos.liq : b.l <= pos.liq) && (sd < 0 ? b.o >= pos.liq : b.o <= pos.liq)) return { px: pos.liq, why: 'liquidazione' }
  const s1 = hitStop(b), t1 = hitTgt(b)
  if (s1 && t1) {
    if (m1?.length) {
      for (const x of m1) {
        const a = hitStop(x), c = hitTgt(x)
        if (a) return { ...at(x, pos.stop, 'stop'), via: '1m' }
        if (c) return { ...at(x, pos.target, 'target'), via: '1m' }
      }
    }
    return { ...at(b, pos.stop, 'stop'), both: true, via: m1?.length ? '1m' : 'stop (nessun dato a 1 minuto)' }
  }
  if (s1) return at(b, pos.stop, 'stop')
  if (t1) return at(b, pos.target, 'target')
  return null
}

// ---------- Simulazione su più titoli (un conto solo) ----------
// data = { SYM: { E, Dd, D1 } }, limits = { SYM: { maxLev, tiers, fundingH } }, m1 = { 'SYM:t': [candele 1m] }.
// Entrata all'apertura della candela dopo il rifiuto, con lo slittamento; commissioni taker e funding stimato.
export function simulate(data, limits, s0, { from = null, to = null, m1 = {} } = {}) {
  const s = cleanSmc(s0)
  const tfE = TF_MS[s.entryTf]
  const syms = Object.keys(data).filter(k => data[k]?.E?.length > s.atrN + 5)
  const sigAt = new Map(), barIdx = {}, discarded = []
  const times = new Set()
  for (const sym of syms) {
    const r = analyze({ ...data[sym], s0: s })
    const E = data[sym].E
    barIdx[sym] = new Map(E.map((b, i) => [b.t, i]))
    for (const b of E) if ((!from || b.t >= from) && (!to || b.t < to)) times.add(b.t)
    for (const g of r.signals) {
      const nx = E[g.i + 1]
      if (!nx || (from && nx.t < from) || (to && nx.t >= to)) continue
      const list = sigAt.get(nx.t) || []; list.push({ ...g, sym }); sigAt.set(nx.t, list)
    }
    for (const d of r.decayed) if ((!from || d.at >= from) && (!to || d.at < to)) discarded.push({ sym, t: d.at, side: d.side, reason: d.reason, stage: d.stage, level: d.level.p })
  }
  const T = [...times].sort((a, b) => a - b)
  let balance = s.capital, peak = balance, maxDD = 0
  let day = null, dayStart = balance, dayPnl = 0
  const open = [], trades = [], curve = [{ t: T[0] ?? Date.now(), balance }], needM1 = new Set()
  const fundH = sym => (limits[sym]?.fundingH || 8) * 3600000
  const closeAt = (p, b, ex) => {
    const sd = p.side
    const slipPx = ex.why === 'liquidazione' ? ex.px : ex.px * (1 - sd * s.slip / 100)
    const H = fundH(p.sym)
    const periods = Math.max(0, Math.floor((b.t + tfE - 1) / H) - Math.floor(p.openedAt / H))
    const funding = periods * p.notional * s.funding / 100
    const res = closeSmc(p, slipPx, s, { liq: ex.why === 'liquidazione', funding })
    balance = Math.max(0, balance + res.pnl); dayPnl += res.pnl
    peak = Math.max(peak, balance); maxDD = Math.max(maxDD, peak > 0 ? (peak - balance) / peak : 0)
    const tr = { ...p, exit: slipPx, exitLevel: ex.px, reason: ex.why, via: ex.via || null, closedAt: b.t + tfE, ...res, rrReal: p.risk > 0 ? res.pnl / p.risk : null }
    if (ex.both && !m1[`${p.sym}:${b.t}`]) needM1.add(`${p.sym}:${b.t}`)
    trades.push(tr)
    curve.push({ t: tr.closedAt, balance })
    open.splice(open.indexOf(p), 1)
  }
  for (const t of T) {
    const dk = dayKey(t)
    if (dk !== day) { day = dk; dayStart = balance; dayPnl = 0 }
    // 1. uscite delle posizioni aperte
    for (const p of [...open]) {
      const i = barIdx[p.sym].get(t); if (i === undefined) continue
      const b = data[p.sym].E[i]
      const ex = exitOnBar(p, b, m1[`${p.sym}:${t}`])
      if (ex) closeAt(p, b, ex)
    }
    // 2. entrate all'apertura di questa candela
    const list = (sigAt.get(t) || []).sort((a, b) => b.level.strength - a.level.strength)
    for (const g of list) {
      const base = { sym: g.sym, t, side: g.side, level: g.level.p }
      const skip = reason => discarded.push({ ...base, reason, stage: 'entrata' })
      if (open.some(p => p.sym === g.sym)) { skip('posizione già aperta sul titolo'); continue }
      if (open.length >= s.maxPos) { skip(`${s.maxPos} posizioni già aperte`); continue }
      if (dayPnl <= -dayStart * s.maxDayLoss / 100) { skip(`perdita massima del giorno (${s.maxDayLoss}%) raggiunta`); continue }
      const i = barIdx[g.sym].get(t), b = data[g.sym].E[i]
      const entry = b.o * (1 + g.side * s.slip / 100)
      const ck = checkEntry(g, entry, s)
      if (ck.skip) { skip(ck.skip); continue }
      const used = open.reduce((x, p) => x + p.margin, 0)
      const z = sizeSmc({ side: g.side, entry, stop: ck.stop, balance, free: balance - used, s, lim: limits[g.sym] })
      if (z.skip) { skip(z.skip); continue }
      const p = {
        sym: g.sym, side: g.side, openedAt: t, signalAt: g.t, entry, signal: b.o, stop: ck.stop, target: ck.target, rrPlan: ck.rr, costPct: ck.costPct, ...z,
        setup: { level: g.level, ob: g.ob, fvg: g.fvg, fvg2: g.fvg2, sweep: g.sweep, inv: g.inv, rej: g.rej, flow: g.flow, ext: g.ext, target: ck.targetInfo },
      }
      open.push(p)
      const ex = exitOnBar(p, b, m1[`${g.sym}:${t}`])
      if (ex) closeAt(p, b, ex)
    }
  }
  // posizioni ancora aperte alla fine: chiuse all'ultima chiusura per il conteggio
  const lastOpen = open.map(p => { const E = data[p.sym].E, b = E[E.length - 1]; return { ...p, last: b.c, upnl: (b.c - p.entry) * p.qty * p.side } })
  return { settings: s, summary: summarize(trades, s.capital, balance, maxDD), curve, trades, open: lastOpen, discarded, needM1: [...needM1], ...groups(trades), from: T[0] ?? null, to: T.at(-1) ?? null }
}

export function summarize(trades, start, balance, maxDD) {
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0)
  const gw = wins.reduce((x, t) => x + t.pnl, 0), gl = -losses.reduce((x, t) => x + t.pnl, 0)
  const Rs = trades.map(t => t.R).filter(Number.isFinite)
  return {
    start, balance, ret: start > 0 ? (balance - start) / start * 100 : 0, trades: trades.length, wins: wins.length,
    winRate: trades.length ? wins.length / trades.length * 100 : 0, avgR: Rs.length ? Rs.reduce((a, b) => a + b, 0) / Rs.length : 0,
    pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0), maxDD: maxDD * 100,
    fees: trades.reduce((x, t) => x + (t.fees || 0), 0), funding: trades.reduce((x, t) => x + (t.funding || 0), 0),
    slip: trades.reduce((x, t) => x + Math.abs((t.entry - (t.signal ?? t.entry)) * t.qty) + Math.abs((t.exit - (t.exitLevel ?? t.exit)) * t.qty), 0),
    targets: trades.filter(t => t.reason === 'target').length, stops: trades.filter(t => t.reason === 'stop').length,
  }
}
function groups(trades) {
  const by = f => {
    const m = {}
    for (const t of trades) { const k = f(t); const g = (m[k] ||= { n: 0, wins: 0, pnl: 0, R: 0 }); g.n++; if (t.pnl > 0) g.wins++; g.pnl += t.pnl; g.R += t.R || 0 }
    return m
  }
  return { bySymbol: by(t => t.sym), bySide: by(t => (t.side > 0 ? 'long' : 'short')), byMonth: by(t => new Date(t.openedAt).toISOString().slice(0, 7)) }
}
