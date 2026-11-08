import { useState } from 'react'
import { useApp } from '../App.jsx'
import { enablePush, disablePush, testPush, pushSupported, isIOS, isStandalone, currentSubscription, syncSubscription } from '../lib/push.js'
import { load, save } from '../lib/store.js'

export default function Settings() {
  const { pushOn, setPushOn } = useApp()
  const [allAlerts, setAllAlerts] = useState(() => load('allAlerts', true))
  const [tradeAlerts, setTradeAlerts] = useState(() => load('tradeAlerts', false))
  const hasCode = !!load('adminCode', '')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const iosNeedsInstall = isIOS() && !isStandalone()

  const run = async fn => {
    setBusy(true); setMsg(null)
    try { await fn() } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const togglePush = () => run(async () => {
    if (pushOn) { await disablePush(); setPushOn(false); setMsg('Notifiche disattivate.') }
    else { await enablePush(); setPushOn(true); setMsg('Notifiche attive su questo dispositivo.') }
  })

  const toggleAll = () => {
    const v = !allAlerts
    setAllAlerts(v); save('allAlerts', v)
    currentSubscription().then(syncSubscription).catch(() => {})
  }

  const toggleTrade = () => run(async () => {
    const v = !tradeAlerts
    save('tradeAlerts', v); setTradeAlerts(v)
    const sub = await currentSubscription()
    if (!sub) { setMsg(v ? 'Attiva prima le notifiche: poi riceverai anche aperture e chiusure.' : null); return }
    const r = await syncSubscription(sub)
    if (v && !r?.tradeAlerts) { save('tradeAlerts', false); setTradeAlerts(false); throw new Error('Serve il codice di controllo: inseriscilo nella pagina Strategia.') }
    setMsg(v ? 'Riceverai una notifica a ogni apertura e chiusura della strategia.' : 'Avvisi delle operazioni spenti.')
  })

  return (
    <>
      <div className="lab section-title" style={{ marginTop: 0 }}>Notifiche</div>
      <div className="card">
        {iosNeedsInstall && (
          <div className="note" style={{ marginBottom: 10, color: 'var(--warn)' }}>
            Su iPhone le notifiche funzionano solo dall'app installata: tocca Condividi → "Aggiungi alla schermata Home", poi apri Wisi Trade da lì e torna qui.
          </div>
        )}
        {!pushSupported() && !iosNeedsInstall && <div className="note" style={{ marginBottom: 10 }}>Questo browser non supporta le notifiche push.</div>}
        <button className={`btn ${pushOn ? 'ghost' : ''}`} disabled={busy || !pushSupported()} onClick={togglePush}>
          {pushOn ? 'Disattiva notifiche' : 'Attiva notifiche'}
        </button>
        {pushOn && (
          <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(async () => { const r = await testPush(); setMsg(r.ok ? 'Notifica di prova inviata.' : `Invio non riuscito (${r.status}).`) })}>
            Manda una notifica di prova
          </button>
        )}
        <label className="toggle" style={{ marginTop: 10 }}>
          <span>Avvisi forti su tutti gli asset<div className="note">Se lo spegni ricevi solo gli avvisi della watchlist.</div></span>
          <input type="checkbox" checked={allAlerts} onChange={toggleAll} />
        </label>
        <label className="toggle">
          <span>Aperture e chiusure della strategia<div className="note">{hasCode ? 'Una notifica per ogni operazione aperta o chiusa, in Prova e in Reale.' : 'Disponibile dopo aver inserito il codice nella pagina Strategia.'}</div></span>
          <input type="checkbox" checked={tradeAlerts} disabled={busy || !hasCode} onChange={toggleTrade} />
        </label>
        {msg && <div className="note" style={{ marginTop: 8 }}>{msg}</div>}
      </div>

      <div className="lab section-title">Come funzionano gli avvisi</div>
      <div className="card">
        <div className="kv"><span>Segnale forte (75+)</span><span className="sec">a tutti</span></div>
        <div className="kv"><span>Segnale medio (55+)</span><span className="sec">solo watchlist</span></div>
        <div className="kv"><span>Fine segnale</span><span className="sec">solo watchlist</span></div>
        <div className="kv"><span>Operazioni della strategia</span><span className="sec">solo con il codice</span></div>
        <div className="kv"><span>Controllo mercati</span><span className="sec">ogni minuto</span></div>
        <div className="note" style={{ marginTop: 6 }}>Watchlist e preferenze restano salvate solo in questo browser.</div>
      </div>

      {hasCode && (
        <>
          <div className="lab section-title">Codice di controllo</div>
          <div className="card">
            <div className="note">Questo browser ha accesso alla pagina Strategia.</div>
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => { save('adminCode', ''); save('tradeAlerts', false); location.reload() }}>Esci da questo browser</button>
          </div>
        </>
      )}
    </>
  )
}
