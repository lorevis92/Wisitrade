// Panoramica dei risultati per mese e per giorno (Simulazione, Prova e Reale).
// days: [{ day: 'YYYY-MM-DD', n: trade, wins, pnl: USDT, pct: % sul capitale di inizio giornata, cap: capitale di inizio giornata }]
// Toccando un mese si apre la griglia dei suoi giorni; toccando un giorno si filtra l'elenco dei trade (onDay).
import { useMemo, useState } from 'react'
import { fmtSigned } from '../lib/api.js'

const monthName = m => new Date(m + '-15T12:00:00Z').toLocaleDateString('it-CH', { month: 'long', year: 'numeric' })
const dayName = d => {
  const x = new Date(d + 'T12:00:00Z')
  return `${x.toLocaleDateString('it-CH', { weekday: 'short' }).replace('.', '')} ${String(x.getUTCDate()).padStart(2, '0')}`
}

// colore: verde se positivo, rosso se negativo, grigio se zero o senza trade; più intenso per i risultati più grandi (k da 0 a 1)
function tone(pct, n, maxAbs) {
  if (!n || !pct) return { className: 'cal-cell zero' }
  const k = Math.min(1, Math.abs(pct) / (maxAbs || 1))
  const [rgb, base] = pct > 0 ? ['0, 229, 199', '#0A1A1C'] : ['255, 92, 122', '#140A10']
  const a = (0.04 + 0.22 * k).toFixed(3)
  return {
    className: `cal-cell ${pct > 0 ? 'pos' : 'neg'}`,
    style: { background: `linear-gradient(rgba(${rgb}, ${a}), rgba(${rgb}, ${a})), ${base}`, borderColor: `rgba(${rgb}, ${(0.25 + 0.55 * k).toFixed(3)})` },
  }
}

export default function CalendarOverview({ days, selDay, onDay, defaultOpen = null }) {
  const [open, setOpen] = useState(defaultOpen)
  const months = useMemo(() => {
    const by = new Map()
    for (const d of [...days].sort((a, b) => (a.day < b.day ? -1 : 1))) {
      const m = d.day.slice(0, 7)
      if (!by.has(m)) by.set(m, { m, days: [], pnl: 0, cap: null, up: 0, traded: 0 })
      const x = by.get(m)
      x.days.push(d)
      x.pnl += d.pnl || 0
      if (x.cap === null && d.cap > 0) x.cap = d.cap // capitale di inizio mese = quello del primo giorno del mese
      if (d.n > 0) { x.traded++; if (d.pnl > 0) x.up++ }
    }
    return [...by.values()].map(x => ({ ...x, pct: x.cap ? x.pnl / x.cap * 100 : null }))
  }, [days])
  if (!months.length) return null
  const maxMonth = Math.max(...months.map(x => Math.abs(x.pct || 0)))
  const cur = months.find(x => x.m === open)
  const maxDay = cur ? Math.max(...cur.days.map(d => Math.abs(d.pct || 0))) : 1

  return (
    <div className="cal">
      <div className="cal-months">
        {months.map(x => {
          const t = tone(x.pct ?? x.pnl, x.traded, x.pct !== null ? maxMonth : Math.abs(x.pnl))
          return (
            <button key={x.m} className={`${t.className} month ${open === x.m ? 'open' : ''}`} style={t.style} onClick={() => setOpen(open === x.m ? null : x.m)} aria-expanded={open === x.m}>
              <span className="cal-title">{monthName(x.m)}</span>
              <span className="cal-pct">{x.pct !== null ? `${fmtSigned(x.pct, 1)}%` : '—'}</span>
              <span className="cal-usd">{fmtSigned(x.pnl)} USDT</span>
              <span className="cal-sub">{x.up}/{x.traded} giorni positivi</span>
            </button>
          )
        })}
      </div>
      {cur && (
        <div className="cal-days">
          {cur.days.map(d => {
            const t = tone(d.pct, d.n, maxDay)
            return (
              <button key={d.day} className={`${t.className} ${selDay === d.day ? 'sel' : ''}`} style={t.style} disabled={!d.n}
                onClick={() => onDay?.(selDay === d.day ? null : d.day)} title={d.n ? `${d.n} trade, ${d.wins} vinti` : 'nessun trade'}>
                <span className="cal-date">{dayName(d.day)}</span>
                <span className="cal-pct">{d.n ? `${fmtSigned(d.pct ?? 0, 1)}%` : '—'}</span>
                <span className="cal-usd">{d.n ? fmtSigned(d.pnl) : ''}</span>
              </button>
            )
          })}
        </div>
      )}
      {selDay && (
        <div className="cal-filter">
          <span>Trade del <b>{new Date(selDay + 'T12:00:00Z').toLocaleDateString('it-CH', { weekday: 'long', day: '2-digit', month: 'long' })}</b></span>
          <button className="chip" onClick={() => onDay?.(null)}>× togli il filtro</button>
        </div>
      )}
      <div className="note" style={{ marginTop: 6 }}>Tocca un mese per vedere i giorni, poi un giorno per vedere solo i suoi trade. % del giorno sul capitale di inizio giornata, % del mese su quello di inizio mese.</div>
    </div>
  )
}

