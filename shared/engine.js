// Motore della strategia "Apertura USA": le stesse regole di entrata e uscita, minuto per minuto,
// usate da Prova e Reale (server/strategy.js, ogni minuto) e dalla Simulazione (runSimulation, sui dati archiviati).
// Qui non c'è nessun accesso a database o a Bitunix: solo calcoli.
import { sizing, pathOf, walk, exitReason, pnlOf, closeMinute, isTradingDay, HOLIDAYS, tierFor, liqPriceOf, stopPastLiq } from './opening.js'
import { ny, weekdayOf } from './time.js'
import { makeInfo, dayContext, tradeContext, tradeStates } from './analysis.js'

export const MIN = 60000
export const OPEN_MIN = 570                // 9:30 New York
export const ENTRY_UNTIL = OPEN_MIN + 30   // entrate al massimo nei primi 30 minuti (s.entryWin può accorciare la finestra)
export const entryUntil = s => OPEN_MIN + Math.min(30, s.entryWin || 30)
const LOOKBACK = 10, MIN_HISTORY = 5
export const PREP_BARS = 1300              // candele da 15 min usate per la preparazione (~13 giorni)

// Candela unica da una serie di candele
export const agg = bars => bars.length ? { t: bars[0].t, o: bars[0].o, h: Math.max(...bars.map(b => b.h)), l: Math.min(...bars.map(b => b.l)), c: bars[bars.length - 1].c, v: bars.reduce((s, b) => s + b.v, 0) } : null

// ---------- Preparazione del giorno: livelli di ieri e 5 giorni, volatilità, volume normale ----------
// bars = candele da 15 minuti dei giorni precedenti (anche fuori orario: vengono filtrate qui)
export function prepFromBars(bars, today) {
  const rth = []
  for (const b of bars) {
    const n = ny(b.t)
    if (n.date >= today || !weekdayOf(n.date) || HOLIDAYS.has(n.date)) continue
    if (n.min < OPEN_MIN || n.min >= closeMinute(n.date)) continue
    rth.push({ ...b, date: n.date, min: n.min })
  }
  const byDate = {}
  for (const b of rth) (byDate[b.date] ||= []).push(b)
  const dates = Object.keys(byDate).sort().filter(d => byDate[d].length >= 8)
  const prev = dates.slice(-LOOKBACK)
  if (prev.length < MIN_HISTORY) return { ok: false, why: `solo ${prev.length} giorni di storico su Bitunix` }
  // ATR (Wilder 14) sulle candele da 15 min in orario di borsa
  const seq = dates.flatMap(d => byDate[d])
  let atr = NaN
  seq.forEach((b, i) => {
    const tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - seq[i - 1].c), Math.abs(b.l - seq[i - 1].c))
    atr = i < 14 ? (Number.isNaN(atr) ? tr : atr + (tr - atr) / (i + 1)) : (atr * 13 + tr) / 14
  })
  const y = byDate[prev[prev.length - 1]], last5 = prev.slice(-5).flatMap(d => byDate[d])
  const levels = [
    { p: Math.max(...y.map(b => b.h)), t: 'massimo di ieri' }, { p: Math.min(...y.map(b => b.l)), t: 'minimo di ieri' },
    { p: y[y.length - 1].c, t: 'chiusura di ieri' },
    { p: Math.max(...last5.map(b => b.h)), t: 'massimo 5 giorni' }, { p: Math.min(...last5.map(b => b.l)), t: 'minimo 5 giorni' },
  ]
  const first = prev.map(d => byDate[d][0]).filter(b => b.min === OPEN_MIN)
  const atrOpen = first.length ? first.reduce((s, b) => s + (b.h - b.l), 0) / first.length : atr
  const slotVol = {}
  for (const slot of [570, 585]) {
    const v = prev.map(d => byDate[d].find(b => b.min === slot)).filter(Boolean).map(b => b.v)
    slotVol[slot] = v.length >= MIN_HISTORY ? v.reduce((s, x) => s + x, 0) / v.length : null
  }
  return { ok: true, levels, atr, atrOpen, unit: Math.max(atr, atrOpen), slotVol, days: prev.length, yClose: y[y.length - 1].c }
}

