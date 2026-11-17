// Strategia SMC (liquidità → order flow → order block + FVG → entrata sul ritorno): Simulazione, Prova e Reale.
// Regole in shared/smc.js (docs/smc.md), server in server/smc.js. Indipendente dalle altre strategie.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CandlestickSeries, BaselineSeries, LineSeries, createSeriesMarkers, LineStyle } from 'lightweight-charts'
import { get, post, postStream, fmtPrice, fmtUsd, fmtSigned, dateCH, timeCH } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import StrategyTabs, { useStrategyMode } from '../components/StrategyTabs.jsx'
import { Sparkline } from '../components/ManualTrade.jsx'
import { SMC_DEFAULTS, SMC_LIMITS, DIR_TFS, ENTRY_TFS, TF_MS, cleanSmc } from '@shared/smc.js'

const RULES = [
  ['minRR', 'Rischio/rendimento minimo', 0.5], ['maxCost', 'Costi massimi (% del rischio)', 1], ['stopAtr', 'Stop oltre il rifiuto (ATR)', 0.05],
  ['invBars', 'Inversione entro (candele)', 1], ['retBars', 'Ritorno entro (candele)', 1], ['rejBars', 'Rifiuto entro (candele dopo il ritorno)', 1],
  ['atrN', 'ATR (periodi, Wilder)', 1], ['mergeAtr', 'Livelli uniti entro (ATR)', 0.01], ['fvgMinAtr', 'FVG minimo (ATR)', 0.05],
  ['obBack', 'Order block: candele indietro', 1], ['riseMax', 'Salita verso il livello: candele', 1], ['ageE', 'Durata livelli d\'entrata (candele)', 10], ['ageD', 'Durata livelli di direzione (candele)', 5],
]
const RISK = [
  ['riskPct', 'Rischio per trade (% del capitale)', 0.1], ['maxPos', 'Posizioni aperte al massimo', 1], ['maxDayLoss', 'Perdita massima del giorno %', 0.5],
  ['capital', 'Capitale (USDT)', 50], ['fee', 'Commissione per lato %', 0.01], ['slip', 'Slittamento per lato % (Simulazione)', 0.01], ['funding', 'Funding per periodo % (Simulazione)', 0.005],
]
const TOGGLES = [
  ['allowNeutral', 'Trade anche con direzione neutra'], ['stopAtSweep', 'Stop oltre la presa (invece del rifiuto)'], ['firstRRTarget', 'Target = primo livello con R/R minimo'],
  ['notifySetup', 'Avviso: setup in attesa del ritorno'], ['notifyEntry', 'Avviso: entrata'], ['notifyExit', 'Avviso: uscita'], ['notifyDecay', 'Avviso: setup decaduto'],
]
const NUMS = [...RULES, ...RISK]
const tone = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'sec')
const pct = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
const r2 = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`)
const sideTxt = s => (s > 0 ? 'long' : 'short')
const flowTxt = f => (f > 0 ? 'rialzista' : f < 0 ? 'ribassista' : 'neutra')
const STAGE = { inv: 'in attesa dell\'inversione', ret: 'in attesa del ritorno nella zona' }
const short = s => s.replace(/USDT$/, '')
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60

function Gate({ onOk }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(null)
  return (
    <form className="card" style={{ padding: 12 }} onSubmit={async e => {
      e.preventDefault(); save('adminCode', code.trim())
      try { await get('/api/admin/check'); onOk() } catch (x) { save('adminCode', ''); setErr(x.message) }
    }}>
      <div className="lab">SMC · area privata</div>
      <p className="note" style={{ margin: '6px 0' }}>Serve il codice di controllo, lo stesso della pagina Strategia.</p>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1, minWidth: 0 }}><input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Codice di controllo" autoComplete="current-password" /></div>
        <button className="btn" style={{ width: 'auto' }} disabled={!code.trim()}>Entra</button>
      </div>
      {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
    </form>
  )
}

// ---------- Impostazioni (titoli con ricerca, timeframe, regole, rischio, avvisi, configurazioni salvate) ----------
let pairsCache = null
function SymbolSearch({ value, onChange }) {
  const [pairs, setPairs] = useState(pairsCache || [])
  const [qq, setQ] = useState('')
  useEffect(() => { if (!pairsCache) get('/api/smc/pairs').then(j => { pairsCache = j.pairs; setPairs(j.pairs) }).catch(() => {}) }, [])
  const found = qq.trim() ? pairs.filter(p => p.symbol.includes(qq.trim().toUpperCase()) && !value.includes(p.symbol)).slice(0, 12) : []
  return (
    <div style={{ marginTop: 8 }}>
      <span className="lab" style={{ fontSize: 10 }}>Titoli (coppie Bitunix operabili via API)</span>
      <div className="chips" style={{ marginTop: 4 }}>
        {value.map(s => <button key={s} className="chip active" onClick={() => value.length > 1 && onChange(value.filter(x => x !== s))} title="Togli">{short(s)} ×</button>)}
      </div>
      <div className="field" style={{ marginTop: 6 }}><input value={qq} onChange={e => setQ(e.target.value)} placeholder="Cerca e aggiungi (es. SOL, NVDA)" /></div>
      {found.length > 0 && <div className="chips" style={{ marginTop: 4 }}>{found.map(p => <button key={p.symbol} className="chip" onClick={() => { onChange([...value, p.symbol]); setQ('') }}>+ {short(p.symbol)}{p.mark ? ' ⚠' : ''}</button>)}</div>}
    </div>
  )
}

function Presets({ value, onLoad }) {
  const [list, setList] = useState([])
  const [name, setName] = useState('')
  const [msg, setMsg] = useState(null)
  useEffect(() => { get('/api/smc/presets').then(j => setList(j.presets)).catch(() => {}) }, [])
  const act = async (path, body, ok) => { try { setList((await post(path, body)).presets); setMsg({ ok: true, text: ok }) } catch (e) { setMsg({ ok: false, text: e.message }) } }
  return (
    <div style={{ marginTop: 10 }}>
      <span className="lab" style={{ fontSize: 10 }}>Configurazioni salvate (comuni alle schede SMC)</span>
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        <div className="field" style={{ flex: 1, minWidth: 0 }}><input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" maxLength={40} /></div>
        <button className="chip" disabled={!name.trim()} onClick={() => act('/api/smc/presets', { name, settings: value }, `"${name.trim()}" salvata`)}>Salva</button>
      </div>
      {list.length > 0 && (
        <div className="chips" style={{ marginTop: 6 }}>
          {list.map(p => (
            <span key={p.name} className="row" style={{ gap: 2 }}>
              <button className="chip" onClick={() => { onLoad(p.settings); setMsg({ ok: true, text: `"${p.name}" caricata` }) }}>{p.name}</button>
              <button className="chip" aria-label={`Elimina ${p.name}`} onClick={() => window.confirm(`Eliminare "${p.name}"?`) && act('/api/smc/presets/delete', { name: p.name }, 'Eliminata')}>×</button>
            </span>
          ))}
        </div>
      )}
      {msg && <div className={`note ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 4 }}>{msg.text}</div>}
    </div>
  )
}

