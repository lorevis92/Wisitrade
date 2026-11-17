// ICC Scanner: metodo ICC (Indication, Correction, Continuation) su tutti i perpetual Bitunix con volume sufficiente.
// Regole in shared/icc.js (deterministiche), server in server/icc.js. Solo analisi e segnalazione: nessun ordine.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CandlestickSeries, BaselineSeries, LineStyle } from 'lightweight-charts'
import { get, post, postStream, fmtPrice } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { ICC_DEFAULTS, ICC_LIMITS, CATEGORIES, cleanIcc } from '@shared/icc.js'

const short = s => s.replace(/USDT$/, '')
const when = t => new Date(t).toLocaleString('it-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtR = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`)
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60
const TREND = { up: 'rialzista', down: 'ribassista', range: 'laterale' }
const STAGE = { indication: 'Indication', correction: 'In correzione' }
const TABS = [['scan', 'Scanner'], ['stats', 'Statistiche'], ['bt', 'Backtest'], ['set', 'Impostazioni']]
const gradeCls = g => `rg-grade g${g}`

// ---------- Grafico con zona, livello rotto, entrata, stop e TP ----------
function IccChart({ data, sig }) {
  const box = useRef(null)
  useEffect(() => {
    if (!box.current || !data?.bars?.length) return
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#6B7590', fontFamily: 'DM Mono, monospace', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: '#121826' }, horzLines: { color: '#121826' } },
      rightPriceScale: { borderColor: '#1C2233' }, timeScale: { borderColor: '#1C2233', timeVisible: true, rightOffset: 4 },
      handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: true }, handleScroll: { horzTouchDrag: true, vertTouchDrag: true, mouseWheel: false, pressedMouseMove: true },
    })
    const bars = data.bars, T = bars.map(b => tzShift(b.t))
    const flat = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
    const band = (lo, hi, color) => {
      const s = chart.addSeries(BaselineSeries, { ...flat, baseValue: { type: 'price', price: lo }, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: color, topFillColor2: color, bottomFillColor1: 'transparent', bottomFillColor2: 'transparent' })
      s.setData(T.map(x => ({ time: x, value: hi })))
    }
    for (const z of data.zones || []) band(z.lo, z.hi === z.lo ? z.hi * 1.0005 : z.hi, 'rgba(245,184,61,0.12)')
    const cs = chart.addSeries(CandlestickSeries, { upColor: '#00E5C7', downColor: '#FF5C7A', borderVisible: false, wickUpColor: '#00E5C7', wickDownColor: '#FF5C7A' })
    cs.setData(bars.map((b, i) => ({ time: T[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    const line = (p, color, title, style = LineStyle.Solid, w = 1) => Number.isFinite(p) && cs.createPriceLine({ price: p, color, lineWidth: w, lineStyle: style, title, axisLabelVisible: true })
    const st = sig || data.current
    if (st) {
      line(st.level, '#9AA6C2', 'livello rotto', LineStyle.Dashed, 2)
      line(st.origin, '#6B7590', 'origine', LineStyle.Dotted)
      if (sig) {
        line(sig.entry, '#E8ECF5', 'entrata', LineStyle.Solid, 2); line(sig.stop, '#FF5C7A', 'stop', LineStyle.Solid, 2)
        line(sig.tp1, '#00E5C7', 'TP1', LineStyle.Dashed, 2); line(sig.tp2, '#00E5C7', 'TP2', LineStyle.Dashed)
      } else { line(st.ext, '#00E5C7', 'estremo (TP1)', LineStyle.Dashed); line(st.mini, '#F5B83D', 'mini-struttura', LineStyle.Dotted) }
    }
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 160), to: bars.length + 4 })
    return () => chart.remove()
  }, [data, sig])
  return <div ref={box} style={{ height: 380 }} />
}