// ---------- Entrata ----------
// bars = candele da 1 minuto di oggi (con .min), dalle 9:30 e prima della fine della finestra d'entrata.
// Restituisce null (nessun segnale per ora), { skip } (titolo scartato per oggi) o il segnale.
// fromMin: primo minuto in cui si può entrare (9:35 con la regola dell'indice: se il prezzo è già oltre la soglia si entra all'apertura di quella candela)
export function findEntry(bars, s, prep, fromMin = OPEN_MIN) {
  if (!prep.ok) return { skip: prep.why || 'dati insufficienti' }
  if (!bars.length) return null
  if (bars[0].min !== OPEN_MIN) return { skip: 'manca la candela delle 9:30' }
  const open = bars[0].o, { cu, cd } = thresholds(s, open)
  let k = null, side = 0, entry = 0
  for (const b of bars) {
    if (b.min < fromMin) continue
    const path = pathOf(b)
    for (let i = 0; i < path.length; i++) {
      const prev = i ? path[i - 1] : path[0], cur = path[i]
      if (cur >= cu && (i === 0 || prev < cu)) { k = b; side = 1; entry = i === 0 ? cur : cu; break }
      if (cur <= cd && (i === 0 || prev > cd)) { k = b; side = -1; entry = i === 0 ? cur : cd; break }
    }
    if (k) break
  }
  if (!k) return null
  const rc = roomCheck(s, prep, open, side, entry)
  if (rc.skip) return { ...rc, k, side } // minuto e lato servono solo al racconto della Simulazione (story)
  return { k, side, entry, open, R: rc.R }
}

// Soglie d'entrata dall'apertura: long sopra cu, short sotto cd (1,25 × il movimento)
export const thresholds = (s, open) => ({ cu: open * (1 + 1.25 * s.movePct / 100), cd: open * (1 - 1.25 * s.movePct / 100) })
// Spazio fino al livello più vicino nella direzione del trade: { skip } se è troppo vicino, altrimenti { R } (livello o null)
export function roomCheck(s, prep, open, side, entry) {
  const ahead = prep.levels.filter(l => (side > 0 ? l.p > entry : l.p < entry)).sort((a, b) => (side > 0 ? a.p - b.p : b.p - a.p))
  const R = ahead[0] || null, done = Math.abs(entry - open)
  if (s.room > 0 && R && Math.abs(R.p - entry) < s.room * done) return { skip: `${R.t} troppo vicino` }
  return { R }
}

// Margine di mantenimento per un titolo: quello di Bitunix per lo scaglione del valore della posizione,
// altrimenti quello impostato (s.mmr, in %). lim = limiti Bitunix del titolo ({ maxLev, tiers }) o null.
export function riskFor(lim, notional, s) {
  const t = tierFor(lim, notional)
  return { mmr: t ? t.mmr : s.mmr / 100, maxLev: t ? t.maxLev : (lim?.maxLev || null), fromBitunix: !!t }
}

// ---------- Regola dell'indice di attività del mercato ----------
// L'indice si conosce alle 9:35 di New York: con la regola attiva le entrate partono da lì. Se l'indice non c'è (storico corto) si opera normalmente.
export const INDEX_FROM = OPEN_MIN + 5
export function indexRule(s, idx) {
  if (s.idxMode === 'off') return { active: false, ok: true, maxPos: s.maxPos, from: OPEN_MIN }
  const base = { active: true, ok: true, maxPos: s.maxPos, from: INDEX_FROM }
  if (idx === null || idx === undefined || !Number.isFinite(idx) || idx >= s.idxMin) return base
  if (s.idxMode === 'min') return { ...base, ok: false, why: `indice di attività ${Math.round(idx)} sotto ${s.idxMin}` }
  return { ...base, maxPos: s.maxPos > 0 ? Math.min(s.maxPos, s.idxPos) : s.idxPos, reduced: true }
}

// Nuova posizione a partire dal segnale e dalla dimensione calcolata (con il prezzo di liquidazione in margine isolato)
export function newPosition({ mode, day, symbol, sig, s, prep, size, risk }) {
  const { k, side, entry, open, R } = sig
  const unit = prep.unit
  const p = {
    mode, day, symbol, side, status: 'open', entry, qty: size.notional / entry, margin: size.margin, leverage: s.leverage,
    init_stop: entry - side * s.sl * unit, unit, best: entry, open_price: open, move_pct: side * 1.25 * s.movePct,
    level: R, entry_slot: k.min < 585 ? 570 : 585, confirmed: false, last_bar: k.t - 1, opened_at: k.t, capital: size.capital,
    entry_bar: k.t, liq_price: null,
  }
  if (risk) p.liq_price = liqPriceOf(p, risk.mmr, s.liqFee)
  return p
}

// Lo stop loss è oltre il prezzo di liquidazione? (la posizione verrebbe liquidata prima di arrivare allo stop)
export const liqBlocks = p => stopPastLiq(p)

