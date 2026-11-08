import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { get, post, fmtPrice, fmtUsd, fmtSigned, ago } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { OPTIONS, exitLevel, normalizeSettings, sizing } from '@shared/opening.js'
import { Select, RulesCard, PresetsCard, num, lab, dayFmt, hm } from '../components/StrategyForm.jsx'
import Simulation from './Simulation.jsx'

function CodeGate({ onOk }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const go = async e => {
    e.preventDefault(); setBusy(true); setErr(null)
    save('adminCode', code.trim())
    try { await get('/api/admin/check'); onOk() } catch (x) { save('adminCode', ''); setErr(x.message) } finally { setBusy(false) }
  }
  return (
    <form className="card" onSubmit={go}>
      <div className="lab">Strategia · area privata</div>
      <p className="body">Qui gira la strategia Apertura USA sul tuo conto, in Prova o in Reale. Inserisci il codice di controllo (la variabile ADMIN_TOKEN su Vercel): resta salvato solo in questo browser.</p>
      <div className="field"><input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Codice di controllo" autoComplete="current-password" /></div>
      <button className="btn" style={{ marginTop: 10 }} disabled={busy || !code.trim()}>Entra</button>
      {err && <div className="note" style={{ color: 'var(--short)', marginTop: 8 }}>{err}</div>}
    </form>
  )
}

