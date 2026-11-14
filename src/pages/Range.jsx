// Pagina Range: riconoscimento automatico dei range P e B (metodo di Patrick Nill) per controllarli a occhio.
// Solo analisi: nessun ordine. Regole in shared/range.js (le stesse del server: avvisi push e registro, server/range-alerts.js).
import { useEffect, useMemo, useRef, useState } from 'react'
import RangeChart, { TrendChart } from '../components/RangeChart.jsx'
import { SymbolPicker, NAMES } from './Rsi.jsx'
import { get, post, fmtPrice } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { currentSubscription } from '../lib/push.js'
import { analyze, trend4h, weekProfiles, cleanRangeSettings, RANGE_DEFAULTS, LIMITS, FEES, GRADES, KIND_LABEL } from '@shared/range.js'

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

function SetupBox({ st, big, earnings, symbol }) {
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
      {news.length > 0 && <div className="warn">Trimestrale di {news.map(e => `${e.symbol} il ${e.date}`).join(', ')}: Patrick non tiene posizioni durante le notizie forti.</div>}
      <div className="rg-levels mono">
        <span>entrata limite sul bordo <b>{fmtPrice(st.entry)}</b> <i>R:R {st.rr.toFixed(1)} · {st.status}{st.why ? ` (${st.why})` : ''}</i></span>
        {mk && <span>oppure a mercato alla chiusura <b>{fmtPrice(mk.entry)}</b> <i>R:R {mk.rr.toFixed(1)} · stop {fmtPrice(mk.stop)} · {mk.status}</i></span>}
        <span>stop <b className="down">{fmtPrice(st.stop)}</b> <i>oltre l'estremo del falso breakout</i></span>
        <span>se arrivano tutti i target <b className="up">{fmtR(st.rrAll)}</b> <i>un terzo a ogni target</i></span>
      </div>
      <Targets t={st} />
      <div className="note">Dopo T1 lo stop va a pareggio. Dalle {when(st.at)}{st.openR !== undefined ? ` · ora ${fmtR(st.openR)}` : ''}{st.R !== null && st.R !== undefined ? ` · risultato ${fmtR(st.R)} (con commissioni ${fmtR(st.Rnet)})` : ''}</div>
      {big && <RiskCalc entry={st.entry} stop={st.stop} />}
    </div>
  )
}

function AltTrade({ t, label }) {
  if (!t) return null
  if (t.entry === undefined) return <div className="note">{label}: {t.dir > 0 ? 'sopra' : 'sotto'} · {t.status}{t.trigger ? ` (entrata oltre ${fmtPrice(t.trigger)})` : ''}.</div>
  return (
    <div className="note mono rg-alt-row">
      {label}: <b className={t.side > 0 ? 'up' : 'down'}>{t.side > 0 ? 'long' : 'short'}</b> {fmtPrice(t.entry)} · stop {fmtPrice(t.stop)} · {t.targets.map((x, i) => `${Math.round(x.frac * 100)}% a ${fmtPrice(x.p)}`).join(', ')} · R:R {t.rr.toFixed(1)} · voto {t.grade} · {t.status}{t.R !== null && t.R !== undefined ? ` ${fmtR(t.R)}` : ''}
      {t.alsoShort ? ` · oppure short ${fmtPrice(t.alsoShort.entry)} stop ${fmtPrice(t.alsoShort.stop)} target ${fmtPrice(t.alsoShort.target)}` : ''}
    </div>
  )
}

