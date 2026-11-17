import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'

function Logo() {
  const [img, setImg] = useState(true)
  return (
    <Link to="/" className="logo">
      {img
        ? <img src="/logo-wisitrade.png" alt="Wisi Trade" onError={() => setImg(false)} />
        : <span>WISI<b>TRADE</b></span>}
    </Link>
  )
}

// Menu ad hamburger: tutte le sezioni in gruppi; la voce della pagina aperta è evidenziata. Gli indirizzi non cambiano.
const MENU = [
  ['Mercato', [['/', 'Live'], ['/watchlist', 'Watchlist'], ['/calendario', 'Calendario'], ['/livelli', 'Livelli']]],
  ['Strategie', [['/strategia', 'Apertura USA'], ['/rsi', 'RSI'], ['/range', 'Range']]],
  ['Impostazioni', [['/impostazioni', 'Impostazioni']]],
]
const sectionOf = path => MENU.flatMap(([, items]) => items).find(([to]) => (to === '/' ? path === '/' : path.startsWith(to)))?.[1] || ''

export function Navbar({ pushOn, live }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => { setOpen(false) }, [loc.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = e => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])
  const here = sectionOf(loc.pathname)
  return (
    <header className="nav">
      <div className="wrap">
        <div className="nav-top">
          <button className="icon-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}>☰ <span className="nav-here">{here}</span></button>
          <Logo />
          <Link to="/impostazioni" className={`icon-btn ${pushOn ? 'on' : ''}`} aria-label="Notifiche">
            <span className={`dot ${live ? '' : 'off'}`} /> {pushOn ? 'ON' : 'OFF'}
          </Link>
        </div>
      </div>
      {/* il pannello va nel body: la barra in alto ha backdrop-filter, che confinerebbe il position: fixed alla barra */}
      {open && createPortal(
        <div className="menu-bg" onClick={() => setOpen(false)}>
          <nav className="menu" onClick={e => e.stopPropagation()} aria-label="Sezioni">
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="lab">Wisi Trade</span>
              <button className="icon-btn" aria-label="Chiudi il menu" onClick={() => setOpen(false)}>✕</button>
            </div>
            {MENU.map(([group, items], i) => (
              <div key={i} className="menu-group">
                {group && <div className="menu-title">{group}</div>}
                {items.map(([to, label]) => (
                  <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}>{label}</NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>,
        document.body,
      )}
    </header>
  )
}

export function Footer() {
  const [img, setImg] = useState(true)
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {img
              ? <img src="/logo-wisiverse.png" alt="WiSiVERSE" onError={() => setImg(false)} />
              : <span className="brand">WiSi<b>VERSE</b></span>}
            <span style={{ fontSize: 11, color: 'var(--text-sec)' }}>Part of the WiSiVERSE ecosystem</span>
          </div>
          <a href="https://wisiverse.com" target="_blank" rel="noreferrer">wisiverse.com →</a>
        </div>
        <p className="disclaimer">
          Wisi Trade mostra segnali calcolati automaticamente e analisi generate dall'AI a scopo informativo.
          Non è consulenza finanziaria. Il trading con leva può far perdere più del capitale investito. La modalità Reale apre e chiude ordini veri sul tuo conto Bitunix: usala con somme che puoi permetterti di perdere.
        </p>
      </div>
    </footer>
  )
}