function ChartCard({ symbol, sig, onClose }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { setData(null); setErr(null); get(`/api/icc/chart?symbol=${symbol}`).then(setData).catch(e => setErr(e.message)) }, [symbol])
  const ref = useRef(null)
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [symbol, sig])
  const s = sig ? { ...sig, level: sig.level ?? sig.data?.level, origin: sig.origin ?? sig.data?.origin } : null
  return (
    <div className="card" style={{ padding: 12 }} ref={ref}>
      <div className="row"><span className="lab">{short(symbol)} · 1 ora</span><button className="chip" onClick={onClose}>Chiudi</button></div>
      {err && <div className="note down">{err}</div>}
      {!data && !err && <p className="note">Carico…</p>}
      {data && <>
        <p className="note mono" style={{ margin: '4px 0' }}>trend daily {TREND[data.trend]} · {data.zones.length} zone daily{data.current ? ` · setup in corso: ${data.current.side > 0 ? 'long' : 'short'} ${STAGE[data.current.stage] || data.current.stage}` : ''}</p>
        <IccChart data={data} sig={s} />
        <p className="note">Fasce gialle: zone daily. Tratteggiata grigia: livello rotto dall'Indication; puntinata: origine della rottura (chiusura oltre = setup invalidato). {s ? 'Entrata (bianca), stop (rosso), TP1 e TP2 (verdi) del segnale.' : 'Verde: estremo dell\'Indication (TP1); gialla: ultimo swing della mini-struttura della correzione (chiusura oltre = segnale).'}</p>
      </>}
    </div>
  )
}

