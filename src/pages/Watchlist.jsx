import { useApp } from '../App.jsx'
import AssetRow from '../components/AssetRow.jsx'
import { sortAssets } from './Live.jsx'
import { Link } from 'react-router-dom'

export default function Watchlist() {
  const { data, watchlist, toggleStar, pushOn } = useApp()
  if (!data) return <div className="empty">Carico…</div>
  const list = sortAssets(data.assets.filter(a => watchlist.includes(a.symbol)))
  return (
    <>
      <div className="card">
        <div className="lab">La tua watchlist</div>
        <div className="note" style={{ marginTop: 6 }}>
          Per gli asset che segui ricevi anche i segnali medi (forza 55+) e l'avviso di fine segnale. Gli altri asset ti avvisano solo con segnali forti (75+).
          {!pushOn && <> <Link to="/impostazioni" style={{ color: 'var(--primary)' }}>Attiva le notifiche</Link>.</>}
        </div>
      </div>
      <div className="card" style={{ padding: '2px 14px' }}>
        {list.length
          ? list.map(a => <AssetRow key={a.symbol} a={a} starred onStar={toggleStar} />)
          : <div className="empty">Nessun asset. Tocca ☆ nella lista Live o nella scheda di un asset per aggiungerlo.</div>}
      </div>
    </>
  )
}