function RangeCard({ rg, earnings, symbol }) {
  const g = glowFor(rg)
  return (
    <div className={`rsi-card rg-card ${g.pulse ? 'pulse' : ''}`} style={g.style}>
      <div className="row">
        <b className="rsi-tf">{rg.type === 'P' ? 'P · impulso al rialzo' : 'B · impulso al ribasso'}</b>
        <span className={`pill ${rg.state.startsWith('setup pronto') ? (rg.lastSetup.side > 0 ? 'long' : 'short') : rg.state === 'valido' ? 'neutral' : 'closed'}`}>{rg.state}</span>
      </div>
      <div className="rsi-vals mono">
        <span>alto <b>{fmtPrice(rg.top)}</b></span><span>basso <b>{Number.isFinite(rg.bottom) ? fmtPrice(rg.bottom) : '—'}</b></span>
        <span>tocchi <b>{rg.touchUp}↑ {rg.touchDn}↓</b></span>
      </div>
      <div className="note" style={{ marginTop: 4 }}>
        impulso {fmtPrice(rg.imp.from)} → {fmtPrice(rg.imp.to)} ({rg.imp.strength.toFixed(1)}× ATR, non si opera) · {rg.validAt ? `valido dalle ${when(rg.validAt)}` : 'non ancora valido'}{rg.fakeouts.length ? ` · falsi breakout ${rg.fakeouts.length}` : ''}
      </div>
      {rg.strong && <div className="rg-tags"><span className="pill rg-strong">su livello settimanale: {rg.strong.map(x => `${x.name} ${fmtPrice(x.p)}`).join(', ')}</span></div>}
      {rg.lastSetup && ['setup pronto', 'setup in corso', 'falso breakout in corso', 'setup scaduto'].includes(rg.state) && <SetupBox st={rg.lastSetup} earnings={earnings} symbol={symbol} />}
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
      <summary className="row"><span className="lab">Impostazioni del riconoscimento</span><span className="mono muted" style={{ fontSize: 11 }}>{params.impulseAtr}×ATR · {params.minTouches} tocchi · {params.minHours}h · R:R {params.minRR}</span></summary>
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
function streak(rows) {
  let best = 0, cur = 0
  for (const r of rows.slice().sort((a, b) => (a.exit_at || 0) - (b.exit_at || 0))) { if (r.r_net < 0) { cur++; best = Math.max(best, cur) } else cur = 0 }
  return best
}
function StatsTable({ title, rows, keyOf }) {
  const groups = new Map()
  for (const r of rows) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r) }
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="tbl">
        <thead><tr><th>{title}</th><th>Proposti</th><th>Eseguiti</th><th>Vinti</th><th>R medio</th><th>R totale</th></tr></thead>
        <tbody>
          {[...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => {
            const done = list.filter(r => r.final && r.r_net !== null)
            const tot = done.reduce((x, r) => x + r.r_net, 0)
            return (
              <tr key={k}>
                <td>{k}</td><td>{list.length}</td><td>{done.length}</td>
                <td>{done.length ? `${Math.round(done.filter(r => r.r_net > 0).length / done.length * 100)}%` : '—'}</td>
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
function Registry({ symbol }) {
  const [reg, setReg] = useState(null)
  const [msg, setMsg] = useState(null)
  const authed = !!load('adminCode', '')
  const refresh = () => get('/api/range/registry').then(setReg).catch(e => setReg({ rows: [], error: e.message }))
  useEffect(() => { refresh(); const id = setInterval(refresh, 300000); return () => clearInterval(id) }, [])
  if (!reg) return <div className="card note" style={{ padding: 12 }}>Carico il registro…</div>
  const follow = reg.follow?.symbols || []
  const on = follow.includes(symbol)
  const toggle = async () => {
    try { await post('/api/range/follow', { symbols: on ? follow.filter(s => s !== symbol) : [...follow, symbol] }); setMsg(null); refresh() } catch (e) { setMsg(e.message) }
  }
  const valid = (reg.rows || []).filter(r => r.valid)
  const done = valid.filter(r => r.final && r.r_net !== null)
  const tot = done.reduce((x, r) => x + r.r_net, 0)
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row"><span className="lab">Registro automatico</span><span className="note mono">{done.length ? `${done.length} trade conclusi · ${fmtR(tot)}` : ''}</span></div>
      <p className="note" style={{ marginTop: 4 }}>
        Il server salva ogni setup proposto sui titoli seguiti ({follow.length ? follow.map(short).join(', ') : 'nessuno'}), anche a pagina chiusa, ogni 15 minuti,
        con le impostazioni di partenza, e ne segue l'esito con le commissioni di Bitunix (limite {FEES.maker}%, a mercato e stop {FEES.taker}%).
      </p>
      {authed
        ? <label className="toggle"><span style={{ fontSize: 13 }}>Segui {short(symbol)} nel registro <span className="note">(al massimo 8 titoli)</span></span><input type="checkbox" checked={on} onChange={toggle} /></label>
        : <p className="note">Per scegliere i titoli seguiti serve il codice di controllo (lo stesso della pagina Strategia).</p>}
      {msg && <div className="note down">{msg}</div>}
      {reg.error && <div className="warn">{reg.error}</div>}
      {!reg.error && !valid.length && <p className="note">Ancora nessun setup registrato: i primi arrivano quando sui titoli seguiti si forma un range con un falso breakout o un breakout.</p>}
      {valid.length > 0 && (
        <>
          <div className="warn">Con pochi casi questi numeri non valgono ancora: servono almeno 30–50 trade conclusi per gruppo prima di trarre conclusioni.</div>
          <div className="rg-levels mono" style={{ marginTop: 8 }}>
            <span>setup validi proposti <b>{valid.length}</b></span>
            <span>trade conclusi <b>{done.length}</b> <i>entrata eseguita e uscita completa</i></span>
            <span>serie di perdite più lunga <b className="down">{streak(done)}</b></span>
            <span>risultato medio <b className={tot >= 0 ? 'up' : 'down'}>{done.length ? fmtR(tot / done.length) : '—'}</b> <i>con le commissioni</i></span>
          </div>
          <StatsTable title="Tipo di trade" rows={valid} keyOf={r => `${KIND_LABEL[r.kind]}${r.variant ? ` (${r.variant})` : ''}`} />
          <StatsTable title="Range" rows={valid} keyOf={r => r.range_type} />
          <StatsTable title="Rispetto all'impulso" rows={valid} keyOf={r => (r.with_impulse ? 'nella direzione' : 'contro')} />
          <StatsTable title="Trend a 4 ore" rows={valid} keyOf={r => r.fit || '—'} />
          <StatsTable title="Voto" rows={valid} keyOf={r => r.grade || '—'} />
          <StatsTable title="Titolo" rows={valid} keyOf={r => short(r.symbol)} />
        </>
      )}
    </div>
  )
}

export default function Range() {
  const [custom, setCustomRaw] = useState(() => load('rangeCustom', []).filter(s => typeof s === 'string'))
  const [symbol, setSymbolRaw] = useState(() => load('rangeSymbol', FEATURED[0]))
  const [params, setParamsRaw] = useState(() => cleanRangeSettings(load('rangeParams', RANGE_DEFAULTS)))
  const [focusId, setFocusId] = useState(null)
  const setCustom = v => { setCustomRaw(v); save('rangeCustom', v) }
  const setSymbol = s => { setSymbolRaw(s); save('rangeSymbol', s); setFocusId(null) }
  const setParams = p => { setParamsRaw(p); save('rangeParams', p) }
  const data = useBars(symbol)
  const earnings = useEarnings()

  const now = Date.now()
  const closed = tf => data[tf]?.bars?.filter(b => b.t + TF_MS[tf] <= now) || null
  const b15 = data['15m']?.bars, c15 = useMemo(() => closed('15m'), [data['15m']]) // eslint-disable-line react-hooks/exhaustive-deps
  const c4 = useMemo(() => closed('4h'), [data['4h']]) // eslint-disable-line react-hooks/exhaustive-deps
  const b1h = data['1h']?.bars || []
  const tr = useMemo(() => (c4?.length ? trend4h(c4) : null), [c4])
  const res = useMemo(() => (c15?.length > 50 ? analyze(c15, params, { bars1h: b1h, bars4h: c4 || [] }) : null), [c15, params, b1h, c4])
  const wp = useMemo(() => (b1h.length ? weekProfiles(b1h, now) : null), [b1h]) // eslint-disable-line react-hooks/exhaustive-deps
  const active = res ? res.ranges.filter(r => r.active).reverse() : []
  const past = res ? res.trades.filter(t => t.valid).slice().reverse() : []
  const invalidN = res ? res.setups.filter(s => !s.valid).length : 0
  const focus = (res && focusId && res.trades.find(s => s.id === focusId)) || active.map(r => r.lastSetup).find(s => s && s.valid && ['pronto', 'in corso'].includes(s.status)) || null
  const err = data['15m']?.error || data['4h']?.error

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <div className="lab">Range P e B · metodo di Patrick Nill</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{short(symbol)}{NAMES[symbol] ? <span className="sec" style={{ fontSize: 14, fontWeight: 600 }}> · {NAMES[symbol]}</span> : null}</div>
        </div>
        <span className="note mono">{b15?.length ? fmtPrice(b15.at(-1).c) : ''}</span>
      </div>
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
          {active.length ? active.map(rg => <RangeCard key={rg.id} rg={rg} earnings={earnings} symbol={symbol} />) : <div className="card note" style={{ padding: 12 }}>Nessun range attivo adesso: l'ultimo impulso non ha ancora formato un range, o il range è finito con un breakout. Patrick non opera l'impulso, solo il range che lo segue.</div>}
        </div>
      )}

      <div className="card" style={{ padding: 10 }}>
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
        {focus && (focus.kind === 'falso' ? <SetupBox st={focus.variant === 'mercato' ? res.setups.find(s => s.market?.id === focus.id) || focus : focus} big earnings={earnings} symbol={symbol} /> : <><AltTrade t={focus} label={KIND_LABEL[focus.kind]} /><RiskCalc entry={focus.entry} stop={focus.stop} limit={focus.kind === 'range'} /></>)}
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="row"><span className="lab">Setup degli ultimi giorni</span></div>
        {past.length ? (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="tbl clickable">
              <thead><tr><th>Quando</th><th>Tipo</th><th>Range</th><th>Lato</th><th>Impulso</th><th>Voto</th><th>Entrata</th><th>Stop</th><th>Target</th><th>R:R</th><th>Trend 4h</th><th>Com'è finito</th><th>Lordo</th><th>Netto</th></tr></thead>
              <tbody>
                {past.map(s => (
                  <tr key={s.id} onClick={() => setFocusId(s.id === focusId ? null : s.id)} style={s.id === focus?.id ? { background: 'var(--surface-alt)' } : undefined}>
                    <td>{when(s.at)}</td><td>{kindName(s)}</td><td>{s.type}</td>
                    <td className={s.side > 0 ? 'up' : 'down'}>{s.side > 0 ? 'long' : 'short'}</td>
                    <td>{s.withImpulse ? 'a favore' : 'contro'}</td>
                    <td><span className={gradeCls(s.grade)}>{s.grade}</span></td>
                    <td>{fmtPrice(s.entry)}</td><td>{fmtPrice(s.stop)}</td><td>{s.targets.map(x => fmtPrice(x.p)).join(' / ')}</td>
                    <td>{s.rr.toFixed(1)}</td>
                    <td className={fitCls(s.fit)}>{s.fit}</td>
                    <td>{s.status === 'target' ? 'target raggiunto' : s.status === 'stop' ? 'stop toccato' : String(s.status).startsWith('pareggio dopo') ? `${s.status.slice(-2)}, poi pareggio` : s.status === 'scaduto' ? (s.why || 'scaduto') : s.status}</td>
                    <td className={s.R > 0 ? 'up' : s.R < 0 ? 'down' : 'sec'}>{s.R !== null && s.R !== undefined ? fmtR(s.R) : s.openR !== undefined ? `${fmtR(s.openR)} aperto` : '—'}</td>
                    <td className={s.Rnet > 0 ? 'up' : s.Rnet < 0 ? 'down' : 'sec'}>{s.Rnet !== undefined ? fmtR(s.Rnet) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="note">{res ? 'Nessun setup valido negli ultimi 8 giorni con queste impostazioni.' : '…'}</p>}
        <p className="note" style={{ marginTop: 6 }}>
          Tocca un setup per disegnarlo sul grafico. Uscite secondo il tipo: falso breakout un terzo a ogni target (stop a pareggio dopo T1); range trade tutto sul bordo opposto; breakout con conferma 30% al primo target, il resto corre.
          Netto = con le commissioni di Bitunix. {invalidN ? `Altri ${invalidN} falsi breakout hanno un rischio/rendimento sotto ${params.minRR}. ` : ''}Sono pochi casi: servono per capire, non come statistica.
        </p>
      </div>

      <Registry symbol={symbol} />
      <Settings params={params} setParams={setParams} />
      <div className="card" style={{ padding: 12 }}><AlertToggle symbol={symbol} params={params} /></div>
      <p className="note">
        Candele di Bitunix: 15 minuti degli ultimi 8 giorni (aggiornate ogni minuto), 1 ora per il profilo settimanale, 4 ore per il contesto. Si usano solo candele chiuse.
        Falso breakout verso il basso con rientro = long, verso l'alto = short, nelle P e nelle B, con qualunque trend. Entrata limite sul bordo o a mercato alla chiusura della candela di rientro;
        stop appena oltre l'estremo del falso breakout (+0,1 ATR, almeno mezzo ATR dall'entrata). Contro l'impulso: T1 bordo opposto, poi verso l'origine dell'impulso;
        nella direzione dell'impulso: T1 bordo opposto, poi le aree di valore successive o la proiezione 1:1 dell'impulso; senza riferimenti, 2 volte il rischio.
        Le notizie: il Calendario ha solo le trimestrali delle azioni, senza ora; le notizie macro (Fed, inflazione) non ci sono. Regole complete in claude/strategia-range-pb-patrick.md. Solo analisi: nessun ordine.
      </p>
    </div>
  )
}