function SettingsForm({ value, onChange, title, open = false }) {
  const toDraft = v => Object.fromEntries(NUMS.map(([k]) => [k, String(v[k])]))
  const [draft, setDraft] = useState(() => toDraft(value))
  useEffect(() => { setDraft(toDraft(value)) }, [value])
  const bad = k => { const v = +draft[k], [lo, hi] = SMC_LIMITS[k]; return !(draft[k] !== '' && Number.isFinite(v) && v >= lo && v <= hi) }
  const apply = () => { if (!NUMS.some(([k]) => bad(k))) onChange(cleanSmc({ ...value, ...Object.fromEntries(NUMS.map(([k]) => [k, +draft[k]])) })) }
  const set = patch => onChange(cleanSmc({ ...value, ...patch }))
  const grid = list => (
    <div className="tt-grid">
      {list.map(([k, l, step]) => (
        <label key={k} className="field">
          <span className="lab" style={{ fontSize: 10 }}>{l}</span>
          <input type="number" inputMode="decimal" step={step} value={draft[k]} style={bad(k) ? { borderColor: '#FF5C7A' } : undefined}
            onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} onBlur={apply} onKeyDown={e => e.key === 'Enter' && apply()} />
        </label>
      ))}
    </div>
  )
  return (
    <details className="card" style={{ padding: 12 }} open={open}>
      <summary className="row"><span className="lab">{title}</span><span className="mono muted" style={{ fontSize: 11 }}>{value.symbols.length} titoli · {value.dirTf}/{value.entryTf} · {value.riskPct}% · R/R {value.minRR}</span></summary>
      <SymbolSearch value={value.symbols} onChange={symbols => set({ symbols })} />
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <span className="lab" style={{ fontSize: 10 }}>Direzione</span>
          <div className="seg" style={{ marginTop: 4 }}>{DIR_TFS.map(tf => <button key={tf} className={value.dirTf === tf ? 'on' : ''} disabled={TF_MS[tf] <= TF_MS[value.entryTf]} onClick={() => set({ dirTf: tf })}>{tf}</button>)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <span className="lab" style={{ fontSize: 10 }}>Entrata</span>
          <div className="seg" style={{ marginTop: 4 }}>{ENTRY_TFS.map(tf => <button key={tf} className={value.entryTf === tf ? 'on' : ''} disabled={TF_MS[tf] >= TF_MS[value.dirTf]} onClick={() => set({ entryTf: tf })}>{tf}</button>)}</div>
        </div>
      </div>
      <div className="lab" style={{ marginTop: 10, fontSize: 10 }}>Regole</div>
      {grid(RULES)}
      <div className="lab" style={{ marginTop: 10, fontSize: 10 }}>Rischio e costi</div>
      {grid(RISK)}
      <div className="chips" style={{ marginTop: 10 }}>
        {TOGGLES.map(([k, l]) => <button key={k} className={`chip ${value[k] ? 'active' : ''}`} onClick={() => set({ [k]: !value[k] })}>{l}</button>)}
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        <button className="chip" onClick={() => window.confirm('Ripristinare i valori predefiniti (titoli compresi)?') && onChange(cleanSmc({ ...SMC_DEFAULTS, active: value.active }))}>Ripristina default</button>
      </div>
      <Presets value={value} onLoad={s => onChange(cleanSmc({ ...s, active: value.active }))} />
    </details>
  )
}

