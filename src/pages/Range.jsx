// Pagina Range: riconoscimento automatico dei range P e B (metodo di Patrick Nill) per controllarli a occhio.
// Solo analisi: nessun ordine. Regole in shared/range.js (le stesse del server: avvisi push e registro, server/range-alerts.js).
import { useEffect, useMemo, useRef, useState } from 'react'
import RangeChart, { TrendChart } from '../components/RangeChart.jsx'
import StrategyTabs, { useStrategyMode, ComingSoon } from '../components/StrategyTabs.jsx'
import { Sparkline } from '../components/ManualTrade.jsx'
import { SymbolPicker, NAMES } from './Rsi.jsx'
import { get, post, postStream, fmtPrice } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { currentSubscription } from '../lib/push.js'
import { analyze, trend4h, weekProfiles, cleanRangeSettings, RANGE_DEFAULTS, LIMITS, FEES, GRADES, KIND_LABEL } from '@shared/range.js'
import { CRYPTO, ASSET_MAP } from '@shared/assets.js'
import { STRATEGY_SYMBOLS } from '@shared/opening.js'

const FEATURED = ['BTCUSDT', 'ETHUSDT', 'XAUUSDT']
const REFRESH = { '15m': 60000, '1h': 600000, '4h': 600000 }
const TF_MS = { '15m': 15 * 60000, '1h': 3600000, '4h': 4 * 3600000 }
const short = s => s.replace(/USDT$/, '')
const TREND = { up: 'rialzista', down: 'ribassista', side: 'laterale' }
const when = t => new Date(t).toLocaleString('it-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtR = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`)
const fmtU = v => (Number.isFinite(v) ? v.toLocaleString('it-CH', { maximumFractionDigits: 2 }) : '—')
const kindName = t => `${KIND_LABEL[t.kind]}${t.variant ? ` (${t.variant})` : ''}`
const fitCls = f => (f === 'a favore' ? 'up' : f === 'contro' ? 'down' : 'sec')
const gradeCls = g => `rg-grade g${g}`
const SETTINGS_INFO = [
  ['impulseAtr', 'Forza minima dell\'impulso', '× ATR', 'Quanto deve essere ampio il movimento rispetto alla volatilità normale a 15 minuti (ATR 14). Più alto: solo impulsi netti, meno range.'],
  ['impulseBars', 'Durata massima dell\'impulso', 'candele', 'In quante candele da 15 minuti al massimo deve avvenire l\'impulso (16 = 4 ore). Più basso: solo movimenti rapidi.'],
  ['minTouches', 'Tocchi minimi', 'tocchi', 'Tocchi dei bordi (alto + basso, almeno uno per lato) perché il range sia valido. Più alto: range più "provati", ma meno numerosi e più tardi.'],
  ['minHours', 'Durata minima del range', 'ore', 'Da quanto tempo il prezzo deve stare nel range perché sia valido (12 = mezza giornata). Più basso: range più frequenti ma meno solidi.'],
  ['touchTol', 'Tolleranza del tocco', '× ATR', 'Quanto vicino al bordo deve arrivare il prezzo per contare un tocco. Più alta: più tocchi contati, range validi prima.'],
  ['maxCost', 'Costi massimi rispetto al rischio', '%', 'Commissioni di andata e ritorno (entrata e uscita allo stop) al massimo questa percentuale del rischio. Oltre, lo stop è troppo stretto per i costi di Bitunix e il setup non è valido. Più bassa: solo setup con stop più larghi.'],
  ['futFee', 'Commissione del future (tipo IBKR)', '% per lato', 'Secondo scenario di costo, per capire se la strategia starebbe in piedi su un broker più economico: stessa commissione per entrata, target e stop. Bitunix resta 0,02% limite e 0,06% a mercato e stop.'],
  ['minRR', 'Rischio/rendimento minimo', ': 1', 'Un setup è valido solo se il rendimento fino all\'ultimo target è almeno questo multiplo del rischio. Più alto: meno setup, più selettivi.'],
]
// stato → alone (come nella pagina RSI)
function glowFor(rg) {
  const st = rg.lastSetup
  const dirCol = s => (s > 0 ? '0,229,199' : '255,92,122')
  let rgb = null, x = 0, pulse = false
  if (rg.state === 'setup pronto') { rgb = dirCol(st.side); x = st.grade === 'A' ? 1 : st.grade === 'B' ? 0.75 : 0.5; pulse = true }
  else if (rg.state === 'setup in corso') { rgb = dirCol(st.side); x = 0.6 }
  else if (rg.state === 'falso breakout in corso') { rgb = dirCol(st?.side ?? 1); x = 0.4; pulse = true }
  else if (rg.state === 'breakout') { rgb = '245,184,61'; x = 0.4 }
  else if (rg.state === 'valido') { rgb = rg.type === 'P' ? '0,229,199' : '255,92,122'; x = rg.strong ? 0.35 : 0.2 }
  if (!rgb) return { style: {}, pulse: false }
  const a = 0.16 + 0.6 * x, blur = 8 + 28 * x, spread = 0.5 + 4 * x
  return {
    pulse,
    style: {
      '--glow': `0 0 ${blur.toFixed(1)}px ${spread.toFixed(1)}px rgba(${rgb},${a.toFixed(2)})`,
      '--glow-hi': `0 0 ${(blur + 14).toFixed(1)}px ${(spread + 3).toFixed(1)}px rgba(${rgb},${Math.min(0.95, a + 0.3).toFixed(2)})`,
      borderColor: `rgba(${rgb},${(0.3 + 0.55 * x).toFixed(2)})`,
    },
  }
}

function useBars(symbol) {
  const [data, setData] = useState({})
  const symRef = useRef(symbol); symRef.current = symbol
  useEffect(() => {
    setData({})
    const timers = [], busy = {}
    const fetchTf = tf => {
      if (busy[tf] || document.visibilityState === 'hidden') return
      busy[tf] = true
      get(`/api/range/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`)
        .then(j => { if (symRef.current === symbol) setData(d => ({ ...d, [tf]: { bars: j.bars, error: null } })) })
        .catch(e => { if (symRef.current === symbol) setData(d => ({ ...d, [tf]: { ...d[tf], error: e.message } })) })
        .finally(() => { busy[tf] = false })
    }
    for (const tf of Object.keys(REFRESH)) { fetchTf(tf); timers.push(setInterval(() => fetchTf(tf), REFRESH[tf])) }
    const onVis = () => document.visibilityState === 'visible' && Object.keys(REFRESH).forEach(fetchTf)
    document.addEventListener('visibilitychange', onVis)
    return () => { timers.forEach(clearInterval); document.removeEventListener('visibilitychange', onVis) }
  }, [symbol])
  return data
}

// trimestrali dal Calendario (solo le azioni: date senza ora)
function useEarnings() {
  const [ev, setEv] = useState([])
  useEffect(() => { get('/api/events').then(j => setEv(j.earnings || [])).catch(() => {}) }, [])
  return ev
}
function useMacro() {
  const [ev, setEv] = useState([])
  useEffect(() => { get('/api/macro').then(j => setEv(j.events || [])).catch(() => {}) }, [])
  return ev
}
// eventi macro USA nelle 24 ore dopo il setup (o da adesso, se il setup è ancora aperto)
const MACRO_H = 24
function macroFor(macro, t) {
  const from = Math.max(t, Date.now() - 3600000)
  return macro.filter(e => e.t >= from && e.t <= from + MACRO_H * 3600000)
}
const macroWhen = e => new Date(e.t).toLocaleString('it-CH', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayOf = t => new Date(t).toISOString().slice(0, 10)
function newsFor(earnings, symbol, t) {
  const from = dayOf(t), to = dayOf(t + 2 * 864e5)
  return earnings.filter(e => e.symbol === short(symbol) && e.date >= from && e.date <= to)
}

function Grade({ t }) {
  if (!t?.grade) return null
  return (
    <details className="rg-why">
      <summary><span className={gradeCls(t.grade)}>voto {t.grade}</span> <span className="note">perché?</span></summary>
      <ul className="rg-reasons">
        {t.reasons.map((r, i) => <li key={i}><b className={r.pts > 0 ? 'up' : r.pts < 0 ? 'down' : 'muted'}>{r.pts > 0 ? `+${r.pts}` : r.pts}</b> {r.txt}</li>)}
      </ul>
      <p className="note">Punti: 4 o più = A, 2–3 = B, meno = C. Un range o un falso breakout su un livello settimanale vale 2 punti.</p>
    </details>
  )
}

function Targets({ t }) {
  return (
    <div className="rg-levels mono">
      {t.targets.map((x, i) => (
        <span key={i}>{t.targets.length > 1 ? `T${i + 1}` : 'Target'} · {Math.round(x.frac * 100)}% <b className="up">{fmtPrice(x.p)}</b> <i>{x.why} · R:R {t.rrs[i].toFixed(1)}</i></span>
      ))}
    </div>
  )
}

function RiskCalc({ entry, stop, limit = true }) {
  const [v, setV] = useState(() => ({ capital: 300, pct: 1, ...load('rangeRisk', {}) }))
  const set = p => setV(x => { const n = { ...x, ...p }; save('rangeRisk', n); return n })
  const cap = +v.capital, pct = +v.pct
  const dist = Math.abs(entry - stop)
  const riskU = cap * pct / 100
  const qty = dist > 0 ? riskU / dist : null
  const notional = qty ? qty * entry : null
  const lev = notional && cap > 0 ? notional / cap : null
  const fees = notional ? notional * ((limit ? FEES.maker : FEES.taker) + FEES.taker) / 100 : null
  return (
    <div className="rg-calc">
      <div className="row" style={{ gap: 8 }}>
        <label className="field" style={{ flex: 1 }}><span className="lab" style={{ fontSize: 10 }}>Capitale</span><div className="input-suffix"><input type="number" inputMode="decimal" value={v.capital} onChange={e => set({ capital: e.target.value })} /><span>USDT</span></div></label>
        <label className="field" style={{ flex: 1 }}><span className="lab" style={{ fontSize: 10 }}>Rischio</span><div className="input-suffix"><input type="number" inputMode="decimal" step="0.1" value={v.pct} onChange={e => set({ pct: e.target.value })} /><span>%</span></div></label>
      </div>
      <div className="rg-levels mono" style={{ marginTop: 6 }}>
        <span>posizione <b>{fmtU(notional)} USDT</b> <i>{qty ? `${qty.toPrecision(4)} unità` : ''}</i></span>
        <span>leva necessaria <b>{lev ? `${Math.max(1, Math.ceil(lev))}x` : '—'}</b> <i>con tutto il capitale come margine</i></span>
        <span>perdita se scatta lo stop <b className="down">{fmtU(riskU + (fees || 0))} USDT</b> <i>{fmtU(riskU)} + commissioni {fmtU(fees)}</i></span>
        <span>stop a <b>{(dist / entry * 100).toFixed(2)}%</b> <i>dall'entrata</i></span>
      </div>
      <p className="note">Patrick rischia al massimo l'1% per trade. Un trade dura di solito da 4 ore a 3 giorni. Lo stop non si allarga mai.</p>
    </div>
  )
}

const costCls = (v, max) => (v > max ? 'down' : v <= max / 2 ? 'up' : 'sec')
function CostLine({ t, max }) {
  if (t?.costPct === undefined) return null
  return (
    <>
      <span>costi Bitunix <b className={costCls(t.costPct, max)}>{t.costPct.toFixed(0)}% del rischio</b> <i>{t.valid ? 'valido' : t.rrOk ? 'oltre la soglia: non valido' : 'non valido'} · soglia {max}%{t.variant === 'limite' || t.kind === 'range' ? ' · entrata limite 0,02%' : ' · entrata a mercato 0,06%'}, stop 0,06%</i></span>
      <span>costi future (tipo IBKR) <b className={costCls(t.costPctFut, max)}>{t.costPctFut.toFixed(0)}% del rischio</b> <i>{t.validFut ? 'valido' : 'non valido'} con questi costi</i></span>
    </>
  )
}
function NetLine({ t }) {
  if (t?.R === null || t?.R === undefined) return null
  return <span>risultato <b className={t.R >= 0 ? 'up' : 'down'}>{fmtR(t.R)} lordo</b> <i>netto Bitunix {fmtR(t.Rnet)} · netto future {fmtR(t.RnetFut)}</i></span>
}

function MacroWarn({ macro, t }) {
  const list = macroFor(macro, t)
  if (!list.length) return null
  return <div className="warn">Notizie macro USA nelle {MACRO_H} ore successive: {list.slice(0, 3).map(e => `${e.title} (${macroWhen(e)})`).join(' · ')}. Patrick non tiene posizioni durante le notizie forti.</div>
}

function SetupBox({ st, big, earnings, symbol, macro = [], maxCost }) {
  if (!st) return null
  const mk = st.market
  const news = newsFor(earnings, symbol, st.at)
  return (
    <div className={`rg-setup ${st.side > 0 ? 'long' : 'short'} ${big ? 'big' : ''}`}>
      <div className="row">
        <b className={st.side > 0 ? 'up' : 'down'}>{st.side > 0 ? 'LONG' : 'SHORT'} · falso breakout verso {st.side > 0 ? 'il basso' : 'l\'alto'}</b>
        <span className={`pill ${st.valid ? (st.side > 0 ? 'long' : 'short') : 'closed'}`}>{st.valid ? 'valido' : 'non valido'}</span>
      </div>
      <div className="rg-tags">
        <Grade t={st} />
        <span className="pill neutral">{st.withImpulse ? 'nella direzione dell\'impulso' : 'contro l\'impulso'} ({st.type})</span>
        <span className={`note ${fitCls(st.fit)}`}>trend 4h {st.fit}{st.trend ? ` (${TREND[st.trend]})` : ''}</span>
        {st.invalid && <span className="note down">{st.invalid}</span>}
      </div>
      {st.status !== 'scaduto' && st.R == null && <MacroWarn macro={macro} t={st.at} />}
      {news.length > 0 && <div className="warn">Trimestrale di {news.map(e => `${e.symbol} il ${e.date}`).join(', ')}: Patrick non tiene posizioni durante le notizie forti.</div>}
      <div className="rg-levels mono">
        <span>entrata limite sul bordo <b>{fmtPrice(st.entry)}</b> <i>R:R {st.rr.toFixed(1)} · {st.status}{st.why ? ` (${st.why})` : ''}</i></span>
        {mk && <span>oppure a mercato alla chiusura <b>{fmtPrice(mk.entry)}</b> <i>R:R {mk.rr.toFixed(1)} · costi {mk.costPct.toFixed(0)}% del rischio{mk.costReject ? ' (oltre la soglia)' : ''} · stop {fmtPrice(mk.stop)} · {mk.status}</i></span>}
        <CostLine t={st} max={maxCost} />
        <NetLine t={st} />
        <span>stop <b className="down">{fmtPrice(st.stop)}</b> <i>oltre l'estremo del falso breakout</i></span>
        <span>se arrivano tutti i target <b className="up">{fmtR(st.rrAll)}</b> <i>un terzo a ogni target</i></span>
      </div>
      <Targets t={st} />
      <div className="note">Dopo T1 lo stop va a pareggio. Dalle {when(st.at)}{st.openR !== undefined ? ` · ora ${fmtR(st.openR)}` : ''}</div>
      {big && <RiskCalc entry={st.entry} stop={st.stop} />}
    </div>
  )
}

function AltTrade({ t, label }) {
  if (!t) return null
  if (t.entry === undefined) return <div className="note">{label}: {t.dir > 0 ? 'sopra' : 'sotto'} · {t.status}{t.trigger ? ` (entrata oltre ${fmtPrice(t.trigger)})` : ''}.</div>
  return (
    <div className="note mono rg-alt-row">
      {label}: <b className={t.side > 0 ? 'up' : 'down'}>{t.side > 0 ? 'long' : 'short'}</b> {fmtPrice(t.entry)} · stop {fmtPrice(t.stop)} · {t.targets.map((x, i) => `${Math.round(x.frac * 100)}% a ${fmtPrice(x.p)}`).join(', ')} · R:R {t.rr.toFixed(1)} · costi {t.costPct.toFixed(0)}% del rischio con Bitunix{t.costReject ? ' (oltre la soglia: non valido)' : ''}, {t.costPctFut.toFixed(0)}% con il future · voto {t.grade} · {t.status}{t.R !== null && t.R !== undefined ? ` ${fmtR(t.R)} lordo, netto ${fmtR(t.Rnet)} Bitunix e ${fmtR(t.RnetFut)} future` : ''}
      {t.alsoShort ? ` · oppure short ${fmtPrice(t.alsoShort.entry)} stop ${fmtPrice(t.alsoShort.stop)} target ${fmtPrice(t.alsoShort.target)}` : ''}
    </div>
  )
}

function RangeCard({ rg, earnings, symbol, macro, maxCost }) {
  const g = glowFor(rg)
  return (
    <div className={`rsi-card rg-card ${g.pulse ? 'pulse' : ''}`} style={g.style}>
      <div className="row">
        <b className="rsi-tf">{rg.type === 'P' ? 'P · impulso al rialzo' : 'B · impulso al ribasso'}</b>
        <span className={`pill ${rg.state.startsWith('setup pronto') ? (rg.lastSetup.side > 0 ? 'long' : 'short') : rg.state === 'valido' ? 'neutral' : 'closed'}`}>{rg.state}</span>
      </div>
      <div className="rsi-vals mono">
        <span>alto <b>{Number.isFinite(rg.top) ? fmtPrice(rg.top) : '—'}</b></span><span>basso <b>{Number.isFinite(rg.bottom) ? fmtPrice(rg.bottom) : '—'}</b></span>
        <span>tocchi <b>{rg.touchUp}↑ {rg.touchDn}↓</b></span>
      </div>
      <div className="note" style={{ marginTop: 4 }}>
        impulso {fmtPrice(rg.imp.from)} → {fmtPrice(rg.imp.to)} ({rg.imp.strength.toFixed(1)}× ATR, non si opera) · {rg.validAt ? `valido dalle ${when(rg.validAt)}` : 'non ancora valido'}{rg.fakeouts.length ? ` · falsi breakout ${rg.fakeouts.length}` : ''}
      </div>
      {rg.strong && <div className="rg-tags"><span className="pill rg-strong">su livello settimanale: {rg.strong.map(x => `${x.name} ${fmtPrice(x.p)}`).join(', ')}</span></div>}
      {rg.lastSetup && ['setup pronto', 'setup in corso', 'falso breakout in corso', 'setup scaduto'].includes(rg.state) && <SetupBox st={rg.lastSetup} earnings={earnings} symbol={symbol} macro={macro} maxCost={maxCost} />}
      {rg.alt && (
        <details className="rg-alt">
          <summary className="note">Altri due modi di operare questo range (meno importanti)</summary>
          <AltTrade t={rg.alt.inside} label="Range trade (limite sul bordo, tutto fuori sul bordo opposto)" />
          <AltTrade t={rg.alt.breakout} label="Breakout con conferma (chiusura fuori, ritorno sul bordo, rottura dell'estremo della candela di breakout; 30% al primo target, il resto corre)" />
          {!rg.alt.breakout && <div className="note">Breakout con conferma: nessuna chiusura fuori dal range finora.</div>}
        </details>
      )}
    </div>
  )
}

function Settings({ params, setParams }) {
  const [draft, setDraft] = useState(() => ({ ...params }))
  useEffect(() => setDraft({ ...params }), [params])
  const bad = k => { const v = +draft[k], [lo, hi] = LIMITS[k]; return !(Number.isFinite(v) && v >= lo && v <= hi) }
  const apply = () => { if (!SETTINGS_INFO.some(([k]) => bad(k))) setParams(cleanRangeSettings(draft)) }
  const isDefault = Object.entries(RANGE_DEFAULTS).every(([k, v]) => params[k] === v)
  return (
    <details className="card" style={{ padding: 12 }}>
      <summary className="row"><span className="lab">Impostazioni del riconoscimento</span><span className="mono muted" style={{ fontSize: 11 }}>{params.impulseAtr}×ATR · {params.minTouches} tocchi · {params.minHours}h · R:R {params.minRR} · costi {params.maxCost}%</span></summary>
      {SETTINGS_INFO.map(([k, label, unit, help]) => (
        <div key={k} className="rg-set">
          <label className="field">
            <span className="lab" style={{ fontSize: 10 }}>{label}</span>
            <div className="input-suffix"><input type="number" inputMode="decimal" step="any" min={LIMITS[k][0]} max={LIMITS[k][1]} value={draft[k]} style={bad(k) ? { color: '#FF5C7A' } : undefined}
              onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} onBlur={apply} onKeyDown={e => e.key === 'Enter' && apply()} /><span>{unit}</span></div>
          </label>
          <p className="note">{help} <span className="muted">(da {LIMITS[k][0]} a {LIMITS[k][1]}, partenza {RANGE_DEFAULTS[k]})</span></p>
        </div>
      ))}
      <div className="row" style={{ marginTop: 6 }}>
        <span className="note">Salvate in questo browser. Gli avvisi push usano le impostazioni del momento in cui li attivi; il registro usa sempre quelle di partenza.</span>
        {!isDefault && <button className="chip" onClick={() => setParams({ ...RANGE_DEFAULTS })}>Valori di partenza</button>}
      </div>
    </details>
  )
}

function AlertToggle({ symbol, params }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    (async () => {
      const sub = await currentSubscription().catch(() => null)
      if (!sub) return setState({ noPush: true })
      try { const j = await get(`/api/range/alerts?endpoint=${encodeURIComponent(sub.endpoint)}`); setState({ sub, symbols: j.symbols, minGrade: j.minGrade || 'C', subscribed: j.subscribed }) } catch (e) { setState({ error: e.message }) }
    })()
  }, [])
  if (state.loading) return null
  if (state.noPush) return <p className="note">Avvisi push: attiva prima le notifiche in Impostazioni, poi potrai sceglierli per ogni titolo.</p>
  if (state.error || !state.subscribed) return <p className="note">Avvisi push non disponibili: {state.error || 'iscrizione non trovata, riattiva le notifiche in Impostazioni'}</p>
  const on = state.symbols.includes(symbol)
  const send = async (symbols, minGrade) => {
    try { const j = await post('/api/range/alerts', { endpoint: state.sub.endpoint, symbols, settings: params, minGrade }); setState(s => ({ ...s, symbols: j.symbols, minGrade: j.minGrade, msg: null })) } catch (e) { setState(s => ({ ...s, msg: e.message })) }
  }
  return (
    <>
      <label className="toggle">
        <span style={{ fontSize: 13 }}>Avvisi push per {short(symbol)}: range valido e setup pronto<br /><span className="note">{state.symbols.length ? `attivi su ${state.symbols.map(short).join(', ')}` : 'nessun titolo'} · al massimo 8 · controllo ogni 15 minuti{state.msg ? ` · ${state.msg}` : ''}</span></span>
        <input type="checkbox" checked={on} onChange={() => send(on ? state.symbols.filter(s => s !== symbol) : [...state.symbols, symbol], state.minGrade)} />
      </label>
      <div className="row" style={{ marginTop: 6 }}>
        <span className="note">Avvisa dei setup con voto almeno</span>
        <div className="chips">{GRADES.map(g => <button key={g} className={`chip ${state.minGrade === g ? 'active' : ''}`} disabled={!state.symbols.length} onClick={() => send(state.symbols, g)}>{g}</button>)}</div>
      </div>
    </>
  )
}

