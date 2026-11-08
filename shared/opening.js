// Strategia "Apertura USA · entrata in tempo reale" — regole condivise tra server e app.
// Nei primi 30 minuti dopo l'apertura (9:30 New York = 15:30 in Svizzera) entra appena il titolo arriva a
// apertura ± 1,25 × movimento (il quarto in più conferma che continua), se il livello chiave più vicino lascia spazio.
// In perdita chiude solo lo stop loss; in guadagno escono lo stop che segue, la protezione guadagno,
// il livello se non lo supera o la mancata conferma di volume e VWAP; altrimenti alla chiusura della borsa.

import { NEW_SYMBOLS, LOW_LIQ_SYMBOLS, LEV_SYMBOLS } from './universe.js'

// Titoli originali della strategia (MA e BA non hanno il perpetual su Bitunix: restano qui ma non operano mai)
export const ORB_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NFLX', 'NVDA', 'META', 'TSLA', 'AMD', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'INTC', 'PLTR', 'COIN', 'MSTR', 'HOOD', 'UBER', 'SHOP', 'PYPL', 'BABA', 'JPM', 'V', 'MA', 'DIS', 'WMT', 'COST', 'MCD', 'BA', 'LLY', 'UNH', 'ARM', 'MU']

export const ORIGINAL_SYMBOLS = ORB_SYMBOLS.filter(s => s !== 'MA' && s !== 'BA') // i 32 originali disponibili su Bitunix
export { NEW_SYMBOLS, LOW_LIQ_SYMBOLS, LEV_SYMBOLS }
// Tutti i titoli selezionabili: originali, nuovi (volume sufficiente), a bassa liquidità ed ETF a leva o inversi
export const STRATEGY_SYMBOLS = [...new Set([...ORB_SYMBOLS, ...NEW_SYMBOLS, ...LOW_LIQ_SYMBOLS, ...LEV_SYMBOLS])]
const STRATEGY_SET = new Set(STRATEGY_SYMBOLS)

// Configurazione migliore trovata nei test (17 giorni, 34 titoli): +40% su 300 USDT, 75% vinti, profit factor 2,28
export const STRATEGY_DEFAULTS = {
  symbols: ORB_SYMBOLS,
  leverage: 5,
  marginPct: 10,          // margine per trade, % del capitale da usare
  capitalMode: 'percent', // 'fixed' = cifra in USDT, 'percent' = % del saldo, 'dedicated' = capitale dedicato (si aggiorna con i risultati)
  capitalFixed: 300,
  capitalPct: 100,
  capitalDedicated: 0,    // capitale dedicato: cifra di partenza (cambiandola si riparte da lì)
  maxDayLoss: 10,         // con capitale dedicato: perdita massima giornaliera in % (0 = spenta): superata, niente nuovi trade fino a domani
  maxTotalLoss: 30,       // con capitale dedicato: perdita massima totale in % (0 = spenta): superata, la strategia si ferma
  movePct: 1,             // segnale: movimento dall'apertura (entrata a 1,25 × questo valore)
  sl: 1.5,                // stop loss in unità di volatilità
  trail: 1,               // in guadagno: stop che segue a questa distanza
  giveback: 0.4,          // protezione guadagno: esce se restituisce questa quota
  room: 1,                // spazio minimo dal livello più vicino, in multipli del movimento già fatto
  maxPos: 8,              // posizioni al giorno
  stale: 'run',           // trade fermi dopo 60 min: run | half | close
  fee: 0.06,              // commissione per lato in % (Prova e Simulazione; nel Reale quella vera di Bitunix)
  // Liquidazione (margine isolato) e costi
  liqGuard: true,         // non aprire se lo stop loss è oltre il prezzo di liquidazione (nel Reale sempre attivo)
  mmr: 1,                 // margine di mantenimento in % se Bitunix non lo fornisce per quel perpetual
  liqFee: 0.1,            // commissione di liquidazione in % del valore della posizione
  funding: 0.01,          // funding medio per periodo, in % del valore della posizione (solo Simulazione)
  slip: 0.05,             // slittamento per lato sugli ordini a mercato, in % (solo Simulazione)
  // Uscite da testare (spente di default)
  npMin: 0,               // "Nessun progresso": dopo questi minuti dall'entrata (0 = spenta)...
  npUnits: 0.25,          // ...se il guadagno massimo non ha raggiunto queste unità di volatilità, chiudi
  halfAt: 0,              // "Metà subito": a +queste unità chiudi metà posizione e sposta lo stop al prezzo d'entrata (0 = spenta)
  // Indice di attività del mercato (alle 9:35 di New York): off | min = opera solo se l'indice è almeno idxMin | reduce = sotto idxMin usa solo idxPos posizioni
  entryWin: 30,           // finestra d'entrata: minuti dopo l'apertura in cui si può entrare (5, 10, 15 o 30)
  idxMode: 'off',
  idxMin: 50,
  idxPos: 2,
}