// ---------- Uscita: una candela da 1 minuto chiusa ----------
// p = posizione (viene aggiornata), b = candela chiusa (con .min), dayBars = candele di oggi dalle 9:30 (con .min).
// Restituisce { exit, reason } se la posizione va chiusa, altrimenti null.
export function stepBar(p, s, b, dayBars, prep) {
  const inProfit = x => p.side * (x - p.entry) > 0
  // dalla seconda candela in poi l'apertura può essere già oltre lo stop (salto): si esce a quel prezzo
  const gap = b.t > (p.entry_bar ?? (p.opened_at - MIN))
  const hit = walk(p, s, pathOf(b), gap)
  p.last_bar = b.t
  if (hit !== null) return { exit: hit.px, reason: hit.liq ? 'liquidazione' : exitReason(p, hit.px), liq: hit.liq }
  // Conferma volume dopo l'entrata: nei primi volConfirm minuti, candela con volume sotto il normale di quel minuto e prezzo
  // tornato al livello d'entrata (o peggio) alla chiusura → si chiude (come le altre uscite decise a candela chiusa)
  if (s.volConfirm > 0 && prep?.minVol) {
    const el = Math.round((b.t - (p.entry_bar ?? p.opened_at)) / MIN)
    const norm = prep.minVol[b.min]
    if (el >= 1 && el <= s.volConfirm && norm && b.v < norm && p.side * (b.c - p.entry) <= 0) return { exit: b.c, reason: 'volume in calo' }
  }
  // "Nessun progresso": passati npMin minuti dall'entrata senza aver mai raggiunto npUnits unità di guadagno
  if (s.npMin > 0 && !p.np_done && b.t + MIN - (p.entry_bar ?? p.opened_at) >= s.npMin * MIN) {
    p.np_done = true
    if (p.side * (p.best - p.entry) < s.npUnits * p.unit) return { exit: b.c, reason: 'nessun progresso' }
  }
  // a ogni chiusura di una candela da 15 minuti
  if ((b.min + 1 - OPEN_MIN) % 15 !== 0) return null
  const slot = b.min - 14
  const b15 = agg(dayBars.filter(x => x.min >= slot && x.min <= b.min))
  if (!b15) return null
  if (!p.confirmed && slot === p.entry_slot) {
    // conferma: volume della candela d'entrata almeno 1,5 volte il normale e prezzo dalla parte giusta del VWAP
    p.confirmed = true
    const norm = prep?.slotVol?.[slot]
    p.volx = norm ? b15.v / norm : null
    let pv = 0, vv = 0
    for (const x of dayBars) { if (x.min > b.min) break; const tp = (x.h + x.l + x.c) / 3; pv += tp * x.v; vv += x.v }
    const vwap = vv > 0 ? pv / vv : b15.c
    const ok = p.volx >= 1.5 && (p.side > 0 ? b15.c > vwap : b15.c < vwap)
    if (!ok && inProfit(b15.c)) return { exit: b15.c, reason: 'nessuna conferma' }
  } else if (slot > p.entry_slot) {
    if (!p.stale_done && slot - p.entry_slot >= 60) {
      p.stale_done = true
      if (p.side * (p.best - p.entry) < 0.5 * p.unit) {
        if (s.stale === 'close' && p.side * (b15.c - p.entry) <= 0) return { exit: b15.c, reason: 'fermo dopo 60 min' }
        if (s.stale === 'half') { p.init_stop = p.entry - p.side * s.sl * p.unit / 2; p.halved = true }
      }
    }
    const R = p.level
    if (R && inProfit(b15.c) && (p.side > 0 ? b15.h >= R.p && b15.c < R.p : b15.l <= R.p && b15.c > R.p)) return { exit: b15.c, reason: 'resistenza' }
  }
  return null
}

