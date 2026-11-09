// Grafico della giornata di una posizione di Prova o Reale (aperta o chiusa): candele da 1 minuto, entrata e uscita,
// apertura delle 9:30 e soglia del segnale, stop (iniziale, come si è spostato, finale), livello più vicino, liquidazione.
// Nel Reale anche prezzo del segnale e prezzo eseguito su Bitunix, con slittamento e ritardo. Le posizioni aperte si
// aggiornano da sole. Solo lettura: non cambia niente nella logica della strategia.
import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers, LineStyle, CrosshairMode } from 'lightweight-charts'
import { get, fmtPrice, fmtSigned } from '../lib/api.js'
import { exitLevel } from '@shared/opening.js'
import { dayFmt, hm } from './StrategyForm.jsx'

const C = { up: '#00E5C7', down: '#FF5C7A', warn: '#F5B83D', grid: '#121826', text: '#6B7590', line: '#9AA6C2', open: '#6B7590' }
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60
const REFRESH_MS = 20000
const hms = t => (t ? new Date(t).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—')
// slittamento per lato in %: negativo = peggio per te
const slipPct = (side, sig, fill, isExit) => (sig && fill ? (isExit ? side * (fill - sig) / sig : side * (sig - fill) / sig) * 100 : null)

// Stop nel tempo, ricostruito dalle candele con la regola dell'app (exitLevel): parte dallo stop iniziale e segue il prezzo migliore
function stopPath(p, s, bars, from, to) {
  const out = []
  let best = p.entry
  const init = p.entry - p.side * s.sl * p.unit
  for (const b of bars) {
    if (b.t < from || b.t > to) continue
    best = p.side > 0 ? Math.max(best, b.h) : Math.min(best, b.l)
    out.push({ t: b.t + 60000, v: exitLevel({ side: p.side, entry: p.entry, unit: p.unit, best, init_stop: init }, s) })
  }
  return { init, path: out }
}

export default function PositionChart({ id, mode, onClose }) {
  const box = useRef(null)
  const range = useRef(null)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true, timer = null
    const load = () => get(`/api/strategy/day?id=${id}`).then(j => {
      if (!alive) return
      setData(j); setErr(null)
      if (j.position.status === 'open') timer = setTimeout(load, REFRESH_MS)
    }).catch(e => { if (alive) { setErr(e.message); timer = setTimeout(load, REFRESH_MS) } })
    load()
    return () => { alive = false; clearTimeout(timer) }
  }, [id])

  const p = data?.position, s = data?.settings, bars = data?.bars
  const open = p?.status === 'open'
  const px = open ? (data.price ?? bars?.at(-1)?.c ?? null) : null
  const thr = p ? p.open_price * (1 + (p.move_pct || 0) / 100) : null
  const ex = p?.exchange || {}, slip = ex.slip || {}, tm = ex.timing || {}
  const live = mode === 'live' && p?.mode === 'live'
  const half = p?.half_done && p.half_qty > 0 ? p.half_qty : 0
  const upnl = open && px ? p.side * (px - p.entry) * (p.qty - half) + (half ? p.side * (p.half_px - p.entry) * half : 0) : null
  const pnl = open ? upnl : p?.pnl
  const pct = p && pnl !== null && pnl !== undefined ? pnl / (p.entry * p.qty) * 100 : null
  // candela del segnale d'entrata (entry_bar); per le posizioni vecchie senza quel dato, l'ora d'apertura
  const entryAt = p ? (p.entry_bar ?? p.opened_at) : null
  const sp = p && s && bars?.length ? stopPath(p, s, bars, Math.floor(entryAt / 60000) * 60000, open ? Date.now() : p.closed_at) : null

  useEffect(() => {
    if (!box.current || !bars?.length || !p || !s) return
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
    const main = chart.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down, priceLineVisible: open, lastValueVisible: open })
    main.setData(bars.map((b, i) => ({ time: t[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1)
    vol.setData(bars.map((b, i) => ({ time: t[i], value: b.v, color: b.c >= b.o ? 'rgba(0,229,199,0.35)' : 'rgba(255,92,122,0.35)' })))
    chart.panes()[1]?.setHeight(60)

    const long = p.side > 0
    const pl = (price, color, title, style = LineStyle.Dashed) => price && main.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, title, axisLabelVisible: true })
    pl(p.open_price, C.open, 'apertura 9:30', LineStyle.Dotted)
    pl(thr, C.line, 'soglia', LineStyle.Dashed)
    pl(p.entry, long ? C.up : C.down, 'entrata', LineStyle.Solid)
    if (!open) pl(p.exit, p.pnl >= 0 ? C.up : C.down, 'uscita')
    if (sp) pl(sp.init, C.down, 'stop iniziale', LineStyle.Dotted)
    if (sp && Math.abs(p.init_stop - sp.init) > p.unit * 0.01) pl(p.init_stop, C.warn, 'stop finale', LineStyle.Dotted)
    if (live && ex.sl && sp && Math.abs(ex.sl - sp.init) > p.unit * 0.01) pl(ex.sl, C.down, 'stop Bitunix', LineStyle.SparseDotted)
    if (p.level?.p) pl(p.level.p, C.line, p.level.t, LineStyle.Dotted)
    if (p.liq_price > 0) pl(p.liq_price, C.down, 'liquidazione', LineStyle.LargeDashed)
    if (p.half_done && p.half_px) pl(p.half_px, C.warn, 'metà chiusa', LineStyle.Dashed)
    if (live && slip.sigIn && Math.abs(slip.sigIn - p.entry) > 1e-9 && Math.abs(slip.sigIn - thr) > 1e-9) pl(slip.sigIn, C.line, 'segnale', LineStyle.SparseDotted)

    // stop che segue il prezzo (ricostruito dalle candele)
    if (sp?.path.length) {
      const line = chart.addSeries(LineSeries, { color: C.warn, lineWidth: 1, lineStyle: LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      const seen = new Set()
      line.setData(sp.path.map(x => ({ time: tzShift(x.t), value: x.v })).filter(x => !seen.has(x.time) && seen.add(x.time)))
    }

    const barAt = ts => { let k = 0; for (let i = 0; i < bars.length; i++) if (bars[i].t <= ts) k = i; return t[k] }
    const marks = [{ time: barAt(entryAt), position: long ? 'belowBar' : 'aboveBar', color: long ? C.up : C.down, shape: long ? 'arrowUp' : 'arrowDown', text: `${long ? 'LONG' : 'SHORT'} ${hm(p.opened_at)}` }]
    if (!open && p.closed_at) marks.push({ time: barAt(p.closed_at), position: long ? 'aboveBar' : 'belowBar', color: p.pnl >= 0 ? C.up : C.down, shape: 'circle', text: `uscita ${hm(p.closed_at)}` })
    createSeriesMarkers(main, marks.sort((a, b) => a.time - b.time))

    // zoom: quello scelto da te (resta tra un aggiornamento e l'altro), altrimenti dal quarto d'ora prima dell'entrata a mezz'ora dopo l'uscita
    if (range.current) chart.timeScale().setVisibleLogicalRange(range.current)
    else {
      const from = bars.findIndex(b => b.t >= p.opened_at - 15 * 60000)
      const to = open ? -1 : bars.findIndex(b => b.t >= p.closed_at + 30 * 60000)
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, from), to: to < 0 ? bars.length + 2 : to })
    }
    const onRange = r => { if (r) range.current = r }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    return () => { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange); chart.remove() }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const slIn = live ? slipPct(p.side, slip.sigIn, slip.fillIn, false) : null
  const slOut = live ? slipPct(p.side, slip.sigOut, slip.fillOut, true) : null
  const delay = tm.fillAt && tm.signalAt ? (tm.fillAt - tm.signalAt) / 1000 : null

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="row">
          <div>
            <b>{p?.symbol || '…'}</b> {p && <span className={`pill ${p.side > 0 ? 'long' : 'short'}`}>{p.side > 0 ? 'Long' : 'Short'}</span>}
            {p && <span className="note"> {dayFmt(p.day, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · {mode === 'live' ? 'Reale' : 'Prova'}{open ? ' · aperta' : ''}</span>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>
        {p && (
          <>
            <div className="pos-grid mono" style={{ marginTop: 10 }}>
              <span>entrata {hm(p.opened_at)}<br /><b>{fmtPrice(p.entry)}</b></span>
              {open ? <span>ora<br /><b>{fmtPrice(px)}</b></span> : <span>uscita {hm(p.closed_at)}<br /><b>{fmtPrice(p.exit)}</b></span>}
              <span>{open ? 'uscita a' : 'stop iniziale'}<br /><b>{fmtPrice(open && s ? exitLevel(p, s) : sp?.init ?? p.init_stop)}</b></span>
              <span>{open ? 'ora' : 'risultato'}<br /><b className={pnl >= 0 ? 'up' : 'down'}>{pnl !== null && pnl !== undefined ? `${fmtSigned(pnl)} (${fmtSigned(pct)}%)` : '—'}</b></span>
            </div>
            <div className="note">
              {open ? 'posizione aperta: si aggiorna ogni 20 secondi' : p.reason} · apertura 9:30 {fmtPrice(p.open_price)} · soglia {fmtPrice(thr)}
              {p.level ? ` · livello più vicino: ${p.level.t} ${fmtPrice(p.level.p)}` : ' · nessun livello davanti'} · margine {p.margin.toFixed(0)} USDT × {p.leverage}x
              {p.liq_price > 0 ? ` · liquidazione ${fmtPrice(p.liq_price)}` : ''}
            </div>
            {live && (
              <div className="pos-grid mono" style={{ marginTop: 8 }}>
                <span>segnale {tm.src ? `(${tm.src})` : ''}<br /><b>{hms(tm.signalAt)}</b><br />{fmtPrice(slip.sigIn)}{slip.sigPx && Math.abs(slip.sigPx - slip.sigIn) > 1e-9 ? ` · letto ${fmtPrice(slip.sigPx)}` : ''}</span>
                <span>eseguito su Bitunix<br /><b>{hms(tm.fillAt)}</b><br />{fmtPrice(slip.fillIn)}</span>
                <span>slittamento entrata<br /><b className={slIn === null ? '' : slIn < 0 ? 'down' : 'up'}>{slIn === null ? '—' : `${fmtSigned(slIn, 3)}%`}</b><br />ritardo {delay === null ? '—' : `${delay.toFixed(1)} s`}</span>
                <span>uscita: livello → eseguito<br /><b>{open ? '—' : `${fmtPrice(slip.sigOut)} → ${slip.fillOut ? fmtPrice(slip.fillOut) : 'n.d.'}`}</b><br />{open ? `stop Bitunix ${fmtPrice(ex.sl)}` : slOut === null ? '' : <span className={slOut < 0 ? 'down' : 'up'}>{fmtSigned(slOut, 3)}%{slip.byExchange ? ' (stop di Bitunix)' : ''}</span>}</span>
              </div>
            )}
            {live && (slip.fee !== null && slip.fee !== undefined) && <div className="note">commissioni vere di Bitunix {Math.abs(slip.fee).toFixed(4)} USDT{slip.funding ? ` · funding ${slip.funding.toFixed(4)}` : ''} · slittamento: negativo = peggio per te</div>}
          </>
        )}
        <div className="chart-box" ref={box} style={{ height: 340 }}>
          {err && !data && <div className="empty">Grafico non disponibile: {err}</div>}
          {!err && !data && <div className="empty">Carico le candele…</div>}
          {data && !bars?.length && <div className="empty">Nessuna candela per questo giorno.</div>}
        </div>
        <p className="note">
          Candele da 1 minuto del perpetual Bitunix ({data?.source === 'Bitunix' ? 'da Bitunix' : 'dall\'archivio'}), dalle 9:00 alle 16:30 di New York, orari in ora locale.
          La linea arancione è lo stop che segue il prezzo, ricostruito dalle candele con le regole attuali della {mode === 'live' ? 'pagina Reale' : 'Prova'}.
        </p>
      </div>
    </div>
  )
}
