import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { get, ago, fmtPrice } from '../lib/api.js'

// Orari della sessione USA convertiti nell'ora locale del browser
function usTimes() {
  const now = new Date()
  const nyDate = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const toLocal = (h, m) => {
    // trova l'istante UTC che a New York corrisponde a h:m del giorno corrente
    const guess = new Date(`${nyDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
    const nyAtGuess = new Date(guess.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const utcAtGuess = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
    const t = new Date(guess.getTime() + (utcAtGuess - nyAtGuess))
    return t.toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })
  }
  return [
    ['Apertura borsa USA', toLocal(9, 30)],
    ['Fine range di apertura', toLocal(9, 45)],
    ['Finestra breakout fino a', toLocal(11, 30)],
    ['Chiusura borsa USA', toLocal(16, 0)],
  ]
}

export default function Calendar() {
  const [events, setEvents] = useState(null)
  const [signals, setSignals] = useState(null)
  useEffect(() => {
    get('/api/events').then(j => setEvents(j.earnings)).catch(() => setEvents([]))
    get('/api/signals').then(j => setSignals(j.signals)).catch(() => setSignals([]))
  }, [])

  return (
    <>
      <div className="lab section-title" style={{ marginTop: 0 }}>Orari di oggi (ora locale)</div>
      <div className="card">
        {usTimes().map(([l, t]) => <div className="kv" key={l}><span>{l}</span><span className="mono">{t}</span></div>)}
        <div className="note" style={{ marginTop: 6 }}>Crypto monitorate 24/7. I breakout di apertura valgono solo nei giorni di borsa.</div>
      </div>

      <div className="lab section-title">Prossime trimestrali</div>
      <div className="card">
        {!events && <div className="note">Carico…</div>}
        {events?.length === 0 && <div className="note">Nessuna data ancora: arrivano con il Contesto settimanale di ogni titolo.</div>}
        {events?.map(e => (
          <Link to={`/asset/${e.symbol}`} className="kv" key={e.symbol}>
            <span><b>{e.symbol}</b> <span className="muted">{e.name}</span></span>
            <span className="mono" style={{ color: 'var(--warn)' }}>{new Date(e.date + 'T12:00:00').toLocaleDateString('it-CH', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
          </Link>
        ))}
      </div>

      <div className="lab section-title">Ultimi segnali</div>
      <div className="card">
        {!signals && <div className="note">Carico…</div>}
        {signals?.length === 0 && <div className="note">Ancora nessun segnale registrato.</div>}
        {signals?.map(s => (
          <Link to={`/asset/${s.symbol}`} className="kv" key={s.id}>
            <span>
              <b>{s.symbol}</b> <span className={`pill ${s.direction}`}>{s.direction}</span>{' '}
              <span className="muted" style={{ fontSize: 12 }}>{s.typeLabel}</span>
            </span>
            <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>
              {s.status === 'active' ? <span className="up">attivo</span> : <span className={s.ret90 > 0 ? 'up' : 'down'}>{s.ret90 >= 0 ? '+' : ''}{s.ret90?.toFixed(2)}%</span>}
              <div className="muted">{ago(s.started_at)} · {fmtPrice(s.entry)}</div>
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
