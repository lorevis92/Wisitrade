import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../App.jsx'
import AssetRow, { Spark } from '../components/AssetRow.jsx'
import { fmtPct, ago } from '../lib/api.js'

const FILTERS = [['all', 'Tutti'], ['signals', 'Segnali'], ['crypto', 'Crypto'], ['stock', 'Azioni']]

export function sortAssets(list) {
  return [...list].sort((a, b) =>
    (b.signal ? 1 : 0) - (a.signal ? 1 : 0) || (b.open ? 1 : 0) - (a.open ? 1 : 0) || b.score - a.score)
}

function HeroSignal({ a }) {
  const s = a.signal
  const dir = s.direction
  return (
    <Link to={`/asset/${a.symbol}`} className={`card ${dir}`} style={{ display: 'block' }}>
      <div className="row">
        <span className="lab" style={{ color: dir === 'long' ? 'var(--long)' : 'var(--short)' }}>
          Segnale attivo · {dir} · {a.typeLabel || ''}
        </span>
        <span className="mono muted" style={{ fontSize: 12 }}>{ago(s.started_at)}</span>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 800 }}>{a.symbol}</span>
        <span className={`mono ${a.chgDay >= 0 ? 'up' : 'down'}`} style={{ fontSize: 20 }}>{fmtPct(a.chgDay)}</span>
      </div>
      <div style={{ margin: '6px 0' }}><Spark values={a.spark} color={dir === 'long' ? '#00E5C7' : '#FF5C7A'} height={46} /></div>
      <div className="grid2">
        <div className="tile"><div className="lab">Forza</div><div className="mono" style={{ fontSize: 16 }}>{s.score}/100</div></div>
        <div className="tile"><div className="lab">Attivo da</div><div className="mono" style={{ fontSize: 16 }}>{s.ageMin ?? 0} min</div></div>
      </div>
      {a.headline && <div className="note" style={{ marginTop: 8 }}>{a.headline}</div>}
    </Link>
  )
}

export default function Live() {
  const { data, error, watchlist, toggleStar } = useApp()
  const [filter, setFilter] = useState('all')

  const list = useMemo(() => {
    if (!data) return []
    let l = data.assets
    if (filter === 'signals') l = l.filter(a => a.signal)
    if (filter === 'crypto' || filter === 'stock') l = l.filter(a => a.kind === filter)
    return sortAssets(l)
  }, [data, filter])

  if (error && !data) return <div className="empty">Non riesco a caricare i dati: {error}</div>
  if (!data) return <div className="empty">Carico i mercati…</div>

  const active = sortAssets(data.assets.filter(a => a.signal)).slice(0, 3)
  const noData = data.assets.every(a => !a.at)

  return (
    <>
      {noData && (
        <div className="card"><div className="note">Lo scanner non ha ancora raccolto dati. Appena il Worker gira (ogni minuto) qui compaiono prezzi e segnali.</div></div>
      )}
      {active.map(a => <HeroSignal key={a.symbol} a={a} />)}
      {!active.length && !noData && (
        <div className="card">
          <div className="lab">Nessun segnale attivo</div>
          <div className="note" style={{ marginTop: 6 }}>
            Il mercato è calmo{data.session.inSession ? '' : ' e la borsa USA è chiusa (crypto sempre monitorate)'}. Ti avviso appena parte un movimento.
          </div>
        </div>
      )}
      <div className="row" style={{ margin: '18px 0 6px' }}>
        <span className="lab">Monitorati · {data.assets.length}</span>
        <span className="pill closed">{data.session.inSession ? 'Borsa USA aperta' : 'Borsa USA chiusa'}</span>
      </div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {FILTERS.map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <div className="card" style={{ padding: '2px 14px' }}>
        {list.length ? list.map(a => <AssetRow key={a.symbol} a={a} starred={watchlist.includes(a.symbol)} onStar={toggleStar} />)
          : <div className="empty">Nessun asset in questo filtro.</div>}
      </div>
    </>
  )
}
