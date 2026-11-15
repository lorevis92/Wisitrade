// Pagina Livelli: supporti e resistenze (4h e giornaliero), profilo di volume settimanale, Stocastico RSI multi-timeframe
// e commento automatico da regole (shared/levels.js). Solo analisi: nessun ordine, nessun conto.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CandlestickSeries, BaselineSeries, LineStyle } from 'lightweight-charts'
import { get, fmtPrice } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { readStoch, RSI_DEFAULTS } from '../lib/stochrsi.js'
import { BASE, NAMES, SymbolPicker, TfCard, Summary, BigView, cleanParams } from './Rsi.jsx'
import { buildLevels, narrate } from '@shared/levels.js'

const STOCH_TFS = ['4h', '1h', '15m', '5m', '1m']
const TFS = ['1d', '4h', '1h', '15m', '5m', '1m']
const REFRESH = { '1m': 15000, '5m': 30000, '15m': 60000, '1h': 120000, '4h': 300000, '1d': 600000 }
const short = s => s.replace(/USDT$/, '')
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60
const TONE = { interesting: 'up', watch: 'warn', risk: 'down', neutral: 'sec' }

function LevelsChart({ bars, levels, wp, price, height = 420 }) {
  const box = useRef(null)
  useEffect(() => {
    if (!box.current || !bars?.length) return
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#6B7590', fontFamily: 'DM Mono, monospace', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: '#121826' }, horzLines: { color: '#121826' } },
      rightPriceScale: { borderColor: '#1C2233' }, timeScale: { borderColor: '#1C2233', timeVisible: true, rightOffset: 4 },
      handleScale: { pinch: true, mouseWheel: false, axisPressedMouseMove: true }, handleScroll: { horzTouchDrag: true, vertTouchDrag: false, mouseWheel: false, pressedMouseMove: true },
    })
    const t = bars.map(b => tzShift(b.t))
    const flat = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
    const band = (lo, hi, color) => {
      const s = chart.addSeries(BaselineSeries, { ...flat, baseValue: { type: 'price', price: lo }, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: color, topFillColor2: color, bottomFillColor1: 'transparent', bottomFillColor2: 'transparent' })
      s.setData(t.map(x => ({ time: x, value: hi })))
    }
    for (const w of [wp?.cur, wp?.prev].filter(Boolean)) {
      for (const z of w.hvn || []) band(z.lo, z.hi, 'rgba(245,184,61,0.08)')
      for (const z of w.lvn || []) band(z.lo, z.hi, 'rgba(139,124,255,0.08)')
    }
    const cs = chart.addSeries(CandlestickSeries, { upColor: '#00E5C7', downColor: '#FF5C7A', borderVisible: false, wickUpColor: '#00E5C7', wickDownColor: '#FF5C7A' })
    cs.setData(bars.map((b, i) => ({ time: t[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    for (const l of levels || []) {
      const sup = l.p < price, col = sup ? '0,229,199' : '255,92,122'
      cs.createPriceLine({ price: l.p, color: `rgba(${col},${l.strong ? 0.95 : 0.45})`, lineWidth: l.strong ? 2 : 1, lineStyle: l.strong ? LineStyle.Solid : LineStyle.Dashed, title: `${l.strong ? 'forte' : 'debole'} · ${sup ? 'S' : 'R'}`, axisLabelVisible: l.strong })
    }
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 140), to: bars.length + 4 })
    return () => chart.remove()
  }, [bars, levels, wp, price])
  return <div ref={box} style={{ height }} />
}

