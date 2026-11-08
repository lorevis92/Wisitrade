// Strategia "Apertura USA · entrata in tempo reale" — regole condivise tra server e app.
// Nei primi 30 minuti dopo l'apertura (9:30 New York = 15:30 in Svizzera) entra appena il titolo arriva a
// apertura ± 1,25 × movimento (il quarto in più conferma che continua), se il livello chiave più vicino lascia spazio.
// In perdita chiude solo lo stop loss; in guadagno escono lo stop che segue, la protezione guadagno,
// il livello se non lo supera o la mancata conferma di volume e VWAP; altrimenti alla chiusura della borsa.

export const ORB_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NFLX', 'NVDA', 'META', 'TSLA', 'AMD', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'INTC', 'PLTR', 'COIN', 'MSTR', 'HOOD', 'UBER', 'SHOP', 'PYPL', 'BABA', 'JPM', 'V', 'MA', 'DIS', 'WMT', 'COST', 'MCD', 'BA', 'LLY', 'UNH', 'ARM', 'MU']

// Configurazione migliore trovata nei test (17 giorni, 34 titoli): +40% su 300 USDT, 75% vinti, profit factor 2,28
export const STRATEGY_DEFAULTS = {
  symbols: ORB_SYMBOLS,
  leverage: 5,
  marginPct: 10,          // margine per trade, % del capitale da usare
  capitalMode: 'percent', // 'fixed' = cifra in USDT, 'percent' = % del saldo
  capitalFixed: 300,
  capitalPct: 100,
  movePct: 1,             // segnale: movimento dall'apertura (entrata a 1,25 × questo valore)
  sl: 1.5,                // stop loss in unità di volatilità
  trail: 1,               // in guadagno: stop che segue a questa distanza
  giveback: 0.4,          // protezione guadagno: esce se restituisce questa quota
  room: 1,                // spazio minimo dal livello più vicino, in multipli del movimento già fatto
  maxPos: 8,              // posizioni al giorno
  stale: 'run',           // trade fermi dopo 60 min: run | half | close
  fee: 0.06,              // commissione per lato in % (solo Prova)
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
  stale: ['run', 'half', 'close'],
  fee: [0.06, 0.05, 0.042, 0.03, 0.02, 0.014, 0],
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
}

export function normalizeSettings(s = {}) {
  const out = { ...STRATEGY_DEFAULTS }
  for (const k of Object.keys(STRATEGY_DEFAULTS)) if (s[k] !== undefined && s[k] !== null) out[k] = s[k]
  out.symbols = Array.isArray(out.symbols) ? out.symbols.filter(x => ORB_SYMBOLS.includes(x)) : ORB_SYMBOLS
  for (const k of ['leverage', 'marginPct', 'capitalFixed', 'capitalPct', 'movePct', 'sl', 'trail', 'giveback', 'room', 'maxPos', 'fee']) out[k] = Number(out[k])
  out.leverage = Math.min(Math.max(out.leverage || 1, 1), 20)
  out.marginPct = Math.min(Math.max(out.marginPct || 10, 1), 100)
  out.capitalPct = Math.min(Math.max(out.capitalPct || 100, 1), 100)
  out.capitalFixed = Math.max(out.capitalFixed || 0, 0)
  if (!['fixed', 'percent'].includes(out.capitalMode)) out.capitalMode = 'percent'
  if (!['run', 'half', 'close'].includes(out.stale)) out.stale = 'run'
  return out
}

// Capitale da usare e dimensione di ogni trade a partire dal saldo della piattaforma
export function sizing(settings, platformBalance) {
  const s = normalizeSettings(settings)
  const bal = Math.max(0, platformBalance || 0)
  const capital = s.capitalMode === 'fixed' ? Math.min(s.capitalFixed, bal || s.capitalFixed) : bal * s.capitalPct / 100
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

// Fa scorrere dei prezzi sulla posizione: aggiorna il punto migliore, restituisce il prezzo d'uscita se toccato
export function walk(p, s, pts) {
  for (const pt of pts) {
    const lvl = exitLevel(p, s)
    if (p.side > 0 ? pt <= lvl : pt >= lvl) return lvl
    p.best = p.side > 0 ? Math.max(p.best, pt) : Math.min(p.best, pt)
  }
  return null
}

export const exitReason = (p, px) => ((p.side > 0 ? px > p.entry : px < p.entry) ? 'ritracciamento' : (p.halved ? 'stop ridotto' : 'stop loss'))

export const pnlOf = (p, exit, feePct) => {
  const gross = p.side * (exit - p.entry) * p.qty
  const fees = (p.entry + exit) * p.qty * (feePct / 100)
  return { pnl: gross - fees, fees }
}

// Giorni di chiusura della borsa USA (NYSE) e chiusure anticipate alle 13:00
export const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])
export const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26'])
export const closeMinute = date => (EARLY_CLOSE.has(date) ? 780 : 960)
export const isTradingDay = (date, weekday) => weekday && !HOLIDAYS.has(date)