const steps = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => +(from + i * step).toFixed(4))

export const OPTIONS = {
  leverage: steps(1, 20, 1),
  marginPct: [5, 10, 15, 20, 25, 33, 50, 100],
  movePct: [0.5, 0.75, 1, 1.25, 1.5, 2],
  sl: steps(0.25, 3, 0.25),
  trail: steps(0.25, 3, 0.25),
  giveback: [0, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6],
  room: [0, 0.25, 0.5, 0.75, 1, 1.5],
  maxPos: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 0],
  maxDayLoss: [0, 3, 5, 7.5, 10, 15, 20, 30],
  maxTotalLoss: [0, 10, 15, 20, 25, 30, 40, 50],
  stale: ['run', 'half', 'close'],
  fee: [0.06, 0.05, 0.042, 0.03, 0.02, 0.014, 0],
  mmr: [0.5, 1, 1.5, 2, 2.5, 3, 5],
  liqFee: [0, 0.05, 0.1, 0.2, 0.5, 1],
  funding: [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1],
  slip: [0, 0.01, 0.02, 0.03, 0.05, 0.1, 0.15, 0.2, 0.3],
  npMin: [0, 5, 10, 15, 20, 30, 45, 60, 90],
  npUnits: [0.1, 0.25, 0.5, 0.75, 1],
  halfAt: [0, 0.5, 0.75, 1, 1.25, 1.5, 2, 3],
  entryWin: [5, 10, 15, 30],
  idxMode: ['off', 'min', 'reduce'],
  idxMin: [20, 30, 40, 50, 60, 70, 80],
  idxPos: [1, 2, 3, 4, 5, 6],
}

const n2 = v => String(v).replace('.', ',')
const slWord = v => (v <= 0.5 ? 'molto stretto' : v < 1 ? 'stretto' : v < 1.5 ? 'medio-stretto' : v < 2 ? 'medio' : v < 2.75 ? 'largo' : 'molto largo')
const trailWord = v => (v < 0.5 ? 'molto stretto' : v < 0.75 ? 'stretto' : v < 1 ? 'medio-stretto' : v < 1.5 ? 'medio' : v <= 2 ? 'largo' : 'molto largo')
export const LABELS = {
  sl: Object.fromEntries(OPTIONS.sl.map(v => [v, `${slWord(v)} (${n2(v)})`])),
  trail: Object.fromEntries(OPTIONS.trail.map(v => [v, `${trailWord(v)} (${n2(v)})`])),
  giveback: Object.fromEntries(OPTIONS.giveback.map(v => [v, v ? `esci se restituisci il ${Math.round(v * 100)}%` : 'spenta'])),
  room: { 0: 'nessun controllo', 0.25: 'almeno un quarto del movimento', 0.5: 'almeno metà del movimento', 0.75: 'almeno 3/4 del movimento', 1: 'almeno tutto il movimento', 1.5: 'almeno 1,5 volte il movimento' },
  maxPos: { 0: 'nessun limite' },
  stale: { run: 'lascia correre', half: 'dimezza lo stop', close: 'chiudi se in perdita' },
  npMin: { 0: 'spenta' },
  halfAt: { 0: 'spenta' },
  idxMode: { off: 'spento', min: 'opera solo se l\'indice è almeno…', reduce: 'sotto la soglia meno posizioni' },
}

