// ICC Scanner: motore deterministico del metodo ICC (Indication, Correction, Continuation). Nessuna AI, solo regole.
// Stesso codice per lo scanner dal vivo (server/icc.js) e per il backtest. Solo analisi e segnalazione: nessun ordine.
// Candele: { t: ms inizio, o, h, l, c } chiuse. Si decide solo con dati noti in quel momento (uno swing esiste dalla chiusura
// della candela che lo conferma, una zona daily dalla chiusura del giorno che la completa). Il ribassista è lo specchio.
//
// Stato per strumento: nessun setup → Indication → Correction → Continuation (segnale), oppure Invalidato / Scaduto.
//  - Swing high/low: massimo (minimo) con almeno swingN candele più basse (alte) per lato.
//  - Zone daily: gruppi di almeno zoneMin swing daily (massimi e minimi) entro zoneAtr × ATR daily, negli ultimi zoneDays giorni.
//  - Indication: chiusura di una candela 4H oltre una zona daily (bordo opposto) o oltre l'ultimo swing 4H non ancora rotto.
//    Origine della rottura = estremo opposto del movimento (minimo dal penultimo swing low 4H alla candela di rottura, per il long).
//  - Correction: il prezzo torna verso il livello rotto (entro retestAtr × ATR 4H). Chiusura 1H oltre l'origine = Invalidato.
//    Troppe candele 1H senza correzione (maxIndBars) o correzione troppo lunga (maxCorrBars) = Scaduto.
//  - Continuation: chiusura 1H oltre l'ultimo swing della mini-struttura della correzione (swing high 1H dopo l'estremo
//    dell'Indication, per il long), nella direzione della rottura = segnale.
//  - Entrata = chiusura della candela di segnale; stop = oltre l'estremo della correzione (+ stopAtr × ATR 1H);
//    TP1 = estremo dell'Indication; TP2 = prossima zona daily oltre TP1. R:R = media di TP1 e TP2 (metà posizione ciascuno),
//    solo TP1 se non c'è una zona.
import { atr } from './indicators.js'

export const H1 = 36e5, H4 = 4 * H1, D1 = 24 * H1
export const CATEGORIES = { crypto: 'Crypto', stock: 'Azioni', commodity: 'Materie prime' }
export const ICC_DEFAULTS = {
  swingN: 2,          // candele per lato per uno swing
  zoneAtr: 0.5,       // swing daily entro questa frazione di ATR daily = stessa zona
  zoneMin: 2,         // swing per formare una zona
  zoneDays: 180,      // giorni di swing daily considerati
  retestAtr: 0.5,     // correzione: il prezzo arriva entro questa frazione di ATR 4H dal livello rotto
  deepAtr: 0.5,       // correzione profonda: oltre il livello rotto di più di questa frazione di ATR 4H
  maxIndBars: 72,     // candele 1H dopo l'Indication per iniziare la correzione, poi scade
  maxCorrBars: 48,    // candele 1H massime della correzione, poi scade
  stopAtr: 0.1,       // stop oltre l'estremo della correzione di questa frazione di ATR 1H
  minRR: 1.5,         // R:R minimo per un segnale
  rrA: 2,             // R:R minimo per il voto A (insieme al trend daily a favore)
  maxHold: 240,       // candele 1H massime di un trade nel paper tracking, poi chiusura alla chiusura
  fee: 0.06,          // commissione per lato in % (per il risultato netto in R)
  btcFilter: true,    // altcoin: niente segnali contro il trend daily di BTC
  maxSameDir: 6,      // segnali attivi nella stessa direzione al massimo (0 = nessun limite)
  minVolCrypto: 5e6,  // volume minimo in 24 ore (USDT) per seguire un mercato
  minVolStock: 3e5,
  minVolCommodity: 3e5,
  maxMarkets: 200,    // mercati seguiti al massimo (i più scambiati)
  notifyA: true,      // notifiche push per i segnali di voto A
}
export const ICC_LIMITS = {
  swingN: [1, 5], zoneAtr: [0.1, 3], zoneMin: [2, 6], zoneDays: [30, 400], retestAtr: [0, 3], deepAtr: [0, 5], maxIndBars: [6, 400],
  maxCorrBars: [6, 400], stopAtr: [0, 2], minRR: [0.5, 10], rrA: [0.5, 10], maxHold: [12, 2000], fee: [0, 0.2], maxSameDir: [0, 100],
  minVolCrypto: [0, 1e10], minVolStock: [0, 1e10], minVolCommodity: [0, 1e10], maxMarkets: [5, 400],
}
const INTS = ['swingN', 'zoneMin', 'zoneDays', 'maxIndBars', 'maxCorrBars', 'maxHold', 'maxSameDir', 'maxMarkets']
export function cleanIcc(raw = {}) {
  const out = { ...ICC_DEFAULTS }
  for (const [k, [lo, hi]] of Object.entries(ICC_LIMITS)) { const v = +raw?.[k]; if (raw?.[k] !== '' && raw?.[k] !== null && Number.isFinite(v) && v >= lo && v <= hi) out[k] = v }
  for (const k of INTS) out[k] = Math.round(out[k])
  for (const k of ['btcFilter', 'notifyA']) if (typeof raw?.[k] === 'boolean') out[k] = raw[k]
  return out
}