// ---------- Volume normale minuto per minuto e filtri di volume ----------
export const VOL_FROM = OPEN_MIN, VOL_TO = OPEN_MIN + 35 // 9:30–10:05 New York (finestra d'entrata + conferma)
// prevDays = candele da 1 minuto (con .min) dei giorni precedenti, al massimo 10, dal più vecchio al più recente.
// Volume normale di ogni minuto = media dei giorni che hanno quel minuto (servono almeno 5 giorni).
export function minuteNormals(prevDays) {
  const sum = {}, cnt = {}
  for (const bars of prevDays.slice(-10)) for (const b of bars) {
    const m = b.min ?? ny(b.t).min
    if (m < VOL_FROM || m > VOL_TO) continue
    sum[m] = (sum[m] || 0) + b.v; cnt[m] = (cnt[m] || 0) + 1
  }
  const out = {}
  for (const m in sum) if (cnt[m] >= 5) out[m] = sum[m] / cnt[m]
  return Object.keys(out).length ? out : null
}
// Primo minuto in cui si può entrare (regola dell'indice e ritardo d'entrata)
export const entryFrom = (s, rule) => Math.max(rule.from, OPEN_MIN + (s.entryDelay || 0))
// Filtro volume all'entrata (solo dati noti): volume della candela chiusa PRIMA di quella del segnale rispetto al normale di quel minuto.
// Restituisce null se va bene, altrimenti il motivo per cui il titolo si scarta.
export function volInBlock(s, sig, bars, prep) {
  if (!(s.volIn > 0)) return null
  const prev = bars.find(b => b.min === sig.k.min - 1)
  if (!prev) return 'filtro volume: nessuna candela chiusa prima del segnale'
  const norm = prep?.minVol?.[prev.min]
  if (!norm) return 'filtro volume: volume normale non disponibile'
  const x = prev.v / norm
  return x >= s.volIn ? null : `filtro volume: ${x.toFixed(1).replace('.', ',')}× sotto ${String(s.volIn).replace('.', ',')}×`
}

// ---------- Scelta tra segnali dello stesso minuto ----------
// Quando più titoli danno il segnale nello stesso minuto e i posti liberi non bastano, l'ordine è (s.pick):
// list = ordine della lista | move = movimento più forte dall'apertura | volume = più liquido (USDT scambiati da 9:30 al segnale)
// | volat = più volatile (unità di volatilità in % del prezzo). Solo dati noti nel momento dell'entrata: il prezzo d'entrata e
// le candele chiuse PRIMA di quella del segnale (la Simulazione entra dentro quella candela, quindi la sua chiusura non si conosce).
// Restituisce un numero: più basso = prima. bars = candele di oggi del titolo (con .min), idx = posizione nella lista.
export function signalRank(s, { sig, prep, bars, idx }) {
  if (s.pick === 'move') {
    let prev = null
    for (const b of bars) { if (b.min >= sig.k.min) break; prev = b }
    return -Math.max(Math.abs(sig.entry / sig.open - 1), prev ? Math.abs(prev.c / sig.open - 1) : 0)
  }
  if (s.pick === 'volume') { let v = 0; for (const b of bars) { if (b.min >= sig.k.min) break; v += b.v * b.c } return -v }
  if (s.pick === 'volat') return -(prep.unit / sig.open)
  return idx
}
export const bySignal = (a, b) => a.sig.k.t - b.sig.k.t || a.rank - b.rank

// ---------- Limiti di perdita e freno di mercato (stesse regole per Simulazione, Prova e Reale) ----------
// dayRef = capitale a inizio giornata, dayPnl = trade chiusi oggi, openPnl = posizioni aperte (al prezzo attuale),
// totalRef = riferimento della perdita totale (partenza), balance = capitale attuale.
export function lossCheck(s, { dayRef, dayPnl = 0, openPnl = 0, totalRef = null, balance = null }) {
  const out = { brake: false, dayStop: false, halt: false }
  if (dayRef > 0) {
    if (s.brakePct > 0 && dayPnl + openPnl <= -dayRef * s.brakePct / 100) out.brake = true
    if (s.maxDayLoss > 0 && dayPnl < 0 && -dayPnl >= dayRef * s.maxDayLoss / 100) out.dayStop = true
  }
  if (s.maxTotalLoss > 0 && totalRef > 0 && balance !== null && balance <= totalRef * (1 - s.maxTotalLoss / 100)) out.halt = true
  return out
}
// Guadagno o perdita non realizzati di una posizione al prezzo px (compresa la metà già chiusa con "Metà subito")
export function openPnlOf(p, px) {
  const hq = p.half_done && p.half_qty > 0 ? p.half_qty : 0
  return p.side * (px - p.entry) * (p.qty - hq) + (hq ? p.side * (p.half_px - p.entry) * hq : 0)
}

// Andamento di una posizione per l'animazione della Simulazione: al massimo 12 punti [minuto, risultato non realizzato]
function storyPath(path) {
  const N = 12
  const pick = path.length <= N ? path : Array.from({ length: N }, (_, i) => path[Math.round(i * (path.length - 1) / (N - 1))])
  return pick.map(([m, v]) => [m, Math.round(v * 100) / 100])
}

