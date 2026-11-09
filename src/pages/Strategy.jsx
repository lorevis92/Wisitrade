import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { get, post, fmtPrice, fmtUsd, fmtSigned, ago } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { OPTIONS, exitLevel, normalizeSettings, sizing } from '@shared/opening.js'
import { Select, RulesCard, PresetsCard, MarginField, PositionsField, ExposureInfo, useMins, num, lab, dayFmt, hm } from '../components/StrategyForm.jsx'
import Simulation from './Simulation.jsx'
import CalendarOverview from '../components/CalendarOverview.jsx'

// Capitale dedicato: valore attuale, partenza, risultato, limiti di perdita e storico delle modifiche
function DedicatedCapital({ c, s, set, mode }) {
  const pending = !c || c.set !== s.capitalDedicated
  const dt = t => new Date(t).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
      <div className="lab">Capitale dedicato</div>
      {c && !pending ? (
        <>
          <div className="kv"><span>Capitale dedicato attuale</span><span className="mono"><b>{fmtUsd(c.current)} USDT</b></span></div>
          <div className="kv"><span className="sec">Partenza</span><span className="mono sec">{fmtUsd(c.start)} USDT · {dt(c.startAt)}</span></div>
          <div className="kv"><span className="sec">Risultato dalla partenza</span><span className={`mono ${c.net >= 0 ? 'up' : 'down'}`}>{fmtSigned(c.net)} USDT · {fmtSigned(c.pct)}% · {c.trades} trade</span></div>
          <div className="kv"><span className="sec">Oggi</span><span className={`mono ${c.dayPnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(c.dayPnl)} USDT</span></div>
        </>
      ) : (
        <div className="note" style={{ color: 'var(--warn)' }}>
          {s.capitalDedicated > 0 ? `Premi Salva: ${fmtUsd(s.capitalDedicated)} USDT diventa il punto di partenza.` : "Imposta la cifra di partenza e premi Salva: finché non c'è, la strategia non apre trade."}
        </div>
      )}
      <div className="note" style={{ marginTop: 4 }}>
        Dopo ogni trade chiuso il capitale dedicato si aggiorna con il risultato vero{mode === 'live' ? ' (commissioni e funding di Bitunix compresi)' : ''}; il giorno dopo si lavora con il nuovo valore.{mode === 'live' ? ' Non si usa mai più del saldo disponibile su Bitunix.' : ''}
      </div>
      <div className="note" style={{ marginTop: 4 }}>Limiti di perdita: giornaliera {s.maxDayLoss ? `${num(s.maxDayLoss)}%` : 'spenta'} · totale {s.maxTotalLoss ? `${num(s.maxTotalLoss)}%` : 'spenta'} · freno {s.brakePct ? `${num(s.brakePct)}%` : 'spento'} (si cambiano in Regole della strategia).</div>
      {c?.history?.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="lab" style={{ cursor: 'pointer' }}>Storico delle modifiche · {c.history.length}</summary>
          {c.history.map((h, i) => (
            <div key={i} className="kv">
              <span className="sec">{dt(h.at)} · {h.type === 'set' ? 'nuova partenza' : 'riavvio dopo lo stop'}</span>
              <span className="mono">{h.from !== null && h.from !== undefined ? `${fmtUsd(h.from)} → ` : ''}{fmtUsd(h.to)} USDT</span>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

// Slittamento nel Reale: prezzo del segnale contro prezzo eseguito su Bitunix (+ = contro di te), e confronto con la Prova
function Slippage({ sl }) {
  const pc = v => (v === null || v === undefined ? '—' : `${fmtSigned(v, 3)}%`)
  return (
    <>
      <div className="lab section-title">Slittamento nel Reale · {sl.n} trade</div>
      <div className="stat-grid">
        <div className="tile"><div className="lab">Medio in entrata</div><div className="mono big">{pc(sl.avgIn)}</div><div className="note">per lato, rispetto al prezzo del segnale</div></div>
        <div className="tile"><div className="lab">Medio in uscita</div><div className="mono big">{pc(sl.avgOut)}</div><div className="note">{sl.nOut} uscite a mercato (stop di Bitunix esclusi)</div></div>
        <div className="tile"><div className="lab">Reale · Prova</div><div className="mono big">{sl.vsPaper ? `${fmtSigned(sl.vsPaper.live, 2)}% · ${fmtSigned(sl.vsPaper.paper, 2)}%` : '—'}</div><div className="note">{sl.vsPaper ? `risultato medio per trade su ${sl.vsPaper.n} segnali uguali` : 'servono trade sugli stessi segnali in Prova'}</div></div>
      </div>
      {sl.list.length > 0 && (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Titolo</th><th>Giorno</th><th>Entrata: segnale → eseguito</th><th>Slitt.</th><th>Uscita: segnale → eseguito</th><th>Slitt.</th><th>Commissioni</th><th>Reale</th><th>Prova</th></tr></thead>
            <tbody>{sl.list.map(r => (
              <tr key={r.id}>
                <td><b>{r.symbol}</b> <span className={`pill ${r.side > 0 ? 'long' : 'short'}`}>{r.side > 0 ? 'L' : 'S'}</span></td>
                <td>{dayFmt(r.day, { day: '2-digit', month: '2-digit' })}</td>
                <td className="mono">{fmtPrice(r.sigIn)} → {fmtPrice(r.fillIn)}</td>
                <td className={`mono ${r.inPct > 0 ? 'down' : 'up'}`}>{pc(r.inPct)}</td>
                <td className="mono">{r.fillOut ? `${fmtPrice(r.sigOut)} → ${fmtPrice(r.fillOut)}${r.byExchange ? ' (stop Bitunix)' : ''}` : '—'}</td>
                <td className={`mono ${r.outPct > 0 ? 'down' : 'up'}`}>{r.byExchange ? '—' : pc(r.outPct)}</td>
                <td className="mono">{r.fee !== null && r.fee !== undefined ? fmtUsd(Math.abs(r.fee), 3) : '—'}</td>
                <td className={r.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(r.pct, 2)}%</td>
                <td className={r.paper?.pct >= 0 ? 'up' : 'down'}>{r.paper?.pct !== null && r.paper?.pct !== undefined ? `${fmtSigned(r.paper.pct, 2)}%` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}

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
  const [selDay, setSelDay] = useState(null)
  const mins = useMins() // giorno scelto nella panoramica: filtra le operazioni chiuse
  const [draftFrom, setDraftFrom] = useState(null) // { name, presetId, settings }: impostazione salvata caricata nella bozza

  const refresh = useCallback(() => mode === 'sim' ? Promise.resolve() : get(`/api/strategy?mode=${mode}`)
    .then(v => { setView(v); setErr(null) })
    .catch(e => { if (/codice/i.test(e.message)) { save('adminCode', ''); setAuthed(false) } setErr(e.message) }), [mode])

  useEffect(() => { setView(null); setDraft(null); setDraftFrom(null); setArmStart(false); setArmReset(false) }, [mode])
  useEffect(() => {
    if (!authed || mode === 'sim') return
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [authed, refresh])

  const s = draft || view?.settings
  const dirty = !!draft && JSON.stringify(normalizeSettings(draft)) !== JSON.stringify(normalizeSettings(view?.settings))
  const set = (k, v) => setDraft(d => ({ ...(d || view.settings), [k]: v }))
  // capitale dedicato: la cifra nuova (non ancora salvata) diventa la partenza; altrimenti il valore attuale
  const dedNow = s?.capitalMode === 'dedicated' ? (view?.capital && view.capital.set === s.capitalDedicated ? view.capital.current : s.capitalDedicated || 0) : undefined
  const sizeBase = view ? (mode === 'live' && s?.capitalMode === 'dedicated' ? view.platform.available ?? 0 : view.platform.balance ?? 0) : 0
  const sz = useMemo(() => (s && view ? sizing(s, sizeBase, dedNow) : null), [s, view, sizeBase, dedNow])

  const act = async (fn, ok) => {
    setBusy(true); setMsg(null)
    try { const v = await fn(); if (v?.view) setView(v.view); else if (v?.mode) setView(v); if (ok) setMsg(ok) } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  // nome della configurazione che si salva: quella caricata (o quella già attiva), "(modificata)" se è stata cambiata
  const saveSettings = () => act(async () => {
    const baseName = (draftFrom?.name || view.active?.name || 'personalizzata').replace(/ \(modificata\)$/, '')
    const baseSettings = draftFrom ? draftFrom.settings : (view.active?.edited ? null : view.settings)
    const edited = !baseSettings || JSON.stringify(normalizeSettings(draft)) !== JSON.stringify(normalizeSettings(baseSettings))
    const presetId = draftFrom ? draftFrom.presetId : view.active?.presetId ?? null
    const name = edited && baseName !== 'personalizzata' ? `${baseName} (modificata)` : baseName
    const v = await post('/api/strategy/settings', { mode, settings: draft, name, presetId, edited })
    setDraft(null); setDraftFrom(null); return v
  }, mode === 'live' ? 'Impostazioni del Reale salvate.' : 'Impostazioni salvate.')
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
  const shownTrades = selDay ? view.trades.filter(p => p.day === selDay) : view.trades

  return (
    <>
      {tabs}

      {/* Configurazione attiva in questa scheda */}
      <div className="card" style={{ padding: '10px 14px' }}>
        <div className="row">
          <span className="lab">Configurazione attiva {mode === 'live' ? 'nel Reale' : 'in Prova'}</span>
          <span className="mono sec">{view.active?.at ? `modificata il ${new Date(view.active.at).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{view.active?.name || 'default dell\'app'}</div>
        {dirty && <div className="note" style={{ color: 'var(--warn)' }}>Hai modifiche non salvate{draftFrom ? ` (caricata "${draftFrom.name}")` : ''}: {mode === 'live' ? 'il Reale' : 'la Prova'} continua con la configurazione attiva finché non premi Salva.</div>}
      </div>

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
        {view.capital?.halted && <div className="warn">Strategia fermata per la perdita massima totale: {view.capital.halted.why}. Riavviandola il limite riparte dal capitale attuale.</div>}
        {(view.capital?.dayStop || t.dayStop) && <div className="warn">Oggi niente nuovi trade: perdita massima giornaliera superata. Si riparte domani.</div>}
        {t.brake && <div className="warn">Freno di mercato scattato oggi alle {new Date(t.brake.at).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })}: perdita del giorno {fmtSigned(t.brake.loss)} USDT{t.brake.pct !== null ? ` (${fmtSigned(t.brake.pct)}%)` : ''}, posizioni chiuse e niente nuovi trade fino a domani.</div>}
        {tickAge !== null && tickAge > 5 * 60000 && <div className="warn">L'ultimo controllo è di {ago(st.lastTick.at)}: il controllo ogni minuto non sta girando. Verifica cron-job.org.</div>}
        {tickAge === null && <div className="warn">Il controllo ogni minuto non è ancora partito: configura cron-job.org (vedi README).</div>}
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="tile"><div className="lab">Oggi</div><div className="mono" style={{ marginTop: 4 }}>{t.tradingDay ? `${t.prepared}/${s.symbols.length} titoli pronti` : 'borsa chiusa'}</div></div>
          <div className="tile"><div className="lab">Ultimo controllo</div><div className="mono" style={{ marginTop: 4 }}>{st.lastTick?.at ? ago(st.lastTick.at) : '—'}</div></div>
          <div className="tile">
            <div className="lab">Indice di attività</div>
            <div className="mono" style={{ marginTop: 4 }}>{!t.tradingDay ? '—' : t.mindex ? (t.mindex.idx === null ? 'non disponibile' : `${Math.round(t.mindex.idx)} / 100`) : 'dalle 9:35 NY'}</div>
            {view.settings.idxMode !== 'off' && t.mindex?.idx !== null && t.mindex?.idx !== undefined && t.mindex.idx < view.settings.idxMin && <div className="note" style={{ color: 'var(--warn)' }}>{view.settings.idxMode === 'min' ? 'sotto la soglia: oggi niente trade' : `sotto la soglia: massimo ${view.settings.idxPos} posizioni`}</div>}
          </div>
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
              <button className={s.capitalMode === 'dedicated' ? 'on' : ''} onClick={() => set('capitalMode', 'dedicated')}>Dedicato</button>
            </div>
            <div className="input-suffix">
              <input type="number" inputMode="decimal" min="0" step="any"
                value={s.capitalMode === 'fixed' ? s.capitalFixed : s.capitalMode === 'dedicated' ? s.capitalDedicated : s.capitalPct}
                onChange={e => set(s.capitalMode === 'fixed' ? 'capitalFixed' : s.capitalMode === 'dedicated' ? 'capitalDedicated' : 'capitalPct', e.target.value === '' ? '' : +e.target.value)} />
              <span>{s.capitalMode === 'percent' ? '%' : 'USDT'}</span>
            </div>
            {s.capitalMode === 'dedicated'
              ? <span className="note">cifra di partenza · ora si usano <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.capital)} USDT</b>{dedNow > sz.capital ? (mode === 'live' ? ' (limitato al saldo disponibile)' : ' (limitato al saldo)') : ''}. Cambiandola si riparte da questa cifra.</span>
              : <span className="note">= <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.capital)} USDT</b>{s.capitalMode === 'fixed' && view.platform.balance !== null && s.capitalFixed > view.platform.balance ? ' (limitato al saldo)' : ''}</span>}
          </div>
          <MarginField s={s} set={set} sz={sz} />
          <Select label="Leva" value={s.leverage} options={OPTIONS.leverage} fmt={v => `${v}x`} onChange={v => set('leverage', v)}
            hint={<>posizione da <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.notional)} USDT</b></>} />
          <PositionsField s={s} set={set} />
        </div>
        <ExposureInfo s={s} sz={sz} mins={mins} />
        {s.capitalMode === 'dedicated' && <DedicatedCapital c={view.capital} s={s} set={set} mode={mode} />}
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
      <PresetsCard current={normalizeSettings(s)} onLoad={(st, name, id) => {
        const ns = normalizeSettings(st)
        setDraft(ns); setDraftFrom(name && name !== 'default' ? { name, presetId: id ?? null, settings: ns } : { name: 'default dell\'app', presetId: null, settings: ns })
        setMsg(mode === 'live' ? 'Caricata nella pagina: il Reale non cambia finché non premi Salva.' : 'Impostazioni caricate: premi Salva per applicarle.')
      }} />

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
              {p.liq_price > 0 && <div className="note">liquidazione a <span className="mono">{fmtPrice(p.liq_price)}</span> (margine isolato)</div>}
              <button className="btn ghost small" disabled={busy} onClick={() => act(() => post('/api/strategy/close', { mode, id: p.id }), `${p.symbol} chiuso.`)}>Chiudi ora</button>
            </div>
          )
        })}
        {view.open.length > 1 && <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => act(() => post('/api/strategy/close', { mode }), 'Posizioni chiuse.')}>Chiudi tutto</button>}
      </div>

      {/* Giorno per giorno */}
      <div className="lab section-title">Giorno per giorno · {days.length} giorni con operazioni</div>
      {days.length > 0 && <CalendarOverview days={days.map(d => ({ day: d.day, n: d.n, wins: d.wins, pnl: d.pnl, pct: d.pct, cap: d.capital }))} selDay={selDay}
        onDay={d => { setSelDay(d); if (d) setTimeout(() => document.getElementById('closed-trades')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} />}
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

      {mode === 'live' && view.slippage && <Slippage sl={view.slippage} />}

      {/* Operazioni */}
      <div className="lab section-title row" id="closed-trades">
        <span>Operazioni chiuse · {selDay ? `${shownTrades.length} del ${dayFmt(selDay, { weekday: 'short', day: '2-digit', month: '2-digit' })}` : `ultime ${view.trades.length}`}</span>
        {selDay && <button className="chip" onClick={() => setSelDay(null)}>× tutti i giorni</button>}
      </div>
      {shownTrades.length ? (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Titolo</th><th>Tipo</th><th>Giorno</th><th>Entrata</th><th>Uscita</th><th>Motivo</th><th>Risultato</th><th>%</th></tr></thead>
            <tbody>{shownTrades.map(p => {
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