export default function Strategy() {
  const [params, setParams] = useSearchParams()
  const mode = ['live', 'sim'].includes(params.get('mode')) ? params.get('mode') : 'paper'
  const [authed, setAuthed] = useState(() => !!load('adminCode', ''))
  const [view, setView] = useState(null)
  const [draft, setDraft] = useState(null)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [resetBal, setResetBal] = useState('')
  const [armReset, setArmReset] = useState(false)
  const [armStart, setArmStart] = useState(false)

  const refresh = useCallback(() => mode === 'sim' ? Promise.resolve() : get(`/api/strategy?mode=${mode}`)
    .then(v => { setView(v); setErr(null) })
    .catch(e => { if (/codice/i.test(e.message)) { save('adminCode', ''); setAuthed(false) } setErr(e.message) }), [mode])

  useEffect(() => { setView(null); setDraft(null); setArmStart(false); setArmReset(false) }, [mode])
  useEffect(() => {
    if (!authed || mode === 'sim') return
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [authed, refresh])

  const s = draft || view?.settings
  const dirty = !!draft && JSON.stringify(normalizeSettings(draft)) !== JSON.stringify(normalizeSettings(view?.settings))
  const set = (k, v) => setDraft(d => ({ ...(d || view.settings), [k]: v }))
  const sz = useMemo(() => (s && view ? sizing(s, view.platform.balance ?? 0) : null), [s, view])

  const act = async (fn, ok) => {
    setBusy(true); setMsg(null)
    try { const v = await fn(); if (v?.view) setView(v.view); else if (v?.mode) setView(v); if (ok) setMsg(ok) } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const saveSettings = () => act(async () => { const v = await post('/api/strategy/settings', { mode, settings: draft }); setDraft(null); return v }, 'Impostazioni salvate.')
  const toggleEnabled = () => {
    if (!view.enabled && mode === 'live' && !armStart) { setArmStart(true); return }
    setArmStart(false)
    act(() => post('/api/strategy/settings', { mode, enabled: !view.enabled }), view.enabled ? 'Strategia fermata.' : 'Strategia avviata.')
  }

  if (!authed) return <CodeGate onOk={() => setAuthed(true)} />

  const tabs = (
    <div className="seg" style={{ marginBottom: 12 }}>
      <button className={mode === 'paper' ? 'on' : ''} onClick={() => setParams({ mode: 'paper' })}>Prova · capitale fittizio</button>
      <button className={mode === 'live' ? 'on' : ''} onClick={() => setParams({ mode: 'live' })}>Reale · Bitunix</button>
      <button className={mode === 'sim' ? 'on' : ''} onClick={() => setParams({ mode: 'sim' })}>Simulazione</button>
    </div>
  )
  if (mode === 'sim') return <>{tabs}<Simulation onAuthError={() => { save('adminCode', ''); setAuthed(false) }} /></>
  if (!view) return <>{tabs}<div className="card empty">{err || 'Carico la strategia…'}</div></>

  const st = view.status, t = view.today
  const tickAge = st.lastTick?.at ? Date.now() - st.lastTick.at : null
  const openLocal = new Date(Date.now() - (t.minutes - 570) * 60000).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })
  const totalUpnl = view.open.reduce((a, p) => a + (p.upnl || 0), 0)
  const days = view.days
  const bestDay = days.length ? days.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null
  const worstDay = days.length ? days.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null
  const avgDay = days.length ? days.reduce((a, d) => a + d.pnl, 0) / days.length : null
  const avgPct = days.length ? days.reduce((a, d) => a + (d.pct || 0), 0) / days.length : null
  const maxAbs = Math.max(1, ...days.map(d => Math.abs(d.pnl)))
  const skips = Object.entries(t.skips || {})

  return (
    <>
      {tabs}

      {/* Stato */}
      <div className={`card ${view.enabled ? 'long' : ''}`}>
        <div className="row">
          <div>
            <div className="lab">Apertura USA · entrata in tempo reale</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{mode === 'paper' ? 'Prova' : 'Reale'} · {view.enabled ? 'attiva' : 'ferma'}</div>
          </div>
          <span className={`pill ${view.enabled ? 'long' : 'closed'}`}>{view.enabled ? 'ON' : 'OFF'}</span>
        </div>
        <p className="body">
          {mode === 'paper'
            ? `Tutto uguale al Reale, ma con capitale fittizio: le entrate e le uscite sono simulate al prezzo del segnale, con commissione ${num(s.fee)}% per lato.`
            : 'Apre e chiude ordini veri sul tuo conto futures Bitunix, a mercato, con margine isolato e uno stop loss di sicurezza già impostato su Bitunix.'}
          {' '}Entrate nei primi 30 minuti dopo l'apertura USA ({t.tradingDay ? `oggi alle ${openLocal}` : 'oggi la borsa è chiusa'}), chiusura di tutto prima della fine della seduta.
        </p>
        {mode === 'live' && !st.keys && <div className="warn">Mancano le chiavi API di Bitunix: aggiungi BITUNIX_API_KEY e BITUNIX_SECRET_KEY su Vercel (solo permesso di trading, mai prelievi).</div>}
        {mode === 'live' && st.keys && !st.liveTrading && <div className="warn">Gli ordini veri sono bloccati dall'interruttore generale: quando hai finito i test in Prova imposta LIVE_TRADING=on su Vercel.</div>}
        {tickAge !== null && tickAge > 5 * 60000 && <div className="warn">L'ultimo controllo è di {ago(st.lastTick.at)}: il controllo ogni minuto non sta girando. Verifica cron-job.org.</div>}
        {tickAge === null && <div className="warn">Il controllo ogni minuto non è ancora partito: configura cron-job.org (vedi README).</div>}
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="tile"><div className="lab">Oggi</div><div className="mono" style={{ marginTop: 4 }}>{t.tradingDay ? `${t.prepared}/${s.symbols.length} titoli pronti` : 'borsa chiusa'}</div></div>
          <div className="tile"><div className="lab">Ultimo controllo</div><div className="mono" style={{ marginTop: 4 }}>{st.lastTick?.at ? ago(st.lastTick.at) : '—'}</div></div>
        </div>
        <button className={`btn ${view.enabled ? 'ghost' : ''}`} style={{ marginTop: 10 }} disabled={busy || (mode === 'live' && !view.enabled && !st.liveAllowed)} onClick={toggleEnabled}>
          {view.enabled ? 'Ferma la strategia' : armStart ? 'Confermi? Userà soldi veri' : 'Avvia la strategia'}
        </button>
        {mode === 'live' && !view.enabled && !st.liveAllowed && <div className="note" style={{ marginTop: 6 }}>Si può avviare quando chiavi API e interruttore generale sono a posto.</div>}
      </div>

      {/* Capitale */}
      <div className="lab section-title">Capitale</div>
      <div className="card">
        <div className="kv" style={{ borderTop: 0 }}>
          <span>{mode === 'paper' ? 'Saldo di prova' : 'Saldo futures su Bitunix'}</span>
          <span className="mono">{view.platform.balance !== null ? `${fmtUsd(view.platform.balance)} USDT` : '—'}</span>
        </div>
        {mode === 'paper' && <div className="kv"><span className="sec">Partenza</span><span className="mono sec">{fmtUsd(view.platform.start)} USDT · {fmtSigned((view.platform.balance / view.platform.start - 1) * 100)}%</span></div>}
        {mode === 'live' && view.platform.available !== undefined && <div className="kv"><span className="sec">Disponibili · in posizione</span><span className="mono sec">{fmtUsd(view.platform.available)} · {fmtUsd(view.platform.margin)} USDT</span></div>}
        {view.platform.error && <div className="note" style={{ color: 'var(--short)' }}>{view.platform.error}</div>}

        <div className="grid2" style={{ marginTop: 12, alignItems: 'start' }}>
          <div className="field">
            <span className="lab">Capitale da usare</span>
            <div className="seg small">
              <button className={s.capitalMode === 'fixed' ? 'on' : ''} onClick={() => set('capitalMode', 'fixed')}>Cifra</button>
              <button className={s.capitalMode === 'percent' ? 'on' : ''} onClick={() => set('capitalMode', 'percent')}>% saldo</button>
            </div>
            <div className="input-suffix">
              <input type="number" inputMode="decimal" min="0" step="any"
                value={s.capitalMode === 'fixed' ? s.capitalFixed : s.capitalPct}
                onChange={e => set(s.capitalMode === 'fixed' ? 'capitalFixed' : 'capitalPct', e.target.value === '' ? '' : +e.target.value)} />
              <span>{s.capitalMode === 'fixed' ? 'USDT' : '%'}</span>
            </div>
            <span className="note">= <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.capital)} USDT</b>{s.capitalMode === 'fixed' && view.platform.balance !== null && s.capitalFixed > view.platform.balance ? ' (limitato al saldo)' : ''}</span>
          </div>
          <Select label="Margine per trade" value={s.marginPct} options={OPTIONS.marginPct} fmt={v => `${v}% del capitale`} onChange={v => set('marginPct', v)}
            hint={<>= <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.margin)} USDT</b> a trade</>} />
          <Select label="Leva" value={s.leverage} options={OPTIONS.leverage} fmt={v => `${v}x`} onChange={v => set('leverage', v)}
            hint={<>posizione da <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.notional)} USDT</b></>} />
          <Select label="Posizioni al giorno" value={s.maxPos} options={OPTIONS.maxPos} fmt={v => lab('maxPos', v) || `massimo ${v}`} onChange={v => set('maxPos', v)}
            hint={s.maxPos > 0 ? `esposizione massima ${fmtUsd(sz.notional * s.maxPos, 0)} USDT` : 'senza limite'} />
        </div>
        {mode === 'paper' && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
            <div className="lab">Riparti da capo</div>
            <div className="row" style={{ marginTop: 6 }}>
              <div className="input-suffix" style={{ flex: 1 }}><input type="number" min="1" placeholder={String(view.platform.start)} value={resetBal} onChange={e => setResetBal(e.target.value)} /><span>USDT</span></div>
              <button className="btn ghost" style={{ width: 'auto' }} disabled={busy}
                onClick={() => { if (!armReset) { setArmReset(true); return } setArmReset(false); act(() => post('/api/strategy/reset', { balance: +(resetBal || view.platform.start) }), 'Prova azzerata.') }}>
                {armReset ? 'Confermi?' : 'Azzera'}
              </button>
            </div>
            <div className="note">Cancella lo storico di prova e riparte con il saldo scelto.</div>
          </div>
        )}
      </div>

      {/* Regole */}
      <RulesCard s={s} set={set} showFee={mode === 'paper'} />
      <PresetsCard current={normalizeSettings(s)} onLoad={st => { setDraft(normalizeSettings(st)); setMsg('Impostazioni caricate: premi Salva per applicarle.') }} />

      {dirty && (
        <div className="savebar">
          <span>Modifiche non salvate</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost" style={{ width: 'auto' }} onClick={() => setDraft(null)}>Annulla</button>
            <button className="btn" style={{ width: 'auto' }} disabled={busy} onClick={saveSettings}>Salva</button>
          </div>
        </div>
      )}
      {msg && <div className="note" style={{ margin: '0 0 12px', color: 'var(--warn)' }}>{msg}</div>}

      {/* Posizioni aperte */}
      <div className="lab section-title row">
        <span>Posizioni aperte · {view.open.length}</span>
        {view.open.length > 0 && <span className={totalUpnl >= 0 ? 'up' : 'down'}>{fmtSigned(totalUpnl)} USDT</span>}
      </div>
      <div className="card">
        {!view.open.length && <div className="note">Nessuna posizione aperta.</div>}
        {view.open.map(p => {
          const lvl = exitLevel(p, normalizeSettings(view.settings))
          return (
            <div key={p.id} className="pos">
              <div className="row">
                <div><b>{p.symbol}</b> <span className={`pill ${p.side > 0 ? 'long' : 'short'}`}>{p.side > 0 ? 'Long' : 'Short'}</span> <span className="note">{hm(p.opened_at)}</span></div>
                <span className={`mono ${p.upnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(p.upnl)} USDT</span>
              </div>
              <div className="pos-grid mono">
                <span>entrata<br /><b>{fmtPrice(p.entry)}</b></span>
                <span>ora<br /><b>{fmtPrice(p.price)}</b></span>
                <span>uscita a<br /><b>{fmtPrice(lvl)}</b></span>
                <span>margine<br /><b>{fmtUsd(p.margin, 0)} × {p.leverage}x</b></span>
              </div>
              {p.level && <div className="note">livello più vicino: {p.level.t} {fmtPrice(p.level.p)}{p.note ? ` · ${p.note}` : ''}</div>}
              <button className="btn ghost small" disabled={busy} onClick={() => act(() => post('/api/strategy/close', { mode, id: p.id }), `${p.symbol} chiuso.`)}>Chiudi ora</button>
            </div>
          )
        })}
        {view.open.length > 1 && <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => act(() => post('/api/strategy/close', { mode }), 'Posizioni chiuse.')}>Chiudi tutto</button>}
      </div>

      {/* Giorno per giorno */}
      <div className="lab section-title">Giorno per giorno · {days.length} giorni con operazioni</div>
      {days.length ? (
        <>
          <div className="stat-grid">
            <div className="tile"><div className="lab">Totale</div><div className={`mono big ${view.totals.net >= 0 ? 'up' : 'down'}`}>{fmtSigned(view.totals.net)}</div><div className="note">{view.totals.n} operazioni · {Math.round(view.totals.wins / Math.max(1, view.totals.n) * 100)}% vinte</div></div>
            <div className="tile"><div className="lab">Giorni in guadagno</div><div className="mono big">{days.filter(d => d.pnl > 0).length} su {days.length}</div><div className="note">profit factor {view.totals.pf ? fmtUsd(view.totals.pf) : '—'}</div></div>
            <div className="tile"><div className="lab">Media al giorno</div><div className={`mono big ${avgDay >= 0 ? 'up' : 'down'}`}>{fmtSigned(avgDay)}</div><div className="note">{fmtSigned(avgPct)}% · {fmtUsd(view.totals.n / days.length, 1)} operazioni</div></div>
            <div className="tile"><div className="lab">Migliore · peggiore</div><div className="mono" style={{ marginTop: 4 }}><span className="up">{fmtSigned(bestDay.pnl)}</span> · <span className={worstDay.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(worstDay.pnl)}</span></div><div className="note">{dayFmt(bestDay.day, { day: '2-digit', month: 'short' })} · {dayFmt(worstDay.day, { day: '2-digit', month: 'short' })}</div></div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Giorno</th><th>Operazioni</th><th>Vinte</th><th>Risultato</th><th>% capitale</th><th className="barcol"></th></tr></thead>
              <tbody>{days.map(d => (
                <tr key={d.day}>
                  <td>{dayFmt(d.day)}</td><td>{d.n}</td><td>{d.wins} su {d.n}</td>
                  <td className={d.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(d.pnl)} USDT</td>
                  <td className={d.pnl >= 0 ? 'up' : 'down'}>{d.pct !== null ? `${fmtSigned(d.pct)}%` : '—'}</td>
                  <td className="barcol"><div className="dbar" style={{ width: `${Math.max(3, Math.abs(d.pnl) / maxAbs * 100)}%`, background: d.pnl >= 0 ? 'var(--long)' : 'var(--short)' }} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      ) : <div className="card note">Ancora nessuna operazione chiusa. Il riepilogo compare dopo il primo giorno.</div>}

      {/* Operazioni */}
      <div className="lab section-title">Operazioni chiuse · ultime {view.trades.length}</div>
      {view.trades.length ? (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Titolo</th><th>Tipo</th><th>Giorno</th><th>Entrata</th><th>Uscita</th><th>Motivo</th><th>Risultato</th><th>%</th></tr></thead>
            <tbody>{view.trades.map(p => {
              const pct = p.pnl / (p.entry * p.qty) * 100
              return (
                <tr key={p.id}>
                  <td><b>{p.symbol}</b></td>
                  <td><span className={`pill ${p.side > 0 ? 'long' : 'short'}`}>{p.side > 0 ? 'Long' : 'Short'}</span></td>
                  <td>{dayFmt(p.day, { day: '2-digit', month: '2-digit' })}</td>
                  <td>{hm(p.opened_at)} · {fmtPrice(p.entry)}</td>
                  <td>{hm(p.closed_at)} · {fmtPrice(p.exit)}</td>
                  <td className="sec">{p.reason}</td>
                  <td className={p.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(p.pnl)}</td>
                  <td className={p.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(pct)}%</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      ) : <div className="card note">Nessuna operazione chiusa.</div>}

      {skips.length > 0 && (
        <details className="card" style={{ marginTop: 12 }}>
          <summary className="lab" style={{ cursor: 'pointer' }}>Titoli scartati oggi · {skips.length}</summary>
          {skips.map(([sym, why]) => <div key={sym} className="kv"><span>{sym}</span><span className="sec">{why}</span></div>)}
        </details>
      )}
    </>
  )
}