function Tiles({ items }) {
  return <div className="tt-tiles">{items.map(([l, v, cls]) => <div key={l} className="tile"><div className="lab" style={{ fontSize: 10 }}>{l}</div><div className={`mono ${cls || ''}`} style={{ fontSize: 15, fontWeight: 700 }}>{v}</div></div>)}</div>
}

// ---------- Grafico: livelli (presi e non), order block, FVG, setup in corso, trade ----------
function SmcChart({ data, trades = [], viewKey, height = 420 }) {
  const box = useRef(null)
  const view = useRef({ key: null, range: null })
  useEffect(() => {
    if (!box.current || !data?.bars?.length) return
    const bars = data.bars
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#6B7590', fontFamily: 'DM Mono, monospace', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: '#121826' }, horzLines: { color: '#121826' } },
      rightPriceScale: { borderColor: '#1C2233' }, timeScale: { borderColor: '#1C2233', timeVisible: true, rightOffset: 4 },
      handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: true, axisDoubleClickReset: true }, handleScroll: { horzTouchDrag: true, vertTouchDrag: true, mouseWheel: false, pressedMouseMove: true },
    })
    const T = bars.map(b => b.t), first = T[0], last = T.at(-1)
    const span = (a, b) => { const out = []; for (const t of T) if (t >= a && t <= b) out.push(tzShift(t)); return out }
    const flat = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
    const band = (lo, hi, from, to, color) => {
      const ts = span(Math.max(first, from), to); if (!ts.length) return
      const s = chart.addSeries(BaselineSeries, { ...flat, baseValue: { type: 'price', price: lo }, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: color, topFillColor2: color, bottomFillColor1: 'transparent', bottomFillColor2: 'transparent' })
      s.setData(ts.map(x => ({ time: x, value: hi })))
    }
    const seg = (p, from, to, color, style = LineStyle.Solid, width = 1) => {
      const ts = span(Math.max(first, from), to); if (ts.length < 1) return
      const s = chart.addSeries(LineSeries, { ...flat, color, lineWidth: width, lineStyle: style })
      s.setData(ts.map(x => ({ time: x, value: p })))
    }
    for (const f of data.fvgs.slice(-25)) band(f.lo, f.hi, f.t, f.t + 6 * TF_MS[data.entryTf], f.side > 0 ? 'rgba(0,229,199,0.10)' : 'rgba(255,92,122,0.10)')
    for (const o of data.obs.slice(-20)) band(o.lo, o.hi, o.t, o.broken ?? last, o.side > 0 ? 'rgba(0,229,199,0.16)' : 'rgba(255,92,122,0.16)')
    for (const p of data.pending) band(p.ob.lo, p.ob.hi, p.ob.t, last, 'rgba(245,184,61,0.22)')
    const cs = chart.addSeries(CandlestickSeries, { upColor: '#00E5C7', downColor: '#FF5C7A', borderVisible: false, wickUpColor: '#00E5C7', wickDownColor: '#FF5C7A' })
    cs.setData(bars.map(b => ({ time: tzShift(b.t), open: b.o, high: b.h, low: b.l, close: b.c })))
    for (const l of data.levels) seg(l.p, l.t, last, l.side > 0 ? `rgba(255,92,122,${l.important ? 0.9 : 0.35})` : `rgba(0,229,199,${l.important ? 0.9 : 0.35})`, l.important ? LineStyle.Solid : LineStyle.Dashed, l.important ? 2 : 1)
    for (const l of data.taken.slice(-60)) seg(l.p, l.t, l.taken, 'rgba(154,166,194,0.35)', LineStyle.Dotted)
    const mk = []
    for (const p of data.pending) mk.push({ time: tzShift(p.sweep.t), position: p.side < 0 ? 'aboveBar' : 'belowBar', color: '#F5B83D', shape: p.side < 0 ? 'arrowDown' : 'arrowUp', text: 'presa' })
    for (const g of data.signals) mk.push({ time: tzShift(g.rej.t), position: g.side < 0 ? 'aboveBar' : 'belowBar', color: '#E8ECF5', shape: 'circle', text: `rifiuto ${sideTxt(g.side)}` })
    for (const t of trades) {
      if (t.openedAt < first) continue
      const tIn = Math.floor(t.openedAt / TF_MS[data.entryTf]) * TF_MS[data.entryTf]
      const tOut = t.closedAt ? Math.floor((t.closedAt - 1) / TF_MS[data.entryTf]) * TF_MS[data.entryTf] : last
      mk.push({ time: tzShift(Math.min(tIn, last)), position: t.side > 0 ? 'belowBar' : 'aboveBar', color: t.side > 0 ? '#00E5C7' : '#FF5C7A', shape: t.side > 0 ? 'arrowUp' : 'arrowDown', text: `entrata ${sideTxt(t.side)}` })
      seg(t.stop, tIn, tOut, '#FF5C7A', LineStyle.Dashed); seg(t.target, tIn, tOut, '#00E5C7', LineStyle.Dashed); seg(t.entry, tIn, tOut, '#9AA6C2', LineStyle.Dotted)
      if (t.closedAt) mk.push({ time: tzShift(Math.min(tOut, last)), position: 'inBar', color: t.pnl > 0 ? '#00E5C7' : '#FF5C7A', shape: 'square', text: t.reason })
    }
    mk.sort((a, b) => a.time - b.time)
    if (mk.length) createSeriesMarkers(cs, mk)
    const saved = view.current.key === viewKey ? view.current.range : null
    chart.timeScale().setVisibleLogicalRange(saved || { from: Math.max(0, bars.length - 160), to: bars.length + 4 })
    return () => { view.current = { key: viewKey, range: chart.timeScale().getVisibleLogicalRange() }; chart.remove() }
  }, [data, trades, viewKey])
  return <div ref={box} style={{ height }} />
}