// ---------- Simulazione sui dati archiviati ----------
// days: { 'YYYY-MM-DD': { SYM: [candele 1 min con t,o,h,l,c,v] } } (9:00–16:30 NY)
// opts: { from, to, capital, limits }. Le regole sono le stesse del dal vivo; il saldo cresce e cala a ogni chiusura (guadagni reinvestiti).
// limits = { SYM: { maxLev, tiers, fundingH } } da Bitunix (margine di mantenimento e orari del funding); se manca si usano i valori impostati.
// Costi: commissione per lato sul valore della posizione, slittamento per lato sugli ordini a mercato (s.slip),
// funding stimato (s.funding) a ogni orario del funding di Bitunix con la posizione aperta, pagato sempre (stima prudente).
// Come dal vivo: il segnale nella candela del minuto m viene preso al controllo successivo (dopo le uscite di quel minuto),
// la candela d'entrata viene già controllata per l'uscita, e alle 15:59 si chiude tutto all'apertura di quel minuto.
// cache (facoltativa): oggetto riusato tra simulazioni sugli stessi `days` (ottimizzazione): preparazione e candele
// si calcolano una volta sola; i risultati sono identici. analysis = false salta i valori dell'Analisi (più veloce).
// story = true registra anche, solo per l'animazione della Simulazione, l'andamento di ogni posizione aperta (tr.path, tr.kmin)
// e i segnali rimasti fuori di ogni giorno (riga del giorno .skipped): non cambia nessuna regola né nessun risultato.
// slipBy (facoltativo): slittamento per lato in % per singolo titolo, al posto di s.slip (per le analisi, es. dallo spread misurato)
export function runSimulation(days, s, { from, to, capital, limits = {}, mindex = {}, cache = null, analysis = true, slipBy = null, story = false }) {
  const slip0 = (s.slip || 0) / 100
  const slipOf = sym => (slipBy && slipBy[sym] !== undefined ? slipBy[sym] / 100 : slip0)
  const mmrFrom = {}
  const C = cache || {}
  const allDates = C.allDates ||= Object.keys(days).sort()
  const symOrder = Object.fromEntries(s.symbols.map((x, i) => [x, i]))
  // candele da 15 minuti per simbolo (per la preparazione di ogni giorno)
  const b15 = C.b15 ||= {}
  if (!C.b15done) for (const d of allDates) for (const [sym, bars] of Object.entries(days[d])) {
    const arr = (b15[sym] ||= [])
    let cur = null
    for (const b of bars) {
      const t = Math.floor(b.t / 900000) * 900000
      if (!cur || cur.t !== t) { cur = { t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; arr.push(cur) } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v }
    }
  }
  C.b15done = true
  const prepC = C.prep ||= {}, ctxC = C.ctx ||= {}
  // candele di oggi e indice per minuto: tenute tra una simulazione e l'altra solo con la cache (ottimizzazione);
  // senza cache si rifanno ogni giorno, così la memoria non cresce con il numero di titoli
  let todayC = cache ? (C.today ||= {}) : {}, byMinC = cache ? (C.byMin ||= {}) : {}
  // volume normale minuto per minuto (10 giorni precedenti con dati), unito alla preparazione
  const mvC = C.minVol ||= {}
  const minVolFor = (sym, day) => {
    const key = sym + '|' + day
    if (key in mvC) return mvC[key]
    const prev = []
    for (let i = allDates.indexOf(day) - 1; i >= 0 && prev.length < 10; i--) { const b = days[allDates[i]]?.[sym]; if (b?.length) prev.unshift(b) }
    return (mvC[key] = minuteNormals(prev))
  }
  const prepFor = (sym, day, openTs) => {
    const key = sym + '|' + day
    if (prepC[key]) return prepC[key]
    const arr = b15[sym] || []
    const start = openTs - 5 * MIN - PREP_BARS * 15 * MIN // come dal vivo: le ultime 1300 candele prima della preparazione
    return (prepC[key] = prepFromBars(arr.filter(b => b.t >= start && b.t < openTs), day))
  }

  const info = C.info ||= makeInfo(days) // per l'Analisi: solo dati fino al minuto considerato
  let balance = capital, peak = capital, maxDD = 0, maxDDPct = 0
  const trades = [], dayRows = [], reasons = {}, skips = {}
  let fundingTot = 0, slipTot = 0, liqs = 0
  let tradeId = 0
  // limiti di perdita e freno di mercato: quando sono scattati (giorno, tipo, minuto, risultato del giorno in quel momento)
  const limitEvents = []
  let halted = null // perdita massima totale: niente nuovi trade fino alla fine della simulazione

  for (const day of allDates) {
    if (day < from || day > to || !isTradingDay(day, weekdayOf(day))) continue
    const closeMin = closeMinute(day)
    const startBal = balance
    const today = {}
    if (!cache) { todayC = {}; byMinC = {} }
    for (const sym of s.symbols) {
      const raw = days[day][sym]
      if (!raw?.length) continue
      const key = sym + '|' + day
      // le candele dell'archivio hanno già il minuto di New York (min); altrimenti si calcola
      today[sym] = todayC[key] ||= raw[0].min !== undefined ? raw.filter(b => b.min >= OPEN_MIN) : raw.map(b => ({ ...b, min: ny(b.t).min })).filter(b => b.min >= OPEN_MIN)
    }
    const syms = Object.keys(today)
    if (!syms.length) continue
    const mi = mindex[day] || null
    const ctxKey = day + '|' + s.symbols.join(',')
    const dctx = !analysis ? null : ctxKey in ctxC ? ctxC[ctxKey] : (ctxC[ctxKey] = dayContext(days, allDates, day, s.symbols, info))
    const ctx = { ...(dctx || {}), mindex: mi?.idx ?? null, mindexPcts: mi?.pcts ?? null }
    const rule = indexRule(s, mi?.idx ?? null)
    if (!rule.ok) skips['giorni con indice sotto il minimo'] = (skips['giorni con indice sotto il minimo'] || 0) + 1
    if (rule.reduced) skips['giorni con meno posizioni (indice basso)'] = (skips['giorni con meno posizioni (indice basso)'] || 0) + 1
    // segnali di entrata
    const sigs = []
    const daySkips = [] // solo con story: [titolo, minuto, lato, motivo] dei segnali rimasti fuori
    const noteSkip = (sym, sig, why) => { if (story && sig?.k && daySkips.length < 40) daySkips.push([sym, sig.k.min, sig.side || 0, why]) }
    for (const sym of rule.ok ? syms : []) {
      const openTs = today[sym][0].t - (today[sym][0].min - OPEN_MIN) * MIN
      const prep0 = prepFor(sym, day, openTs)
      const prep = (s.volIn > 0 || s.volConfirm > 0) && prep0.ok ? { ...prep0, minVol: minVolFor(sym, day) } : prep0
      const sig = findEntry(today[sym].filter(b => b.min < entryUntil(s)), s, prep, entryFrom(s, rule))
      if (!sig) continue
      if (sig.skip) { const why = sig.skip.replace(/^solo \d+ giorni.*/, 'storico insufficiente'); skips[why] = (skips[why] || 0) + 1; noteSkip(sym, sig, why); continue }
      const vb = volInBlock(s, sig, today[sym], prep)
      if (vb) { const why = vb.replace(/: \d.*/, ': sotto la soglia'); skips[why] = (skips[why] || 0) + 1; noteSkip(sym, sig, why); continue }
      sigs.push({ sym, sig, prep, rank: signalRank(s, { sig, prep, bars: today[sym], idx: symOrder[sym] }) })
    }
    // per minuto del segnale, poi secondo la regola di scelta (a parità: ordine della lista)
    sigs.sort((a, b) => bySignal(a, b) || symOrder[a.sym] - symOrder[b.sym])

    const byMin = {}
    for (const sym of syms) {
      const key = sym + '|' + day
      if (!byMinC[key]) { const m = (byMinC[key] = new Map()); for (const b of today[sym]) m.set(b.min, b) }
      byMin[sym] = byMinC[key]
    }
    let open = [], taken = 0
    const dayTrades = []
    const close = (pos, raw, reason, at, liq = false) => {
      // uscita a mercato: slittamento contro di te (non con la liquidazione, che chiude Bitunix)
      const exit = liq ? raw : raw * (1 - pos.side * slipOf(pos.symbol))
      const slipCost = pos.slipIn + Math.abs(raw - exit) * pos.qty
      const P = (limits[pos.symbol]?.fundingH || 8) * 3600000
      const nF = Math.max(0, Math.ceil(at / P) - Math.ceil(pos.opened_at / P)) // orari del funding con la posizione aperta
      const funding = nF * pos.qty * pos.entry * (s.funding || 0) / 100
      const { pnl, fees } = pnlOf(pos, exit, s.fee, { liq, funding })
      fundingTot += funding; slipTot += slipCost; if (liq) liqs++
      balance += pnl
      peak = Math.max(peak, balance)
      const dd = peak - balance
      if (dd > maxDD) maxDD = dd
      if (peak > 0 && dd / peak * 100 > maxDDPct) maxDDPct = dd / peak * 100
      const r = (reasons[reason] ||= { n: 0, wins: 0, pnl: 0 })
      r.n++; r.pnl += pnl; if (pnl > 0) r.wins++
      const tr = {
        id: ++tradeId, symbol: pos.symbol, day, side: pos.side, entry: pos.entry, exit, stop: pos.stop0, stopEnd: pos.init_stop,
        level: pos.level, opened_at: pos.opened_at, closed_at: at, reason, pnl, fees, qty: pos.qty, margin: pos.margin,
        leverage: pos.leverage, pct: pnl / (pos.entry * pos.qty) * 100, balance, liq: pos.liq_price, funding, slip: slipCost,
        signal: pos.signal, half: pos.half_done ? { px: pos.half_px, qty: pos.half_qty } : null, unit: pos.unit,
        states: analysis ? tradeStates(pos, byMin[pos.symbol], at) : null, ctx: pos.ctx,
      }
      if (story) { tr.kmin = pos.kmin; tr.path = storyPath(pos.path || []) }
      trades.push(tr); dayTrades.push(tr)
      open = open.filter(x => x !== pos)
    }

    let si = 0
    let stopNew = halted ? 'strategia ferma (perdita massima totale)' : null // motivo per non aprire altri trade oggi
    const lastPx = {}
    const dayPnlNow = () => dayTrades.reduce((a, t) => a + t.pnl, 0)
    // capitale di riferimento dei limiti: quello usato a inizio giornata (con "% saldo" = saldo, con "Cifra" = la cifra), come in Prova e Reale
    const dayRef = sizing(s, startBal).capital
    const event = (type, m, extra = {}) => limitEvents.push({ day, type, min: m, dayPnl: dayPnlNow(), dayPct: dayRef > 0 ? dayPnlNow() / dayRef * 100 : 0, ...extra })
    const checkAfterClose = m => {
      const L = lossCheck(s, { dayRef, dayPnl: dayPnlNow(), totalRef: capital, balance })
      if (L.halt && !halted) { halted = day; event('totale', m); stopNew = 'strategia ferma (perdita massima totale)' }
      if (L.dayStop && !stopNew) { event('giornaliero', m); stopNew = 'perdita massima giornaliera' }
      // freno superato già solo con i trade chiusi (nessuna posizione aperta da chiudere): niente nuovi trade
      if (L.brake && !open.length && stopNew !== 'freno di mercato' && !halted) { event('freno', m, { lossAtTrigger: dayPnlNow(), lossPct: dayRef > 0 ? dayPnlNow() / dayRef * 100 : 0 }); stopNew = 'freno di mercato' }
    }
    for (let m = OPEN_MIN; m < closeMin - 1; m++) {
      // uscite sulla candela chiusa del minuto m
      const nBefore = dayTrades.length
      for (const pos of [...open]) {
        const b = byMin[pos.symbol].get(m)
        if (!b) continue
        lastPx[pos.symbol] = b
        const r = stepBar(pos, s, b, today[pos.symbol], pos.prep)
        if (r) close(pos, r.exit, r.reason, b.t + MIN, r.liq)
        else if (story) pos.path.push([m + 1, openPnlOf(pos, b.c)])
      }
      // freno di mercato: perdita del giorno (chiusi + aperti al prezzo di chiusura del minuto) oltre la soglia → chiude tutto
      if (s.brakePct > 0 && open.length) {
        let openPnl = 0
        for (const pos of open) { const b = lastPx[pos.symbol]; if (b) openPnl += openPnlOf(pos, b.c) } // solo candele chiuse fino al minuto m
        if (lossCheck(s, { dayRef, dayPnl: dayPnlNow(), openPnl }).brake) {
          const loss = dayPnlNow() + openPnl
          // si chiude come dal vivo: dopo la chiusura del minuto m, all'apertura della candela successiva di ogni titolo (più lo slittamento in close)
          for (const pos of [...open]) {
            let nx = null
            for (let k = m + 1; k < closeMin; k++) { nx = byMin[pos.symbol].get(k); if (nx) break }
            const b = lastPx[pos.symbol] || byMin[pos.symbol].get(m)
            if (nx) close(pos, nx.o, 'freno di mercato', nx.t)
            else close(pos, b ? b.c : pos.entry, 'freno di mercato', (b ? b.t : pos.opened_at) + MIN)
          }
          event('freno', m, { lossAtTrigger: loss, lossPct: dayRef > 0 ? loss / dayRef * 100 : 0 })
          if (!stopNew || stopNew === 'perdita massima giornaliera') stopNew = 'freno di mercato'
        }
      }
      if (dayTrades.length > nBefore) checkAfterClose(m)
      // entrate scattate nel minuto m
      while (si < sigs.length && sigs[si].sig.k.min <= m) {
        const { sym, sig, prep } = sigs[si++]
        if (stopNew) { skips[stopNew] = (skips[stopNew] || 0) + 1; noteSkip(sym, sig, stopNew); continue }
        if (rule.maxPos > 0 && taken >= rule.maxPos) { skips['limite posizioni al giorno'] = (skips['limite posizioni al giorno'] || 0) + 1; noteSkip(sym, sig, 'limite posizioni al giorno'); continue }
        const size = sizing(s, balance)
        if (!(size.margin >= 1)) { skips['capitale insufficiente'] = (skips['capitale insufficiente'] || 0) + 1; noteSkip(sym, sig, 'capitale insufficiente'); continue }
        // entrata a mercato: slittamento contro di te; lo stop si calcola dal prezzo eseguito, come nel Reale
        const fill = sig.entry * (1 + sig.side * slipOf(sym))
        const risk = riskFor(limits[sym], size.notional, s)
        mmrFrom[sym] = risk.fromBitunix ? 'bitunix' : 'impostato'
        const pos = newPosition({ mode: 'sim', day, symbol: sym, sig: { ...sig, entry: fill }, s, prep, size, risk })
        if (s.liqGuard && liqBlocks(pos)) { skips['stop oltre la liquidazione'] = (skips['stop oltre la liquidazione'] || 0) + 1; noteSkip(sym, sig, 'stop oltre la liquidazione'); continue }
        pos.prep = prep; pos.stop0 = pos.init_stop; pos.signal = sig.entry; pos.kmin = sig.k.min
        pos.ctx = analysis ? tradeContext(days, allDates, day, sym, sig, s.symbols, info) : null
        pos.slipIn = Math.abs(fill - sig.entry) * pos.qty
        taken++; open.push(pos)
        if (story) pos.path = []
        lastPx[sym] = sig.k
        const r = stepBar(pos, s, sig.k, today[sym], prep)
        if (r) { close(pos, r.exit, r.reason, sig.k.t + MIN, r.liq); checkAfterClose(m) }
      }
    }
    // fine giornata: chiude tutto un minuto prima della chiusura della borsa
    for (const pos of [...open]) {
      const last = byMin[pos.symbol].get(closeMin - 1)
      const fallback = today[pos.symbol].filter(b => b.min < closeMin - 1).at(-1)
      const px = last ? last.o : fallback?.c ?? pos.entry
      close(pos, px, 'chiusura', last ? last.t : (fallback?.t ?? pos.opened_at) + MIN)
    }
    if (open.length === 0 && dayTrades.length) checkAfterClose(closeMin - 1) // la perdita totale si controlla anche a fine giornata
    if (dayTrades.length) {
      const pnl = dayTrades.reduce((a, t) => a + t.pnl, 0)
      dayRows.push({ day, n: dayTrades.length, wins: dayTrades.filter(t => t.pnl > 0).length, pnl, pct: startBal > 0 ? pnl / startBal * 100 : null, balance, ctx })
    } else dayRows.push({ day, n: 0, wins: 0, pnl: 0, pct: 0, balance, ctx })
    if (story) dayRows.at(-1).skipped = daySkips
  }

  let gp = 0, gl = 0, wins = 0, fees = 0
  for (const t of trades) { if (t.pnl > 0) { gp += t.pnl; wins++ } else gl -= t.pnl; fees += t.fees }
  const simDays = dayRows.length
  return {
    from, to, capital, final: balance, net: balance - capital, pct: capital > 0 ? (balance / capital - 1) * 100 : 0,
    n: trades.length, wins, pf: gl > 0 ? gp / gl : null, grossWin: gp, grossLoss: gl, fees,
    funding: fundingTot, slippage: slipTot, costs: fees + fundingTot + slipTot, liquidations: liqs,
    worstDay: dayRows.filter(d => d.n && d.pct !== null).reduce((w, d) => (!w || d.pct < w.pct ? d : w), null),
    mmrFrom,
    maxDD, maxDDPct, days: simDays, daysWithTrades: dayRows.filter(d => d.n).length, daysUp: dayRows.filter(d => d.pnl > 0).length,
    firstDay: dayRows[0]?.day ?? null, lastDay: dayRows.at(-1)?.day ?? null,
    reasons: Object.entries(reasons).map(([reason, r]) => ({ reason, ...r })).sort((a, b) => b.n - a.n),
    limitEvents, halted,
    skips: Object.entries(skips).map(([why, n]) => ({ why, n })).sort((a, b) => b.n - a.n),
    daily: dayRows,
    trades,
  }
}