export function normalizeSettings(s = {}) {
  const out = { ...STRATEGY_DEFAULTS }
  for (const k of Object.keys(STRATEGY_DEFAULTS)) if (s[k] !== undefined && s[k] !== null) out[k] = s[k]
  out.symbols = Array.isArray(out.symbols) ? [...new Set(out.symbols.filter(x => STRATEGY_SET.has(x)))] : ORB_SYMBOLS
  for (const k of ['leverage', 'marginPct', 'capitalFixed', 'capitalPct', 'movePct', 'sl', 'trail', 'giveback', 'room', 'maxPos', 'fee', 'mmr', 'liqFee', 'funding', 'slip', 'npMin', 'npUnits', 'halfAt', 'idxMin', 'idxPos', 'entryWin', 'capitalDedicated', 'maxDayLoss', 'maxTotalLoss']) out[k] = Number(out[k])
  out.entryWin = Math.min(Math.max(Math.round(out.entryWin) || 30, 1), 30)
  if (!['off', 'min', 'reduce'].includes(out.idxMode)) out.idxMode = 'off'
  out.idxMin = Math.min(Math.max(out.idxMin || 0, 0), 100)
  out.idxPos = Math.min(Math.max(Math.round(out.idxPos) || 1, 1), 50)
  out.npMin = Math.min(Math.max(out.npMin || 0, 0), 390)
  out.npUnits = Math.min(Math.max(out.npUnits || 0, 0), 10)
  out.halfAt = Math.min(Math.max(out.halfAt || 0, 0), 20)
  for (const k of ['fee', 'liqFee', 'funding', 'slip']) out[k] = Math.min(Math.max(out[k] || 0, 0), 5)
  out.mmr = Math.min(Math.max(out.mmr || 1, 0.1), 50)
  out.liqGuard = out.liqGuard !== false
  out.leverage = Math.min(Math.max(out.leverage || 1, 1), 20)
  out.marginPct = Math.min(Math.max(out.marginPct || 10, 1), 100)
  out.capitalPct = Math.min(Math.max(out.capitalPct || 100, 1), 100)
  out.capitalFixed = Math.max(out.capitalFixed || 0, 0)
  if (!['fixed', 'percent', 'dedicated'].includes(out.capitalMode)) out.capitalMode = 'percent'
  out.capitalDedicated = Math.max(out.capitalDedicated || 0, 0)
  out.maxDayLoss = Math.min(Math.max(out.maxDayLoss || 0, 0), 100)
  out.maxTotalLoss = Math.min(Math.max(out.maxTotalLoss || 0, 0), 100)
  if (!['run', 'half', 'close'].includes(out.stale)) out.stale = 'run'
  return out
}

// Capitale da usare e dimensione di ogni trade a partire dal saldo della piattaforma
// Impostazioni di un conto: nel Reale, se non è mai stato scelto, il capitale è "dedicato" (default)
export const settingsFor = (mode, raw = {}) => normalizeSettings(mode === 'live' && !raw?.capitalMode ? { ...raw, capitalMode: 'dedicated' } : raw)

// Capitale da usare. platformBalance = saldo (nel Reale quello disponibile su Bitunix).
// dedicatedNow = capitale dedicato attuale; senza (Simulazione) il capitale dedicato è il saldo della simulazione.
// Con il capitale dedicato non si usa mai più del saldo.
export function sizing(settings, platformBalance, dedicatedNow) {
  const s = normalizeSettings(settings)
  const bal = Math.max(0, platformBalance || 0)
  const capital = s.capitalMode === 'fixed' ? Math.min(s.capitalFixed, bal || s.capitalFixed)
    : s.capitalMode === 'dedicated' ? (dedicatedNow === undefined || dedicatedNow === null ? bal : Math.min(Math.max(0, dedicatedNow), bal))
      : bal * s.capitalPct / 100
  const margin = capital * s.marginPct / 100
  return { capital, margin, notional: margin * s.leverage }
}

// Percorso dentro una candela come su TradingView: se l'apertura è più vicina al massimo O→H→L→C, altrimenti O→L→H→C
export const pathOf = b => (Math.abs(b.h - b.o) < Math.abs(b.l - b.o) ? [b.o, b.h, b.l, b.c] : [b.o, b.l, b.h, b.c])

// Livello di uscita attuale. Finché il guadagno è sotto mezza unità resta lo stop loss;
// poi lo stop segue il prezzo (mai peggio dello stop loss) e la protezione guadagno blocca la quota scelta.
export function exitLevel(p, s) {
  const gain = p.side * (p.best - p.entry)
  if (gain < 0.5 * p.unit) return p.init_stop
  let lvl = p.best - p.side * s.trail * p.unit
  lvl = p.side > 0 ? Math.max(lvl, p.init_stop) : Math.min(lvl, p.init_stop)
  if (s.giveback > 0) {
    const g = p.entry + p.side * gain * (1 - s.giveback)
    lvl = p.side > 0 ? Math.max(lvl, g) : Math.min(lvl, g)
  }
  return lvl
}

