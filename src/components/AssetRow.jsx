import { Link } from 'react-router-dom'
import { fmtPct } from '../lib/api.js'

export function Spark({ values = [], color = '#9AA6C2', height = 28 }) {
  if (values.length < 2) return <svg width="100%" height={height} />
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ')
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" points={pts} />
    </svg>
  )
}

export function stateLabel(a) {
  if (!a.open) return { text: 'chiuso', cls: 'closed' }
  if (a.signal) return { text: a.signal.direction === 'long' ? 'segnale long' : 'segnale short', cls: a.signal.direction }
  if (a.score >= 45 && a.direction) return { text: a.direction === 'long' ? 'in formazione ↑' : 'in formazione ↓', cls: a.direction }
  return { text: 'neutro', cls: 'neutral' }
}

export default function AssetRow({ a, starred, onStar }) {
  const lbl = stateLabel(a)
  const col = a.chgDay === null ? '#9AA6C2' : a.chgDay >= 0 ? '#00E5C7' : '#FF5C7A'
  const barCol = a.direction === 'short' ? 'var(--short)' : 'var(--long)'
  return (
    <div className="asset-row">
      <Link to={`/asset/${a.symbol}`} style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="asset-sym">{a.symbol}</span>
          <span className={`pill ${lbl.cls}`}>{lbl.text}</span>
        </div>
        <div className="asset-name">{a.name}{a.headline ? ` · ${a.headline}` : ''}</div>
        <div className="score-bar"><i style={{ width: `${a.score}%`, background: barCol }} /></div>
      </Link>
      <Link to={`/asset/${a.symbol}`}><Spark values={a.spark} color={col} /></Link>
      <div style={{ textAlign: 'right' }}>
        <div className="mono" style={{ fontSize: 13, color: col }}>{fmtPct(a.chgDay)}</div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 3 }}>
          <span className="mono muted" style={{ fontSize: 11 }}>{a.score}</span>
          {onStar && (
            <button onClick={() => onStar(a.symbol)} aria-label={starred ? 'Togli dalla watchlist' : 'Aggiungi alla watchlist'}
              style={{ background: 'none', border: 0, color: starred ? 'var(--warn)' : 'var(--text-muted)', fontSize: 15, padding: 0 }}>
              {starred ? '★' : '☆'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
