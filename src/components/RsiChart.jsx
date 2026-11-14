import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries, BaselineSeries, createSeriesMarkers, LineStyle, CrosshairMode } from 'lightweight-charts'

const C = { up: '#00E5C7', down: '#FF5C7A', k: '#E8ECF5', d: '#F5B83D', grid: '#121826', text: '#6B7590', zone: '#3A4766' }
// L'orario del grafico in ora locale: Lightweight Charts lavora in UTC
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60

// Candele sopra, Stocastico RSI sotto (K, D, zone estreme evidenziate); frecce sulle candele dove K è uscito da una zona estrema.
// Il grafico si crea una volta e ai nuovi dati aggiorna solo le serie, così zoom e scorrimento restano dove sono.
export default function RsiChart({ bars, read, params, tf, height = 190, stochHeight = 90, visible = 90, interactive = false }) {
  const box = useRef(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!box.current) return
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: C.text, fontFamily: 'DM Mono, monospace', fontSize: 10, attributionLogo: false, panes: { separatorColor: '#1C2233', separatorHoverColor: '#23304D' } },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1C2233' },
      timeScale: { borderColor: '#1C2233', timeVisible: tf !== '1d', secondsVisible: false, rightOffset: 3 },
      // nelle card piccole il dito scorre la pagina, non il grafico; in grande si trascina e si ingrandisce
      // (la rotella resta alla pagina, per scendere alla tabella)
      handleScale: interactive ? { pinch: true, mouseWheel: false, axisPressedMouseMove: true } : false,
      handleScroll: interactive ? { horzTouchDrag: true, vertTouchDrag: false, mouseWheel: false, pressedMouseMove: true } : false,
    })
    const candles = chart.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down })
    // scala dello stocastico fissa 0–100
    const flat = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineWidth: 1, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) }
    // zone estreme: riempimento tra la soglia alta e 100 (rosso) e tra 0 e la soglia bassa (verde)
    const zHigh = chart.addSeries(BaselineSeries, { ...flat, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: 'rgba(255,92,122,.13)', topFillColor2: 'rgba(255,92,122,.13)', bottomFillColor1: 'transparent', bottomFillColor2: 'transparent' }, 1)
    const zLow = chart.addSeries(BaselineSeries, { ...flat, topLineColor: 'transparent', bottomLineColor: 'transparent', bottomFillColor1: 'rgba(0,229,199,.13)', bottomFillColor2: 'rgba(0,229,199,.13)', topFillColor1: 'transparent', topFillColor2: 'transparent' }, 1)
    const dLine = chart.addSeries(LineSeries, { ...flat, color: C.d, lastValueVisible: true }, 1)
    const kLine = chart.addSeries(LineSeries, { ...flat, color: C.k, lineWidth: 2, lastValueVisible: true }, 1)
    kLine.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.06 } })
    const markers = createSeriesMarkers(candles, [])
    chart.panes()[1]?.setHeight(stochHeight)
    ref.current = { chart, candles, zHigh, zLow, kLine, dLine, markers, lines: [], first: true }
    return () => { chart.remove(); ref.current = null }
  }, [tf, interactive, stochHeight])

  useEffect(() => {
    const r = ref.current
    if (!r || !bars?.length || !read) return
    const t = bars.map(b => tzShift(b.t))
    r.candles.setData(bars.map((b, i) => ({ time: t[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    const val = arr => arr.map((v, i) => (v === null ? { time: t[i] } : { time: t[i], value: v }))
    r.kLine.setData(val(read.k)); r.dLine.setData(val(read.d))
    r.zHigh.applyOptions({ baseValue: { type: 'price', price: params.high } }); r.zHigh.setData(t.map(x => ({ time: x, value: 100 })))
    r.zLow.applyOptions({ baseValue: { type: 'price', price: params.low } }); r.zLow.setData(t.map(x => ({ time: x, value: 0 })))
    r.lines.forEach(l => r.kLine.removePriceLine(l))
    r.lines = [params.high, params.low].map(price => r.kLine.createPriceLine({ price, color: C.zone, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false }))
    r.markers.setMarkers(read.exits.map(e => e.from === 'oversold'
      ? { time: t[e.i], position: 'belowBar', color: C.up, shape: 'arrowUp', size: 0.8 }
      : { time: t[e.i], position: 'aboveBar', color: C.down, shape: 'arrowDown', size: 0.8 }))
    if (r.first) { r.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - visible), to: bars.length + 2 }); r.first = false }
  }, [bars, read, params.high, params.low, tf, interactive, stochHeight, visible])

  return <div ref={box} style={{ height: height + stochHeight, position: 'relative' }} />
}
