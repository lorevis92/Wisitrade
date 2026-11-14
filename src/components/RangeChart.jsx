import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries, BaselineSeries, createSeriesMarkers, LineStyle, CrosshairMode } from 'lightweight-charts'

const C = { up: '#00E5C7', down: '#FF5C7A', warn: '#F5B83D', grid: '#121826', text: '#6B7590', ema: '#8B7CFF' }
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }
const baseOpts = (tf, interactive) => ({
  autoSize: true,
  layout: { background: { color: 'transparent' }, textColor: C.text, fontFamily: 'DM Mono, monospace', fontSize: 10, attributionLogo: false, panes: { separatorColor: '#1C2233' } },
  grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#1C2233' },
  timeScale: { borderColor: '#1C2233', timeVisible: true, secondsVisible: false, rightOffset: 4 },
  handleScale: interactive ? { pinch: true, mouseWheel: false, axisPressedMouseMove: true } : false,
  handleScroll: interactive ? { horzTouchDrag: true, vertTouchDrag: false, mouseWheel: false, pressedMouseMove: true } : false,
})
const flat = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }

// Grafico a 4 ore: candele e media esponenziale a 50 (la regola del trend)
export function TrendChart({ bars, ema50, height = 200 }) {
  const box = useRef(null)
  useEffect(() => {
    if (!box.current || !bars?.length) return
    const chart = createChart(box.current, baseOpts('4h', false))
    const t = bars.map(b => tzShift(b.t))
    const cs = chart.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down })
    cs.setData(bars.map((b, i) => ({ time: t[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    const e = chart.addSeries(LineSeries, { ...flat, color: C.ema, lineWidth: 2 })
    e.setData(ema50.slice(0, bars.length).map((v, i) => (v === null ? { time: t[i] } : { time: t[i], value: v })))
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 60), to: bars.length + 2 })
    return () => chart.remove()
  }, [bars, ema50])
  return <div ref={box} style={{ height }} />
}

