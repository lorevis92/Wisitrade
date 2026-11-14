import { useEffect, useMemo, useRef, useState } from 'react'
import RsiChart from '../components/RsiChart.jsx'
import { get, fmtPrice } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { readStoch, RSI_DEFAULTS } from '../lib/stochrsi.js'

const BASE = ['BTCUSDT', 'ETHUSDT', 'XAUUSDT', 'GOOGLUSDT', 'NVDAUSDT', 'TSLAUSDT', 'MSTRUSDT', 'COINUSDT', 'QQQUSDT']
const NAMES = { XAUUSDT: 'oro' }
const TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d']
// ogni quanto si rileggono le candele (la CDN tiene la risposta per un po', vedi RSI_TF in api/index.js)
const REFRESH = { '1m': 15000, '3m': 30000, '5m': 30000, '15m': 60000, '1h': 120000, '4h': 300000, '1d': 600000 }
const STATE = { oversold: 'ipervenduto', overbought: 'ipercomprato', neutral: 'neutro' }
const LIMITS = { rsi: [2, 50], stoch: [2, 50], k: [1, 10], d: [1, 10], high: [51, 99], low: [1, 49] }
const short = s => s.replace(/USDT$/, '')
const fmtV = v => (v === null || v === undefined ? '—' : v.toFixed(1))
const fmtP = v => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`)
const agoText = n => (n === 0 ? 'candela in corso' : n === 1 ? '1 candela fa' : `${n} candele fa`)
const timeOf = (t, tf) => new Date(t).toLocaleString('it-CH', tf === '1d' ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function cleanParams(p) {
  const out = { ...RSI_DEFAULTS }
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) { const v = Math.round(+p?.[k]); if (Number.isFinite(v) && v >= lo && v <= hi) out[k] = v }
  if (out.low >= out.high) { out.low = RSI_DEFAULTS.low; out.high = RSI_DEFAULTS.high }
  return out
}

// Alone della card: verde in ipervenduto, rosso in ipercomprato, più acceso quanto più è estremo
function glowStyle(read) {
  if (!read || read.state === null) return {}
  const pulse = read.cross?.inZone && read.cross.ago <= 1
  let state = read.state, x = read.intensity
  if (state === 'neutral') { if (!pulse) return {}; state = read.cross.dir === 'up' ? 'oversold' : 'overbought'; x = 0 }
  const rgb = state === 'oversold' ? '0,229,199' : '255,92,122'
  const a = 0.16 + 0.6 * x, blur = 8 + 28 * x, spread = 0.5 + 4 * x
  return {
    '--glow': `0 0 ${blur.toFixed(1)}px ${spread.toFixed(1)}px rgba(${rgb},${a.toFixed(2)})`,
    '--glow-hi': `0 0 ${(blur + 14).toFixed(1)}px ${(spread + 3).toFixed(1)}px rgba(${rgb},${Math.min(0.95, a + 0.3).toFixed(2)})`,
    borderColor: `rgba(${rgb},${(0.3 + 0.55 * x).toFixed(2)})`,
  }
}
const isPulse = read => !!(read?.cross?.inZone && read.cross.ago <= 1)

function CrossText({ cross }) {
  if (!cross) return <span className="muted">Nessun incrocio K/D recente</span>
  return <span className={cross.dir === 'up' ? 'up' : 'down'}>K ha incrociato D verso {cross.dir === 'up' ? "l'alto" : 'il basso'} · {agoText(cross.ago)}{cross.inZone ? ' · in zona estrema' : ''}</span>
}

function StatePill({ state }) {
  if (!state) return <span className="pill closed">—</span>
  return <span className={`pill ${state === 'oversold' ? 'long' : state === 'overbought' ? 'short' : 'neutral'}`}>{STATE[state]}</span>
}

function TfCard({ tf, entry, read, params, onOpen }) {
  const bars = entry?.bars
  return (
    <div role="button" tabIndex={0} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())} className={`rsi-card ${read?.state && read.state !== 'neutral' ? 'lit' : ''} ${isPulse(read) ? 'pulse' : ''}`} style={glowStyle(read)} onClick={onOpen}>
      <div className="row">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b className="rsi-tf">{tf}</b>
          {bars?.length > 0 && <span className="mono sec" style={{ fontSize: 12 }}>{fmtPrice(bars.at(-1).c)}</span>}
        </div>
        <StatePill state={read?.state} />
      </div>
      <div className="rsi-vals mono">
        <span>K <b style={{ color: '#E8ECF5' }}>{fmtV(read?.K)}</b></span>
        <span>D <b style={{ color: '#F5B83D' }}>{fmtV(read?.D)}</b></span>
      </div>
      <div className="rsi-cross">{read ? <CrossText cross={read.cross} /> : <span className="muted">&nbsp;</span>}</div>
      <div className="rsi-chart">
        {bars?.length > 0 && read
          ? <RsiChart bars={bars} read={read} params={params} tf={tf} />
          : <div className="empty" style={{ padding: '60px 10px' }}>{entry?.error ? `Non disponibile: ${entry.error}` : 'Carico le candele…'}</div>}
      </div>
    </div>
  )
}

function exitStats(exits, from) {
  const xs = exits.filter(e => e.from === from && e.a10 !== null)
  if (!xs.length) return null
  const dir = from === 'oversold' ? 1 : -1 // "giusto" = il prezzo va nel verso dell'uscita
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length
  return { n: xs.length, a5: avg(xs.filter(e => e.a5 !== null).map(e => e.a5)), a10: avg(xs.map(e => e.a10)), right: xs.filter(e => dir * e.a10 > 0).length }
}

function BigView({ symbol, tf, entry, read, params, onClose }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  const bars = entry?.bars
  const os = read && exitStats(read.exits, 'oversold'), ob = read && exitStats(read.exits, 'overbought')
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className={`sheet rsi-big ${isPulse(read) ? 'pulse' : ''}`} style={glowStyle(read)} onClick={e => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 8 }}>
          <div><b style={{ fontSize: 17 }}>{short(symbol)} · {tf}</b> {bars?.length > 0 && <span className="mono sec" style={{ marginLeft: 6 }}>{fmtPrice(bars.at(-1).c)}</span>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-start', gap: 12 }}>
          <StatePill state={read?.state} />
          <span className="mono" style={{ fontSize: 13 }}>K <b>{fmtV(read?.K)}</b> · D <b style={{ color: '#F5B83D' }}>{fmtV(read?.D)}</b></span>
        </div>
        <div className="rsi-cross" style={{ marginTop: 6 }}>{read && <CrossText cross={read.cross} />}</div>
        {bars?.length > 0 && read
          ? <RsiChart bars={bars} read={read} params={params} tf={tf} height={320} stochHeight={130} visible={150} interactive />
          : <div className="empty">{entry?.error || 'Carico le candele…'}</div>}
        <p className="note" style={{ marginTop: 6 }}>Linea bianca K, gialla D. Frecce sulle candele: K esce dall'ipervenduto (verde, sotto la candela) o dall'ipercomprato (rossa, sopra). Puoi scorrere e ingrandire il grafico.</p>

        {read && (
          <>
            <div className="lab section-title">Cosa ha fatto il prezzo dopo le uscite</div>
            <div className="grid2">
              {[['oversold', os, "Uscita dall'ipervenduto", 'salito'], ['overbought', ob, "Uscita dall'ipercomprato", 'sceso']].map(([k, s, title, word]) => (
                <div key={k} className="tile">
                  <div className="lab" style={{ fontSize: 10 }}>{title}</div>
                  {s ? (
                    <div className="mono" style={{ fontSize: 12, marginTop: 5, lineHeight: 1.6 }}>
                      <div>dopo 5 candele <b className={s.a5 >= 0 ? 'up' : 'down'}>{fmtP(s.a5)}</b></div>
                      <div>dopo 10 candele <b className={s.a10 >= 0 ? 'up' : 'down'}>{fmtP(s.a10)}</b></div>
                      <div className="sec">{word} {s.right} volte su {s.n}</div>
                    </div>
                  ) : <div className="note" style={{ marginTop: 5 }}>Nessuna uscita con 10 candele dopo in questo grafico</div>}
                </div>
              ))}
            </div>
            {read.exits.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="tbl">
                  <thead><tr><th>Quando</th><th>Uscita da</th><th>Prezzo</th><th>+5 candele</th><th>+10 candele</th></tr></thead>
                  <tbody>
                    {[...read.exits].reverse().slice(0, 15).map(e => (
                      <tr key={e.t + e.from}>
                        <td>{timeOf(e.t, tf)}</td>
                        <td className={e.from === 'oversold' ? 'up' : 'down'}>{STATE[e.from]}</td>
                        <td>{fmtPrice(e.price)}</td>
                        <td className={e.a5 === null ? 'muted' : e.a5 >= 0 ? 'up' : 'down'}>{fmtP(e.a5)}</td>
                        <td className={e.a10 === null ? 'muted' : e.a10 >= 0 ? 'up' : 'down'}>{fmtP(e.a10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note" style={{ marginTop: 8 }}>Variazione del prezzo di chiusura rispetto alla candela dell'uscita, sulle ultime {bars?.length || 0} candele {tf}. Sono pochi casi: servono per imparare a leggere l'indicatore, non sono una statistica affidabile.</p>
          </>
        )}
      </div>
    </div>
  )
}

function SymbolPicker({ symbol, setSymbol, custom, setCustom }) {
  const [qText, setQ] = useState('')
  const [pairs, setPairs] = useState(null)
  const [err, setErr] = useState(null)
  const loadPairs = () => { if (!pairs) get('/api/rsi/pairs').then(j => setPairs(j.symbols)).catch(e => setErr(e.message)) }
  const qq = qText.trim().toUpperCase()
  const matches = qq && pairs ? pairs.filter(s => s.includes(qq)).sort((a, b) => (a.startsWith(qq) ? 0 : 1) - (b.startsWith(qq) ? 0 : 1) || a.length - b.length).slice(0, 8) : []
  const pick = s => {
    if (!BASE.includes(s) && !custom.includes(s)) setCustom([...custom, s])
    setSymbol(s); setQ('')
  }
  const remove = s => { setCustom(custom.filter(x => x !== s)); if (symbol === s) setSymbol(BASE[0]) }
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="chips">
        {BASE.map(s => <button key={s} className={`chip ${symbol === s ? 'active' : ''}`} onClick={() => setSymbol(s)}>{short(s)}{NAMES[s] ? ` · ${NAMES[s]}` : ''}</button>)}
        {custom.map(s => (
          <span key={s} className={`chip rsi-custom ${symbol === s ? 'active' : ''}`}>
            <button onClick={() => setSymbol(s)}>{short(s)}</button>
            <button onClick={() => remove(s)} aria-label={`Togli ${s}`}>×</button>
          </span>
        ))}
      </div>
      <div className="field" style={{ marginTop: 10, position: 'relative' }}>
        <input value={qText} onFocus={loadPairs} onChange={e => { setQ(e.target.value); loadPairs() }} placeholder="Cerca un'altra coppia di Bitunix (es. SOL, AAPL)" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          onKeyDown={e => { if (e.key === 'Enter' && matches[0]) pick(matches[0]) }} />
        {qq && (
          <div className="rsi-results">
            {!pairs && !err && <div className="note">Carico le coppie…</div>}
            {err && <div className="note down">{err}</div>}
            {pairs && !matches.length && <div className="note">Nessuna coppia con “{qq}”</div>}
            {matches.map(s => <button key={s} className="chip" onClick={() => pick(s)}>{s}</button>)}
          </div>
        )}
      </div>
    </div>
  )
}

function Settings({ params, setParams }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])))
  useEffect(() => { setDraft(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))) }, [params])
  const fields = [['rsi', 'RSI'], ['stoch', 'Stocastico'], ['k', 'K'], ['d', 'D'], ['high', 'Soglia alta'], ['low', 'Soglia bassa']]
  const bad = k => { const v = +draft[k], [lo, hi] = LIMITS[k]; return !(Number.isInteger(v) && v >= lo && v <= hi) || (k === 'low' && v >= +draft.high) }
  const apply = () => { if (!fields.some(([k]) => bad(k))) setParams(cleanParams(draft)) }
  const isDefault = Object.entries(RSI_DEFAULTS).every(([k, v]) => params[k] === v)
  return (
    <details className="card" style={{ padding: 12 }}>
      <summary className="row"><span className="lab">Impostazioni dell'indicatore</span><span className="mono muted" style={{ fontSize: 11 }}>{params.rsi} · {params.stoch} · {params.k} · {params.d} · {params.high}/{params.low}</span></summary>
      <div className="rsi-settings">
        {fields.map(([k, l]) => (
          <label key={k} className="field">
            <span className="lab" style={{ fontSize: 10 }}>{l}</span>
            <input type="number" inputMode="numeric" min={LIMITS[k][0]} max={LIMITS[k][1]} value={draft[k]} style={bad(k) ? { borderColor: '#FF5C7A' } : undefined}
              onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} onBlur={apply} onKeyDown={e => e.key === 'Enter' && apply()} />
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="note">Candele per RSI e stocastico, medie di K e D, soglie delle zone. Salvate in questo browser.</span>
        {!isDefault && <button className="chip" onClick={() => setParams({ ...RSI_DEFAULTS })}>Valori classici</button>}
      </div>
    </details>
  )
}

function Summary({ reads }) {
  const order = [...TFS].reverse()
  const ready = order.filter(tf => reads[tf]?.state)
  const nOs = ready.filter(tf => reads[tf].state === 'oversold').length, nOb = ready.filter(tf => reads[tf].state === 'overbought').length
  const nUp = ready.filter(tf => reads[tf].K > reads[tf].D).length
  let align
  if (!ready.length) align = 'Carico i timeframe…'
  else if (!nOs && !nOb) align = 'Nessun timeframe in zona estrema'
  else if (nOs >= nOb) align = `${nOs} su ${ready.length} allineati in ipervenduto${nOb ? ` · ${nOb} in ipercomprato` : ''}`
  else align = `${nOb} su ${ready.length} allineati in ipercomprato${nOs ? ` · ${nOs} in ipervenduto` : ''}`
  const tone = nOs > nOb ? 'up' : nOb > nOs ? 'down' : 'sec'
  return (
    <div className="card rsi-summary">
      <div className="rsi-strip">
        {order.map((tf, i) => {
          const s = reads[tf]?.state
          return (
            <span key={tf}>
              {i > 0 && <span className="muted"> · </span>}
              <b>{tf}</b> <span className={s === 'oversold' ? 'up' : s === 'overbought' ? 'down' : 'sec'}>{s ? STATE[s] : '…'}</span>
            </span>
          )
        })}
      </div>
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <b className={tone} style={{ fontSize: 14 }}>{align}</b>
        {ready.length > 0 && <span className="note">K sopra D in {nUp} su {ready.length}</span>}
      </div>
    </div>
  )
}

export default function Rsi() {
  const [custom, setCustomRaw] = useState(() => load('rsiCustom', []).filter(s => typeof s === 'string'))
  const [symbol, setSymbolRaw] = useState(() => load('rsiSymbol', BASE[0]))
  const [params, setParamsRaw] = useState(() => cleanParams(load('rsiParams', RSI_DEFAULTS)))
  const [data, setData] = useState({}) // data[tf] = { bars, error, symbol }
  const [open, setOpen] = useState(null)
  const setCustom = v => { setCustomRaw(v); save('rsiCustom', v) }
  const setSymbol = s => { setSymbolRaw(s); save('rsiSymbol', s) }
  const setParams = p => { setParamsRaw(p); save('rsiParams', p) }
  const symRef = useRef(symbol); symRef.current = symbol

  // candele di ogni timeframe, rilette da sole (più spesso per i timeframe piccoli); ferme quando la pagina non si vede
  useEffect(() => {
    setData({})
    const timers = {}, inflight = {}
    const fetchTf = tf => {
      if (inflight[tf] || document.visibilityState === 'hidden') return
      inflight[tf] = true
      get(`/api/rsi/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`)
        .then(j => { if (symRef.current === symbol) setData(d => ({ ...d, [tf]: { bars: j.bars, error: null } })) })
        .catch(e => { if (symRef.current === symbol) setData(d => ({ ...d, [tf]: { ...d[tf], error: e.message } })) })
        .finally(() => { inflight[tf] = false })
    }
    TFS.forEach(tf => { fetchTf(tf); timers[tf] = setInterval(() => fetchTf(tf), REFRESH[tf]) })
    const onVis = () => document.visibilityState === 'visible' && TFS.forEach(fetchTf)
    document.addEventListener('visibilitychange', onVis)
    return () => { Object.values(timers).forEach(clearInterval); document.removeEventListener('visibilitychange', onVis) }
  }, [symbol])

  const reads = useMemo(() => Object.fromEntries(TFS.map(tf => [tf, data[tf]?.bars?.length ? readStoch(data[tf].bars, params) : null])), [data, params])

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <div className="lab">Stocastico RSI</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{short(symbol)}{NAMES[symbol] ? <span className="sec" style={{ fontSize: 14, fontWeight: 600 }}> · {NAMES[symbol]}</span> : null}</div>
        </div>
        <span className="note mono">{symbol}</span>
      </div>
      <SymbolPicker symbol={symbol} setSymbol={setSymbol} custom={custom} setCustom={setCustom} />
      <Summary reads={reads} />
      <div className="rsi-grid">
        {TFS.map(tf => <TfCard key={symbol + tf} tf={tf} entry={data[tf]} read={reads[tf]} params={params} onOpen={() => setOpen(tf)} />)}
      </div>
      <Settings params={params} setParams={setParams} />
      <p className="note">Candele del perpetual su Bitunix, aggiornate da sole: ogni 15 secondi l'1m, ogni 30 il 3m e il 5m, ogni minuto il 15m, più di rado gli altri. Alone verde = ipervenduto (K sotto {params.low}), rosso = ipercomprato (K sopra {params.high}), più acceso quanto più K è estremo; l'impulso segnala un incrocio K/D dentro una zona estrema. Tocca una card per aprirla in grande.</p>
      {open && <BigView symbol={symbol} tf={open} entry={data[open]} read={reads[open]} params={params} onClose={() => setOpen(null)} />}
    </div>
  )
}
