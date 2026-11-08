import { useEffect, useRef, useState } from 'react'
import {
  createChart, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries, createSeriesMarkers, LineStyle, CrosshairMode,
} from 'lightweight-charts'
import { ema, bollinger, rsi, macd, vwap } from '@shared/indicators.js'
import { get } from '../lib/api.js'
import { load, save, defaultChart } from '../lib/store.js'

const TFS = ['1m', '5m', '15m', '1h', '4h', '1d']
const TYPES = [['candles', 'Candele'], ['line', 'Linea'], ['area', 'Area']]
const INDS = [['ema20', 'EMA 20'], ['ema50', 'EMA 50'], ['vwap', 'VWAP'], ['bb', 'Bollinger'], ['volume', 'Volume'], ['rsi', 'RSI'], ['macd', 'MACD']]
const C = { up: '#00E5C7', down: '#FF5C7A', ema20: '#F5B83D', ema50: '#8B7CFF', vwap: '#9AA6C2', bb: '#3A4766', grid: '#121826', text: '#6B7590' }

// L'orario del grafico in ora locale: Lightweight Charts lavora in UTC, quindi spostiamo i timestamp
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60
const nyKey = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export default function Chart({ symbol, kind, signal, levels }) {
  const box = useRef(null)
  const chartRef = useRef(null)
  const rangeRef = useRef(null) // mantiene zoom/scroll quando il grafico si aggiorna
  const [prefs, setPrefs] = useState(() => ({ ...defaultChart, ...load('chart', {}), ind: { ...defaultChart.ind, ...load('chart', {}).ind } }))
  const [bars, setBars] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { save('chart', prefs) }, [prefs])

  // Carica le candele e aggiorna ogni minuto
  useEffect(() => {
    let alive = true
    const fetchBars = () => get(`/api/candles/${symbol}?tf=${prefs.tf}`)
      .then(j => { if (alive) { setBars(j.bars); setError(null) } })
      .catch(e => alive && setError(e.message))
    fetchBars()
    const id = setInterval(fetchBars, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [symbol, prefs.tf])

  // Disegna il grafico
  useEffect(() => {
    if (!box.current || !bars?.length) return
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: C.text, fontFamily: 'DM Mono, monospace', fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1C2233' },
      timeScale: { borderColor: '#1C2233', timeVisible: prefs.tf !== '1d', secondsVisible: false, rightOffset: 4 },
      handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: true },
      handleScroll: { horzTouchDrag: true, vertTouchDrag: false, mouseWheel: true, pressedMouseMove: true },
    })
    chartRef.current = chart
    const t = bars.map(b => tzShift(b.t))
    const line = (vals, color, width = 1, pane = 0, style = LineStyle.Solid) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane)
      s.setData(vals.map((v, i) => (v === null ? { time: t[i] } : { time: t[i], value: v })))
      return s
    }

    let main
    if (prefs.type === 'candles') {
      main = chart.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down })
      main.setData(bars.map((b, i) => ({ time: t[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    } else if (prefs.type === 'line') {
      main = chart.addSeries(LineSeries, { color: C.up, lineWidth: 2 })
      main.setData(bars.map((b, i) => ({ time: t[i], value: b.c })))
    } else {
      main = chart.addSeries(AreaSeries, { lineColor: C.up, topColor: 'rgba(0,229,199,0.25)', bottomColor: 'rgba(0,229,199,0)', lineWidth: 2 })
      main.setData(bars.map((b, i) => ({ time: t[i], value: b.c })))
    }

    const closes = bars.map(b => b.c)
    const { ind } = prefs
    if (ind.ema20) line(ema(closes, 20), C.ema20)
    if (ind.ema50) line(ema(closes, 50), C.ema50)
    if (ind.vwap && prefs.tf !== '1d') line(vwap(bars, kind === 'stock' ? nyKey : undefined), C.vwap, 1, 0, LineStyle.Dashed)
    if (ind.bb) {
      const bb = bollinger(bars)
      line(bb.upper, C.bb); line(bb.lower, C.bb); line(bb.mid, C.bb, 1, 0, LineStyle.Dotted)
    }

    let pane = 1
    const paneHeights = []
    if (ind.volume) {
      const v = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, pane)
      v.setData(bars.map((b, i) => ({ time: t[i], value: b.v, color: b.c >= b.o ? 'rgba(0,229,199,0.35)' : 'rgba(255,92,122,0.35)' })))
      paneHeights.push([pane++, 70])
    }
    if (ind.rsi) {
      const r = line(rsi(bars), C.ema20, 1, pane)
      r.createPriceLine({ price: 70, color: '#3A4766', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
      r.createPriceLine({ price: 30, color: '#3A4766', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
      paneHeights.push([pane++, 80])
    }
    if (ind.macd) {
      const m = macd(bars)
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
      h.setData(m.hist.map((v, i) => (v === null ? { time: t[i] } : { time: t[i], value: v, color: v >= 0 ? 'rgba(0,229,199,0.5)' : 'rgba(255,92,122,0.5)' })))
      line(m.line, C.ema20, 1, pane); line(m.signal, C.ema50, 1, pane)
      paneHeights.push([pane++, 90])
    }
    const panes = chart.panes()
    paneHeights.forEach(([i, h]) => panes[i]?.setHeight(h))

    // Livelli del segnale
    if (levels?.stop && signal) main.createPriceLine({ price: signal.stop ?? levels.stop, color: C.down, lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'stop' })
    if (levels?.resistance) main.createPriceLine({ price: levels.resistance, color: '#3A4766', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'res' })
    if (levels?.support) main.createPriceLine({ price: levels.support, color: '#3A4766', lineWidth: 1, lineStyle: LineStyle.Dotted, title: 'sup' })
    if (signal?.entry) main.createPriceLine({ price: signal.entry, color: signal.direction === 'long' ? C.up : C.down, lineWidth: 1, lineStyle: LineStyle.Solid, title: 'entrata', axisLabelVisible: false })

    // Marker sul punto di partenza del segnale
    if (signal?.started_at) {
      const st = tzShift(signal.started_at)
      const idx = t.findIndex((x, i) => x <= st && (t[i + 1] === undefined || t[i + 1] > st))
      if (idx >= 0) {
        createSeriesMarkers(main, [{
          time: t[idx],
          position: signal.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: signal.direction === 'long' ? C.up : C.down,
          shape: signal.direction === 'long' ? 'arrowUp' : 'arrowDown',
          text: signal.direction === 'long' ? 'LONG' : 'SHORT',
        }])
      }
    }

    const saved = rangeRef.current
    chart.timeScale().setVisibleLogicalRange(saved && saved.key === `${symbol}-${prefs.tf}`
      ? saved.range
      : { from: Math.max(0, bars.length - 120), to: bars.length + 4 })
    return () => {
      const range = chart.timeScale().getVisibleLogicalRange()
      if (range) rangeRef.current = { key: `${symbol}-${prefs.tf}`, range }
      chart.remove(); chartRef.current = null
    }
  }, [bars, prefs.type, JSON.stringify(prefs.ind), JSON.stringify({ signal, levels }), kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = patch => setPrefs(p => ({ ...p, ...patch }))
  const toggle = k => setPrefs(p => ({ ...p, ind: { ...p.ind, [k]: !p.ind[k] } }))

  return (
    <div>
      <div className="row" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
        <div className="chips">
          {TFS.map(tf => <button key={tf} className={`chip ${prefs.tf === tf ? 'active' : ''}`} onClick={() => set({ tf })}>{tf}</button>)}
        </div>
        <div className="chips">
          {TYPES.map(([k, l]) => <button key={k} className={`chip ${prefs.type === k ? 'active' : ''}`} onClick={() => set({ type: k })}>{l}</button>)}
        </div>
      </div>
      <div className="chart-box" ref={box}>
        {error && <div className="empty">Grafico non disponibile: {error}</div>}
        {!error && !bars && <div className="empty">Carico le candele…</div>}
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        {INDS.map(([k, l]) => <button key={k} className={`chip ${prefs.ind[k] ? 'on' : ''}`} onClick={() => toggle(k)}>{l}</button>)}
      </div>
      {kind === 'stock' && <p className="note" style={{ marginTop: 8 }}>Prezzi del perpetual su Bitunix. Fuori dall'orario della borsa USA il perpetual continua a muoversi, con meno volume.</p>}
    </div>
  )
}