// Grafico a 15 minuti con impulsi, range (rettangoli), tocchi, falsi breakout, livelli e setup
export default function RangeChart({ bars, res, wp, focus, height = 440, visible = 220 }) {
  const box = useRef(null)
  const rangeRef = useRef(null)
  useEffect(() => {
    if (!box.current || !bars?.length || !res) return
    const chart = createChart(box.current, baseOpts('15m', true))
    const t = bars.map(b => tzShift(b.t))
    const last = bars.length - 1
    const cs = chart.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down })
    cs.setData(bars.map((b, i) => ({ time: t[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    const markers = []
    const ranges = res.ranges.slice(-14)
    for (const rg of ranges) {
      const a = rg.startIdx, z = Math.min(rg.endIdx ?? last, last)
      if (!(z > a) || !Number.isFinite(rg.top) || !Number.isFinite(rg.bottom)) continue
      const col = rg.type === 'P' ? C.up : C.down
      const strong = rg.active && rg.validIdx !== null
      const faint = rg.dropped
      const fill = chart.addSeries(BaselineSeries, { ...flat, baseValue: { type: 'price', price: rg.bottom }, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: rgba(col, strong ? 0.13 : faint ? 0.03 : 0.06), topFillColor2: rgba(col, strong ? 0.13 : faint ? 0.03 : 0.06), bottomFillColor1: 'transparent', bottomFillColor2: 'transparent' })
      fill.setData(t.slice(a, z + 1).map(x => ({ time: x, value: rg.top })))
      for (const p of [rg.top, rg.bottom]) {
        const ln = chart.addSeries(LineSeries, { ...flat, color: rgba(col, strong ? 0.85 : faint ? 0.22 : 0.4), lineWidth: 1, lineStyle: rg.validIdx === null ? LineStyle.Dashed : LineStyle.Solid })
        ln.setData([{ time: t[a], value: p }, { time: t[z], value: p }])
      }
      // impulso: linea dall'origine all'estremo
      const im = rg.imp
      const il = chart.addSeries(LineSeries, { ...flat, color: rgba(col, faint ? 0.35 : 0.75), lineWidth: faint ? 2 : 3 })
      il.setData([{ time: t[im.start], value: im.from }, { time: t[im.end], value: im.to }])
      markers.push({ time: t[a], position: rg.type === 'P' ? 'aboveBar' : 'belowBar', color: col, shape: 'square', size: 0.6, text: rg.dropped ? `${rg.type} non valido` : `${rg.type} ${rg.touchUp}↑ ${rg.touchDn}↓${rg.validIdx !== null ? '' : ' (in formazione)'}` })
      for (const fb of rg.fakeouts) markers.push({ time: t[fb.idx], position: fb.dir > 0 ? 'aboveBar' : 'belowBar', color: fb.dir > 0 ? C.down : C.up, shape: fb.dir > 0 ? 'arrowDown' : 'arrowUp', text: 'falso' })
      if (rg.breakout) markers.push({ time: t[rg.breakout.idx], position: rg.breakout.dir > 0 ? 'aboveBar' : 'belowBar', color: C.warn, shape: 'circle', size: 0.6, text: 'breakout' })
    }
    // profilo settimanale: zone con molto volume (gialle, il prezzo frena) e con poco volume (viola, le attraversa in fretta)
    // della settimana precedente e di quella in corso, sotto a tutto il resto
    const band = (lo, hi, color) => {
      const b = chart.addSeries(BaselineSeries, { ...flat, baseValue: { type: 'price', price: lo }, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: color, topFillColor2: color, bottomFillColor1: 'transparent', bottomFillColor2: 'transparent' })
      b.setData(t.map(x => ({ time: x, value: hi })))
    }
    for (const p of [wp?.prev, wp?.cur].filter(Boolean)) {
      for (const z of p.hvn || []) band(z.lo, z.hi, rgba(C.warn, 0.07))
      for (const z of p.lvn || []) band(z.lo, z.hi, rgba(C.ema, 0.08))
    }
    // setup passati (falso breakout, entrata limite): cosa è successo
    for (const st of res.setups.filter(x => x.valid)) {
      const i = st.exitIdx ?? st.fillIdx
      if (i === null || i === undefined || i > last) continue
      const txt = st.R !== null ? `${st.R >= 0 ? '+' : ''}${st.R.toFixed(1)}R` : st.status === 'scaduto' ? 'non eseguito' : 'in corso'
      markers.push({ time: t[i], position: st.side > 0 ? 'belowBar' : 'aboveBar', color: st.R > 0 ? C.up : st.R < 0 ? C.down : C.text, shape: 'circle', size: 0.5, text: txt })
    }
    markers.sort((a, b) => a.time - b.time)
    createSeriesMarkers(cs, markers)
    // livelli chiave del profilo settimanale: POC, VAH e VAL (settimana in corso piena, precedente tratteggiata)
    for (const [p, cur] of [[wp?.cur, true], [wp?.prev, false]]) {
      if (!p) continue
      const st = cur ? LineStyle.Solid : LineStyle.Dashed, sfx = cur ? ' sett.' : ' sett. prec.'
      cs.createPriceLine({ price: p.poc, color: rgba(C.warn, cur ? 0.95 : 0.7), lineWidth: 2, lineStyle: st, title: `POC${sfx}`, axisLabelVisible: true })
      cs.createPriceLine({ price: p.vah, color: rgba(C.warn, cur ? 0.75 : 0.5), lineWidth: 1, lineStyle: st, title: `VAH${sfx}`, axisLabelVisible: false })
      cs.createPriceLine({ price: p.val, color: rgba(C.warn, cur ? 0.75 : 0.5), lineWidth: 1, lineStyle: st, title: `VAL${sfx}`, axisLabelVisible: false })
    }
    // setup in evidenza: entrata, stop, target
    if (focus) {
      const line = (price, color, title, style = LineStyle.Solid) => cs.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, title, axisLabelVisible: true })
      line(focus.entry, '#E8ECF5', `entrata ${focus.side > 0 ? 'long' : 'short'}`)
      line(focus.stop, C.down, 'stop')
      let prev = null
      focus.targets.forEach((x, i) => {
        if (prev !== null && Math.abs(x.p - prev) < 1e-9) return
        prev = x.p
        line(x.p, rgba(C.up, i === 0 ? 0.8 : 1), focus.targets.length > 1 ? `T${i + 1}` : 'target', i === 0 ? LineStyle.Dashed : i === 1 ? LineStyle.Solid : LineStyle.Dotted)
      })
    }
    const saved = rangeRef.current
    chart.timeScale().setVisibleLogicalRange(saved || { from: Math.max(0, bars.length - visible), to: bars.length + 4 })
    return () => { rangeRef.current = chart.timeScale().getVisibleLogicalRange(); chart.remove() }
  }, [bars, res, wp, focus, visible])
  return <div ref={box} style={{ height, position: 'relative' }} />
}
