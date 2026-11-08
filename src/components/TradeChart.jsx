// Grafico a candele da 1 minuto della giornata di un trade simulato: entrata, uscita, stop e livello più vicino.
import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, LineStyle, CrosshairMode } from 'lightweight-charts'
import { get, fmtPrice, fmtSigned } from '../lib/api.js'
import { dayFmt, hm } from './StrategyForm.jsx'

const C = { up: '#00E5C7', down: '#FF5C7A', warn: '#F5B83D', grid: '#121826', text: '#6B7590', line: '#9AA6C2' }
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60

export default function TradeChart({ trade, onClose }) {
  const box = useRef(null)
  const [bars, setBars] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    setBars(null); setErr(null)
    get(`/api/sim/day?symbol=${trade.symbol}&day=${trade.day}`).then(j => alive && setBars(j.bars)).catch(e => alive && setErr(e.message))
    return () => { alive = false }
  }, [trade.symbol, trade.day])

  useEffect(() => {
    if (!box.current || !bars?.length) return
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: C.text, fontFamily: 'DM Mono, monospace', fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1C2233' },
      timeScale: { borderColor: '#1C2233', timeVisible: true, secondsVisible: false, rightOffset: 2 },
      handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: true },
      handleScroll: { horzTouchDrag: true, vertTouchDrag: false, mouseWheel: true, pressedMouseMove: true },
    })
    const t = bars.map(b => tzShift(b.t))
    const main = chart.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down, priceLineVisible: false, lastValueVisible: false })
    main.setData(bars.map((b, i) => ({ time: t[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1)
    vol.setData(bars.map((b, i) => ({ time: t[i], value: b.v, color: b.c >= b.o ? 'rgba(0,229,199,0.35)' : 'rgba(255,92,122,0.35)' })))
    chart.panes()[1]?.setHeight(60)

    const long = trade.side > 0
    const pl = (price, color, title, style = LineStyle.Dashed) => price && main.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, title, axisLabelVisible: true })
    pl(trade.entry, long ? C.up : C.down, 'entrata', LineStyle.Solid)
    pl(trade.exit, trade.pnl >= 0 ? C.up : C.down, 'uscita')
    pl(trade.stop, C.down, 'stop', LineStyle.Dotted)
    if (trade.stopEnd && Math.abs(trade.stopEnd - trade.stop) > 1e-9) pl(trade.stopEnd, C.warn, 'stop ridotto', LineStyle.Dotted)
    if (trade.level) pl(trade.level.p, C.line, trade.level.t, LineStyle.Dotted)
    if (trade.half) pl(trade.half.px, C.warn, 'metà chiusa', LineStyle.Dashed)
    if (trade.liq) pl(trade.liq, '#FF5C7A', 'liquidazione', LineStyle.LargeDashed)

    const barAt = ts => { let k = 0; for (let i = 0; i < bars.length; i++) if (bars[i].t <= ts) k = i; return t[k] }
    const exitBar = trade.reason === 'chiusura' ? trade.closed_at : trade.closed_at - 60000
    createSeriesMarkers(main, [
      { time: barAt(trade.opened_at), position: long ? 'belowBar' : 'aboveBar', color: long ? C.up : C.down, shape: long ? 'arrowUp' : 'arrowDown', text: long ? 'LONG' : 'SHORT' },
      { time: barAt(exitBar), position: long ? 'aboveBar' : 'belowBar', color: trade.pnl >= 0 ? C.up : C.down, shape: 'circle', text: 'uscita' },
    ].sort((a, b) => a.time - b.time))
    // zoom: dal quarto d'ora prima dell'entrata a mezz'ora dopo l'uscita
    const from = bars.findIndex(b => b.t >= trade.opened_at - 15 * 60000)
    const to = bars.findIndex(b => b.t >= trade.closed_at + 30 * 60000)
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, from), to: to < 0 ? bars.length + 2 : to })
    return () => chart.remove()
  }, [bars, trade])

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="row">
          <div>
            <b>{trade.symbol}</b> <span className={`pill ${trade.side > 0 ? 'long' : 'short'}`}>{trade.side > 0 ? 'Long' : 'Short'}</span>
            <span className="note"> {dayFmt(trade.day, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>
        <div className="pos-grid mono" style={{ marginTop: 10 }}>
          <span>entrata {hm(trade.opened_at)}<br /><b>{fmtPrice(trade.entry)}</b></span>
          <span>uscita {hm(trade.closed_at)}<br /><b>{fmtPrice(trade.exit)}</b></span>
          <span>stop<br /><b>{fmtPrice(trade.stop)}</b></span>
          <span>risultato<br /><b className={trade.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(trade.pnl)} ({fmtSigned(trade.pct)}%)</b></span>
        </div>
        <div className="note">{trade.reason}{trade.level ? ` · livello più vicino: ${trade.level.t} ${fmtPrice(trade.level.p)}` : ' · nessun livello davanti'} · margine {trade.margin.toFixed(0)} USDT × {trade.leverage}x{trade.liq ? ` · liquidazione ${fmtPrice(trade.liq)}` : ''}</div>
        {trade.fees !== undefined && <div className="note">costi: commissioni {trade.fees.toFixed(2)}{trade.funding ? ` · funding ${trade.funding.toFixed(2)}` : ''}{trade.slip ? ` · slittamento ${trade.slip.toFixed(2)}` : ''} USDT{trade.signal && Math.abs(trade.signal - trade.entry) > 1e-9 ? ` · segnale a ${fmtPrice(trade.signal)}` : ''}</div>}
        <div className="chart-box" ref={box} style={{ height: 340 }}>
          {err && <div className="empty">Grafico non disponibile: {err}</div>}
          {!err && !bars && <div className="empty">Carico le candele…</div>}
          {bars && !bars.length && <div className="empty">Nessuna candela archiviata per questo giorno.</div>}
        </div>
        <p className="note">Candele da 1 minuto del perpetual Bitunix, dalle 9:00 alle 16:30 di New York (orari in ora locale).</p>
      </div>
    </div>
  )
}