function ChartCard({ settings, trades }) {
  const [sym, setSym] = useState(() => load('smcChartSym', settings.symbols[0]))
  const symbol = settings.symbols.includes(sym) ? sym : settings.symbols[0]
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const key = `${symbol}|${settings.entryTf}|${settings.dirTf}`
  useEffect(() => {
    let alive = true
    const run = () => post('/api/smc/chart', { symbol, settings }).then(d => { if (alive) { setData(d); setErr(null) } }).catch(e => alive && setErr(e.message))
    setData(null); run()
    const id = setInterval(run, Math.max(60000, TF_MS[settings.entryTf] / 3))
    return () => { alive = false; clearInterval(id) }
  }, [key, JSON.stringify([settings.minRR, settings.allowNeutral, settings.ageE, settings.ageD, settings.riseMax, settings.invBars, settings.retBars])])
  const own = useMemo(() => trades.filter(t => (t.symbol || t.sym) === symbol), [trades, symbol])
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="lab">Grafico {settings.entryTf}</span>
        <div className="chips">{settings.symbols.map(s => <button key={s} className={`chip ${s === symbol ? 'active' : ''}`} onClick={() => { setSym(s); save('smcChartSym', s) }}>{short(s)}</button>)}</div>
      </div>
      {err && <div className="note down">{err}</div>}
      {!data && !err && <p className="note">Carico…</p>}
      {data && (
        <>
          <p className="note mono" style={{ margin: '4px 0' }}>direzione {settings.dirTf}: <b className={tone(data.flow)}>{flowTxt(data.flow)}</b> · ATR {fmtPrice(data.atr)} · {data.levels.filter(l => l.important).length} livelli importanti non presi</p>
          <SmcChart data={data} trades={own} viewKey={key} />
          <p className="note">Linee piene: livelli di liquidità importanti non presi (rosse sopra, verdi sotto); tratteggiate: livelli deboli; puntinate grigie: livelli già presi. Zone verdi/rosse: order block (più scure) e FVG; zona gialla: order block di un setup in corso. Trade: entrata, stop (rosso) e target (verde).</p>
          {data.pending.length > 0 && <div className="lv-list">{data.pending.map(p => <SetupRow key={p.id} p={p} sym={symbol} />)}</div>}
        </>
      )}
    </div>
  )
}