export default function Levels() {
  const [custom, setCustomRaw] = useState(() => load('levelsCustom', []).filter(s => typeof s === 'string'))
  const [symbol, setSymbolRaw] = useState(() => load('levelsSymbol', BASE[0]))
  const [chartTf, setChartTfRaw] = useState(() => load('levelsTf', '4h'))
  const [data, setData] = useState({})
  const [open, setOpen] = useState(null)
  const params = useMemo(() => cleanParams(load('rsiParams', RSI_DEFAULTS)), [])
  const setCustom = v => { setCustomRaw(v); save('levelsCustom', v) }
  const setSymbol = s => { setSymbolRaw(s); save('levelsSymbol', s) }
  const setChartTf = v => { setChartTfRaw(v); save('levelsTf', v) }
  const symRef = useRef(symbol); symRef.current = symbol

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

  const reads = useMemo(() => Object.fromEntries(STOCH_TFS.map(tf => [tf, data[tf]?.bars?.length ? readStoch(data[tf].bars, params) : null])), [data, params])
  const price = data['1m']?.bars?.at(-1)?.c ?? data['15m']?.bars?.at(-1)?.c ?? null
  const b4 = data['4h']?.bars, b1d = data['1d']?.bars, b1h = data['1h']?.bars
  const lv = useMemo(() => (b4?.length && b1d?.length && b1h?.length && price ? buildLevels({ bars4h: b4, bars1d: b1d, bars1h: b1h, price }) : null), [b4, b1d, b1h, price])
  const story = useMemo(() => narrate({ price, levels: lv?.levels, atr4h: lv?.atr4h, reads, params, bars4h: b4, bars15: data['15m']?.bars, wp: lv?.wp, fmt: fmtPrice }), [price, lv, reads, params, b4, data])
  const err = TFS.map(tf => data[tf]?.error).find(Boolean)

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <div className="lab">Mercato · Livelli</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{short(symbol)}{NAMES[symbol] ? <span className="sec" style={{ fontSize: 14, fontWeight: 600 }}> · {NAMES[symbol]}</span> : null}</div>
        </div>
        <span className="note mono">{price ? fmtPrice(price) : symbol}</span>
      </div>
      <SymbolPicker symbol={symbol} setSymbol={setSymbol} custom={custom} setCustom={setCustom} />
      {err && <div className="warn">Dati non disponibili: {err}</div>}

      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Commento</div>
        <div className={TONE[story.tone]} style={{ fontSize: 16, fontWeight: 800, margin: '4px 0 8px' }}>{story.headline}</div>
        {story.blocks.map(b => <p key={b.title} style={{ margin: '0 0 8px', lineHeight: 1.5 }}><b>{b.title}.</b> {b.text}</p>)}
        {story.warnings.map((w, i) => <div key={i} className="warn" style={{ marginTop: 6 }}>⚠ {w}</div>)}
        <p className="note" style={{ marginTop: 8 }}>Commento scritto da regole fisse, si aggiorna da solo con le candele. Non è un consiglio di investimento.</p>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="row">
          <span className="lab">Grafico con i livelli</span>
          <div className="seg">{['4h', '1d'].map(k => <button key={k} className={chartTf === k ? 'on' : ''} onClick={() => setChartTf(k)}>{k === '1d' ? 'giornaliero' : '4 ore'}</button>)}</div>
        </div>
        {data[chartTf]?.bars?.length && lv
          ? <LevelsChart bars={data[chartTf].bars} levels={lv.levels} wp={lv.wp} price={price} />
          : <div className="empty" style={{ padding: '80px 10px' }}>Carico le candele…</div>}
        <p className="note">Linea piena = livello forte (struttura + volume), tratteggiata = debole. Verde sotto il prezzo (supporto), rossa sopra (resistenza). Fasce gialle = zone ad alto volume, viola = basso volume (settimana in corso e precedente).</p>
      </div>

      {lv && (
        <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
          <div className="lab">Livelli vicini</div>
          <table className="table mono" style={{ fontSize: 12, width: '100%', marginTop: 6 }}>
            <thead><tr><th>prezzo</th><th>tipo</th><th>voto</th><th>distanza</th><th style={{ textAlign: 'left' }}>perché</th></tr></thead>
            <tbody>
              {lv.levels.map((l, i) => (
                <tr key={i}>
                  <td>{fmtPrice(l.p)}</td>
                  <td className={l.p < price ? 'up' : 'down'}>{l.p < price ? 'supporto' : 'resistenza'}</td>
                  <td className={l.strong ? 'warn' : 'sec'}>{l.strong ? 'forte' : 'debole'}</td>
                  <td>{((l.p / price - 1) * 100).toFixed(2)}%</td>
                  <td style={{ textAlign: 'left', fontFamily: 'inherit' }}>{[l.structure, l.volume && `volume: ${l.volume}`].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Summary reads={reads} tfs={STOCH_TFS} />
      <div className="rsi-grid">
        {STOCH_TFS.map(tf => <TfCard key={symbol + tf} tf={tf} entry={data[tf]} read={reads[tf]} params={params} onOpen={() => setOpen(tf)} />)}
      </div>
      <p className="note">Livelli di struttura: massimi e minimi di swing a 4 ore e giornalieri toccati almeno 3 volte (4h) o 2 (giornaliero), con tolleranza di circa 0,3 ATR. Profilo di volume della settimana in corso e della precedente come nella pagina Range. Stocastico con le impostazioni della pagina RSI.</p>
      {open && <BigView symbol={symbol} tf={open} entry={data[open]} read={reads[open]} params={params} onClose={() => setOpen(null)} />}
    </div>
  )
}