// Categoria di un perpetual Bitunix (Bitunix non la fornisce): azioni note all'app o con "STOCK" nel nome, materie prime da elenco
const COMMODITIES = new Set(['XAU', 'XAUT', 'XAG', 'XPT', 'XPD', 'COPPER', 'NATGAS', 'CL', 'WTI', 'BRENT', 'UKOIL', 'USOIL', 'OIL', 'PAXG'])
export function categoryOf(perp, stockPerps = new Set()) {
  const base = perp.replace(/(USDT|USDC|USD)$/, '')
  if (COMMODITIES.has(base)) return 'commodity'
  if (stockPerps.has(perp) || /STOCK$/.test(base)) return 'stock'
  return 'crypto'
}

// Swing con n candele per lato: massimo > dei n prima e ≥ dei n dopo (minimo specchio). conf = chiusura della candela che lo conferma.
export function swings(bars, n, tf) {
  const out = []
  for (let i = n; i < bars.length - n; i++) {
    let hi = true, lo = true
    for (let k = 1; k <= n; k++) {
      if (!(bars[i].h > bars[i - k].h && bars[i].h >= bars[i + k].h)) hi = false
      if (!(bars[i].l < bars[i - k].l && bars[i].l <= bars[i + k].l)) lo = false
    }
    const conf = bars[i + n].t + tf
    if (hi) out.push({ i, t: bars[i].t, p: bars[i].h, type: 'H', conf })
    if (lo) out.push({ i, t: bars[i].t, p: bars[i].l, type: 'L', conf })
  }
  return out
}
// Zone daily: swing (massimi e minimi) ordinati per prezzo, uniti se vicini entro tol; almeno minN swing
export function zonesFrom(sw, tol, minN) {
  const ps = sw.map(s => s.p).sort((a, b) => a - b)
  const out = []
  let g = []
  const flush = () => { if (g.length >= minN) out.push({ lo: g[0], hi: g.at(-1), n: g.length }); g = [] }
  for (const p of ps) { if (g.length && p - g.at(-1) > tol) flush(); g.push(p) }
  flush()
  return out
}
// Trend daily dagli ultimi due swing: up = massimi e minimi crescenti, down = decrescenti, altrimenti range
export function trendOf(sw) {
  const H = sw.filter(s => s.type === 'H').slice(-2), L = sw.filter(s => s.type === 'L').slice(-2)
  if (H.length < 2 || L.length < 2) return 'range'
  if (H[1].p > H[0].p && L[1].p > L[0].p) return 'up'
  if (H[1].p < H[0].p && L[1].p < L[0].p) return 'down'
  return 'range'
}