function SetupRow({ p, sym }) {
  return (
    <div className="lv-item">
      <div className="lv-head mono"><b>{short(sym)}</b><span className={p.side > 0 ? 'up' : 'down'}>{sideTxt(p.side)}</span><span className="sec">{STAGE[p.stage] || p.stage}</span></div>
      <div className="note">presa di {fmtPrice(p.level.p)} ({p.level.kinds}, {p.level.touches} tocchi) alle {timeCH(p.sweep.t)} del {dateCH(p.sweep.t)} · order block {fmtPrice(p.ob.lo)}–{fmtPrice(p.ob.hi)}</div>
    </div>
  )
}

function TradeRow({ t, onClose }) {
  const open = t.status === 'open'
  const res = open ? t.upnl : t.pnl
  return (
    <div className="lv-item">
      <div className="lv-head mono">
        <b>{short(t.symbol || t.sym)}</b><span className={t.side > 0 ? 'up' : 'down'}>{sideTxt(t.side)}</span>
        <span className="sec">{dateCH(t.openedAt)} {timeCH(t.openedAt)}{t.closedAt ? ` → ${dateCH(t.closedAt)} ${timeCH(t.closedAt)}` : ''}</span>
        <span>{fmtPrice(t.entry)} → {fmtPrice(open ? t.last : t.exit)}</span>
        <b className={tone(res)}>{fmtSigned(res)} USDT</b>
        {!open && <span className={tone(t.R)}>{r2(t.R)}</span>}
      </div>
      <div className="note">
        stop {fmtPrice(t.stop)} · target {fmtPrice(t.target)} · R/R previsto {t.rrPlan?.toFixed(2)}{t.rrFill ? ` (sull'eseguito ${t.rrFill.toFixed(2)})` : ''} · leva {t.leverage}x
        {t.setup?.level && ` · presa di ${fmtPrice(t.setup.level.p)} (${t.setup.level.kinds})`}{t.setup?.ob && ` · order block ${fmtPrice(t.setup.ob.lo)}–${fmtPrice(t.setup.ob.hi)}`}
        {!open && <> · {t.reason}{t.fees !== undefined ? ` · commissioni ${fmtUsd(t.fees)}` : ''}{t.funding ? ` · funding ${fmtSigned(-t.funding)}` : ''}</>}
        {open && t.tpByApp && ' · target gestito dall\'app'}{open && t.liq ? ` · liquidazione ${fmtPrice(t.liq)}` : ''}
      </div>
      {onClose && <button className="chip" style={{ marginTop: 6 }} onClick={() => onClose(t)}>Chiudi adesso</button>}
    </div>
  )
}