// Fa scorrere dei prezzi sulla posizione: aggiorna il punto migliore e restituisce { px, liq } se tocca l'uscita.
// gap = il primo prezzo è l'apertura di una nuova candela: se è già oltre lo stop si esce a quel prezzo (peggiore), non allo stop.
// Liquidazione (p.liq_price): se il prezzo la tocca prima dello stop la posizione è liquidata.
export function walk(p, s, pts, gap = false) {
  const liq = p.liq_price > 0 ? p.liq_price : null
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i], lvl = exitLevel(p, s)
    const past = x => (p.side > 0 ? pt <= x : pt >= x)
    const liqFirst = liq !== null && (p.side > 0 ? liq >= lvl : liq <= lvl) // stop oltre la liquidazione
    if (liqFirst && past(liq)) return { px: liq, liq: true }
    if (past(lvl)) {
      if (gap && i === 0) return liq !== null && past(liq) ? { px: liq, liq: true } : { px: pt, liq: false }
      return { px: lvl, liq: false }
    }
    // "Metà subito": al primo tocco di +halfAt unità chiude metà a quel livello e porta lo stop al prezzo d'entrata
    if (s.halfAt > 0 && !p.half_done && p.side * (pt - p.entry) >= s.halfAt * p.unit) {
      p.half_done = true
      p.half_px = p.entry + p.side * s.halfAt * p.unit
      p.half_qty = p.qty / 2
      p.init_stop = p.side > 0 ? Math.max(p.init_stop, p.entry) : Math.min(p.init_stop, p.entry)
    }
    p.best = p.side > 0 ? Math.max(p.best, pt) : Math.min(p.best, pt)
  }
  return null
}

export const exitReason = (p, px) => ((p.side > 0 ? px > p.entry : px < p.entry) ? 'ritracciamento'
  : p.half_done && Math.abs(px - p.entry) <= p.entry * 1e-9 ? 'pareggio dopo metà' : (p.halved ? 'stop ridotto' : 'stop loss'))

// Risultato di una chiusura. Commissioni sul valore della posizione (prezzo × quantità) in entrata e in uscita.
// Nessun trade perde più del suo margine sul prezzo; con la liquidazione si perde tutto il margine
// (dentro ci sono margine di mantenimento e commissione di liquidazione) più la commissione d'entrata già pagata.
// Con "Metà subito" la metà già chiusa (half_qty a half_px) entra nel risultato.
export const pnlOf = (p, exit, feePct, { liq = false, funding = 0 } = {}) => {
  const f = feePct / 100
  const hq = p.half_done && p.half_qty > 0 ? p.half_qty : 0, rq = p.qty - hq
  const halfGross = hq ? p.side * (p.half_px - p.entry) * hq : 0
  const entryFee = p.entry * p.qty * f, halfFee = hq ? p.half_px * hq * f : 0
  if (liq) {
    const gross = halfGross - (p.margin || 0) * (rq / p.qty)
    return { pnl: gross - entryFee - halfFee - funding, fees: entryFee + halfFee, gross }
  }
  let gross = halfGross + p.side * (exit - p.entry) * rq
  if (p.margin > 0) gross = Math.max(gross, -p.margin)
  const fees = entryFee + halfFee + exit * rq * f
  return { pnl: gross - fees - funding, fees, gross }
}

// ---------- Liquidazione in margine isolato ----------
// Scaglione di Bitunix per il valore della posizione: { mmr (frazione), maxLev } oppure null se non disponibile
export function tierFor(lim, notional) {
  const t = lim?.tiers
  if (!t?.length) return null
  const x = t.find(r => notional >= (r.start || 0) && notional < (r.end || Infinity)) || t[t.length - 1]
  return { mmr: x.mmr, maxLev: Math.min(x.lev || Infinity, lim.maxLev || Infinity) }
}
// Prezzo di liquidazione: il margine più il risultato scende al margine di mantenimento più la commissione di liquidazione
export function liqPriceOf({ side, entry, qty, margin }, mmr, liqFeePct) {
  const m = mmr + liqFeePct / 100
  const px = side > 0 ? (qty * entry - margin) / (qty * (1 - m)) : (qty * entry + margin) / (qty * (1 + m))
  return px > 0 && Number.isFinite(px) ? px : null
}
export const stopPastLiq = p => !!p.liq_price && (p.side > 0 ? p.init_stop <= p.liq_price : p.init_stop >= p.liq_price)

// Giorni di chiusura della borsa USA (NYSE) e chiusure anticipate alle 13:00
export const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])
export const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26'])
export const closeMinute = date => (EARLY_CLOSE.has(date) ? 780 : 960)
export const isTradingDay = (date, weekday) => weekday && !HOLIDAYS.has(date)
