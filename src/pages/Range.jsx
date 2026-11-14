// Pagina Range: riconoscimento automatico dei range P e B (metodo di Patrick Nill) per controllarli a occhio.
// Solo analisi: nessun ordine. Regole in shared/range.js (le stesse degli avvisi push, server/range-alerts.js).
import { useEffect, useMemo, useRef, useState } from 'react'
import RangeChart, { TrendChart } from '../components/RangeChart.jsx'
import { SymbolPicker, NAMES } from './Rsi.jsx'
import { get, post, fmtPrice } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { currentSubscription } from '../lib/push.js'
import { analyze, trend4h, prevWeekProfile, cleanRangeSettings, RANGE_DEFAULTS, LIMITS } from '@shared/range.js'

const FEATURED = ['BTCUSDT', 'ETHUSDT', 'XAUUSDT']
const REFRESH = { '15m': 60000, '1h': 600000, '4h': 600000 }
const TF_MS = { '15m': 15 * 60000, '1h': 3600000, '4h': 4 * 3600000 }
const short = s => s.replace(/USDT$/, '')
const TREND = { up: 'rialzista', down: 'ribassista', side: 'laterale' }
const when = t => new Date(t).toLocaleString('it-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtR = v => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}R`)
const SETTINGS_INFO = [
  ['impulseAtr', 'Forza minima dell\'impulso', '× ATR', 'Quanto deve essere ampio il movimento rispetto alla volatilità normale a 15 minuti (ATR 14). Più alto: solo impulsi netti, meno range.'],
  ['impulseBars', 'Durata massima dell\'impulso', 'candele', 'In quante candele da 15 minuti al massimo deve avvenire l\'impulso (16 = 4 ore). Più basso: solo movimenti rapidi.'],
  ['minTouches', 'Tocchi minimi', 'tocchi', 'Tocchi dei bordi (alto + basso, almeno uno per lato) perché il range sia valido. Più alto: range più "provati", ma meno numerosi e più tardi.'],
  ['minHours', 'Durata minima del range', 'ore', 'Da quanto tempo il prezzo deve stare nel range perché sia valido (12 = mezza giornata). Più basso: range più frequenti ma meno solidi.'],
  ['touchTol', 'Tolleranza del tocco', '× ATR', 'Quanto vicino al bordo deve arrivare il prezzo per contare un tocco. Più alta: più tocchi contati, range validi prima.'],
  ['minRR', 'Rischio/rendimento minimo', ': 1', 'Un setup è valido solo se il rendimento fino all'ultimo target (T3) è almeno questo multiplo del rischio. Più alto: meno setup, più selettivi.'],
]
// stato → alone (come nella pagina RSI)
function glowFor(rg) {
  const st = rg.lastSetup
  const dirCol = s => (s > 0 ? '0,229,199' : '255,92,122')
  let rgb = null, x = 0, pulse = false
  if (rg.state === 'setup pronto') { rgb = dirCol(st.side); x = 1; pulse = true }
  else if (rg.state === 'setup in corso') { rgb = dirCol(st.side); x = 0.7 }
  else if (rg.state === 'falso breakout in corso') { rgb = dirCol(st?.side ?? 1); x = 0.45; pulse = true }
  else if (rg.state === 'breakout') { rgb = '245,184,61'; x = 0.4 }
  else if (rg.state === 'valido') { rgb = rg.type === 'P' ? '0,229,199' : '255,92,122'; x = 0.2 }
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

function SetupBox({ st, big }) {
  if (!st) return null
  const dir = st.side > 0 ? 'LONG' : 'SHORT'
  return (
    <div className={`rg-setup ${st.side > 0 ? 'long' : 'short'} ${big ? 'big' : ''}`}>
      <div className="row">
        <b className={st.side > 0 ? 'up' : 'down'}>{dir} · falso breakout verso {st.side > 0 ? 'il basso' : 'l\'alto'}</b>
        <span className={`pill ${st.valid ? (st.side > 0 ? 'long' : 'short') : 'closed'}`}>{st.valid ? 'valido' : 'non valido'}</span>
      </div>
      {(st.strong || st.reversal || st.invalid) && (
        <div className="rg-tags">
          {st.strong && <span className="pill rg-strong">rafforzato · range su {st.strong.map(x => x.name).join(', ')} settimanale</span>}
          {st.reversal && <span className="pill neutral">inversione dopo l'impulso</span>}
          {st.invalid && <span className="note down">{st.invalid}</span>}
        </div>
      )}
      <div className="rg-levels mono">
        <span>entrata limite <b>{fmtPrice(st.entry)}</b></span>
        <span>stop <b className="down">{fmtPrice(st.stop)}</b></span>
        <span>T1 · 1/3 <b className="up">{fmtPrice(st.t1)}</b> <i>bordo opposto, poi stop a pareggio · R:R {st.rr1.toFixed(1)}</i></span>
        <span>T2 · 1/3 <b className="up">{fmtPrice(st.t2)}</b> <i>{st.t2why} · R:R {st.rr2.toFixed(1)}</i></span>
        <span>T3 · 1/3 <b className="up">{fmtPrice(st.t3)}</b> <i>{st.t3why} · R:R {st.rr.toFixed(1)}</i></span>
        <span>se arrivano tutti e tre <b className="up">{fmtR(st.rrAll)}</b> <i>media dei tre terzi</i></span>
      </div>
      <div className="note">Trend a 4 ore: <b className={st.fit === 'a favore' ? 'up' : st.fit === 'contro' ? 'down' : 'sec'}>{st.fit}</b>{st.trend ? ` (${TREND[st.trend]})` : ''} · dalle {when(st.at)} · {st.status}{st.why ? ` (${st.why})` : ''}{st.openR !== undefined ? ` · ora ${fmtR(st.openR)}` : ''}</div>
    </div>
  )
}

function BoText({ bo }) {
  if (!bo) return <>nessuna chiusura fuori dal range finora.</>
  const dir = bo.dir > 0 ? 'sopra' : 'sotto'
  if (bo.entry !== undefined) return <>{dir}: entrata {fmtPrice(bo.entry)} · stop {fmtPrice(bo.stop)} · target {fmtPrice(bo.target)} (ampiezza del range) · R:R {bo.rr.toFixed(1)} · {bo.status}{bo.R !== null ? ` ${fmtR(bo.R)}` : ''}</>
  return <>{dir}: {bo.status}{bo.trigger ? ` (entrata oltre ${fmtPrice(bo.trigger)})` : ''}.</>
}

function RangeCard({ rg }) {
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
        impulso {fmtPrice(rg.imp.from)} → {fmtPrice(rg.imp.to)} ({rg.imp.strength.toFixed(1)}× ATR) · {rg.validAt ? `valido dalle ${when(rg.validAt)}` : 'non ancora valido'}{rg.fakeouts.length ? ` · falsi breakout ${rg.fakeouts.length}` : ''}
      </div>
      {rg.lastSetup && ['setup pronto', 'setup in corso', 'falso breakout in corso', 'setup scaduto'].includes(rg.state) && <SetupBox st={rg.lastSetup} />}
      {rg.strong && <div className="rg-tags"><span className="pill rg-strong">rafforzato · range su {rg.strong.map(x => `${x.name} ${fmtPrice(x.p)}`).join(', ')} della settimana prima</span></div>}
      {rg.alt && (rg.endIdx === null || rg.alt.breakout?.idx !== undefined) && (
        <details className="rg-alt">
          <summary className="note">Altri modi di operare questo range (meno importanti)</summary>
          <div className="note mono">
            Range trade (limite sul bordo, obiettivo il bordo opposto, senza parziali): long {fmtPrice(rg.alt.inside.long.entry)} stop {fmtPrice(rg.alt.inside.long.stop)} target {fmtPrice(rg.alt.inside.long.target)} · short {fmtPrice(rg.alt.inside.short.entry)} stop {fmtPrice(rg.alt.inside.short.stop)} target {fmtPrice(rg.alt.inside.short.target)}<br />
            Breakout con conferma (chiusura fuori, ritorno sul bordo, poi una candela che rompe l'estremo della candela di breakout): <BoText bo={rg.alt.breakout} />
          </div>
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
        <span className="note">Salvate in questo browser. Gli avvisi push usano le impostazioni del momento in cui li attivi.</span>
        {!isDefault && <button className="chip" onClick={() => setParams({ ...RANGE_DEFAULTS })}>Valori di partenza</button>}
      </div>
    </details>
  )
}

function AlertToggle({ symbol, params }) {
  const [state, setState] = useState({ loading: true })
  const refresh = async () => {
    const sub = await currentSubscription().catch(() => null)
    if (!sub) return setState({ noPush: true })
    try { const j = await get(`/api/range/alerts?endpoint=${encodeURIComponent(sub.endpoint)}`); setState({ sub, symbols: j.symbols, subscribed: j.subscribed }) } catch (e) { setState({ error: e.message }) }
  }
  useEffect(() => { refresh() }, [])
  if (state.loading) return null
  if (state.noPush) return <p className="note">Avvisi push: attiva prima le notifiche in Impostazioni, poi potrai sceglierli per ogni titolo.</p>
  if (state.error || !state.subscribed) return <p className="note">Avvisi push non disponibili: {state.error || 'iscrizione non trovata, riattiva le notifiche in Impostazioni'}</p>
  const on = state.symbols.includes(symbol)
  const toggle = async () => {
    const next = on ? state.symbols.filter(s => s !== symbol) : [...state.symbols, symbol]
    try { const j = await post('/api/range/alerts', { endpoint: state.sub.endpoint, symbols: next, settings: params }); setState(s => ({ ...s, symbols: j.symbols })) } catch (e) { setState(s => ({ ...s, msg: e.message })) }
  }
  return (
    <label className="toggle">
      <span style={{ fontSize: 13 }}>Avvisi push per {short(symbol)}: range valido e setup pronto<br /><span className="note">{state.symbols.length ? `attivi su ${state.symbols.map(short).join(', ')}` : 'nessun titolo'} · al massimo 8 · controllo ogni 15 minuti{state.msg ? ` · ${state.msg}` : ''}</span></span>
      <input type="checkbox" checked={on} onChange={toggle} />
    </label>
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

  const now = Date.now()
  const closed = tf => data[tf]?.bars?.filter(b => b.t + TF_MS[tf] <= now) || null
  const b15 = data['15m']?.bars, c15 = useMemo(() => closed('15m'), [data['15m']]) // eslint-disable-line react-hooks/exhaustive-deps
  const c4 = useMemo(() => closed('4h'), [data['4h']]) // eslint-disable-line react-hooks/exhaustive-deps
  const b1h = data['1h']?.bars || []
  const tr = useMemo(() => (c4?.length ? trend4h(c4) : null), [c4])
  const res = useMemo(() => (c15?.length > 50 ? analyze(c15, params, { bars1h: b1h, bars4h: c4 || [] }) : null), [c15, params, b1h, c4])
  const vp = useMemo(() => (b1h.length ? prevWeekProfile(b1h, now) : null), [b1h]) // eslint-disable-line react-hooks/exhaustive-deps
  const active = res ? res.ranges.filter(r => r.active).reverse() : []
  const past = res ? res.setups.filter(s => s.valid).slice().reverse() : []
  const invalidN = res ? res.setups.filter(s => !s.valid).length : 0
  const focus = (res && focusId && res.setups.find(s => s.id === focusId)) || active.map(r => r.lastSetup).find(s => s && s.valid && ['pronto', 'in corso'].includes(s.status)) || null
  const totR = past.filter(s => s.R !== null).reduce((x, s) => x + s.R, 0)
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
        <p className="note" style={{ marginTop: 6 }}>Regola: media esponenziale a 50 candele da 4 ore (linea viola, circa 8 giorni). <b>Rialzista</b> se il prezzo è sopra la media e la media sale rispetto a 40 ore prima; <b>ribassista</b> se è sotto e la media scende; altrimenti <b>laterale</b>.{tr?.ema ? ` Ora: prezzo ${fmtPrice(tr.price)}, media ${fmtPrice(tr.ema)} (${tr.slope >= 0 ? '+' : ''}${tr.slope.toFixed(2)}% in 40 ore).` : ''}</p>
      </div>

      {res && (
        <div className="rsi-grid">
          {active.length ? active.map(rg => <RangeCard key={rg.id} rg={rg} />) : <div className="card note" style={{ padding: 12 }}>Nessun range attivo adesso: l'ultimo impulso non ha ancora formato un range, o il range è finito con un breakout.</div>}
        </div>
      )}

      <div className="card" style={{ padding: 10 }}>
        <div className="row" style={{ marginBottom: 4 }}>
          <span className="lab">Decisione · 15 minuti</span>
          <span className="note">{res ? `${res.impulses.length} impulsi · ${res.ranges.filter(r => !r.dropped).length} range (${res.ranges.filter(r => r.validIdx !== null).length} validi) · ${res.ranges.filter(r => r.dropped).length} non validi · ${res.setups.length} falsi breakout` : 'Carico le candele…'}</span>
        </div>
        {b15?.length && res ? <RangeChart key={symbol} bars={b15} res={res} vp={vp} focus={focus} /> : <div className="empty" style={{ padding: '120px 10px' }}>{err || 'Carico le candele…'}</div>}
        <p className="note" style={{ marginTop: 6 }}>
          Linea spessa = impulso. Rettangolo verde = range P (dopo un impulso al rialzo), rosso = range B (al ribasso); tratteggiato finché non è valido, con i tocchi ↑ in alto e ↓ in basso; molto chiaro con la scritta "non valido" = consolidamento di almeno 2 ore che si è rotto prima di diventare valido o ha ritracciato troppo.
          Freccia "falso" = una candela ha chiuso fuori dal range e la successiva di nuovo dentro. Linee gialle = volume profile della settimana prima (POC, VAH, VAL); range passati più chiari = aree di valore.
          {focus ? ' Linee spesse: entrata, stop, T1, T2 e T3 del setup in evidenza.' : ''} Pallini: com'è finito ogni setup passato. Trascina per scorrere, pizzica per ingrandire.
        </p>
        {focus && <SetupBox st={focus} big />}
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="row"><span className="lab">Setup degli ultimi giorni</span><span className="note mono">{past.length ? `totale ${fmtR(totR)}` : ''}</span></div>
        {past.length ? (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="tbl clickable">
              <thead><tr><th>Quando</th><th>Range</th><th>Lato</th><th>Entrata</th><th>Stop</th><th>T1 / T2 / T3</th><th>R:R</th><th>Trend 4h</th><th>Note</th><th>Com'è finito</th><th>Risultato</th></tr></thead>
              <tbody>
                {past.map(s => (
                  <tr key={s.id} onClick={() => setFocusId(s.id === focusId ? null : s.id)} style={s.id === focus?.id ? { background: 'var(--surface-alt)' } : undefined}>
                    <td>{when(s.at)}</td><td>{s.type}</td>
                    <td className={s.side > 0 ? 'up' : 'down'}>{s.side > 0 ? 'long' : 'short'}</td>
                    <td>{fmtPrice(s.entry)}</td><td>{fmtPrice(s.stop)}</td><td>{fmtPrice(s.t1)} / {fmtPrice(s.t2)} / {fmtPrice(s.t3)}</td>
                    <td>{s.rr.toFixed(1)}</td>
                    <td className={s.fit === 'a favore' ? 'up' : s.fit === 'contro' ? 'down' : 'sec'}>{s.fit}</td>
                    <td>{[s.reversal ? 'inversione' : null, s.strong ? 'rafforzato' : null].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{s.status === 'target' ? 'target raggiunto' : s.status === 'stop' ? 'stop toccato' : s.status.startsWith('pareggio dopo') ? `${s.status.slice(-2)}, poi pareggio` : s.status === 'scaduto' ? (s.why || 'scaduto') : s.status}</td>
                    <td className={s.R > 0 ? 'up' : s.R < 0 ? 'down' : 'sec'}>{s.R !== null ? fmtR(s.R) : s.openR !== undefined ? `${fmtR(s.openR)} aperto` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="note">{res ? 'Nessun setup valido negli ultimi 8 giorni con queste impostazioni.' : '…'}</p>}
        <p className="note" style={{ marginTop: 6 }}>
          Tocca un setup per disegnarlo sul grafico. Risultato in multipli del rischio, con le uscite di Patrick: un terzo a T1 con lo stop spostato a pareggio, un terzo a T2, un terzo a T3; entrata limite valida 4 ore.
          {invalidN ? ` Altri ${invalidN} falsi breakout non sono diventati setup validi (rischio/rendimento sotto ${params.minRR}, contro il trend a 4 ore, o trend non chiaro senza inversione).` : ''} Sono pochi casi: servono per capire, non come statistica.
        </p>
      </div>

      <Settings params={params} setParams={setParams} />
      <div className="card" style={{ padding: 12 }}><AlertToggle symbol={symbol} params={params} /></div>
      <p className="note">
        Candele di Bitunix: 15 minuti degli ultimi 8 giorni (aggiornate ogni minuto), 1 ora per il volume profile, 4 ore per il trend. Si usano solo candele chiuse.
        Setup come li farebbe Patrick: dopo un falso breakout, entrata limite sul bordo dal lato della rottura fallita, stop appena oltre l'estremo del falso breakout
        (+0,1 ATR, almeno mezzo ATR dall'entrata); un terzo sul bordo opposto (poi stop a pareggio), un terzo alla prossima area di valore, un terzo all'origine dell'impulso
        (a favore dell'impulso: le due aree di valore successive; senza aree oltre, come ai massimi storici, proiezione 1:1 dell'impulso).
        Valido con rischio/rendimento fino all'ultimo target almeno {params.minRR} e trend a 4 ore a favore; con il trend non chiaro solo l'inversione dopo un impulso forte che si è fermato; mai contro il trend.
        Rafforzato se il range si è formato su un livello del volume profile della settimana prima. Un range smette di valere se ritraccia oltre il 60% dell'impulso, dopo due chiusure di fila fuori o dopo 5 giorni.
        Regole complete in claude/strategia-range-pb-patrick.md. Solo analisi: nessun ordine.
      </p>
    </div>
  )
}