function Groups({ title, rows }) {
  const list = Object.entries(rows || {})
  if (!list.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div className="lab" style={{ fontSize: 10 }}>{title}</div>
      <div className="lv-list">
        {list.map(([k, g]) => (
          <div key={k} className="lv-head mono" style={{ padding: '3px 2px', borderBottom: '1px solid var(--border)' }}>
            <b style={{ minWidth: 64 }}>{short(k)}</b><span className="sec">{g.n} trade · vinti {Math.round(g.wins / g.n * 100)}%</span><b className={tone(g.pnl)}>{fmtSigned(g.pnl)}</b><span className={tone(g.R)}>{r2(g.R / g.n)} medio</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Simulazione ----------
function SimTab() {
  const [s, setSRaw] = useState(() => cleanSmc(load('smcSim', SMC_DEFAULTS)))
  const setS = v => { setSRaw(v); save('smcSim', v) }
  const [from, setFrom] = useState(() => load('smcFrom', ''))
  const [to, setTo] = useState(() => load('smcTo', ''))
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [showDisc, setShowDisc] = useState(false)
  const ctl = useRef(null)
  const run = async () => {
    setBusy(true); setErr(null); setRes(null); setProg('avvio')
    ctl.current = new AbortController()
    try {
      await postStream('/api/smc/sim', { settings: s, from: from || null, to: to || null }, {
        signal: ctl.current.signal,
        onEvent: ev => {
          if (ev.t === 'phase') setProg(ev.msg)
          if (ev.t === 'load') setProg(`${ev.sym}: ${ev.bars} candele dal ${ev.first ? new Date(ev.first).toLocaleDateString('it-CH') : '—'}`)
          if (ev.t === 'result') setRes(ev.result)
          if (ev.t === 'error') setErr(ev.error)
        },
      })
    } catch (e) { if (e.name !== 'AbortError') setErr(e.message) } finally { setBusy(false); setProg(null) }
  }
  const S = res?.summary
  return (
    <>
      <SettingsForm value={s} onChange={setS} title="Impostazioni della Simulazione" open />
      <div className="card" style={{ padding: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1, minWidth: 130 }}><span className="lab" style={{ fontSize: 10 }}>Dal (vuoto = ultimo anno)</span><input type="date" value={from} onChange={e => { setFrom(e.target.value); save('smcFrom', e.target.value) }} /></label>
          <label className="field" style={{ flex: 1, minWidth: 130 }}><span className="lab" style={{ fontSize: 10 }}>Al (vuoto = oggi)</span><input type="date" value={to} onChange={e => { setTo(e.target.value); save('smcTo', e.target.value) }} /></label>
        </div>
        <div className="chips" style={{ marginTop: 6 }}><button className="chip" onClick={() => { setFrom('2019-01-01'); save('smcFrom', '2019-01-01') }}>Tutto lo storico di Bitunix</button></div>
        {busy
          ? <button className="btn" style={{ marginTop: 8 }} onClick={() => ctl.current?.abort()}>Annulla</button>
          : <button className="btn" style={{ marginTop: 8 }} onClick={run}>Avvia la simulazione</button>}
        {prog && <p className="note" style={{ marginTop: 6 }}>{prog}</p>}
        {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
        <p className="note" style={{ marginTop: 6 }}>Candele di Bitunix archiviate a mesi nell'app: la prima volta su tutto lo storico a 15 minuti servono alcuni minuti per titolo. Stesse regole di Prova e Reale; entrata all'apertura della candela dopo il rifiuto con lo slittamento; stop e target nella stessa candela: candele da 1 minuto, altrimenti conta lo stop. Funding stimato sempre pagato.</p>
      </div>
      {S && (
        <>
          <div className="card" style={{ padding: 12 }}>
            <div className="row"><span className="lab">Risultato</span><span className="note mono">{res.from ? new Date(res.from).toLocaleDateString('it-CH') : '—'} → {res.to ? new Date(res.to).toLocaleDateString('it-CH') : '—'}</span></div>
            <Tiles items={[
              ['capitale finale', `${fmtUsd(S.balance)} USDT`], ['rendimento', pct(S.ret), tone(S.ret)], ['massimo calo', `−${S.maxDD.toFixed(1)}%`, 'down'],
              ['trade', `${S.trades} · vinti ${S.winRate.toFixed(0)}%`], ['R medio', r2(S.avgR), tone(S.avgR)], ['profit factor', Number.isFinite(S.pf) ? S.pf.toFixed(2) : '∞'],
              ['commissioni', `−${fmtUsd(S.fees)}`, 'down'], ['funding', fmtSigned(-S.funding), tone(-S.funding)], ['slittamento', `−${fmtUsd(S.slip)}`, 'down'],
              ['al target', String(S.targets), 'up'], ['allo stop', String(S.stops), 'down'], ['aperte a fine periodo', String(res.open.length)],
            ]} />
            <Sparkline points={res.curve.map(p => ({ t: p.t, v: p.balance }))} height={90} />
            {res.unresolved > 0 && <p className="note">{res.unresolved} candele con stop e target insieme senza candele da 1 minuto: contato lo stop.</p>}
            {res.errors?.length > 0 && <p className="note down">{res.errors.join(' · ')}</p>}
            <Groups title="Per titolo" rows={res.bySymbol} />
            <Groups title="Per direzione" rows={res.bySide} />
            <Groups title="Per mese" rows={res.byMonth} />
          </div>
          <ChartCard settings={s} trades={res.trades} />
          <div className="card" style={{ padding: 12 }}>
            <div className="lab">Trade {res.tradesTotal > res.trades.length ? `(ultimi ${res.trades.length} di ${res.tradesTotal})` : ''}</div>
            <div className="lv-list">{res.trades.slice(-60).reverse().map((t, i) => <TradeRow key={i} t={{ ...t, symbol: t.sym, status: 'closed' }} />)}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="lab">Setup scartati ({res.discardedTotal})</div>
            <div className="lv-list">{Object.entries(res.discardedBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="lv-head mono" style={{ padding: '2px' }}><span className="sec" style={{ flex: 1 }}>{k.replace(/#/g, 'N')}</span><b>{v}</b></div>)}</div>
            <button className="chip" style={{ marginTop: 8 }} onClick={() => setShowDisc(v => !v)}>{showDisc ? 'Nascondi l\'elenco' : 'Mostra gli ultimi'}</button>
            {showDisc && <div className="lv-list">{res.discarded.slice(-80).reverse().map((d, i) => <div key={i} className="lv-item"><div className="lv-head mono"><b>{short(d.sym)}</b><span className={d.side > 0 ? 'up' : 'down'}>{sideTxt(d.side)}</span><span className="sec">{dateCH(d.t)} {timeCH(d.t)}</span></div><div className="note">{d.reason} · livello {fmtPrice(d.level)}</div></div>)}</div>}
          </div>
        </>
      )}
    </>
  )
}

// ---------- Prova e Reale ----------
function LiveTab({ mode }) {
  const [st, setSt] = useState(null)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const [cap, setCap] = useState('')
  const reload = () => get(`/api/smc/state?mode=${mode}`).then(x => { setSt(x); setErr(null) }).catch(e => setErr(e.message))
  useEffect(() => { setSt(null); reload(); const id = setInterval(reload, 30000); return () => clearInterval(id) }, [mode])
  const act = async (path, body, ok) => { try { setSt(await post(path, { mode, ...body })); setMsg({ ok: true, text: ok }) } catch (e) { setMsg({ ok: false, text: e.message }) } }
  if (err && !st) return <div className="warn">{err}</div>
  if (!st) return <div className="card note" style={{ padding: 12 }}>Carico…</div>
  const s = st.settings, acc = st.account, live = mode === 'live'
  const res = acc ? acc.balance - acc.start : 0
  const onClose = t => { if (window.confirm(`Chiudere ${short(t.symbol)} adesso${live ? ' su Bitunix' : ''}?`)) act('/api/smc/close', { id: t.id }, `${short(t.symbol)} chiusa`) }
  return (
    <>
      {live && !st.liveAllowed && <div className="warn">Reale non abilitato: servono LIVE_TRADING=on e le chiavi Bitunix su Vercel. Puoi preparare le impostazioni.</div>}
      <div className="card" style={{ padding: 12 }}>
        <div className="row">
          <span className="lab">{live ? 'Reale · capitale dedicato' : 'Prova · capitale fittizio'}</span>
          <span className={`pill ${s.active ? 'long' : 'closed'}`}>{s.active ? 'attiva' : 'ferma'}</span>
        </div>
        {acc ? (
          <>
            <Tiles items={[['capitale', `${fmtUsd(acc.balance)} USDT`], ['risultato', `${fmtSigned(res)} (${pct(res / acc.start * 100)})`, tone(res)], ['posizioni aperte', `${st.open.length}/${s.maxPos}`]]} />
            <Sparkline points={(acc.curve || []).map(p => ({ t: p.t, v: p.balance }))} />
          </>
        ) : <p className="note">Conto non ancora avviato: scegli le impostazioni e premi Avvia.</p>}
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn" style={{ width: 'auto' }} onClick={() => act('/api/smc/settings', { settings: { ...s, active: !s.active } }, s.active ? 'Fermata: niente nuove entrate, le posizioni aperte restano gestite' : 'Avviata')}>{s.active ? 'Ferma le entrate' : 'Avvia'}</button>
          <div className="input-suffix" style={{ flex: 1, minWidth: 130 }}><input type="number" inputMode="decimal" placeholder={`capitale (ora ${acc?.start ?? s.capital})`} value={cap} onChange={e => setCap(e.target.value)} /><span>USDT</span></div>
          <button className="chip" onClick={() => { if (window.confirm(live ? 'Azzerare il capitale dedicato del Reale?' : 'Azzerare il conto di prova? Le posizioni di prova aperte si chiudono senza risultato.')) act('/api/smc/reset', { capital: +(cap || acc?.start || s.capital) }, 'Conto azzerato') }}>Azzera il conto</button>
        </div>
        {msg && <div className={`note ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 6 }}>{msg.text}</div>}
        <p className="note" style={{ marginTop: 6 }}>
          {live
            ? 'Ordini veri su Bitunix: a mercato subito dopo la candela di rifiuto, margine isolato verificato, leva mai oltre il massimo di Bitunix, stop dentro l\'ordine e ricontrollato ogni 5 minuti (mai oltre la liquidazione), target sull\'ordine di Bitunix se lo accetta (altrimenti lo chiude l\'app). Mai su titoli con posizioni o ordini non suoi (tue, di Apertura USA, di Turtle) né su quelli di Apertura USA nel Reale; il capitale dedicato di Apertura USA resta riservato.'
            : 'Nessun ordine vero: entrata al prezzo di Bitunix con lo slittamento misurato nel Reale di Apertura USA, stop e target controllati sulle candele da 1 minuto, funding al tasso di Bitunix, liquidazione simulata.'}
          {' '}Controllo ogni minuto sul server (anche a pagina chiusa); analisi alla chiusura di ogni candela da {s.entryTf}; entrate mai durante l'apertura USA (9:25–10:40 New York).{st.checkedAt ? ` Ultima analisi: ${timeCH(st.checkedAt)}.` : ''}
        </p>
      </div>
      <SettingsForm value={s} onChange={v => act('/api/smc/settings', { settings: v }, 'Impostazioni salvate')} title={`Impostazioni ${live ? 'del Reale' : 'della Prova'}`} />
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Titoli e setup in corso</div>
        <div className="lv-list">
          {s.symbols.map(sym => {
            const a = st.analysis[sym]
            return (
              <div key={sym} className="lv-item">
                <div className="lv-head mono"><b>{short(sym)}</b><span>direzione <b className={tone(a?.flow)}>{a ? flowTxt(a.flow) : '—'}</b></span><span className="sec">{a ? `analisi ${timeCH(a.at)}` : 'non ancora analizzato'}</span></div>
                <div className="note">{a?.pending?.length ? a.pending.map(p => `${sideTxt(p.side)} ${STAGE[p.stage]} (presa di ${fmtPrice(p.level.p)}, zona ${fmtPrice(p.ob.lo)}–${fmtPrice(p.ob.hi)})`).join(' · ') : 'in attesa della presa di un livello importante'}</div>
              </div>
            )
          })}
        </div>
      </div>
      <ChartCard settings={s} trades={[...st.open, ...st.history]} />
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Posizioni aperte</div>
        {st.open.length ? <div className="lv-list">{st.open.map(t => <TradeRow key={t.id} t={t} onClose={onClose} />)}</div> : <p className="note">Nessuna.</p>}
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Storico</div>
        {st.history.length ? <div className="lv-list">{st.history.map(t => <TradeRow key={t.id} t={t} />)}</div> : <p className="note">Ancora nessun trade chiuso.</p>}
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Registro (setup, entrate, scarti con il motivo)</div>
        {st.log.length ? <div className="lv-list">{st.log.slice(0, 60).map((x, i) => <div key={i} className="lv-item"><div className="lv-head mono"><b>{short(x.sym)}</b><span className={x.side > 0 ? 'up' : 'down'}>{sideTxt(x.side)}</span><span className="sec">{x.kind} · {dateCH(x.at)} {timeCH(x.at)}</span></div><div className="note">{x.text}</div></div>)}</div> : <p className="note">Vuoto.</p>}
      </div>
    </>
  )
}

export default function Smc() {
  const [mode, setMode] = useStrategyMode('smc', 'sim')
  const [authed, setAuthed] = useState(() => !!load('adminCode', ''))
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <div className="lab">Strategia · SMC</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>Liquidità, order block e ritorno</div>
        </div>
      </div>
      <StrategyTabs mode={mode} setMode={setMode} />
      {!authed ? <Gate onOk={() => setAuthed(true)} /> : mode === 'sim' ? <SimTab /> : <LiveTab key={mode} mode={mode} />}
      <p className="note">Short (il long è lo specchio): direzione ribassista sul timeframe di direzione; un livello di liquidità importante sopra il prezzo viene preso dopo una salita con un order block rialzista e il suo FVG; entro 20 candele un FVG ribassista e una chiusura sotto l'order block; entro 40 il prezzo torna nella zona e una candela chiude sotto: entrata, stop sopra la candela di rifiuto + 0,25 ATR, target al primo livello importante non preso sotto, solo con rischio/rendimento ≥ 3 e costi ≤ 20% del rischio. Regole complete in docs/smc.md.</p>
    </div>
  )
}
