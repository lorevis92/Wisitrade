import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'

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

export function Navbar({ pushOn, live }) {
  return (
    <header className="nav">
      <div className="wrap">
        <div className="nav-top">
          <Link to="/impostazioni" className="icon-btn" aria-label="Menu">☰</Link>
          <Logo />
          <Link to="/impostazioni" className={`icon-btn ${pushOn ? 'on' : ''}`} aria-label="Notifiche">
            <span className={`dot ${live ? '' : 'off'}`} /> {pushOn ? 'ON' : 'OFF'}
          </Link>
        </div>
        <nav className="tabs">
          <NavLink to="/" end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Live</NavLink>
          <NavLink to="/watchlist" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Watchlist</NavLink>
          <NavLink to="/strategia" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Strategia</NavLink>
          <NavLink to="/calendario" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Calendario</NavLink>
          <NavLink to="/rsi" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>RSI</NavLink>
        </nav>
      </div>
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