// Classificazione: scenario rispetto al trend daily, correzione profonda, voto A/B/C
export function classify({ side, trend, levelKind, deep, rr }, s) {
  const dir = side > 0 ? 'up' : 'down'
  const scenario = trend === dir ? 'a favore del trend' : trend === 'range' ? (levelKind === 'zona' ? 'rottura di range' : 'in range') : 'inversione'
  const grade = scenario === 'a favore del trend' && rr >= s.rrA ? 'A' : (scenario === 'a favore del trend' || (scenario === 'rottura di range' && rr >= s.rrA)) ? 'B' : 'C'
  return { scenario, aligned: scenario === 'a favore del trend', deep, grade }
}

// Esito di un segnale sulle candele 1H dopo l'entrata: metà a TP1 (poi stop a pareggio), metà a TP2; senza TP2 tutto a TP1.
// Stop e target nella stessa candela = stop (prudente). Oltre maxHold candele: chiusura all'ultima chiusura.
export function outcome(sig, bars, from, s) {
  const sd = sig.side, risk = Math.abs(sig.entry - sig.stop)
  const feeR = 2 * s.fee / 100 * sig.entry / risk
  let stop = sig.stop, half = !!sig.tp2, left = 1, R = 0, tp1At = null
  const hit = (b, p) => (sd > 0 ? b.h >= p : b.l <= p), lost = (b, p) => (sd > 0 ? b.l <= p : b.h >= p)
  const r = p => (p - sig.entry) * sd / risk
  for (let i = from; i < bars.length; i++) {
    const b = bars[i]
    if (lost(b, stop)) { R += left * r(stop); return { status: tp1At ? 'TP1 poi pareggio' : 'stop', R, Rnet: R - feeR, exitAt: b.t + H1, tp1At, bars: i - from + 1, final: true } }
    if (!tp1At && hit(b, sig.tp1)) {
      tp1At = b.t + H1
      if (!half) return { status: 'TP1', R: r(sig.tp1), Rnet: r(sig.tp1) - feeR, exitAt: tp1At, tp1At, bars: i - from + 1, final: true }
      R += 0.5 * r(sig.tp1); left = 0.5; stop = sig.entry
      continue
    }
    if (tp1At && hit(b, sig.tp2)) { R += 0.5 * r(sig.tp2); return { status: 'TP2', R, Rnet: R - feeR, exitAt: b.t + H1, tp1At, bars: i - from + 1, final: true } }
    if (i - from + 1 >= s.maxHold) { R += left * r(b.c); return { status: 'scaduto (tempo)', R, Rnet: R - feeR, exitAt: b.t + H1, tp1At, bars: i - from + 1, final: true } }
  }
  const last = bars.at(-1)
  return { status: 'aperto', R: last ? R + left * r(last.c) : null, Rnet: null, exitAt: null, tp1At, bars: bars.length - from, final: false }
}

