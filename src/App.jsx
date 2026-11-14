import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar, Footer } from './components/Layout.jsx'
import Live from './pages/Live.jsx'
import Watchlist from './pages/Watchlist.jsx'
import Calendar from './pages/Calendar.jsx'
import Asset from './pages/Asset.jsx'
import Settings from './pages/Settings.jsx'
import Strategy from './pages/Strategy.jsx'
import Rsi from './pages/Rsi.jsx'
import { get } from './lib/api.js'
import { load, save } from './lib/store.js'
import { registerSW, currentSubscription, syncSubscription } from './lib/push.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [watchlist, setWatchlist] = useState(() => load('watchlist', []))
  const [pushOn, setPushOn] = useState(false)

  const refresh = useCallback(() => get('/api/assets').then(d => { setData(d); setError(null) }).catch(e => setError(e.message)), [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    const onVis = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [refresh])

  useEffect(() => {
    registerSW().then(() => currentSubscription()).then(sub => setPushOn(!!sub)).catch(() => {})
  }, [])

  const toggleStar = useCallback(sym => {
    setWatchlist(w => {
      const next = w.includes(sym) ? w.filter(s => s !== sym) : [...w, sym]
      save('watchlist', next)
      currentSubscription().then(syncSubscription).catch(() => {})
      return next
    })
  }, [])

  const live = data?.at && data.assets.some(a => a.at && Date.now() - a.at < 5 * 60000)

  return (
    <Ctx.Provider value={{ data, error, refresh, watchlist, toggleStar, pushOn, setPushOn }}>
      <BrowserRouter>
        <Navbar pushOn={pushOn} live={live} />
        <main className="wrap" style={{ paddingTop: 14 }}>
          <Routes>
            <Route path="/" element={<Live />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/strategia" element={<Strategy />} />
            <Route path="/calendario" element={<Calendar />} />
            <Route path="/rsi" element={<Rsi />} />
            <Route path="/asset/:symbol" element={<Asset />} />
            <Route path="/impostazioni" element={<Settings />} />
            <Route path="*" element={<Live />} />
          </Routes>
        </main>
        <Footer />
      </BrowserRouter>
    </Ctx.Provider>
  )
}
