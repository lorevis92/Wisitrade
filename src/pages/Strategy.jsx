import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import StrategyTabs from '../components/StrategyTabs.jsx'
import { get, post, fmtPrice, fmtUsd, fmtSigned, ago } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { OPTIONS, exitLevel, normalizeSettings, sizing } from '@shared/opening.js'
import { Select, RulesCard, PresetsCard, MarginField, PositionsField, ExposureInfo, useMins, num, lab, dayFmt, hm } from '../components/StrategyForm.jsx'
import Simulation from './Simulation.jsx'
import CalendarOverview from '../components/CalendarOverview.jsx'
import PositionChart from '../components/PositionChart.jsx'
import { LiveSphere } from '../components/Sphere.jsx'
import { EXCHANGES, EX_LIST } from '@shared/venues.js'

// Chiavi API da mettere su Vercel per ogni exchange (solo permessi di trading, mai prelievi)
const KEYS_HINT = { bitunix: 'BITUNIX_API_KEY e BITUNIX_SECRET_KEY', bitget: 'BITGET_API_KEY, BITGET_API_SECRET e BITGET_API_PASSPHRASE' }

// Totale di Prova o Reale: solo il bilancio economico, diviso per exchange e sommato (niente elenco dei trade)
function TotalView({ mode }) {
  const [v, setV] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let on = true
    const go = () => get(`/api/strategy/total?mode=${mode}`).then(x => { if (on) { setV(x); setErr(null) } }).catch(e => on && setErr(e.message))
    go()
    const id = setInterval(go, 30000)
    return () => { on = false; clearInterval(id) }
  }, [mode])
  if (!v) return <div className="card empty">{err || 'Carico il totale…'}</div>
  const cap = c => (c ? `${fmtUsd(c.current)} USDT` : '—')
  const capNote = c => (c && c.start > 0 ? `${fmtSigned((c.current / c.start - 1) * 100)}% dalla partenza (${fmtUsd(c.start)})` : '')
  const pct = x => (x === null || x === undefined ? '—' : `${Math.round(x)}%`)
  const T = v.total
  return (
    <>
      <div className="stat-grid">
        <div className="tile"><div className="lab">Risultato</div><div className={`mono big ${T.net >= 0 ? 'up' : 'down'}`}>{fmtSigned(T.net)}</div><div className="note">USDT · oggi {fmtSigned(T.today)}</div></div>
        <div className="tile"><div className="lab">Capitale</div><div className="mono big">{T.capital ? fmtUsd(T.capital.current) : '—'}</div><div className="note">{capNote(T.capital) || 'USDT'}</div></div>
        <div className="tile"><div className="lab">Trade · vincenti</div><div className="mono big">{T.n} · {pct(T.winPct)}</div><div className="note">{T.open ? `${T.open} posizioni aperte` : 'nessuna posizione aperta'}</div></div>
        <div className="tile"><div className="lab">Costi</div><div className="mono big">{fmtUsd(T.costs)}</div><div className="note">commissioni {fmtUsd(T.fees)} · funding {fmtSigned(T.funding)} USDT</div></div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Exchange</th><th>Stato</th><th>Trade</th><th>Vincenti</th><th>Risultato</th><th>Oggi</th><th>Costi</th><th>Capitale</th></tr></thead>
          <tbody>
            {v.rows.map(r => (
              <tr key={r.ex}>
                <td><b>{r.name}</b></td>
                <td className="sec">{r.missing ? 'conto da creare' : r.enabled ? 'attiva' : 'ferma'}</td>
                <td>{r.n}</td><td>{pct(r.winPct)}</td>
                <td className={r.net >= 0 ? 'up' : 'down'}>{fmtSigned(r.net)}</td>
                <td className={r.today >= 0 ? 'up' : 'down'}>{fmtSigned(r.today)}</td>
                <td className="mono">{fmtUsd(r.costs)}</td>
                <td className="mono" title={capNote(r.capital)}>{cap(r.capital)}</td>
              </tr>
            ))}
            <tr>
              <td><b>Totale</b></td><td></td><td><b>{T.n}</b></td><td><b>{pct(T.winPct)}</b></td>
              <td className={T.net >= 0 ? 'up' : 'down'}><b>{fmtSigned(T.net)}</b></td>
              <td className={T.today >= 0 ? 'up' : 'down'}><b>{fmtSigned(T.today)}</b></td>
              <td className="mono"><b>{fmtUsd(T.costs)}</b></td>
              <td className="mono"><b>{cap(T.capital)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="note">Risultato netto (commissioni e funding compresi) dei trade chiusi. Costi = commissioni + funding pagato. Capitale = capitale dedicato{mode === 'paper' ? ' o saldo di prova' : ''} di ogni exchange. Per i trade apri la sezione dell'exchange.</div>
    </>
  )
}

