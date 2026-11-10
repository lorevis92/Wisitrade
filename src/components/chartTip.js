// Tooltip delle candele da 1 minuto nei grafici dei trade (Simulazione, Prova, Reale): al passaggio del mouse (o al tocco)
// mostra l'ora di New York della candela, con i secondi (da hh:mm:00 a hh:mm:59), e i prezzi della candela.
import { fmtPrice } from '../lib/api.js'

const nyTime = t => new Date(t).toLocaleTimeString('it-CH', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' })

// chart = grafico lightweight-charts, box = elemento che lo contiene, bars = candele { t, o, h, l, c, v }, times = tempi del grafico per candela
export function attachTip(chart, box, bars, times) {
  const byTime = new Map(times.map((x, i) => [x, bars[i]]))
  const tip = document.createElement('div')
  tip.className = 'chart-tip'
  tip.style.display = 'none'
  box.appendChild(tip)
  const onMove = param => {
    const b = param.time !== undefined ? byTime.get(param.time) : null
    if (!b || !param.point || param.point.x < 0 || param.point.y < 0) { tip.style.display = 'none'; return }
    tip.innerHTML = `<b>${nyTime(b.t)} – ${nyTime(b.t + 59000)}</b> New York<br>`
      + `apertura ${fmtPrice(b.o)} · massimo ${fmtPrice(b.h)}<br>minimo ${fmtPrice(b.l)} · chiusura ${fmtPrice(b.c)}${b.v !== undefined ? `<br>volume ${+b.v.toFixed(2)}` : ''}`
    tip.style.display = 'block'
    const w = tip.offsetWidth, h = tip.offsetHeight, W = box.clientWidth
    let x = param.point.x + 14, y = param.point.y + 14
    if (x + w > W - 4) x = Math.max(4, param.point.x - w - 14)
    if (y + h > box.clientHeight - 4) y = Math.max(4, param.point.y - h - 14)
    tip.style.left = `${x}px`; tip.style.top = `${y}px`
  }
  chart.subscribeCrosshairMove(onMove)
  return () => { chart.unsubscribeCrosshairMove(onMove); tip.remove() }
}