// ---------- Motore: tutte le candele 1H, con 4H e 1D, una alla volta ----------
// Restituisce i setup (con lo stato finale), i segnali (con l'esito), il setup in corso, zone, trend e livelli per il grafico.
export function runIcc({ b1h, b4h, b1d, s0 = ICC_DEFAULTS, from = 0 }) {
  const s = cleanIcc(s0)
  const A1 = atr(b1h, 14), A4 = atr(b4h, 14), AD = atr(b1d, 14)
  const swD = swings(b1d, s.swingN, D1), sw4 = swings(b4h, s.swingN, H4), sw1 = swings(b1h, s.swingN, H1)
  const setups = [], signals = []
  let cur = null, j4 = -1, used = new Set()
  let zoneCache = { day: null, zones: [], trend: 'range' }
  const zonesAt = T => {
    const day = Math.floor(T / D1)
    if (zoneCache.day !== day) {
      const known = swD.filter(x => x.conf <= T && x.t >= T - s.zoneDays * D1)
      let k = -1; for (let i = 0; i < b1d.length && b1d[i].t + D1 <= T; i++) k = i
      // ATR daily (con meno di 14 giorni: media delle escursioni disponibili)
      const a = k >= 0 ? (AD[k] ?? (k >= 1 ? b1d.slice(0, k + 1).reduce((x, d) => x + d.h - d.l, 0) / (k + 1) : null)) : null
      zoneCache = { day, zones: a ? zonesFrom(known, s.zoneAtr * a, s.zoneMin) : [], trend: trendOf(known), atr: a }
    }
    return zoneCache
  }
  const close = (st, status, why, T) => { st.stage = status; st.why = why; st.endAt = T; cur = null }

  for (let i = 0; i < b1h.length; i++) {
    const b = b1h[i], T = b.t + H1
    // 1. candele 4H chiuse fino a questo momento: Indication
    while (j4 + 1 < b4h.length && b4h[j4 + 1].t + H4 <= T) {
      j4++
      const c = b4h[j4], p = b4h[j4 - 1]
      if (!p || !(A4[j4] > 0)) continue
      const Z = zonesAt(c.t + H4)
      const known4 = sw4.filter(x => x.conf <= c.t + H4)
      for (const side of [1, -1]) {
        if (cur && cur.side === side) continue
        // livello rotto: bordo di una zona daily (oltre la zona) o l'ultimo swing 4H non ancora usato
        const zone = Z.zones.find(z => (side > 0 ? c.c > z.hi && p.c <= z.hi : c.c < z.lo && p.c >= z.lo))
        const lastSw = [...known4].reverse().find(x => x.type === (side > 0 ? 'H' : 'L'))
        const swOk = lastSw && !used.has(`${side}${lastSw.t}`) && (side > 0 ? c.c > lastSw.p && p.c <= lastSw.p : c.c < lastSw.p && p.c >= lastSw.p)
        if (!zone && !swOk) continue
        const level = zone ? (side > 0 ? zone.hi : zone.lo) : lastSw.p
        if (swOk) used.add(`${side}${lastSw.t}`)
        // origine: estremo opposto dal penultimo swing opposto 4H alla rottura (o le ultime 10 candele 4H)
        const opp = known4.filter(x => x.type === (side > 0 ? 'L' : 'H')).slice(-1)[0]
        const k0 = opp && j4 - opp.i <= 60 ? opp.i : Math.max(0, j4 - 10)
        let origin = side > 0 ? Infinity : -Infinity
        for (let k = k0; k <= j4; k++) origin = side > 0 ? Math.min(origin, b4h[k].l) : Math.max(origin, b4h[k].h)
        if (cur) close(cur, 'invalidato', 'rottura nella direzione opposta', c.t + H4)
        cur = {
          id: `${side > 0 ? 'L' : 'S'}${c.t}`, side, stage: 'indication', at: c.t + H4, level, levelKind: zone ? 'zona' : 'swing', zone: zone || null,
          origin, ext: side > 0 ? c.h : c.l, extAt: c.t, atr4: A4[j4], trend: Z.trend, indI: i, corrI: null, corrExt: null, mini: null, deep: false,
        }
        setups.push(cur)
        break
      }
    }
    if (!cur || b.t < cur.at) continue
    // 2. candela 1H: aggiornamento del setup in corso
    const st = cur, sd = st.side
    if (sd > 0 ? b.c < st.origin : b.c > st.origin) { close(st, 'invalidato', 'chiusura oltre l\'origine della rottura', T); continue }
    if (st.stage === 'indication') {
      if (sd > 0 ? b.h > st.ext : b.l < st.ext) { st.ext = sd > 0 ? b.h : b.l; st.extAt = b.t }
      if (sd > 0 ? b.l <= st.level + s.retestAtr * st.atr4 : b.h >= st.level - s.retestAtr * st.atr4) { st.stage = 'correction'; st.corrI = i; st.corrAt = T; st.corrExt = sd > 0 ? b.l : b.h }
      else if (i - st.indI >= s.maxIndBars) close(st, 'scaduto', `nessuna correzione entro ${s.maxIndBars} candele 1H`, T)
      continue
    }
    // correzione: estremo, profondità, mini-struttura (ultimo swing 1H dopo l'estremo dell'Indication), continuation
    st.corrExt = sd > 0 ? Math.min(st.corrExt, b.l) : Math.max(st.corrExt, b.h)
    st.deep = sd > 0 ? st.corrExt < st.level - s.deepAtr * st.atr4 : st.corrExt > st.level + s.deepAtr * st.atr4
    const mini = sw1.filter(x => x.type === (sd > 0 ? 'H' : 'L') && x.t >= st.extAt && x.conf <= T).at(-1)
    st.mini = mini ? mini.p : null
    if (mini && (sd > 0 ? b.c > mini.p : b.c < mini.p)) {
      const a1 = A1[i] || 0
      const entry = b.c, stop = sd > 0 ? st.corrExt - s.stopAtr * a1 : st.corrExt + s.stopAtr * a1
      const risk = Math.abs(entry - stop)
      const Z = zonesAt(T)
      const nextZone = Z.zones.filter(z => (sd > 0 ? z.lo > st.ext : z.hi < st.ext)).sort((a, z) => (sd > 0 ? a.lo - z.lo : z.hi - a.hi))[0]
      const tp1 = st.ext, tp2 = nextZone ? (sd > 0 ? nextZone.lo : nextZone.hi) : null
      const rr1 = (tp1 - entry) * sd / risk, rr2 = tp2 !== null ? (tp2 - entry) * sd / risk : null
      const rr = rr2 !== null ? (rr1 + rr2) / 2 : rr1
      const cls = classify({ side: sd, trend: st.trend, levelKind: st.levelKind, deep: st.deep, rr }, s)
      const sig = {
        id: st.id, side: sd, at: T, entry, stop, tp1, tp2, rr1, rr2, rr, risk, level: st.level, levelKind: st.levelKind, zone: st.zone, origin: st.origin,
        ext: st.ext, corrExt: st.corrExt, mini: mini.p, indAt: st.at, corrAt: st.corrAt, trend: st.trend, ...cls,
      }
      if (!(risk > 0) || rr1 <= 0) { close(st, 'scartato', 'entrata già oltre TP1', T); continue }
      if (rr < s.minRR) { close(st, 'scartato', `R:R ${rr.toFixed(2)} sotto ${s.minRR}`, T); st.signal = sig; continue }
      if (T >= from) signals.push({ ...sig, ...outcome(sig, b1h, i + 1, s) })
      close(st, 'continuation', 'segnale', T); st.signal = sig
      continue
    }
    if (i - st.corrI >= s.maxCorrBars) close(st, 'scaduto', `correzione oltre ${s.maxCorrBars} candele 1H`, T)
  }
  const lastT = b1h.length ? b1h.at(-1).t + H1 : 0
  const Z = lastT ? zonesAt(lastT) : { zones: [], trend: 'range' }
  return { setups: setups.filter(x => x.at >= from), signals, current: cur, zones: Z.zones, trend: Z.trend, atrD: Z.atr ?? null, lastT }
}

// Filtri sui segnali (in ordine di tempo): trend daily di BTC per le altcoin, limite di segnali attivi nella stessa direzione.
// btcTrendAt(t) → 'up' | 'down' | 'range'. Restituisce i segnali con filtered = motivo (o null).
export function applyFilters(sigs, s, { btcTrendAt = null, active = [] } = {}) {
  const open = active.slice() // { side, until }
  return sigs.slice().sort((a, b) => a.at - b.at).map(g => {
    let filtered = null
    if (s.btcFilter && btcTrendAt && g.category === 'crypto' && !/^BTC/.test(g.symbol)) {
      const bt = btcTrendAt(g.at)
      if ((g.side > 0 && bt === 'down') || (g.side < 0 && bt === 'up')) filtered = `contro il trend daily di BTC (${bt === 'up' ? 'rialzista' : 'ribassista'})`
    }
    const live = open.filter(o => o.side === g.side && (o.until === null || o.until > g.at)).length
    if (!filtered && s.maxSameDir && live >= s.maxSameDir) filtered = `già ${live} segnali attivi ${g.side > 0 ? 'long' : 'short'}`
    if (!filtered) open.push({ side: g.side, until: g.exitAt ?? null })
    return { ...g, filtered }
  })
}