// ---------- Scanner ----------
function Filters({ cat, setCat, grade, setGrade }) {
  return (
    <div className="chips" style={{ marginBottom: 8 }}>
      {[['all', 'Tutte'], ...Object.entries(CATEGORIES)].map(([k, l]) => <button key={k} className={`chip ${cat === k ? 'active' : ''}`} onClick={() => { setCat(k); save('iccCat', k) }}>{l}</button>)}
      <span style={{ width: 8 }} />
      {['all', 'A', 'B', 'C'].map(g => <button key={g} className={`chip ${grade === g ? 'active' : ''}`} onClick={() => { setGrade(g); save('iccGrade', g) }}>{g === 'all' ? 'Tutti i voti' : `Voto ${g}`}</button>)}
    </div>
  )
}
function SignalRow({ g, onOpen }) {
  return (
    <tr onClick={() => onOpen(g.symbol, g)} style={g.filtered ? { opacity: 0.55 } : undefined}>
      <td><b>{short(g.symbol)}</b></td><td className={g.side > 0 ? 'up' : 'down'}>{g.side > 0 ? 'long' : 'short'}</td>
      <td><span className={gradeCls(g.grade)}>{g.grade}</span></td><td>{g.scenario}{g.deep ? ' · profonda' : ''}</td>
      <td>{fmtPrice(g.entry)}</td><td>{fmtPrice(g.stop)}</td><td>{fmtPrice(g.tp1)}</td><td>{g.tp2 ? fmtPrice(g.tp2) : '—'}</td><td>{g.rr?.toFixed(1)}</td>
      <td>{when(g.created_at)}</td><td>{g.filtered ? `filtrato: ${g.filtered}` : g.status}</td><td className={g.r > 0 ? 'up' : g.r < 0 ? 'down' : ''}>{fmtR(g.final ? g.r_net : g.r)}</td>
    </tr>
  )
}
function ScanTab({ st, open }) {
  const [cat, setCat] = useState(() => load('iccCat', 'all'))
  const [grade, setGrade] = useState(() => load('iccGrade', 'all'))
  const okCat = c => cat === 'all' || c === cat
  const corr = Object.entries(st.states).filter(([, x]) => x.current?.stage === 'correction' && okCat(x.category))
    .map(([sym, x]) => ({ sym, ...x })).sort((a, b) => (b.current.corrAt || 0) - (a.current.corrAt || 0))
  const ind = Object.entries(st.states).filter(([, x]) => x.current?.stage === 'indication' && okCat(x.category)).length
  const active = st.signals.filter(g => !g.final && okCat(g.category) && (grade === 'all' || g.grade === grade))
  const last = st.signals.filter(g => g.final && okCat(g.category) && (grade === 'all' || g.grade === grade)).slice(0, 20)
  const done = st.done?.at, n = Object.keys(st.states).length
  return (
    <>
      <div className="card" style={{ padding: 12 }}>
        <p className="note" style={{ margin: 0 }}>{st.universe ? `${st.universe.n} mercati seguiti su ${st.universe.total} perpetual di Bitunix (volume 24h sopra soglia)` : 'Universo non ancora calcolato'} · {n} analizzati{done ? ` · ultimo giro completo ${when(done)}` : ' · primo giro in corso'} · {ind} in Indication. Aggiornamento dopo ogni chiusura della candela 1H.</p>
      </div>
      {st.error && <div className="warn">{st.error}</div>}
      <Filters cat={cat} setCat={setCat} grade={grade} setGrade={setGrade} />
      <div className="card" style={{ padding: 12 }}>
        <div className="row"><span className="lab">Segnali attivi</span><span className="note mono">{active.length}</span></div>
        {active.length ? (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="tbl clickable">
              <thead><tr><th>Mercato</th><th>Lato</th><th>Voto</th><th>Scenario</th><th>Entrata</th><th>Stop</th><th>TP1</th><th>TP2</th><th>R:R</th><th>Segnale</th><th>Stato</th><th>R ora</th></tr></thead>
              <tbody>{active.map(g => <SignalRow key={g.id} g={g} onOpen={open} />)}</tbody>
            </table>
          </div>
        ) : <p className="note">Nessun segnale attivo{grade !== 'all' || cat !== 'all' ? ' con questi filtri' : ''}.</p>}
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="row"><span className="lab">In correzione</span><span className="note mono">{corr.length}</span></div>
        {corr.length ? (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="tbl clickable">
              <thead><tr><th>Mercato</th><th>Lato</th><th>Categoria</th><th>Trend daily</th><th>Livello rotto</th><th>Estremo</th><th>Mini-struttura</th><th>Origine</th><th>Da</th></tr></thead>
              <tbody>
                {corr.map(x => (
                  <tr key={x.sym} onClick={() => open(x.sym, null)}>
                    <td><b>{short(x.sym)}</b></td><td className={x.current.side > 0 ? 'up' : 'down'}>{x.current.side > 0 ? 'long' : 'short'}</td>
                    <td>{CATEGORIES[x.category]}</td><td>{TREND[x.trend]}</td>
                    <td>{fmtPrice(x.current.level)} <span className="sec">({x.current.levelKind})</span></td><td>{fmtPrice(x.current.ext)}</td>
                    <td>{x.current.mini ? fmtPrice(x.current.mini) : '—'}</td><td>{fmtPrice(x.current.origin)}{x.current.deep ? ' · profonda' : ''}</td>
                    <td>{x.current.corrAt ? when(x.current.corrAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="note">Nessun mercato in correzione adesso.</p>}
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Ultimi segnali chiusi</div>
        {last.length ? (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="tbl clickable">
              <thead><tr><th>Mercato</th><th>Lato</th><th>Voto</th><th>Scenario</th><th>Entrata</th><th>Stop</th><th>TP1</th><th>TP2</th><th>R:R</th><th>Segnale</th><th>Esito</th><th>R netto</th></tr></thead>
              <tbody>{last.map(g => <SignalRow key={g.id} g={g} onOpen={open} />)}</tbody>
            </table>
          </div>
        ) : <p className="note">Ancora nessuno.</p>}
      </div>
    </>
  )
}

// ---------- Statistiche (paper tracking o backtest) ----------
function Group({ title, rows, keyOf }) {
  const m = new Map()
  for (const r of rows) { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r) }
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="tbl">
        <thead><tr><th>{title}</th><th>Trade</th><th>Vinti</th><th>R medio</th><th>R totale</th></tr></thead>
        <tbody>
          {[...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, list]) => {
            const tot = list.reduce((x, r) => x + r.R, 0)
            return <tr key={k}><td>{k}</td><td>{list.length}</td><td>{Math.round(list.filter(r => r.R > 0).length / list.length * 100)}%</td><td className={tot > 0 ? 'up' : tot < 0 ? 'down' : ''}>{fmtR(tot / list.length)}</td><td className={tot > 0 ? 'up' : tot < 0 ? 'down' : ''}>{fmtR(tot)}</td></tr>
          })}
        </tbody>
      </table>
    </div>
  )
}
// rows normalizzate: { symbol, category, side, grade, scenario, deep, R (netto), at }
function Stats({ rows, title, filtered = 0 }) {
  const tot = rows.reduce((x, r) => x + r.R, 0)
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="lab">{title}</div>
      {rows.length ? (
        <>
          <div className="rg-levels mono" style={{ marginTop: 8 }}>
            <span>trade conclusi <b>{rows.length}</b> <i>{filtered ? `${filtered} segnali filtrati esclusi` : 'segnali non filtrati'}</i></span>
            <span>vinti <b>{Math.round(rows.filter(r => r.R > 0).length / rows.length * 100)}%</b> <i>R netto positivo</i></span>
            <span>R medio <b className={tot > 0 ? 'up' : tot < 0 ? 'down' : ''}>{fmtR(tot / rows.length)}</b> <i>totale {fmtR(tot)}</i></span>
          </div>
          <Group title="Scenario" rows={rows} keyOf={r => r.scenario + (r.deep ? ' · profonda' : '')} />
          <Group title="Voto" rows={rows} keyOf={r => r.grade} />
          <Group title="Categoria" rows={rows} keyOf={r => CATEGORIES[r.category] || r.category} />
          <Group title="Lato" rows={rows} keyOf={r => (r.side > 0 ? 'long' : 'short')} />
          <p className="note" style={{ marginTop: 6 }}>R netto con le commissioni (impostazioni). Esito: metà a TP1 con stop poi a pareggio, metà a TP2 (tutto a TP1 se non c'è una zona); stop e TP nella stessa candela = stop. Con pochi trade i numeri non valgono ancora.</p>
        </>
      ) : <p className="note">Ancora nessun trade concluso.</p>}
    </div>
  )
}
function StatsTab({ st }) {
  const fin = st.signals.filter(g => g.final && g.r_net !== null)
  const rows = fin.filter(g => !g.filtered).map(g => ({ ...g, R: g.r_net }))
  return <Stats rows={rows} title="Paper tracking · segnali dal vivo" filtered={fin.length - rows.length} />
}

// ---------- Backtest ----------
function BacktestTab({ st }) {
  const today = new Date().toISOString().slice(0, 10)
  const [syms, setSyms] = useState(() => load('iccBtSyms', 'BTCUSDT, ETHUSDT, SOLUSDT, XAUUSDT, NVDAUSDT'))
  const [from, setFrom] = useState(() => load('iccBtFrom', new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)))
  const [to, setTo] = useState(() => load('iccBtTo', today))
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const ctl = useRef(null)
  const list = syms.split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean).map(x => (/USDT$/.test(x) ? x : `${x}USDT`))
  const run = async () => {
    setBusy(true); setErr(null); setRes(null); setProg('avvio'); ctl.current = new AbortController()
    try {
      await postStream('/api/icc/backtest', { symbols: list, from, to, settings: st.settings }, { signal: ctl.current.signal, onEvent: ev => { if (ev.t === 'phase') setProg(ev.msg); if (ev.t === 'result') setRes(ev.result); if (ev.t === 'error') setErr(ev.error) } })
    } catch (e) { if (e.name !== 'AbortError') setErr(e.message) } finally { setBusy(false); setProg(null) }
  }
  const fin = res ? res.signals.filter(g => g.final) : []
  const rows = fin.filter(g => !g.filtered).map(g => ({ ...g, R: g.Rnet }))
  return (
    <>
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Backtest · stesso motore sullo storico</div>
        <label className="field" style={{ marginTop: 6 }}><span className="lab" style={{ fontSize: 10 }}>Mercati (separati da virgola; con il tasto qui sotto i più scambiati)</span><input value={syms} onChange={e => { setSyms(e.target.value); save('iccBtSyms', e.target.value) }} autoCapitalize="characters" spellCheck={false} /></label>
        <div className="chips" style={{ marginTop: 6 }}>
          <button className="chip" onClick={() => { const v = Object.entries(st.states).sort((a, b) => (b[1].vol || 0) - (a[1].vol || 0)).slice(0, 10).map(([k]) => short(k)).join(', '); setSyms(v); save('iccBtSyms', v) }}>I 10 più scambiati</button>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <label className="field" style={{ flex: 1, minWidth: 130 }}><span className="lab" style={{ fontSize: 10 }}>Dal</span><input type="date" value={from} max={to} onChange={e => { setFrom(e.target.value); save('iccBtFrom', e.target.value) }} /></label>
          <label className="field" style={{ flex: 1, minWidth: 130 }}><span className="lab" style={{ fontSize: 10 }}>Al</span><input type="date" value={to} max={today} onChange={e => { setTo(e.target.value); save('iccBtTo', e.target.value) }} /></label>
        </div>
        {busy ? <button className="btn" style={{ marginTop: 8 }} onClick={() => ctl.current?.abort()}>Annulla</button> : <button className="btn" style={{ marginTop: 8 }} disabled={!list.length} onClick={run}>Avvia il backtest ({list.length} mercati)</button>}
        {prog && <p className="note" style={{ marginTop: 6 }}>{prog}</p>}
        {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
        <p className="note" style={{ marginTop: 6 }}>Stesse regole, stesse impostazioni e stessi filtri dello scanner (trend di BTC e limite nella stessa direzione su tutti i mercati del backtest). Candele di Bitunix archiviate a mesi; la prima volta vanno scaricate. Al massimo 150 mercati × mesi. Serve il codice di controllo. Indipendente dai segnali dal vivo.</p>
      </div>
      {res && (
        <>
          <Stats rows={rows} title={`Risultato · ${new Date(res.from).toLocaleDateString('it-CH')} → ${new Date(res.to - 1).toLocaleDateString('it-CH')}`} filtered={fin.length - rows.length} />
          <div className="card" style={{ padding: 12 }}>
            <div className="lab">Setup per mercato</div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="tbl">
                <thead><tr><th>Mercato</th><th>Indication</th><th>Segnali</th><th>Invalidati</th><th>Scaduti</th><th>Scartati (R:R)</th></tr></thead>
                <tbody>{Object.entries(res.setups).map(([k, x]) => <tr key={k}><td>{short(k)}</td><td>{Object.values(x).reduce((a, b) => a + b, 0)}</td><td>{x.continuation || 0}</td><td>{x.invalidato || 0}</td><td>{x.scaduto || 0}</td><td>{x.scartato || 0}</td></tr>)}</tbody>
              </table>
            </div>
            {res.errors?.length > 0 && <p className="note down">{res.errors.join(' · ')}</p>}
            {Object.entries(res.first || {}).some(([, t]) => t > res.from) && <p className="note">Storico più corto del periodo: {Object.entries(res.first).filter(([, t]) => t > res.from).map(([k, t]) => `${short(k)} dal ${new Date(t).toLocaleDateString('it-CH')}`).join(', ')}.</p>}
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="lab">Segnali del backtest (dal più recente)</div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="tbl">
                <thead><tr><th>Quando</th><th>Mercato</th><th>Lato</th><th>Voto</th><th>Scenario</th><th>Entrata</th><th>Stop</th><th>TP1</th><th>TP2</th><th>R:R</th><th>Esito</th><th>R netto</th></tr></thead>
                <tbody>{res.signals.slice(0, 300).map((g, i) => (
                  <tr key={i} style={g.filtered ? { opacity: 0.55 } : undefined}>
                    <td>{when(g.at)}</td><td><b>{short(g.symbol)}</b></td><td className={g.side > 0 ? 'up' : 'down'}>{g.side > 0 ? 'long' : 'short'}</td><td><span className={gradeCls(g.grade)}>{g.grade}</span></td>
                    <td>{g.scenario}{g.deep ? ' · profonda' : ''}</td><td>{fmtPrice(g.entry)}</td><td>{fmtPrice(g.stop)}</td><td>{fmtPrice(g.tp1)}</td><td>{g.tp2 ? fmtPrice(g.tp2) : '—'}</td><td>{g.rr.toFixed(1)}</td>
                    <td>{g.filtered ? `filtrato: ${g.filtered}` : g.status}</td><td className={g.Rnet > 0 ? 'up' : g.Rnet < 0 ? 'down' : ''}>{fmtR(g.Rnet)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ---------- Impostazioni ----------
const FIELDS = [
  ['Struttura', [['swingN', 'Candele per lato di uno swing', 1], ['zoneAtr', 'Zone daily: swing entro (× ATR daily)', 0.05], ['zoneMin', 'Swing minimi per una zona', 1], ['zoneDays', 'Giorni di swing per le zone', 10]]],
  ['Correction e Continuation', [['retestAtr', 'Correzione: entro (× ATR 4H) dal livello', 0.05], ['deepAtr', 'Correzione profonda: oltre (× ATR 4H)', 0.05], ['maxIndBars', 'Scadenza senza correzione (candele 1H)', 1], ['maxCorrBars', 'Durata massima della correzione (candele 1H)', 1], ['stopAtr', 'Stop oltre la correzione (× ATR 1H)', 0.05]]],
  ['Segnali', [['minRR', 'R:R minimo per un segnale', 0.1], ['rrA', 'R:R minimo per il voto A', 0.1], ['maxSameDir', 'Segnali attivi nella stessa direzione (0 = nessun limite)', 1], ['maxHold', 'Durata massima di un trade (candele 1H)', 1], ['fee', 'Commissione per lato %', 0.01]]],
  ['Mercati', [['minVolCrypto', 'Volume 24h minimo crypto (USDT)', 100000], ['minVolStock', 'Volume 24h minimo azioni (USDT)', 10000], ['minVolCommodity', 'Volume 24h minimo materie prime (USDT)', 10000], ['maxMarkets', 'Mercati seguiti al massimo', 1]]],
]
function SettingsTab({ st, reload }) {
  const [v, setV] = useState(() => Object.fromEntries(Object.keys(ICC_LIMITS).map(k => [k, String(st.settings[k])])))
  const [flags, setFlags] = useState({ btcFilter: st.settings.btcFilter, notifyA: st.settings.notifyA })
  const [msg, setMsg] = useState(null)
  const bad = k => { const x = +v[k], [lo, hi] = ICC_LIMITS[k]; return !(v[k] !== '' && Number.isFinite(x) && x >= lo && x <= hi) }
  const anyBad = Object.keys(ICC_LIMITS).some(bad)
  const send = async raw => {
    try { const r = await post('/api/icc/settings', { settings: raw }); setMsg({ ok: true, text: `Salvate${r.universe ? ` · ${r.universe.n} mercati seguiti` : ''}` }); reload() } catch (e) { setMsg({ ok: false, text: e.message }) }
  }
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="lab">Impostazioni dello scanner</div>
      {FIELDS.map(([title, list]) => (
        <div key={title} style={{ marginTop: 10 }}>
          <div className="lab" style={{ fontSize: 10 }}>{title}</div>
          <div className="tt-grid">
            {list.map(([k, l, step]) => (
              <label key={k} className="field"><span className="lab" style={{ fontSize: 10 }}>{l}</span>
                <input type="number" inputMode="decimal" step={step} value={v[k]} style={bad(k) ? { borderColor: '#FF5C7A' } : undefined} onChange={e => setV(d => ({ ...d, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="chips" style={{ marginTop: 10 }}>
        <button className={`chip ${flags.btcFilter ? 'active' : ''}`} onClick={() => setFlags(f => ({ ...f, btcFilter: !f.btcFilter }))}>Filtro trend di BTC per le altcoin</button>
        <button className={`chip ${flags.notifyA ? 'active' : ''}`} onClick={() => setFlags(f => ({ ...f, notifyA: !f.notifyA }))}>Notifiche push per i segnali A</button>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn" style={{ width: 'auto' }} disabled={anyBad} onClick={() => send({ ...Object.fromEntries(Object.keys(ICC_LIMITS).map(k => [k, +v[k]])), ...flags })}>Salva</button>
        <button className="chip" onClick={() => { setV(Object.fromEntries(Object.keys(ICC_LIMITS).map(k => [k, String(ICC_DEFAULTS[k])]))); setFlags({ btcFilter: ICC_DEFAULTS.btcFilter, notifyA: ICC_DEFAULTS.notifyA }) }}>Valori di default</button>
      </div>
      {msg && <div className={`note ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 6 }}>{msg.text}</div>}
      <p className="note" style={{ marginTop: 6 }}>Timeframe del metodo fissi: zone e trend sul giornaliero, Indication sul 4 ore, Correction e Continuation sull'1 ora. Per salvare serve il codice di controllo. Le nuove impostazioni valgono dal prossimo giro dello scanner (dopo la prossima chiusura 1H) e per i nuovi segnali; i segnali già registrati restano com'erano.</p>
    </div>
  )
}

export default function Icc() {
  const [tab, setTabRaw] = useState(() => load('iccTab', 'scan'))
  const setTab = t => { setTabRaw(t); save('iccTab', t) }
  const [st, setSt] = useState(null)
  const [err, setErr] = useState(null)
  const [chart, setChart] = useState(null)
  const reload = () => get('/api/icc/state').then(x => { setSt(x); setErr(null) }).catch(e => setErr(e.message))
  useEffect(() => { reload(); const id = setInterval(reload, 120000); return () => clearInterval(id) }, [])
  const open = (symbol, sig) => setChart({ symbol, sig })
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <div className="lab">Mercato · ICC Scanner</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>Indication, Correction, Continuation</div>
        </div>
      </div>
      <div className="seg" style={{ marginBottom: 12, flexWrap: 'wrap' }}>{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {err && !st && <div className="warn">{err}</div>}
      {!st && !err && <div className="card note" style={{ padding: 12 }}>Carico…</div>}
      {st && chart && <ChartCard symbol={chart.symbol} sig={chart.sig} onClose={() => setChart(null)} />}
      {st && tab === 'scan' && <ScanTab st={st} open={open} />}
      {st && tab === 'stats' && <StatsTab st={st} />}
      {st && tab === 'bt' && <BacktestTab st={st} />}
      {st && tab === 'set' && <SettingsTab st={st} reload={reload} />}
      <p className="note">Solo analisi e segnalazione: nessun ordine sull'exchange. Indication = chiusura 4H oltre una zona daily o l'ultimo swing 4H; Correction = ritorno verso il livello rotto senza chiudere oltre l'origine della rottura; Continuation = chiusura 1H oltre l'ultimo swing della mini-struttura della correzione. Voto A = a favore del trend daily e R:R di almeno {st?.settings?.rrA ?? 2}. Notifiche push solo per i segnali A.</p>
    </div>
  )
}