// Capitale dedicato: valore attuale, partenza, risultato, limiti di perdita e storico delle modifiche
function DedicatedCapital({ c, s, set, mode, X = 'Bitunix' }) {
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
        Dopo ogni trade chiuso il capitale dedicato si aggiorna con il risultato vero{mode === 'live' ? ` (commissioni e funding di ${X} compresi)` : ''}; il giorno dopo si lavora con il nuovo valore.{mode === 'live' ? ` Non si usa mai più del saldo disponibile su ${X}.` : ''}
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

// Slittamento nel Reale: prezzo del segnale contro prezzo eseguito sull'exchange (negativo = peggio per te), e confronto con la Prova
function Slippage({ sl, onTrade, X = 'Bitunix' }) {
  const pc = v => (v === null || v === undefined ? '—' : `${fmtSigned(v, 3)}%`)
  return (
    <>
      <div className="lab section-title">Slittamento nel Reale · {sl.n} trade</div>
      <div className="stat-grid">
        <div className="tile"><div className="lab">Medio in entrata</div><div className="mono big">{pc(sl.avgIn)}</div><div className="note">per lato, rispetto alla soglia del segnale · negativo = peggio per te</div></div>
        <div className="tile"><div className="lab">Ritardo medio</div><div className="mono big">{sl.avgDelay !== null && sl.avgDelay !== undefined ? `${fmtUsd(sl.avgDelay, 1)} s` : '—'}</div><div className="note">dal segnale all'esecuzione su {X}{sl.nFast ? ` · entrata veloce ${fmtUsd(sl.avgDelayFast, 1)} s (${sl.nFast} trade)` : ''}</div></div>
        <div className="tile"><div className="lab">Medio in uscita</div><div className="mono big">{pc(sl.avgOut)}</div><div className="note">{sl.nOut} uscite, rispetto al livello d'uscita (stop di {X} compresi)</div></div>
        <div className="tile"><div className="lab">Reale · Prova</div><div className="mono big">{sl.vsPaper ? `${fmtSigned(sl.vsPaper.live, 2)}% · ${fmtSigned(sl.vsPaper.paper, 2)}%` : '—'}</div><div className="note">{sl.vsPaper ? `risultato medio per trade su ${sl.vsPaper.n} segnali uguali` : 'servono trade sugli stessi segnali in Prova'}</div></div>
      </div>
      {sl.list.length > 0 && (
        <div className="table-wrap">
          <table className="tbl clickable">
            <thead><tr><th>Titolo</th><th>Giorno</th><th>Segnale</th><th>Ritardo</th><th>Entrata: segnale → eseguito</th><th>Slitt.</th><th>Uscita: segnale → eseguito</th><th>Slitt.</th><th>Commissioni</th><th>Reale</th><th>Prova</th></tr></thead>
            <tbody>{sl.list.map(r => (
              <tr key={r.id} onClick={() => onTrade?.(r.id)}>
                <td><b>{r.symbol}</b> <span className={`pill ${r.side > 0 ? 'long' : 'short'}`}>{r.side > 0 ? 'L' : 'S'}</span></td>
                <td>{dayFmt(r.day, { day: '2-digit', month: '2-digit' })}</td>
                <td className="mono">{r.signalAt ? new Date(r.signalAt).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}{r.src ? <span className="note"> {r.src}</span> : null}</td>
                <td className="mono" title={r.orderDelay !== null ? `ordine dopo ${fmtUsd(r.orderDelay, 1)} s` : ''}>{r.delay !== null ? `${fmtUsd(r.delay, 1)} s` : '—'}</td>
                <td className="mono">{fmtPrice(r.sigIn)} → {fmtPrice(r.fillIn)}</td>
                <td className={`mono ${r.inPct < 0 ? 'down' : 'up'}`} title={r.detPct !== null && r.detPct !== undefined ? `soglia → prezzo letto ${fmtSigned(r.detPct, 3)}%` : undefined}>{pc(r.inPct)}</td>
                <td className="mono">{r.fillOut ? `${fmtPrice(r.sigOut)} → ${fmtPrice(r.fillOut)}${r.byExchange ? ` (stop ${X})` : ''}` : '—'}</td>
                <td className={`mono ${r.outPct < 0 ? 'down' : 'up'}`}>{pc(r.outPct)}</td>
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

// Titoli scelti che l'exchange non accetta via API: non si tentano (stessa lista per la sua Prova e il suo Reale)
const KIND = { bitunix: 'Bitunix: non operabile via API', bitget: 'Bitget: perpetuo non disponibile', ordini: 'ordine rifiutato nel Reale', stop: 'stop loss non accettato nel Reale' }
const dmy = t => (t ? new Date(t).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
function Operable({ op, busy, onRecheck, X = 'Bitunix' }) {
  if (!op || op.error) return op?.error ? <div className="note">Titoli operabili via API: {op.error}</div> : null
  return (
    <details className="card">
      <summary className="lab" style={{ cursor: 'pointer' }}>Titoli operabili su {X} · {op.uniOk ?? op.ok} su {op.universe ?? op.total} · dei tuoi scelti {op.ok} su {op.total}</summary>
      <div className="note" style={{ marginTop: 8 }}>
        La lista di {X} parte da tutti i {op.universe ?? op.total} titoli dell'universo, indipendente dagli altri exchange: si usano i titoli scelti che {X} accetta via API (Prova e Reale di {X}, stessa lista). Coppie di {X} rilette ogni giorno: ultimo controllo {dmy(op.pairsAt)}.
        Un titolo rifiutato nel Reale (ordine o stop loss) si ritenta da solo dopo {op.recheckDays} giorni.
      </div>
      {(op.all || op.list).length > 0 && (
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="tbl"><thead><tr><th>Titolo</th><th>Motivo</th><th>Dal</th><th>Si riprova</th></tr></thead>
            <tbody>{(op.all || op.list).map(x => (
              <tr key={x.symbol}><td className="mono">{x.symbol}{op.list.some(y => y.symbol === x.symbol) ? ' · scelto' : ''}</td><td title={x.why}>{KIND[x.kind] || x.kind}</td><td className="mono">{dmy(x.at)}</td><td className="mono">{x.until ? dmy(x.until) : `quando ${X} lo abilita`}</td></tr>
            ))}</tbody></table>
        </div>
      )}
      <button className="btn ghost small" style={{ marginTop: 8 }} disabled={busy} onClick={onRecheck}>Ricontrolla ora</button>
      <div className="note">Rilegge le coppie di {X} e toglie i segni del Reale: al prossimo segnale quei titoli si ritentano davvero.</div>
    </details>
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
  // exchange scelto in Prova e Reale (?ex=bitunix|bitget|total), ricordato nel browser
  const exQ = params.get('ex')
  const ex = [...EX_LIST, 'total'].includes(exQ) ? exQ : load('strategy:ex', 'bitunix')
  const setEx = e => { save('strategy:ex', e); setParams(p => { const n = new URLSearchParams(p); n.set('ex', e); return n }, { replace: true }) }
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
  const [chartId, setChartId] = useState(null) // posizione di cui si mostra il grafico della giornata
  const mins = useMins(EX_LIST.includes(ex) ? ex : 'bitunix') // valore minimo di un ordine sull'exchange della sezione
  const [draftFrom, setDraftFrom] = useState(null) // { name, presetId, settings }: impostazione salvata caricata nella bozza

  const refresh = useCallback(() => mode === 'sim' || ex === 'total' ? Promise.resolve() : get(`/api/strategy?mode=${mode}&ex=${ex}`)
    .then(v => { setView(v); setErr(null) })
    .catch(e => { if (/codice/i.test(e.message)) { save('adminCode', ''); setAuthed(false) } setErr(e.message) }), [mode, ex])

  const hasOpen = !!view?.open?.length
  // trade chiusi oggi (per la sfera)
  const todayClosed = useMemo(() => (view ? view.trades.filter(p => p.day === view.today.date) : []), [view])
  useEffect(() => { setView(null); setDraft(null); setDraftFrom(null); setArmStart(false); setArmReset(false); setSelDay(null); setChartId(null) }, [mode, ex])
  useEffect(() => {
    if (!authed || mode === 'sim' || ex === 'total') return
    refresh()
    const id = setInterval(refresh, hasOpen ? 15000 : 30000) // con posizioni aperte più spesso (sfera e risultati aggiornati)
    return () => clearInterval(id)
  }, [authed, refresh, hasOpen])

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
    const v = await post('/api/strategy/settings', { mode, ex, settings: draft, name, presetId, edited })
    setDraft(null); setDraftFrom(null); return v
  }, mode === 'live' ? 'Impostazioni del Reale salvate.' : 'Impostazioni salvate.')
  const toggleEnabled = () => {
    if (!view.enabled && mode === 'live' && !armStart) { setArmStart(true); return }
    setArmStart(false)
    act(() => post('/api/strategy/settings', { mode, ex, enabled: !view.enabled }), view.enabled ? 'Strategia fermata.' : 'Strategia avviata.')
  }

  if (!authed) return <CodeGate onOk={() => setAuthed(true)} />

  const tabs = (
    <>
      <div className="lab" style={{ marginBottom: 8 }}>Strategia · Apertura USA</div>
      <StrategyTabs mode={mode} setMode={m => setParams(p => { const n = new URLSearchParams(p); n.set('mode', m); return n })} liveLabel="Reale · soldi veri" />
      {mode !== 'sim' && (
        <div className="seg small" style={{ marginBottom: 12 }}>
          {EX_LIST.map(e => <button key={e} className={ex === e ? 'on' : ''} onClick={() => setEx(e)}>{EXCHANGES[e].name}</button>)}
          <button className={ex === 'total' ? 'on' : ''} onClick={() => setEx('total')}>Totale</button>
        </div>
      )}
    </>
  )
  if (mode === 'sim') return <>{tabs}<Simulation onAuthError={() => { save('adminCode', ''); setAuthed(false) }} /></>
  if (ex === 'total') return <>{tabs}<TotalView mode={mode} /></>
  if (!view) return <>{tabs}<div className="card empty">{err || 'Carico la strategia…'}</div></>
  if (view.missing) return <>{tabs}<div className="card warn">{view.why}</div></>
  const X = view.exchange?.name || 'Bitunix'

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

      {/* Sfera di oggi: posizioni aperte che galleggiano, trade chiusi depositati sul fondo */}
      {(view.open.length > 0 || todayClosed.length > 0) && (
        <LiveSphere open={view.open} closed={todayClosed} capital={sz?.capital} mode={mode} onBubble={setChartId} />
      )}

      {/* Prova diversa dal Reale: il confronto tra le due non è sugli stessi segnali */}
      {mode === 'paper' && view.vsLive?.diff?.length > 0 && (
        <div className="card" style={{ padding: '10px 14px', borderColor: 'var(--warn)' }}>
          <div className="lab" style={{ color: 'var(--warn)' }}>La Prova ha regole diverse dal Reale {X}</div>
          <div className="note" style={{ marginTop: 4 }}>
            {view.vsLive.diff.map(d => d.key === 'symbols' ? `titoli: ${d.paper} in Prova, ${d.live} nel Reale (${d.onlyPaper} solo in Prova, ${d.onlyLive} solo nel Reale)` : `${d.key}: ${JSON.stringify(d.paper)} in Prova, ${JSON.stringify(d.live)} nel Reale`).join(' · ')}
          </div>
          <button className="btn ghost small" style={{ marginTop: 8 }} disabled={busy} onClick={() => {
            const ls = view.vsLive.liveSettings, cur = view.settings
            const ns = normalizeSettings({ ...ls, capitalMode: cur.capitalMode, capitalFixed: cur.capitalFixed, capitalPct: cur.capitalPct, capitalDedicated: cur.capitalDedicated })
            setDraft(ns)
            setDraftFrom({ name: `come il Reale (${ls.symbols.length} titoli)`, presetId: null, settings: ns })
            setMsg('Regole del Reale caricate in Prova (il capitale resta quello della Prova): premi Salva per applicarle.')
          }}>Usa le regole del Reale</button>
        </div>
      )}

      {/* Prova: prezzi con lo slittamento misurato nel Reale (docs/be-e-prova-realistica.md) */}
      {mode === 'paper' && view.pslip && (
        <div className="card" style={{ padding: '10px 14px' }}>
          <div className="row">
            <span className="lab">Prezzi della Prova come nel Reale</span>
            <span className="mono sec">{view.pslip.at ? `aggiornati il ${new Date(view.pslip.at).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'non ancora misurati'}</span>
          </div>
          <div className="note" style={{ marginTop: 4 }}>
            Entrata: prezzo letto + slittamento. Uscite decise dall'app: prezzo letto in quel controllo − slittamento. Stop su {X}: al livello, come prima.
            Valori dagli ultimi {view.pslip.last} trade del Reale {X} di ogni tipo; con meno di {view.pslip.minN} trade {String(view.pslip.dflt).replace('.', ',')}%.
          </div>
          <div style={{ marginTop: 6 }}>
            {view.pslip.list.map(x => (
              <div key={x.key} className="row" style={{ padding: '3px 0', borderTop: '1px solid var(--border-soft)', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 13 }}>{x.label}</span>
                <span className="mono" style={{ fontSize: 13, textAlign: 'right' }}>
                  {x.pct.toFixed(3).replace('.', ',')}%{x.key === 'freno' && x.step > 0 ? ` + ${x.step.toFixed(3).replace('.', ',')}% per posizione` : ''}
                  <span className="sec"> · {x.src === 'vivo' ? `misurato su ${x.n}` : `predefinito (${x.n} misurati)`}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configurazione attiva in questa scheda */}
      <div className="card" style={{ padding: '10px 14px' }}>
        <div className="row">
          <span className="lab">Configurazione attiva {mode === 'live' ? 'nel Reale' : 'in Prova'} {X}</span>
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
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{mode === 'paper' ? 'Prova' : 'Reale'} {X} · {view.enabled ? 'attiva' : 'ferma'}</div>
          </div>
          <span className={`pill ${view.enabled ? 'long' : 'closed'}`}>{view.enabled ? 'ON' : 'OFF'}</span>
        </div>
        <p className="body">
          {mode === 'paper'
            ? `Tutto uguale al Reale ${X}, ma con capitale fittizio: prezzi e candele di ${X}, entrate e uscite decise dall'app al prezzo letto con lo slittamento misurato nel Reale ${X} (valori qui sopra), stop su ${X} al livello, commissione ${num(s.fee)}% per lato.`
            : `Apre e chiude ordini veri sul tuo conto futures ${X}, a mercato, con margine isolato${view.exchange?.id === 'bitget' ? ', modalità one-way' : ''} e uno stop loss di sicurezza già impostato su ${X}.`}
          {' '}Entrate nei primi 30 minuti dopo l'apertura USA ({t.tradingDay ? `oggi alle ${openLocal}` : 'oggi la borsa è chiusa'}), chiusura di tutto prima della fine della seduta.
        </p>
        {mode === 'live' && !st.keys && <div className="warn">Mancano le chiavi API di {X}: aggiungi {KEYS_HINT[view.exchange?.id] || 'le chiavi'} su Vercel (solo permesso di trading, mai prelievi).</div>}
        {mode === 'live' && st.keys && !st.liveTrading && <div className="warn">Gli ordini veri sono bloccati dall'interruttore generale: quando hai finito i test in Prova imposta LIVE_TRADING=on su Vercel.</div>}
        {view.capital?.halted && <div className="warn">Strategia fermata per la perdita massima totale: {view.capital.halted.why}. Riavviandola il limite riparte dal capitale attuale.</div>}
        {(view.capital?.dayStop || t.dayStop) && <div className="warn">Oggi niente nuovi trade: perdita massima giornaliera superata. Si riparte domani.</div>}
        {t.brake && <div className="warn">Freno di mercato scattato oggi alle {new Date(t.brake.at).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })}: perdita del giorno {fmtSigned(t.brake.loss)} USDT{t.brake.pct !== null ? ` (${fmtSigned(t.brake.pct)}%)` : ''}, posizioni chiuse e niente nuovi trade fino a domani.</div>}
        {tickAge !== null && tickAge > 5 * 60000 && <div className="warn">L'ultimo controllo è di {ago(st.lastTick.at)}: il controllo ogni minuto non sta girando. Verifica cron-job.org.</div>}
        {tickAge === null && <div className="warn">Il controllo ogni minuto non è ancora partito: configura cron-job.org (vedi README).</div>}
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="tile"><div className="lab">Oggi</div><div className="mono" style={{ marginTop: 4 }}>{t.tradingDay ? `${t.prepared}/${view.operable?.ok ?? s.symbols.length} titoli pronti` : 'borsa chiusa'}</div></div>
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
          <span>{mode === 'paper' ? 'Saldo di prova' : `Saldo futures su ${X}`}</span>
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
        <ExposureInfo s={s} sz={sz} mins={mins} X={X} />
        {s.capitalMode === 'dedicated' && <DedicatedCapital c={view.capital} s={s} set={set} mode={mode} X={X} />}
        {mode === 'paper' && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
            <div className="lab">Riparti da capo</div>
            <div className="row" style={{ marginTop: 6 }}>
              <div className="input-suffix" style={{ flex: 1 }}><input type="number" min="1" placeholder={String(view.platform.start)} value={resetBal} onChange={e => setResetBal(e.target.value)} /><span>USDT</span></div>
              <button className="btn ghost" style={{ width: 'auto' }} disabled={busy}
                onClick={() => { if (!armReset) { setArmReset(true); return } setArmReset(false); act(() => post('/api/strategy/reset', { ex, balance: +(resetBal || view.platform.start) }), 'Prova azzerata.') }}>
                {armReset ? 'Confermi?' : 'Azzera'}
              </button>
            </div>
            <div className="note">Cancella lo storico della Prova {X} e riparte con il saldo scelto (gli altri exchange non cambiano).</div>
          </div>
        )}
      </div>

      <Operable op={view.operable} busy={busy} X={X} onRecheck={() => act(() => post('/api/strategy/operable/recheck', { mode, ex }), 'Lista ricontrollata.')} />

      {/* Regole */}
      <RulesCard s={s} set={set} showFee={mode === 'paper'} X={X} off={view.operable?.all ? Object.fromEntries(view.operable.all.map(x => [x.symbol, x.why])) : null} />
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
            <div key={p.id} className="pos" style={{ cursor: 'pointer' }} onClick={() => setChartId(p.id)} title="Tocca per il grafico della giornata">
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
              <button className="btn ghost small" disabled={busy} onClick={e => { e.stopPropagation(); act(() => post('/api/strategy/close', { mode, ex, id: p.id }), `${p.symbol} chiuso.`) }}>Chiudi ora</button>
            </div>
          )
        })}
        {view.open.length > 1 && <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => act(() => post('/api/strategy/close', { mode, ex }), 'Posizioni chiuse.')}>Chiudi tutto</button>}
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

      {mode === 'live' && view.slippage && <Slippage sl={view.slippage} onTrade={setChartId} X={X} />}

      {/* Operazioni */}
      <div className="lab section-title row" id="closed-trades">
        <span>Operazioni chiuse · {selDay ? `${shownTrades.length} del ${dayFmt(selDay, { weekday: 'short', day: '2-digit', month: '2-digit' })}` : `ultime ${view.trades.length}`}</span>
        {selDay && <button className="chip" onClick={() => setSelDay(null)}>× tutti i giorni</button>}
      </div>
      {shownTrades.length ? (
        <div className="table-wrap">
          <table className="tbl clickable">
            <thead><tr><th>Titolo</th><th>Tipo</th><th>Giorno</th><th>Entrata</th><th>Uscita</th><th>Motivo</th><th>Risultato</th><th>%</th></tr></thead>
            <tbody>{shownTrades.map(p => {
              const pct = p.pnl / (p.entry * p.qty) * 100
              return (
                <tr key={p.id} onClick={() => setChartId(p.id)}>
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
      {shownTrades.length > 0 && <div className="note">Tocca un'operazione (o una posizione aperta) per il grafico della sua giornata.</div>}
      {chartId && <PositionChart id={chartId} mode={mode} onClose={() => setChartId(null)} />}

      {skips.length > 0 && (
        <details className="card" style={{ marginTop: 12 }}>
          <summary className="lab" style={{ cursor: 'pointer' }}>Titoli scartati oggi · {skips.length}</summary>
          {skips.map(([sym, why]) => <div key={sym} className="kv"><span>{sym}</span><span className="sec">{why}</span></div>)}
        </details>
      )}
    </>
  )
}
