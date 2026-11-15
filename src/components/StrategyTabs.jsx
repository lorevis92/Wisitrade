// Le tre schede comuni a tutte le strategie (Apertura USA, RSI, Range): Simulazione, Prova, Reale.
// La scheda scelta sta nell'indirizzo (?mode=sim|paper|live) e resta ricordata nel browser per ogni strategia.
import { useSearchParams } from 'react-router-dom'
import { load, save } from '../lib/store.js'

const MODES = [['sim', 'Simulazione'], ['paper', 'Prova · capitale fittizio'], ['live', 'Reale · Bitunix']]

export function useStrategyMode(key, fallback = 'paper') {
  const [params, setParams] = useSearchParams()
  const q = params.get('mode')
  const mode = MODES.some(([k]) => k === q) ? q : load(`tab:${key}`, fallback)
  const setMode = m => { save(`tab:${key}`, m); setParams(p => { const n = new URLSearchParams(p); n.set('mode', m); return n }, { replace: true }) }
  return [mode, setMode]
}

export default function StrategyTabs({ mode, setMode, style }) {
  return (
    <div className="seg" style={{ marginBottom: 12, ...style }}>
      {MODES.map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
    </div>
  )
}

export function ComingSoon({ what }) {
  return <div className="card note" style={{ padding: 14 }}>{what}: in arrivo.</div>
}