// ---------- Registro (server) e statistiche ----------
const validWith = (b, f) => (b && f ? 'tutti e due' : b ? 'Bitunix' : f ? 'future' : 'nessuno')
const SCEN = { bx: { label: 'Bitunix', valid: r => r.valid, net: 'r_net', fees: 'fees_r' }, fut: { label: 'Future (tipo IBKR)', valid: r => r.valid_fut, net: 'r_net_fut', fees: 'fees_r_fut' } }
const doneOf = (rows, sc) => rows.filter(r => r.final && r[SCEN[sc].net] !== null && r[SCEN[sc].net] !== undefined)
function streak(rows, net) {
  let best = 0, cur = 0
  for (const r of rows.slice().sort((a, b) => (a.exit_at || 0) - (b.exit_at || 0))) { if (r[net] < 0) { cur++; best = Math.max(best, cur) } else cur = 0 }
  return best
}
// riga di totale: per ogni scenario, sui trade validi con quei costi e conclusi
function Totals({ rows }) {
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="tbl">
        <thead><tr><th>Totale</th><th>Trade conclusi</th><th>R lordo</th><th>R netto</th><th>In commissioni</th></tr></thead>
        <tbody>
          {Object.entries(SCEN).map(([k, sc]) => {
            const d = doneOf(rows.filter(sc.valid), k)
            const g = d.reduce((x, r) => x + r.r_gross, 0), nt = d.reduce((x, r) => x + r[sc.net], 0), fe = d.reduce((x, r) => x + (r[sc.fees] || 0), 0)
            return (
              <tr key={k}>
                <td>validi con {sc.label}</td><td>{d.length}</td>
                <td className={g > 0 ? 'up' : g < 0 ? 'down' : ''}>{d.length ? fmtR(g) : '—'}</td>
                <td className={nt > 0 ? 'up' : nt < 0 ? 'down' : ''}>{d.length ? fmtR(nt) : '—'}</td>
                <td className="down">{d.length ? fmtR(-fe) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
function StatsTable({ title, rows, keyOf, sc }) {
  const net = SCEN[sc].net
  const groups = new Map()
  for (const r of rows) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r) }
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="tbl">
        <thead><tr><th>{title}</th><th>Proposti</th><th>Eseguiti</th><th>Vinti</th><th>R medio</th><th>R totale</th></tr></thead>
        <tbody>
          {[...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => {
            const done = doneOf(list, sc)
            const tot = done.reduce((x, r) => x + r[net], 0)
            return (
              <tr key={k}>
                <td>{k}</td><td>{list.length}</td><td>{done.length}</td>
                <td>{done.length ? `${Math.round(done.filter(r => r[net] > 0).length / done.length * 100)}%` : '—'}</td>
                <td className={tot > 0 ? 'up' : tot < 0 ? 'down' : ''}>{done.length ? fmtR(tot / done.length) : '—'}</td>
                <td className={tot > 0 ? 'up' : tot < 0 ? 'down' : ''}>{done.length ? fmtR(tot) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
const statusText = r => (r.status === 'target' ? 'target raggiunto' : r.status === 'stop' ? 'stop toccato' : String(r.status).startsWith('pareggio dopo') ? `${r.status.slice(-2)}, poi pareggio` : r.status === 'scaduto' ? (r.data?.why || 'non eseguito') : r.status)
// Conto di prova: ogni setup valido del registro (con quello scenario di costo) diventa un trade che rischia la percentuale
// scelta del capitale di quel momento; la dimensione viene dallo stop, quindi il risultato in USDT = R netto × rischio in USDT.
function paperRun(rows, sc, cfg) {
  const S = SCEN[sc]
  const list = rows.filter(r => S.valid(r) && r.final && r.fill_at && r[S.net] !== null && r[S.net] !== undefined && r.created_at >= cfg.since)
    .sort((a, b) => a.fill_at - b.fill_at)
  const done = []
  for (const r of list) {
    const bal = cfg.capital + done.filter(d => d.exit <= r.fill_at).reduce((x, d) => x + d.pnl, 0)
    const risk = bal * cfg.riskPct / 100
    done.push({ exit: r.exit_at || r.fill_at, pnl: r[S.net] * risk, fees: (r[S.fees] || 0) * risk, R: r[S.net], gross: (r.r_gross || 0) * risk })
  }
  const sorted = done.slice().sort((a, b) => a.exit - b.exit)
  let b = cfg.capital
  const curve = [{ t: cfg.since, v: b }, ...sorted.map(d => ({ t: d.exit, v: (b += d.pnl) }))]
  return { n: done.length, balance: b, pnl: b - cfg.capital, R: done.reduce((x, d) => x + d.R, 0), fees: done.reduce((x, d) => x + d.fees, 0), gross: done.reduce((x, d) => x + d.gross, 0), curve, win: done.filter(d => d.pnl > 0).length }
}
function PaperRange({ reg, onSaved }) {
  const cfg = reg.paper
  const [cap, setCap] = useState(String(cfg?.capital ?? 300))
  const [risk, setRisk] = useState(String(cfg?.riskPct ?? 1))
  const [msg, setMsg] = useState(null)
  const authed = !!load('adminCode', '')
  const send = async resetIt => {
    try { await post('/api/range/paper', { capital: +cap, riskPct: +risk, reset: resetIt }); setMsg({ ok: true, text: resetIt ? 'Conto di prova azzerato: i trade contano da adesso' : 'Impostazioni salvate' }); onSaved() } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row"><span className="lab">Conto di prova · Range</span>{cfg && <span className="note mono">dal {when(cfg.since)}</span>}</div>
      {cfg ? (
        <div className="rg-paper">
          {Object.keys(SCEN).map(k => {
            const r = paperRun(reg.rows || [], k, cfg)
            return (
              <div key={k} className="tile">
                <div className="lab" style={{ fontSize: 10 }}>Costi {SCEN[k].label}</div>
                <div className="mono" style={{ fontSize: 12, lineHeight: 1.6, marginTop: 4 }}>
                  <div>capitale <b>{fmtU(r.balance)} USDT</b></div>
                  <div>risultato <b className={r.pnl >= 0 ? 'up' : 'down'}>{r.pnl >= 0 ? '+' : ''}{fmtU(r.pnl)} USDT</b> ({((r.balance / cfg.capital - 1) * 100).toFixed(1)}%)</div>
                  <div>in multipli del rischio <b className={r.R >= 0 ? 'up' : 'down'}>{fmtR(r.R)}</b> su {r.n} trade · vinti {r.win}</div>
                  <div className="muted">lordo {fmtU(r.gross)} · commissioni −{fmtU(r.fees)} USDT</div>
                </div>
                <Sparkline points={r.curve} height={50} />
              </div>
            )
          })}
        </div>
      ) : <p className="note">Conto di prova non ancora avviato: scegli capitale e rischio per trade e premi Avvia.</p>}
      {authed ? (
        <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
          <div className="input-suffix" style={{ flex: 1, minWidth: 120 }}><input type="number" inputMode="decimal" value={cap} onChange={e => setCap(e.target.value)} /><span>USDT</span></div>
          <div className="input-suffix" style={{ width: 110 }}><input type="number" inputMode="decimal" step="0.1" value={risk} onChange={e => setRisk(e.target.value)} /><span>% rischio</span></div>
          {cfg && <button className="chip" onClick={() => send(false)}>Salva</button>}
          <button className="chip" onClick={() => send(true)}>{cfg ? 'Azzera il conto' : 'Avvia'}</button>
        </div>
      ) : <p className="note">Per avviare, cambiare o azzerare il conto di prova serve il codice di controllo.</p>}
      {msg && <div className={`note ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 6 }}>{msg.text}</div>}
      <p className="note" style={{ marginTop: 6 }}>Ogni setup valido del registro (con quei costi) diventa un trade simulato che rischia il {cfg?.riskPct ?? risk}% del capitale di quel momento: la dimensione viene dalla distanza dello stop, il risultato è R netto × rischio in USDT. Nessun ordine vero. Azzerare fa ripartire il conto da adesso con il capitale scelto.</p>
    </div>
  )
}

// ---------- Titoli seguiti (scelta multipla, come l'universo di Apertura USA) ----------
const PERP = sym => ASSET_MAP[sym]?.perp || `${sym}USDT`
const GROUPS = [
  ['Crypto dello scanner', CRYPTO.map(a => a.perp)],
  ['Azioni di Apertura USA', STRATEGY_SYMBOLS.filter(x => ASSET_MAP[x]).map(PERP)],
]
function useRegistry() {
  const [reg, setReg] = useState(null)
  const refresh = () => get('/api/range/registry').then(setReg).catch(e => setReg({ rows: [], follow: { symbols: [] }, status: {}, error: e.message }))
  useEffect(() => { refresh(); const id = setInterval(refresh, 300000); return () => clearInterval(id) }, [])
  return [reg, refresh]
}
// value/onChange: scelta solo locale (Simulazione), non cambia i titoli seguiti dal vivo
function FollowPicker({ reg, refresh, value = null, onChange = null, title = 'Titoli seguiti dal registro' }) {
  const local = !!onChange
  const follow = reg?.follow?.symbols || []
  const [draft0, setDraft0] = useState(null)
  const draft = local ? value : draft0
  const setDraft = local ? (v => onChange(v || [])) : setDraft0
  const [pairs, setPairs] = useState(null)
  const [qq, setQ] = useState('')
  const [msg, setMsg] = useState(null)
  const authed = local || !!load('adminCode', '')
  const sel = local ? (value || []) : (draft || follow)
  useEffect(() => { get('/api/rsi/pairs').then(j => setPairs(new Set(j.symbols))).catch(() => {}) }, [])
  const avail = list => (pairs ? list.filter(x => pairs.has(x)) : list)
  const toggle = x => setDraft(sel.includes(x) ? sel.filter(y => y !== x) : [...sel, x])
  const q2 = qq.trim().toUpperCase()
  const found = q2 && pairs ? [...pairs].filter(x => x.includes(q2) && !sel.includes(x)).slice(0, 10) : []
  const saveIt = async () => {
    try { await post('/api/range/follow', { symbols: sel }); setDraft(null); setMsg({ ok: true, text: `${sel.length} titoli seguiti` }); refresh() } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  const changed = !local && !!draft && (draft.length !== follow.length || draft.some(x => !follow.includes(x)))
  const other = sel.filter(x => !GROUPS.some(([, l]) => l.includes(x)))
  return (
    <details className="card" style={{ padding: 12 }} open={local ? !sel.length : reg && !follow.length}>
      <summary className="row"><span className="lab">{title}</span><span className="note mono">{local ? sel.length : follow.length} titoli{changed ? ' · modifiche da salvare' : ''}</span></summary>
      {!authed && <p className="note">Per cambiare i titoli seguiti serve il codice di controllo (lo stesso della pagina Strategia).</p>}
      {GROUPS.map(([name, list0]) => {
        const list = avail(list0), on = list.filter(x => sel.includes(x)).length
        return (
          <div key={name} style={{ marginTop: 10 }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span className="lab" style={{ fontSize: 10 }}>{name} · {on}/{list.length}</span>
              <span className="chips">
                <button className="chip" disabled={!authed} onClick={() => setDraft([...new Set([...sel, ...list])])}>Tutti</button>
                <button className="chip" disabled={!authed} onClick={() => setDraft(sel.filter(x => !list.includes(x)))}>Nessuno</button>
              </span>
            </div>
            <div className="chips" style={{ marginTop: 4 }}>{list.map(x => <button key={x} className={`chip ${sel.includes(x) ? 'active' : ''}`} disabled={!authed} onClick={() => toggle(x)}>{short(x)}</button>)}</div>
          </div>
        )
      })}
      {other.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <span className="lab" style={{ fontSize: 10 }}>Altri futures</span>
          <div className="chips" style={{ marginTop: 4 }}>{other.map(x => <button key={x} className="chip active" disabled={!authed} onClick={() => toggle(x)}>{short(x)} ×</button>)}</div>
        </div>
      )}
      {authed && (
        <>
          <div className="field" style={{ marginTop: 10 }}><input value={qq} onChange={e => setQ(e.target.value)} placeholder="Aggiungi un altro future di Bitunix (es. XAU, SOL)" autoCapitalize="characters" autoCorrect="off" spellCheck={false} /></div>
          {found.length > 0 && <div className="chips" style={{ marginTop: 4 }}>{found.map(x => <button key={x} className="chip" onClick={() => { setDraft([...sel, x]); setQ('') }}>+ {short(x)}</button>)}</div>}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            {!local && <button className="btn" style={{ width: 'auto' }} disabled={!changed || sel.length > 200} onClick={saveIt}>Salva ({sel.length})</button>}
            {local && follow.length > 0 && <button className="chip" onClick={() => setDraft(follow)}>Come i titoli seguiti ({follow.length})</button>}
            {reg?.defaults?.length > 0 && <button className="chip" onClick={() => setDraft(reg.defaults)} title="BTC, ETH e le azioni di Apertura USA operabili via API">Selezione di default ({reg.defaults.length})</button>}
            {changed && <button className="chip" onClick={() => setDraft(null)}>Annulla</button>}
          </div>
        </>
      )}
      {sel.length > 200 && <div className="note down">Al massimo 200 titoli.</div>}
      {msg && <div className={`note ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 6 }}>{msg.text}</div>}
      {local ? <p className="note" style={{ marginTop: 6 }}>Scelta solo per la Simulazione: non cambia i titoli seguiti dal registro dal vivo.</p> : <p className="note" style={{ marginTop: 6 }}>Il server controlla i titoli seguiti ogni 15 minuti, a rotazione (prima quelli controllati da più tempo, circa 12–15 per giro): con molti titoli ognuno viene ripassato più di rado, ma i setup si registrano lo stesso perché a ogni controllo il server rilegge gli ultimi 6 giorni di candele. Un titolo aggiunto conta da quando lo aggiungi.</p>}
    </details>
  )
}

// ---------- Cronologia dei trade (dal più recente): registro dal vivo (Prova) o Simulazione, mai insieme ----------
const recognizedOf = rows => rows.filter(r => r.rr === null || r.rr === undefined || r.rr >= RANGE_DEFAULTS.minRR)
function Timeline({ title, rows, onOpen, note = null }) {
  const [sc, setSc] = useState(() => load('rangeRegScen', 'bx'))
  const [all, setAll] = useState(false)
  const S = SCEN[sc], net = S.net
  const list = recognizedOf(rows).slice().sort((a, b) => b.created_at - a.created_at)
  const shown = all ? list : list.slice(0, 50)
  const outcome = r => (!r.final || r[net] === null || r[net] === undefined ? (r.fill_at ? 'aperto' : 'non eseguito') : r[net] > 0 ? 'vinto' : 'perso')
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row"><span className="lab">{title}</span><span className="note mono">{list.length} setup</span></div>
      <div className="chips" style={{ marginTop: 6 }}>{Object.entries(SCEN).map(([k, v]) => <button key={k} className={`chip ${sc === k ? 'active' : ''}`} onClick={() => { setSc(k); save('rangeRegScen', k) }}>R netto {v.label}</button>)}</div>
      {list.length ? (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="tbl clickable">
            <thead><tr><th>Quando</th><th>Titolo</th><th>Lato</th><th>Tipo</th><th>Voto</th><th>Valido con</th><th>Esito</th><th>R netto</th><th>Risultato</th></tr></thead>
            <tbody>
              {shown.map(r => {
                const o = outcome(r)
                return (
                  <tr key={r.id} onClick={() => onOpen?.(r.symbol, r.id.slice(r.symbol.length + 1))} style={!S.valid(r) ? { opacity: 0.55 } : undefined}>
                    <td>{when(r.created_at)}</td><td><b>{short(r.symbol)}</b></td>
                    <td className={r.side > 0 ? 'up' : 'down'}>{r.side > 0 ? 'long' : 'short'}</td>
                    <td>{KIND_LABEL[r.kind]}{r.variant ? ` (${r.variant})` : ''} · {r.range_type}</td>
                    <td><span className={gradeCls(r.grade)}>{r.grade}</span></td>
                    <td>{validWith(r.valid, r.valid_fut)}</td>
                    <td>{statusText(r)}</td>
                    <td className={r[net] > 0 ? 'up' : r[net] < 0 ? 'down' : ''}>{r[net] !== null && r[net] !== undefined ? fmtR(r[net]) : '—'}</td>
                    <td className={o === 'vinto' ? 'up' : o === 'perso' ? 'down' : 'sec'}>{o}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="note">Nessun trade.</p>}
      {list.length > 50 && <button className="chip" style={{ marginTop: 6 }} onClick={() => setAll(x => !x)}>{all ? 'Solo gli ultimi 50' : `Tutti (${list.length})`}</button>}
      <p className="note" style={{ marginTop: 6 }}>Dal più recente. Righe chiare = non validi con i costi scelti (restano per vedere come sarebbero andati). Vinto o perso sul risultato netto con quei costi.{note ? ` ${note}` : ''}</p>
    </div>
  )
}

// ---------- Simulazione: backtest indipendente sullo storico (server/range-backtest.js) ----------
function Backtest({ reg, onOpen }) {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(() => load('rangeBtFrom', new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)))
  const [to, setTo] = useState(() => load('rangeBtTo', today))
  const [syms, setSymsRaw] = useState(() => load('rangeBtSyms', null))
  const setSyms = v => { setSymsRaw(v); save('rangeBtSyms', v) }
  const sel = syms || reg?.follow?.symbols || []
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [sc, setSc] = useState(() => load('rangeRegScen', 'bx'))
  const ctl = useRef(null)
  const run = async () => {
    setBusy(true); setErr(null); setRes(null); setProg('avvio')
    ctl.current = new AbortController()
    try {
      await postStream('/api/range/backtest', { symbols: sel, from, to }, {
        signal: ctl.current.signal,
        onEvent: ev => {
          if (ev.t === 'phase') setProg(ev.msg)
          if (ev.t === 'result') setRes(ev.result)
          if (ev.t === 'error') setErr(ev.error)
        },
      })
    } catch (e) { if (e.name !== 'AbortError') setErr(e.message) } finally { setBusy(false); setProg(null) }
  }
  const S = SCEN[sc], net = S.net
  const rows = res ? recognizedOf(res.rows) : []
  const valid = rows.filter(S.valid), done = doneOf(valid, sc), tot = done.reduce((x, r) => x + r[net], 0)
  return (
    <>
      <FollowPicker reg={reg} value={sel} onChange={setSyms} title="Titoli della Simulazione" />
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Simulazione sullo storico · indipendente da Prova e dal registro dal vivo</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <label className="field" style={{ flex: 1, minWidth: 130 }}><span className="lab" style={{ fontSize: 10 }}>Dal</span><input type="date" value={from} max={to} onChange={e => { setFrom(e.target.value); save('rangeBtFrom', e.target.value) }} /></label>
          <label className="field" style={{ flex: 1, minWidth: 130 }}><span className="lab" style={{ fontSize: 10 }}>Al</span><input type="date" value={to} max={today} onChange={e => { setTo(e.target.value); save('rangeBtTo', e.target.value) }} /></label>
        </div>
        {busy
          ? <button className="btn" style={{ marginTop: 8 }} onClick={() => ctl.current?.abort()}>Annulla</button>
          : <button className="btn" style={{ marginTop: 8 }} disabled={!sel.length} onClick={run}>Avvia la simulazione ({sel.length} titoli)</button>}
        {prog && <p className="note" style={{ marginTop: 6 }}>{prog}</p>}
        {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
        <p className="note" style={{ marginTop: 6 }}>Stessa logica del registro dal vivo, con le impostazioni di partenza: contesto 4h, profilo settimanale, range, tocchi, falso breakout, voto A/B/C, filtro costi ({RANGE_DEFAULTS.maxCost}% del rischio) e le stesse uscite. Il periodo si divide in blocchi come il controllo dal vivo (circa 6 giorni di candele a ogni giro). Candele di Bitunix archiviate a mesi; la prima volta vanno scaricate (fino a qualche minuto con molti titoli). Al massimo 120 titoli × mesi per volta. Nessun dato di Prova o del registro viene letto o cambiato.</p>
      </div>
      {res && (
        <>
          <div className="card" style={{ padding: 12 }}>
            <div className="row"><span className="lab">Risultato della Simulazione</span><span className="note mono">{new Date(res.from).toLocaleDateString('it-CH')} → {new Date(res.to - 1).toLocaleDateString('it-CH')} · {res.symbols.length} titoli</span></div>
            <div className="chips" style={{ marginTop: 6 }}>{Object.entries(SCEN).map(([k, v]) => <button key={k} className={`chip ${sc === k ? 'active' : ''}`} onClick={() => { setSc(k); save('rangeRegScen', k) }}>Costi {v.label}</button>)}</div>
            <div className="rg-levels mono" style={{ marginTop: 8 }}>
              <span>setup nel periodo <b>{rows.length}</b> <i>rischio/rendimento sufficiente</i></span>
              <span>validi con {S.label} <b>{valid.length}</b> <i>{rows.length - valid.length} scartati per i costi</i></span>
              <span>trade conclusi <b>{done.length}</b> <i>vinti {done.length ? Math.round(done.filter(r => r[net] > 0).length / done.length * 100) : 0}%</i></span>
              <span>risultato netto <b className={tot > 0 ? 'up' : tot < 0 ? 'down' : ''}>{done.length ? fmtR(tot) : '—'}</b> <i>{done.length ? `${fmtR(tot / done.length)} medio` : 'multipli del rischio'}</i></span>
              <span>serie di perdite più lunga <b className="down">{streak(done, net)}</b></span>
            </div>
            <Totals rows={rows} />
            <div className="lab" style={{ marginTop: 14 }}>Per titolo · validi con {S.label}</div>
            <StatsTable sc={sc} title="Titolo" rows={valid} keyOf={r => short(r.symbol)} />
            <StatsTable sc={sc} title="Tipo di trade" rows={valid} keyOf={r => `${KIND_LABEL[r.kind]}${r.variant ? ` (${r.variant})` : ''}`} />
            <StatsTable sc={sc} title="Voto" rows={valid} keyOf={r => r.grade || '—'} />
            {res.errors?.length > 0 && <p className="note down">{res.errors.join(' · ')}</p>}
            {Object.entries(res.perSym || {}).some(([, p]) => p.first > res.from) && <p className="note">Storico più corto del periodo: {Object.entries(res.perSym).filter(([, p]) => p.first > res.from).map(([k, p]) => `${short(k)} dal ${new Date(p.first).toLocaleDateString('it-CH')}`).join(', ')}.</p>}
          </div>
          <Timeline title="Cronologia dei trade · Simulazione" rows={res.rows} onOpen={sym => onOpen(sym)} note="Toccando un trade si apre il titolo (il grafico mostra solo gli ultimi 8 giorni)." />
        </>
      )}
    </>
  )
}

// ---------- Riepilogo su tutti i titoli seguiti ----------
function Overview({ reg, onOpen }) {
  const [sc, setSc] = useState(() => load('rangeRegScen', 'bx'))
  const [sort, setSort] = useState(() => load('rangeOvSort', 'setup'))
  if (!reg) return <div className="card note" style={{ padding: 12 }}>Carico il riepilogo…</div>
  const S = SCEN[sc], net = S.net
  const follow = reg.follow?.symbols || [], status = reg.status || {}
  const rows = (reg.rows || []).filter(r => r.rr === null || r.rr >= RANGE_DEFAULTS.minRR)
  const syms = [...new Set([...follow, ...rows.map(r => r.symbol)])]
  const per = syms.map(sym => {
    const mine = rows.filter(r => r.symbol === sym), valid = mine.filter(S.valid), done = doneOf(valid, sc)
    const tot = done.reduce((x, r) => x + r[net], 0)
    return { sym, st: status[sym], followed: follow.includes(sym), n: mine.length, valid: valid.length, done: done.length, win: done.filter(r => r[net] > 0).length, tot }
  })
  const rank = x => (x.st?.setup ? 3 : x.st?.ranges?.some(r => r.valid) ? 2 : x.st?.ranges?.length ? 1 : 0)
  const SORTS = { setup: (a, b) => rank(b) - rank(a) || b.n - a.n, r: (a, b) => b.tot - a.tot, n: (a, b) => b.n - a.n, name: (a, b) => a.sym.localeCompare(b.sym) }
  per.sort(SORTS[sort] || SORTS.setup)
  const allValid = rows.filter(S.valid), allDone = doneOf(allValid, sc), allTot = allDone.reduce((x, r) => x + r[net], 0)
  const checked = Object.values(status).map(x => x.at).filter(Boolean)
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row"><span className="lab">Riepilogo · tutti i titoli seguiti</span><span className="note mono">{follow.length} titoli</span></div>
      {reg.error && <div className="warn">{reg.error}</div>}
      <div className="chips" style={{ marginTop: 6 }}>{Object.entries(SCEN).map(([k, v]) => <button key={k} className={`chip ${sc === k ? 'active' : ''}`} onClick={() => { setSc(k); save('rangeRegScen', k) }}>Costi {v.label}</button>)}</div>
      <div className="rg-levels mono" style={{ marginTop: 8 }}>
        <span>adesso <b>{per.filter(x => x.st?.setup).length}</b> <i>titoli con un setup valido pronto o in corso</i></span>
        <span>range attivi <b>{per.filter(x => x.st?.ranges?.length).length}</b> <i>titoli con almeno un range</i></span>
        <span>setup registrati <b>{rows.length}</b> <i>validi con {S.label}: {allValid.length}</i></span>
        <span>trade conclusi <b>{allDone.length}</b> <i>vinti {allDone.length ? Math.round(allDone.filter(r => r[net] > 0).length / allDone.length * 100) : 0}%</i></span>
        <span>risultato netto <b className={allTot > 0 ? 'up' : allTot < 0 ? 'down' : ''}>{allDone.length ? fmtR(allTot) : '—'}</b> <i>somma in multipli del rischio</i></span>
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
        <span className="lab" style={{ fontSize: 10 }}>Ordina</span>
        <div className="chips">{[['setup', 'Situazione adesso'], ['r', 'Risultato'], ['n', 'Setup'], ['name', 'Nome']].map(([k, l]) => <button key={k} className={`chip ${sort === k ? 'active' : ''}`} onClick={() => { setSort(k); save('rangeOvSort', k) }}>{l}</button>)}</div>
      </div>
      {per.length ? (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="tbl clickable">
            <thead><tr><th>Titolo</th><th>Adesso</th><th>Trend 4h</th><th>Setup</th><th>Validi</th><th>Conclusi</th><th>Vinti</th><th>R netto</th><th>Controllato</th></tr></thead>
            <tbody>
              {per.map(x => {
                const st = x.st, su = st?.setup
                const nowTxt = su ? `${su.side > 0 ? 'long' : 'short'} ${su.grade} · ${su.status}` : st?.ranges?.length ? st.ranges.map(r => `range ${r.type}${r.valid ? ' valido' : ''}`).join(', ') : st?.error ? 'errore' : st ? '—' : 'in attesa'
                return (
                  <tr key={x.sym} onClick={() => onOpen(x.sym)} style={!x.followed ? { opacity: 0.55 } : undefined}>
                    <td><b>{short(x.sym)}</b></td>
                    <td className={su ? (su.side > 0 ? 'up' : 'down') : ''}>{nowTxt}{reg.hot?.[x.sym] && <div className="warn-text" style={{ color: '#F5B83D', fontSize: 11 }} title={reg.hot[x.sym].why}>⚡ {reg.hot[x.sym].why} · ricalcolo al prossimo giro</div>}</td>
                    <td className={st?.trend === 'up' ? 'up' : st?.trend === 'down' ? 'down' : 'sec'}>{st?.trend ? TREND[st.trend] : '—'}</td>
                    <td>{x.n}</td><td>{x.valid}</td><td>{x.done}</td>
                    <td>{x.done ? `${Math.round(x.win / x.done * 100)}%` : '—'}</td>
                    <td className={x.tot > 0 ? 'up' : x.tot < 0 ? 'down' : ''}>{x.done ? fmtR(x.tot) : '—'}</td>
                    <td className="sec">{st?.at ? when(st.at) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="note">Nessun titolo seguito: sceglili qui sopra.</p>}
      <p className="note" style={{ marginTop: 6 }}>Tocca un titolo per aprire il suo dettaglio (contesto, range, zone, setup sul grafico). "Adesso" = ultimo controllo del server con le impostazioni di partenza{checked.length ? `, l'ultimo ${when(Math.max(...checked))}` : ''}; "in attesa" = non ancora controllato; ⚡ = il controllo leggero di ogni minuto ha visto il prezzo vicino a un bordo del range o oltre un livello già noto: il titolo passa in prima fila per il prossimo ricalcolo completo (ogni 15 minuti). Righe chiare = titoli non più seguiti con setup ancora nel registro. Numeri del registro automatico, stesse regole e stessi costi.</p>
    </div>
  )
}

function Registry({ symbol, onOpen, reg, refresh, summary = false }) {
  const [msg, setMsg] = useState(null)
  const [sc, setSc] = useState(() => load('rangeRegScen', 'bx'))
  const [scope0, setScope] = useState(() => load('rangeRegScope', 'all'))
  const scope = summary ? 'all' : scope0
  const [showAll, setShowAll] = useState(false)
  const authed = !!load('adminCode', '')
  if (!reg) return <div className="card note" style={{ padding: 12 }}>Carico il registro…</div>
  const follow = reg.follow?.symbols || []
  const paperCard = <PaperRange reg={reg} onSaved={refresh} />
  const on = follow.includes(symbol)
  const toggle = async () => {
    try { await post('/api/range/follow', { symbols: on ? follow.filter(s => s !== symbol) : [...follow, symbol] }); setMsg(null); refresh() } catch (e) { setMsg(e.message) }
  }
  const S = SCEN[sc], net = S.net
  const rows = (reg.rows || []).filter(r => scope === 'all' || r.symbol === symbol)
  const recognized = rows.filter(r => r.rr === null || r.rr >= RANGE_DEFAULTS.minRR)
  const valid = recognized.filter(S.valid)
  const rejected = recognized.filter(r => !S.valid(r))
  const done = doneOf(valid, sc)
  const tot = done.reduce((x, r) => x + r[net], 0)
  const list = showAll ? recognized : recognized.slice(0, 40)
  return (
    <>
    {paperCard}
    <div className="card" style={{ padding: 12 }}>
      <div className="row"><span className="lab">Registro automatico · trade simulati</span><span className="note mono">{done.length ? `${done.length} conclusi · ${fmtR(tot)}` : ''}</span></div>
      <div className="warn">Sono trade simulati, non ordini veri: nessun ordine parte da questa pagina. Il server calcola come sarebbe andato ogni setup.</div>
      <p className="note" style={{ marginTop: 4 }}>
        Il server salva ogni setup riconosciuto sui titoli seguiti ({follow.length ? follow.map(short).join(', ') : 'nessuno'}), anche a pagina chiusa, ogni 15 minuti,
        con le impostazioni di partenza, e ne segue l'esito con due scenari di costo: Bitunix (limite {FEES.maker}%, a mercato e stop {FEES.taker}%) e future tipo IBKR ({RANGE_DEFAULTS.futFee}% per lato).
      </p>
      {summary ? null : authed
        ? <label className="toggle"><span style={{ fontSize: 13 }}>Segui {short(symbol)} nel registro <span className="note">(al massimo 200 titoli)</span></span><input type="checkbox" checked={on} onChange={toggle} /></label>
        : <p className="note">Per scegliere i titoli seguiti serve il codice di controllo (lo stesso della pagina Strategia).</p>}
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        {!summary && <div className="chips">{[['this', `Solo ${short(symbol)}`], ['all', 'Tutti i titoli']].map(([k, l]) => <button key={k} className={`chip ${scope === k ? 'active' : ''}`} onClick={() => { setScope(k); save('rangeRegScope', k) }}>{l}</button>)}</div>}
        <div className="chips">{Object.entries(SCEN).map(([k, v]) => <button key={k} className={`chip ${sc === k ? 'active' : ''}`} onClick={() => { setSc(k); save('rangeRegScen', k) }}>{v.label}</button>)}</div>
      </div>
      {msg && <div className="note down">{msg}</div>}
      {reg.error && <div className="warn">{reg.error}</div>}
      {!reg.error && !recognized.length && <p className="note">Ancora nessun setup registrato{scope === 'this' ? ` su ${short(symbol)}` : ''}: i primi arrivano quando sui titoli seguiti si forma un range con un falso breakout o un breakout.</p>}
      {recognized.length > 0 && (
        <>
          <div className="warn">Con pochi casi questi numeri non valgono ancora: servono almeno 30–50 trade conclusi per gruppo prima di trarre conclusioni.</div>
          <div className="rg-levels mono" style={{ marginTop: 8 }}>
            <span>setup riconosciuti <b>{recognized.length}</b> <i>rischio/rendimento sufficiente</i></span>
            <span>validi con {S.label} <b>{valid.length}</b> <i>{rejected.length} scartati per i costi</i></span>
            <span>trade conclusi <b>{done.length}</b> <i>entrata eseguita e uscita completa</i></span>
            <span>serie di perdite più lunga <b className="down">{streak(done, net)}</b></span>
          </div>
          <Totals rows={recognized} />
          <div className="lab" style={{ marginTop: 14 }}>Statistiche · validi con {S.label}</div>
          <StatsTable sc={sc} title="Tipo di trade" rows={valid} keyOf={r => `${KIND_LABEL[r.kind]}${r.variant ? ` (${r.variant})` : ''}`} />
          <StatsTable sc={sc} title="Range" rows={valid} keyOf={r => r.range_type} />
          <StatsTable sc={sc} title="Rispetto all'impulso" rows={valid} keyOf={r => (r.with_impulse ? 'nella direzione' : 'contro')} />
          <StatsTable sc={sc} title="Trend a 4 ore" rows={valid} keyOf={r => r.fit || '—'} />
          <StatsTable sc={sc} title="Voto" rows={valid} keyOf={r => r.grade || '—'} />
          {scope === 'all' && <StatsTable sc={sc} title="Titolo" rows={valid} keyOf={r => short(r.symbol)} />}
          {rejected.length > 0 && (
            <>
              <div className="lab" style={{ marginTop: 14 }}>Scartati per i costi con {S.label} (come sarebbero andati)</div>
              <StatsTable sc={sc} title="Tipo di trade" rows={rejected} keyOf={r => `${KIND_LABEL[r.kind]}${r.variant ? ` (${r.variant})` : ''}`} />
            </>
          )}
          <div className="lab" style={{ marginTop: 14 }}>Elenco dei trade simulati</div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="tbl clickable">
              <thead><tr><th>Titolo</th><th>Quando</th><th>Tipo</th><th>Lato</th><th>Voto</th><th>Costi Bitunix / future</th><th>Valido con</th><th>Esito</th><th>Lordo</th><th>Netto {S.label}</th></tr></thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id} onClick={() => onOpen(r.symbol, r.id.slice(r.symbol.length + 1))}>
                    <td>{short(r.symbol)}</td><td>{when(r.created_at)}</td><td>{KIND_LABEL[r.kind]}{r.variant ? ` (${r.variant})` : ''}</td>
                    <td className={r.side > 0 ? 'up' : 'down'}>{r.side > 0 ? 'long' : 'short'}</td>
                    <td><span className={gradeCls(r.grade)}>{r.grade}</span></td>
                    <td>{r.cost_pct != null ? `${r.cost_pct.toFixed(0)}%` : '—'} / {r.cost_pct_fut != null ? `${r.cost_pct_fut.toFixed(0)}%` : '—'}</td>
                    <td>{validWith(r.valid, r.valid_fut)}</td>
                    <td>{statusText(r)}</td>
                    <td className={r.r_gross > 0 ? 'up' : r.r_gross < 0 ? 'down' : ''}>{r.r_gross != null ? fmtR(r.r_gross) : '—'}</td>
                    <td className={r[net] > 0 ? 'up' : r[net] < 0 ? 'down' : ''}>{r[net] != null ? fmtR(r[net]) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recognized.length > 40 && <button className="chip" style={{ marginTop: 6 }} onClick={() => setShowAll(x => !x)}>{showAll ? 'Mostra solo gli ultimi 40' : `Mostra tutti (${recognized.length})`}</button>}
          <p className="note" style={{ marginTop: 6 }}>Tocca un trade per aprire il suo titolo con il setup disegnato sul grafico (se è negli ultimi 8 giorni, quelli che la pagina scarica).</p>
        </>
      )}
    </div>
    </>
  )
}

export default function Range() {
  const [custom, setCustomRaw] = useState(() => load('rangeCustom', []).filter(s => typeof s === 'string'))
  const [symbol, setSymbolRaw] = useState(() => load('rangeSymbol', FEATURED[0]))
  const [params, setParamsRaw] = useState(() => cleanRangeSettings(load('rangeParams', RANGE_DEFAULTS)))
  const [focusId, setFocusId] = useState(null)
  const [mode, setMode] = useStrategyMode('range', 'paper')
  const setCustom = v => { setCustomRaw(v); save('rangeCustom', v) }
  const setSymbol = s => { setSymbolRaw(s); save('rangeSymbol', s); setFocusId(null) }
  const setParams = p => { setParamsRaw(p); save('rangeParams', p) }
  const data = useBars(symbol)
  const earnings = useEarnings()
  const macro = useMacro()

  const now = Date.now()
  const closed = tf => data[tf]?.bars?.filter(b => b.t + TF_MS[tf] <= now) || null
  const b15 = data['15m']?.bars, c15 = useMemo(() => closed('15m'), [data['15m']]) // eslint-disable-line react-hooks/exhaustive-deps
  const c4 = useMemo(() => closed('4h'), [data['4h']]) // eslint-disable-line react-hooks/exhaustive-deps
  const b1h = data['1h']?.bars || []
  const tr = useMemo(() => (c4?.length ? trend4h(c4) : null), [c4])
  const res = useMemo(() => (c15?.length > 50 ? analyze(c15, params, { bars1h: b1h, bars4h: c4 || [] }) : null), [c15, params, b1h, c4])
  const wp = useMemo(() => (b1h.length ? weekProfiles(b1h, now) : null), [b1h]) // eslint-disable-line react-hooks/exhaustive-deps
  const active = res ? res.ranges.filter(r => r.active).reverse() : []
  const past = res ? res.trades.filter(t => t.rrOk).slice().reverse() : []
  const invalidN = res ? res.setups.filter(s => !s.rrOk).length : 0
  const chartRef = useRef(null)
  const [reg, refreshReg] = useRegistry()
  const [view, setViewRaw] = useState(() => load('rangeView', 'all'))
  const setView = v => { setViewRaw(v); save('rangeView', v) }
  const openTrade = (sym, id) => { setSymbolRaw(sym); save('rangeSymbol', sym); setFocusId(id); setView('detail'); setTimeout(() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }
  const openSymbol = sym => { setSymbol(sym); setView('detail'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const focus = (res && focusId && res.trades.find(s => s.id === focusId)) || active.map(r => r.lastSetup).find(s => s && s.valid && ['pronto', 'in corso'].includes(s.status)) || null
  const err = data['15m']?.error || data['4h']?.error

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <div className="lab">Strategia · Range P e B (metodo di Patrick Nill)</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{view === 'all' ? 'Tutti i titoli seguiti' : <>{short(symbol)}{NAMES[symbol] ? <span className="sec" style={{ fontSize: 14, fontWeight: 600 }}> · {NAMES[symbol]}</span> : null}</>}</div>
        </div>
        <span className="note mono">{view === 'detail' && b15?.length ? fmtPrice(b15.at(-1).c) : ''}</span>
      </div>
      <StrategyTabs mode={mode} setMode={setMode} />
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>Riepilogo</button>
        <button className={view === 'detail' ? 'on' : ''} onClick={() => setView('detail')}>Dettaglio · {short(symbol)}</button>
      </div>
      {view === 'all' ? (
        <>
          {mode !== 'sim' && <FollowPicker reg={reg} refresh={refreshReg} />}
          {mode !== 'sim' && <Overview reg={reg} onOpen={openSymbol} />}
          {mode === 'paper' && reg && <Timeline title="Cronologia dei trade · registro dal vivo (Prova)" rows={reg.rows || []} onOpen={openTrade} />}
          {mode === 'paper' && reg && <Registry summary symbol={symbol} onOpen={openTrade} reg={reg} refresh={refreshReg} />}
          {mode === 'sim' && <Backtest reg={reg} onOpen={openSymbol} />}
          {mode === 'live' && <ComingSoon what="Ordini veri della strategia Range" />}
        </>
      ) : <>
      <SymbolPicker symbol={symbol} setSymbol={setSymbol} custom={custom} setCustom={setCustom} featured={FEATURED} />
      {err && <div className="warn">Dati non disponibili: {err}</div>}

      <div className="card" style={{ padding: 12 }}>
        <div className="row">
          <span className="lab">Contesto · 4 ore</span>
          <span className={`pill ${tr?.trend === 'up' ? 'long' : tr?.trend === 'down' ? 'short' : 'neutral'}`}>{tr?.trend ? `trend ${TREND[tr.trend]}` : '…'}</span>
        </div>
        {c4?.length > 0 && tr && <TrendChart key={symbol} bars={c4.slice(-90)} ema50={tr.e50.slice(-90)} />}
        <p className="note" style={{ marginTop: 6 }}>Solo contesto (conta nel voto, non decide la direzione). Regola: media esponenziale a 50 candele da 4 ore (linea viola, circa 8 giorni). <b>Rialzista</b> se il prezzo è sopra la media e la media sale rispetto a 40 ore prima; <b>ribassista</b> se è sotto e la media scende; altrimenti <b>laterale</b>.{tr?.ema ? ` Ora: prezzo ${fmtPrice(tr.price)}, media ${fmtPrice(tr.ema)} (${tr.slope >= 0 ? '+' : ''}${tr.slope.toFixed(2)}% in 40 ore).` : ''}</p>
      </div>

      {wp && (wp.prev || wp.cur) && (
        <div className="card" style={{ padding: 12 }}>
          <span className="lab">Profilo settimanale</span>
          <div className="rg-levels mono" style={{ marginTop: 6 }}>
            {[['Settimana in corso', wp.cur], ['Settimana precedente', wp.prev]].map(([name, p]) => p && (
              <span key={name}>{name} <b>POC {fmtPrice(p.poc)}</b> <i>area di valore {fmtPrice(p.val)} – {fmtPrice(p.vah)}</i></span>
            ))}
          </div>
          <p className="note">I livelli chiave di Patrick: la parte alta (VAH) e bassa (VAL) dell'area di valore settimanale e il prezzo con più scambi (POC). Sul grafico: linee gialle piene per la settimana in corso, tratteggiate per la precedente; fasce gialle = zone con molto volume (il prezzo frena), fasce viola = zone con poco volume (il prezzo le attraversa in fretta).</p>
        </div>
      )}

      {res && (
        <div className="rsi-grid">
          {active.length ? active.map(rg => <RangeCard key={rg.id} rg={rg} earnings={earnings} symbol={symbol} macro={macro} maxCost={params.maxCost} />) : <div className="card note" style={{ padding: 12 }}>Nessun range attivo adesso: l'ultimo impulso non ha ancora formato un range, o il range è finito con un breakout. Patrick non opera l'impulso, solo il range che lo segue.</div>}
        </div>
      )}

      <div className="card" style={{ padding: 10 }} ref={chartRef}>
        <div className="row" style={{ marginBottom: 4 }}>
          <span className="lab">Decisione · 15 minuti</span>
          <span className="note">{res ? `${res.impulses.length} impulsi · ${res.ranges.filter(r => !r.dropped).length} range (${res.ranges.filter(r => r.validIdx !== null).length} validi) · ${res.ranges.filter(r => r.dropped).length} non validi · ${res.setups.length} falsi breakout` : 'Carico le candele…'}</span>
        </div>
        {b15?.length && res ? <RangeChart key={symbol} bars={b15} res={res} wp={wp} focus={focus} /> : <div className="empty" style={{ padding: '120px 10px' }}>{err || 'Carico le candele…'}</div>}
        <p className="note" style={{ marginTop: 6 }}>
          Linea spessa = impulso. Rettangolo verde = range P (dopo un impulso al rialzo), rosso = range B (al ribasso); tratteggiato finché non è valido, con i tocchi ↑ in alto e ↓ in basso; molto chiaro con la scritta "non valido" = consolidamento di almeno 2 ore che si è rotto prima di diventare valido o ha ritracciato troppo.
          Freccia "falso" = una candela ha chiuso fuori dal range e la successiva di nuovo dentro. Range passati più chiari = aree di valore.
          {focus ? ' Linee spesse: entrata, stop e target del setup in evidenza.' : ''} Pallini: com'è finito ogni falso breakout passato. Trascina per scorrere, pizzica per ingrandire.
        </p>
        {focus && (focus.kind === 'falso' ? <SetupBox st={focus.variant === 'mercato' ? res.setups.find(s => s.market?.id === focus.id) || focus : focus} big earnings={earnings} symbol={symbol} macro={macro} maxCost={params.maxCost} /> : <><AltTrade t={focus} label={KIND_LABEL[focus.kind]} /><MacroWarn macro={macro} t={focus.at} /><RiskCalc entry={focus.entry} stop={focus.stop} limit={focus.kind === 'range'} /></>)}
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="row"><span className="lab">Setup degli ultimi giorni</span></div>
        {past.length ? (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="tbl clickable">
              <thead><tr><th>Quando</th><th>Tipo</th><th>Range</th><th>Lato</th><th>Impulso</th><th>Voto</th><th>Entrata</th><th>Stop</th><th>Target</th><th>R:R</th><th>Costi Bitunix / future</th><th>Valido con</th><th>Trend 4h</th><th>Com'è finito</th><th>Lordo</th><th>Netto Bitunix</th><th>Netto future</th></tr></thead>
              <tbody>
                {past.map(s => (
                  <tr key={s.id} onClick={() => setFocusId(s.id === focusId ? null : s.id)} style={s.id === focus?.id ? { background: 'var(--surface-alt)' } : !s.valid && !s.validFut ? { opacity: 0.55 } : undefined}>
                    <td>{when(s.at)}</td><td>{kindName(s)}</td><td>{s.type}</td>
                    <td className={s.side > 0 ? 'up' : 'down'}>{s.side > 0 ? 'long' : 'short'}</td>
                    <td>{s.withImpulse ? 'a favore' : 'contro'}</td>
                    <td><span className={gradeCls(s.grade)}>{s.grade}</span></td>
                    <td>{fmtPrice(s.entry)}</td><td>{fmtPrice(s.stop)}</td><td>{s.targets.map(x => fmtPrice(x.p)).join(' / ')}</td>
                    <td>{s.rr.toFixed(1)}</td>
                    <td>{s.costPct.toFixed(0)}% / {s.costPctFut.toFixed(0)}%</td>
                    <td>{validWith(s.valid, s.validFut)}</td>
                    <td className={fitCls(s.fit)}>{s.fit}</td>
                    <td>{s.status === 'target' ? 'target raggiunto' : s.status === 'stop' ? 'stop toccato' : String(s.status).startsWith('pareggio dopo') ? `${s.status.slice(-2)}, poi pareggio` : s.status === 'scaduto' ? (s.why || 'scaduto') : s.status}</td>
                    <td className={s.R > 0 ? 'up' : s.R < 0 ? 'down' : 'sec'}>{s.R !== null && s.R !== undefined ? fmtR(s.R) : s.openR !== undefined ? `${fmtR(s.openR)} aperto` : '—'}</td>
                    <td className={s.Rnet > 0 ? 'up' : s.Rnet < 0 ? 'down' : 'sec'}>{s.Rnet !== undefined ? fmtR(s.Rnet) : '—'}</td>
                    <td className={s.RnetFut > 0 ? 'up' : s.RnetFut < 0 ? 'down' : 'sec'}>{s.RnetFut !== undefined ? fmtR(s.RnetFut) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="note">{res ? 'Nessun setup valido negli ultimi 8 giorni con queste impostazioni.' : '…'}</p>}
        {past.length > 0 && <Totals rows={past.map(t => ({ valid: t.valid, valid_fut: t.validFut, r_gross: t.R ?? null, r_net: t.Rnet ?? null, fees_r: t.feesR ?? null, r_net_fut: t.RnetFut ?? null, fees_r_fut: t.feesRFut ?? null, final: t.R !== null && t.R !== undefined }))} />}
        <p className="note" style={{ marginTop: 6 }}>
          Tocca un setup per disegnarlo sul grafico. Uscite secondo il tipo: falso breakout un terzo a ogni target (stop a pareggio dopo T1); range trade tutto sul bordo opposto; breakout con conferma 30% al primo target, il resto corre.
          Netto = con le commissioni di Bitunix o del future (tipo IBKR, {params.futFee}% per lato). "Valido con" dice con quali costi le commissioni restano sotto il {params.maxCost}% del rischio; le righe chiare non sono valide con nessuno dei due, e restano per vedere come sarebbero andate. {invalidN ? `Altri ${invalidN} falsi breakout hanno un rischio/rendimento sotto ${params.minRR}. ` : ''}Sono pochi casi: servono per capire, non come statistica.
        </p>
      </div>

      {mode === 'paper' && (reg ? <Registry symbol={symbol} onOpen={openTrade} reg={reg} refresh={refreshReg} /> : <div className="card note" style={{ padding: 12 }}>Carico il registro…</div>)}
      {mode === 'sim' && <div className="card note" style={{ padding: 12 }}>La Simulazione sullo storico (periodo e titoli a scelta) è nella vista Riepilogo.</div>}
      {mode === 'live' && <ComingSoon what="Ordini veri della strategia Range" />}
      <Settings params={params} setParams={setParams} />
      <div className="card" style={{ padding: 12 }}><AlertToggle symbol={symbol} params={params} /></div>
      </>}
      <p className="note">
        Candele di Bitunix: 15 minuti degli ultimi 8 giorni (aggiornate ogni minuto), 1 ora per il profilo settimanale, 4 ore per il contesto. Si usano solo candele chiuse.
        Falso breakout verso il basso con rientro = long, verso l'alto = short, nelle P e nelle B, con qualunque trend. Entrata limite sul bordo o a mercato alla chiusura della candela di rientro;
        stop appena oltre l'estremo del falso breakout (+0,1 ATR, almeno mezzo ATR dall'entrata). Contro l'impulso: T1 bordo opposto, poi verso l'origine dell'impulso;
        nella direzione dell'impulso: T1 bordo opposto, poi le aree di valore successive o la proiezione 1:1 dell'impulso; senza riferimenti, 2 volte il rischio.
        Commissioni: un setup è valido solo se andata e ritorno costano al massimo il {params.maxCost}% del rischio. Notizie: eventi macro USA (Fed, inflazione, occupazione, PIL) del Calendario nelle 24 ore successive, per tutti i titoli; per le azioni anche le trimestrali. Regole complete in claude/strategia-range-pb-patrick.md. Solo analisi: nessun ordine.
      </p>
    </div>
  )
}
