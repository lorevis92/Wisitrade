// Scheda Simulazione della pagina Strategia: la strategia Apertura USA sulle candele da 1 minuto archiviate dell'exchange
// scelto (Bitunix o Bitget, ognuno con il suo archivio, i suoi limiti e i suoi titoli operabili), con lo stesso motore di
// Prova e Reale (shared/engine.js, eseguito sul server). Impostazioni e risultati separati per exchange; confronto affiancato.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, post, postStream, fmtPrice, fmtUsd, fmtSigned } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { OPTIONS, STRATEGY_DEFAULTS, normalizeSettings, sizing, ORIGINAL_SYMBOLS, NEW_SYMBOLS, LOW_LIQ_SYMBOLS, LEV_SYMBOLS } from '@shared/opening.js'
import { addDays } from '@shared/time.js'
import { Select, RulesCard, PresetsCard, MarginField, PositionsField, ExposureInfo, useMins, num, lab, dayFmt, hm } from '../components/StrategyForm.jsx'
import CalendarOverview from '../components/CalendarOverview.jsx'
import TradeChart from '../components/TradeChart.jsx'
import Analysis from '../components/Analysis.jsx'
import { SimSphere } from '../components/Sphere.jsx'
import { EXCHANGES, EX_LIST } from '@shared/venues.js'

// chiave del browser per exchange: Bitunix con le chiavi di prima (impostazioni già salvate invariate)
const keyFor = (ex, name) => (ex === 'bitunix' ? name : `${name}:${ex}`)

// Bitunix e Bitget affiancati: stesse impostazioni, stesso periodo
function CompareCard({ c }) {
  const pct = x => (x === null || x === undefined ? '—' : `${Math.round(x)}%`)
  return (
    <div className="card">
      <div className="lab">Bitunix e Bitget affiancati · {dShort(c.from)} → {dShort(c.to)} · capitale {fmtUsd(c.capital)} USDT</div>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table className="tbl">
          <thead><tr><th>Exchange</th><th>Periodo con dati</th><th>Trade</th><th>Vinti</th><th>Risultato</th><th>%</th><th>Costi</th><th>Commissioni</th><th>Funding</th><th>Slittamento</th><th>Peggior calo</th><th>Titoli con dati</th></tr></thead>
          <tbody>{c.list.map(r => r.error ? (
            <tr key={r.ex}><td><b>{r.name}</b></td><td colSpan={11} className="sec">{r.error}</td></tr>
          ) : (
            <tr key={r.ex}>
              <td><b>{r.name}</b></td>
              <td className="mono">{r.firstDay ? `${dShort(r.firstDay)} → ${dShort(r.lastDay)}` : '—'} · {r.days} g</td>
              <td>{r.n}</td><td>{pct(r.winPct)}</td>
              <td className={r.net >= 0 ? 'up' : 'down'}>{fmtSigned(r.net)}</td>
              <td className={r.net >= 0 ? 'up' : 'down'}>{fmtSigned(r.pct)}%</td>
              <td className="mono">{fmtUsd(r.costs)}</td><td className="mono">{fmtUsd(r.fees)}</td><td className="mono">{fmtUsd(r.funding)}</td><td className="mono">{fmtUsd(r.slippage)}</td>
              <td className="mono down">−{fmtUsd(r.maxDDPct)}%</td>
              <td>{r.withData} su {r.symbols}{r.excluded ? ` (${r.excluded} esclusi)` : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="note">Stesse impostazioni (quelle di questa pagina) e stesso periodo; ogni exchange con i suoi dati, limiti, minimo per ordine e titoli operabili. Se un exchange non ha dati per tutto il periodo, i suoi numeri valgono solo sui giorni indicati.</div>
    </div>
  )
}

const PERIODS = [['1w', '1 settimana', 7], ['1m', '1 mese', 30], ['3m', '3 mesi', 91], ['6m', '6 mesi', 182], ['all', 'tutto'], ['custom', 'date a scelta']]
const dShort = d => (d ? dayFmt(d, { day: '2-digit', month: 'short', year: '2-digit' }) : '—')
const sleep = ms => new Promise(r => setTimeout(r, ms))

function ArchiveCard({ status, onStatus, onAuthError, ex = 'bitunix' }) {
  const X = EXCHANGES[ex]?.name || ex
  const [filling, setFilling] = useState(false)
  const [progress, setProgress] = useState(null)
  const stop = useRef(false)

  const fill = async () => {
    setFilling(true); stop.current = false; setProgress(`Inizio lo scaricamento da ${X}…`)
    let saved = 0
    try {
      for (let round = 0; round < 200 && !stop.current; round++) {
        const r = await post('/api/sim/fill', { ex })
        if (r.busy) {
          setProgress('Lo scaricamento automatico è già in corso: aspetto che finisca il suo blocco…')
          await sleep(15000)
          onStatus(await get(`/api/sim/status?ex=${ex}`))
          continue
        }
        saved += r.saved + r.empty
        onStatus(r.status)
        if (!r.remaining) { setProgress(`Fatto: ${saved} giornate scaricate. L'archivio è completo.`); break }
        setProgress(`${saved} giornate scaricate · ne mancano ${r.remaining}${r.errors?.length ? ` · ultimo errore: ${r.errors[0]}` : ''}`)
      }
      if (stop.current) setProgress(`Fermato: ${saved} giornate scaricate. Puoi riprendere quando vuoi, riparte da dove si è fermato.`)
    } catch (e) {
      if (/codice/i.test(e.message)) onAuthError()
      setProgress(`Interrotto: ${e.message}. Riprova: riparte da dove si è fermato.`)
    } finally { setFilling(false) }
  }

  if (!status) return <div className="card note">Controllo l'archivio dei dati…</div>
  const avail = status.symbols.filter(x => x.days > 0)
  const unavailable = status.symbols.filter(x => x.unavailable)
  return (
    <div className="card">
      <div className="lab">Archivio dati {X} · candele da 1 minuto</div>
      {status.first
        ? <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>Periodo disponibile su {X}: dal {dShort(status.first)} al {dShort(status.last)}</div>
        : <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>Archivio vuoto</div>}
      <p className="body">
        {avail.length} titoli su {status.symbols.length} con dati{unavailable.length ? ` (${unavailable.map(x => x.symbol).join(', ')}: perpetual non disponibile su ${X})` : ''}.
        {status.half && status.half > status.first ? ` I titoli entrano man mano che ${X} li quota: metà dei titoli ha dati dal ${dShort(status.half)}.` : ''}
        {' '}Dalle 9:00 alle 16:30 di New York di ogni giorno di borsa. L'archivio si aggiorna da solo ogni sera, dopo la chiusura.
      </p>
      {status.missing > 0
        ? <div className="warn">Mancano {status.missing} giornate da scaricare{status.running ? ' · scaricamento automatico in corso' : ''}.</div>
        : <div className="note" style={{ color: 'var(--long)' }}>Completo fino al {dShort(status.lastReady)}.</div>}
      {status.missing > 0 && (
        filling
          ? <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => { stop.current = true }}>Ferma dopo questo blocco</button>
          : <button className="btn" style={{ marginTop: 10 }} onClick={fill}>Completa lo scaricamento</button>
      )}
      {progress && <div className="note" style={{ marginTop: 6, color: 'var(--warn)' }}>{progress}</div>}
      {filling && <div className="note">Ogni blocco dura fino a 3 minuti. Tieni la pagina aperta; se la chiudi riparte da dove si è fermato.</div>}
      <details style={{ marginTop: 10 }}>
        <summary className="lab" style={{ cursor: 'pointer' }}>Titolo per titolo</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="tbl">
            <thead><tr><th>Titolo</th><th>Su {X} dal</th><th>Archivio</th><th>Giorni</th><th>Note</th></tr></thead>
            <tbody>{status.symbols.map(x => (
              <tr key={x.symbol}>
                <td><b>{x.symbol}</b>{x.perp && x.perp !== `${x.symbol}USDT` ? <span className="note"> {x.perp}</span> : null}</td>
                <td>{x.unavailable ? '—' : dShort(x.listed)}</td>
                <td>{x.days ? `${dShort(x.first)} → ${dShort(x.last)}` : '—'}</td>
                <td>{x.days || '—'}</td>
                <td className="sec">{x.unavailable ? 'non disponibile' : !x.checked ? 'da controllare' : x.missing ? `mancano ${x.missing}` : 'completo'}{x.partial ? ` · ${x.partial} parziali` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function Equity({ daily, capital }) {
  const pts = [capital, ...daily.map(d => d.balance)]
  if (pts.length < 3) return null
  const W = 600, H = 90, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1
  const xy = pts.map((v, i) => `${(i / (pts.length - 1) * W).toFixed(1)},${(H - 4 - (v - min) / span * (H - 8)).toFixed(1)}`).join(' ')
  const y0 = H - 4 - (capital - min) / span * (H - 8)
  const up = pts.at(-1) >= capital
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 90, display: 'block', marginTop: 8 }}>
      <line x1="0" x2={W} y1={y0} y2={y0} stroke="#23304D" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <polyline points={xy} fill="none" stroke={up ? 'var(--long)' : 'var(--short)'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Limiti di perdita e freno di mercato: quante volte sono scattati e in quali giorni
const EVENT_NAME = { freno: 'freno di mercato (chiudi tutto)', giornaliero: 'perdita massima giornaliera', totale: 'perdita massima totale' }
function LimitEvents({ r }) {
  const s = r.settings || {}
  const ev = r.limitEvents || []
  const on = [s.maxDayLoss > 0 && `giornaliera ${num(s.maxDayLoss)}%`, s.brakePct > 0 && `freno ${num(s.brakePct)}%`, s.maxTotalLoss > 0 && `totale ${num(s.maxTotalLoss)}%`].filter(Boolean)
  const hm2 = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  return (
    <div className="card" style={{ padding: '10px 14px' }}>
      <div className="row"><span className="lab">Limiti di perdita e freno</span><span className="mono">{on.length ? `${ev.length} volte` : 'spenti'}</span></div>
      {on.length > 0 && <div className="note">Attivi: {on.join(' · ')}.{!ev.length ? ' Non sono mai scattati.' : ''}</div>}
      {Object.keys(EVENT_NAME).map(t => { const n = ev.filter(e => e.type === t).length; return n ? <div key={t} className="kv"><span className="sec">{EVENT_NAME[t]}</span><span className="mono">{n}</span></div> : null })}
      {r.halted && <div className="note" style={{ color: 'var(--short)' }}>Simulazione ferma dal {dShort(r.halted)}: dopo non ha più aperto trade.</div>}
      {ev.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary className="lab" style={{ cursor: 'pointer' }}>Giorni · {ev.length}</summary>
          {ev.map((e, i) => (
            <div key={i} className="kv"><span className="sec">{dShort(e.day)} · {hm2(e.min)} NY · {EVENT_NAME[e.type]}</span>
              <span className="mono down">{fmtSigned(e.type === 'freno' ? e.lossPct : e.dayPct)}%</span></div>
          ))}
        </details>
      )}
    </div>
  )
}

// Con quali titoli e con quale dimensione dei trade è stata fatta la simulazione
const GROUP_OF = Object.fromEntries([...ORIGINAL_SYMBOLS.map(x => [x, 'orig']), ...NEW_SYMBOLS.map(x => [x, 'new']), ...LOW_LIQ_SYMBOLS.map(x => [x, 'low']), ...LEV_SYMBOLS.map(x => [x, 'lev'])])
const GROUP_NAME = { orig: 'originali', new: 'nuovi', low: 'bassa liquidità', lev: 'ETF a leva' }
function SimSetup({ r }) {
  const s = r.settings || {}
  const syms = (r.symbolsUsed || s.symbols || []).filter(x => GROUP_OF[x])
  const excl = r.apiExcluded || []
  const withData = new Set(r.symbolsWithData || syms)
  const groups = Object.keys(GROUP_NAME).map(g => {
    const list = syms.filter(x => GROUP_OF[x] === g)
    return { g, n: list.length, data: list.filter(x => withData.has(x)).length }
  }).filter(x => x.n)
  const compound = s.capitalMode !== 'fixed' // capitale dedicato in Simulazione = 100% del saldo della simulazione
  return (
    <div className="card" style={{ padding: '10px 14px' }}>
      <div className="row"><span className="lab">Titoli usati</span><span className="mono">{syms.length}</span></div>
      {groups.map(x => (
        <div key={x.g} className="kv"><span className="sec">{GROUP_NAME[x.g]}</span><span className="mono">{x.n}{x.data < x.n ? ` · ${x.data} con dati nel periodo` : ''}</span></div>
      ))}
      {excl.length > 0 && <div className="note">Esclusi perché non operabili via API su {r.exName || 'Bitunix'}: {excl.length} su {(s.symbols || []).length} ({excl.map(x => x.symbol).join(', ')}).</div>}
      {r.symbolsWithData && withData.size < syms.length && <div className="note">Titoli con dati nel periodo: {withData.size} su {syms.length} (gli altri sono quotati su {r.exName || 'Bitunix'} dopo l'inizio del periodo).</div>}
      <div className="kv" style={{ marginTop: 6 }}><span className="sec">Dimensione dei trade</span>
        <span className="mono">{compound ? `${s.capitalMode === 'dedicated' ? 'capitale dedicato (100% del saldo)' : num(s.capitalPct) + '% del saldo'} · margine ${s.marginPct}% · ${s.leverage}x` : `${num(s.capitalFixed)} USDT fissi · margine ${s.marginPct}% · ${s.leverage}x`}</span></div>
      <div className="note">{compound ? 'Interesse composto: ogni trade si calcola sul saldo del momento, quindi i guadagni fanno crescere i trade successivi.' : 'Senza interesse composto: ogni trade ha la stessa dimensione, qualunque sia il saldo. Su periodi lunghi il risultato in % è più basso che con "% saldo".'}</div>
      <div className="kv"><span className="sec">Commissione · slittamento · funding</span><span className="mono">{num(s.fee)}% · {num(s.slip)}% · {num(s.funding)}%</span></div>
    </div>
  )
}

function Results({ r, onTrade }) {
  const [shown, setShown] = useState(100)
  const [sym, setSym] = useState('')
  const [selDay, setSelDay] = useState(null)
  const days = r.daily.filter(d => d.n > 0).slice().reverse()
  // per la panoramica: capitale di inizio giornata = saldo a fine giornata meno il risultato del giorno
  const calDays = useMemo(() => r.daily.map(d => ({ day: d.day, n: d.n, wins: d.wins, pnl: d.pnl, pct: d.pct, cap: d.balance - d.pnl })), [r])
  const tradesRef = useRef(null)
  const pickDay = d => { setSelDay(d); setShown(100); if (d) setTimeout(() => tradesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }
  const maxAbs = Math.max(1, ...days.map(d => Math.abs(d.pnl)))
  const trades = useMemo(() => r.trades.filter(t => (!sym || t.symbol === sym) && (!selDay || t.day === selDay)).slice().reverse(), [r, sym, selDay])
  const syms = useMemo(() => [...new Set(r.trades.map(t => t.symbol))].sort(), [r])
  const best = days.length ? days.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null
  const worst = days.length ? days.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null

  return (
    <>
      <div className="lab section-title">Risultato {r.exName || 'Bitunix'} · {dShort(r.firstDay)} → {dShort(r.lastDay)} · {r.days} giorni di borsa</div>
      <CalendarOverview days={calDays} selDay={selDay} onDay={pickDay} />
      <div className="stat-grid">
        <div className="tile"><div className="lab">Risultato</div><div className={`mono big ${r.net >= 0 ? 'up' : 'down'}`}>{fmtSigned(r.net)} USDT</div><div className={`note ${r.net >= 0 ? 'up' : 'down'}`}>{fmtSigned(r.pct)}% · saldo {fmtUsd(r.final)}</div></div>
        <div className="tile"><div className="lab">Trade vinti</div><div className="mono big">{r.wins} su {r.n}</div><div className="note">{r.n ? Math.round(r.wins / r.n * 100) : 0}% · {r.daysUp} giorni su {r.daysWithTrades} in guadagno</div></div>
        <div className="tile"><div className="lab">Profit factor</div><div className="mono big">{r.pf ? fmtUsd(r.pf) : '—'}</div><div className="note">vinto {fmtUsd(r.grossWin, 0)} · perso {fmtUsd(r.grossLoss, 0)}</div></div>
        <div className="tile"><div className="lab">Peggior calo</div><div className="mono big down">−{fmtUsd(r.maxDDPct)}%</div><div className="note">−{fmtUsd(r.maxDD)} USDT dal massimo</div></div>
        <div className="tile"><div className="lab">Giorno peggiore</div><div className={`mono big ${!r.worstDay || r.worstDay.pct >= 0 ? '' : 'down'}`}>{r.worstDay ? `${fmtSigned(r.worstDay.pct)}%` : '—'}</div><div className="note">{r.worstDay ? `${fmtSigned(r.worstDay.pnl)} USDT · ${dShort(r.worstDay.day)}` : 'nessuna operazione'}</div></div>
        <div className="tile"><div className="lab">Liquidazioni</div><div className={`mono big ${r.liquidations ? 'down' : ''}`}>{r.liquidations ?? 0}</div><div className="note">{r.liquidations ? 'margine perso per intero' : 'nessun trade liquidato'}</div></div>
      </div>
      <SimSetup r={r} />
      <LimitEvents r={r} />
      <div className="card" style={{ padding: '10px 14px' }}>
        <div className="row"><span className="lab">Costi</span><span className="mono down">−{fmtUsd(r.costs ?? r.fees)} USDT</span></div>
        <div className="kv"><span className="sec">Commissioni (entrata e uscita, sul valore della posizione)</span><span className="mono">{fmtUsd(r.fees)}</span></div>
        <div className="kv"><span className="sec">Funding stimato</span><span className="mono">{fmtUsd(r.funding ?? 0)}</span></div>
        <div className="kv"><span className="sec">Slittamento</span><span className="mono">{fmtUsd(r.slippage ?? 0)}</span></div>
        {r.mmrFrom && Object.values(r.mmrFrom).includes('impostato') && <div className="note" style={{ color: 'var(--warn)' }}>Margine di mantenimento non disponibile da {r.exName || 'Bitunix'} per {Object.entries(r.mmrFrom).filter(([, v]) => v === 'impostato').map(([k]) => k).join(', ')}: usato quello impostato.</div>}
      </div>
      <div className="card" style={{ padding: '10px 14px' }}>
        <div className="row"><span className="lab">Saldo nel tempo</span></div>
        <Equity daily={r.daily} capital={r.capital} />
        {best && <div className="note">Giorno migliore <span className="up mono">{fmtSigned(best.pnl)}</span> ({dShort(best.day)}) · peggiore <span className={`mono ${worst.pnl >= 0 ? 'up' : 'down'}`}>{fmtSigned(worst.pnl)}</span> ({dShort(worst.day)})</div>}
      </div>

      <div className="lab section-title">Motivi d'uscita</div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Motivo</th><th>Trade</th><th>Vinti</th><th>Risultato</th></tr></thead>
          <tbody>{r.reasons.map(x => (
            <tr key={x.reason}><td className="sec">{x.reason}</td><td>{x.n}</td><td>{x.wins} su {x.n}</td><td className={x.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(x.pnl)} USDT</td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className="lab section-title">Giorno per giorno · {days.length} giorni con operazioni</div>
      {days.length ? (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Giorno</th><th>Operazioni</th><th>Vinte</th><th>Risultato</th><th>%</th><th className="barcol"></th></tr></thead>
            <tbody>{days.map(d => (
              <tr key={d.day}>
                <td>{dayFmt(d.day, { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</td><td>{d.n}</td><td>{d.wins} su {d.n}</td>
                <td className={d.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(d.pnl)} USDT</td>
                <td className={d.pnl >= 0 ? 'up' : 'down'}>{d.pct !== null ? `${fmtSigned(d.pct)}%` : '—'}</td>
                <td className="barcol"><div className="dbar" style={{ width: `${Math.max(3, Math.abs(d.pnl) / maxAbs * 100)}%`, background: d.pnl >= 0 ? 'var(--long)' : 'var(--short)' }} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="card note">Nessuna operazione nel periodo.</div>}

      <div className="lab section-title row" ref={tradesRef}>
        <span>Trade · {trades.length}{selDay ? ` del ${dShort(selDay)}` : ''}{r.tradesCut ? ` (solo gli ultimi, ${r.tradesCut} più vecchi non mostrati)` : ''}{selDay && <button className="chip" style={{ marginLeft: 8 }} onClick={() => setSelDay(null)}>× tutti i giorni</button>}</span>
        <select className="mini-select" value={sym} onChange={e => { setSym(e.target.value); setShown(100) }}>
          <option value="">tutti i titoli</option>
          {syms.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      {trades.length ? (
        <>
          <div className="table-wrap">
            <table className="tbl clickable">
              <thead><tr><th>Titolo</th><th>Tipo</th><th>Giorno</th><th>Entrata</th><th>Uscita</th><th>Motivo</th><th>Risultato</th><th>%</th></tr></thead>
              <tbody>{trades.slice(0, shown).map(t => (
                <tr key={t.id} onClick={() => onTrade(t)}>
                  <td><b>{t.symbol}</b></td>
                  <td><span className={`pill ${t.side > 0 ? 'long' : 'short'}`}>{t.side > 0 ? 'Long' : 'Short'}</span></td>
                  <td>{dayFmt(t.day, { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
                  <td>{hm(t.opened_at)} · {fmtPrice(t.entry)}</td>
                  <td>{hm(t.closed_at)} · {fmtPrice(t.exit)}</td>
                  <td className="sec">{t.reason}</td>
                  <td className={t.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(t.pnl)}</td>
                  <td className={t.pnl >= 0 ? 'up' : 'down'}>{fmtSigned(t.pct)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="note" style={{ marginTop: 6 }}>Tocca un trade per vedere il grafico della sua giornata.</div>
          {shown < trades.length && <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setShown(n => n + 200)}>Mostra altri ({trades.length - shown})</button>}
        </>
      ) : <div className="card note">Nessun trade.</div>}

      {r.skips.length > 0 && (
        <details className="card" style={{ marginTop: 12 }}>
          <summary className="lab" style={{ cursor: 'pointer' }}>Segnali scartati · {r.skips.reduce((a, x) => a + x.n, 0)}</summary>
          {r.skips.map(x => <div key={x.why} className="kv"><span className="sec">{x.why}</span><span className="mono">{x.n}</span></div>)}
        </details>
      )}

      <Analysis r={r} />
    </>
  )
}

export default function Simulation({ onAuthError }) {
  // exchange simulato (ricordato nel browser); impostazioni, capitale, periodo e risultato separati per exchange
  const [ex, setExRaw] = useState(() => { const e = load('simEx', 'bitunix'); return EX_LIST.includes(e) ? e : 'bitunix' })
  const X = EXCHANGES[ex]?.name || ex
  const [status, setStatus] = useState(null)
  const [s, setS] = useState(() => normalizeSettings(load(keyFor(ex, 'simSettings'), STRATEGY_DEFAULTS)))
  const [capital, setCapital] = useState(() => load(keyFor(ex, 'simCapital'), 300))
  const [period, setPeriod] = useState(() => load(keyFor(ex, 'simPeriod'), '1m'))
  const [custom, setCustom] = useState(() => load(keyFor(ex, 'simCustom'), { from: '', to: '' }))
  const [result, setResult] = useState(null)
  const results = useRef({}) // ultimo risultato di ogni exchange (si rivede tornando sull'exchange)
  const [cmp, setCmp] = useState(null)
  const [cmpBusy, setCmpBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [trade, setTrade] = useState(null)
  const [live, setLive] = useState(null) // simulazione in corso, seguita dalla sfera mentre il calcolo gira
  const abortRef = useRef(null)
  const authErr = useRef(onAuthError)
  authErr.current = onAuthError

  useEffect(() => { save(keyFor(ex, 'simSettings'), s) }, [s]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { save(keyFor(ex, 'simCapital'), capital) }, [capital]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { save(keyFor(ex, 'simPeriod'), period) }, [period]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { save(keyFor(ex, 'simCustom'), custom) }, [custom]) // eslint-disable-line react-hooks/exhaustive-deps
  // cambio di exchange: si ricaricano le sue impostazioni e il suo ultimo risultato (le altre restano salvate)
  const setEx = e => {
    if (e === ex) return
    abortRef.current?.abort()
    results.current[ex] = result
    save('simEx', e)
    setExRaw(e)
    setS(normalizeSettings(load(keyFor(e, 'simSettings'), STRATEGY_DEFAULTS)))
    setCapital(load(keyFor(e, 'simCapital'), 300))
    setPeriod(load(keyFor(e, 'simPeriod'), '1m'))
    setCustom(load(keyFor(e, 'simCustom'), { from: '', to: '' }))
    setResult(results.current[e] || null); setLive(null); setTrade(null); setErr(null); setStatus(null)
  }

  const refreshStatus = useCallback(() => get(`/api/sim/status?ex=${ex}`).then(setStatus).catch(e => { if (/codice/i.test(e.message)) authErr.current(); setErr(e.message) }), [ex])
  useEffect(() => { refreshStatus() }, [refreshStatus])

  const set = (k, v) => setS(d => ({ ...d, [k]: v }))
  const sz = sizing(s, +capital || 0)
  const mins = useMins(ex)
  const range = useMemo(() => {
    if (!status?.first) return null
    const end = status.last
    if (period === 'custom') return custom.from && custom.to ? { from: custom.from, to: custom.to } : null
    if (period === 'all') return { from: status.first, to: end }
    const days = PERIODS.find(p => p[0] === period)[2]
    const from = addDays(end, -days + 1)
    return { from: from < status.first ? status.first : from, to: end }
  }, [status, period, custom])

  // Simulazione in streaming: il server manda i giorni appena calcolati (per la sfera) e alla fine il risultato completo.
  // lv è scritto qui e letto dalla sfera a ogni fotogramma (non è stato di React: la grafica non rallenta niente).
  const run = async () => {
    abortRef.current?.abort()
    const ctl = new AbortController()
    abortRef.current = ctl
    const lv = { days: [], total: 0, phase: 'avvio', status: 'running', result: null, error: null, load: null, loaded: [], prep: null }
    setLive(lv); setBusy(true); setErr(null); setTrade(null)
    let final = null
    try {
      await postStream('/api/sim/stream', { ex, settings: normalizeSettings(s), capital: +capital, ...range }, {
        signal: ctl.signal,
        onEvent: e => {
          if (e.t === 'phase') lv.phase = e.msg
          else if (e.t === 'load') { lv.load = e; lv.loaded.push(e.sym) }
          else if (e.t === 'start') { lv.total = e.total; lv.phase = 'preparo i dati' }
          else if (e.t === 'prep') lv.prep = e
          else if (e.t === 'days') { for (const d of e.list) lv.days.push(d) }
          else if (e.t === 'result') final = e.result
          else if (e.t === 'error') throw new Error(e.error)
        },
      })
      if (!final) throw new Error('Simulazione interrotta: risposta incompleta dal server')
      lv.result = final; lv.status = 'done'
      setResult(final)
    } catch (e) {
      if (ctl.signal.aborted) lv.status = 'cancelled'
      else { lv.status = 'error'; lv.error = e.message; if (/codice/i.test(e.message)) onAuthError(); setErr(e.message) }
    } finally {
      if (abortRef.current === ctl) { abortRef.current = null; setBusy(false) }
    }
  }
  const cancel = () => abortRef.current?.abort()
  // Bitunix e Bitget sullo stesso periodo e con le stesse impostazioni (solo i numeri principali)
  const compare = async () => {
    setCmpBusy(true); setErr(null)
    try { setCmp(await post('/api/sim/compare', { settings: normalizeSettings(s), capital: +capital, ...range })) }
    catch (e) { if (/codice/i.test(e.message)) onAuthError(); setErr(e.message) }
    finally { setCmpBusy(false) }
  }
  useEffect(() => () => abortRef.current?.abort(), []) // uscendo dalla pagina il calcolo si interrompe

  return (
    <>
      <div className="seg small" style={{ marginBottom: 12 }}>
        {EX_LIST.map(e => <button key={e} className={ex === e ? 'on' : ''} disabled={busy} onClick={() => setEx(e)}>Simula su {EXCHANGES[e].name}</button>)}
      </div>
      <ArchiveCard key={ex} ex={ex} status={status} onStatus={st => st && setStatus(st)} onAuthError={onAuthError} />

      {/* Capitale */}
      <div className="lab section-title">Capitale</div>
      <div className="card">
        <div className="grid2" style={{ alignItems: 'start' }}>
          <label className="field">
            <span className="lab">Capitale iniziale</span>
            <div className="input-suffix"><input type="number" inputMode="decimal" min="1" step="any" value={capital} onChange={e => setCapital(e.target.value === '' ? '' : +e.target.value)} /><span>USDT</span></div>
            <span className="note">i guadagni si reinvestono come dal vivo</span>
          </label>
          <div className="field">
            <span className="lab">Capitale da usare</span>
            <div className="seg small">
              <button className={s.capitalMode === 'fixed' ? 'on' : ''} onClick={() => set('capitalMode', 'fixed')}>Cifra</button>
              <button className={s.capitalMode === 'percent' ? 'on' : ''} onClick={() => set('capitalMode', 'percent')}>% saldo</button>
            </div>
            <div className="input-suffix">
              <input type="number" inputMode="decimal" min="0" step="any" value={s.capitalMode === 'fixed' ? s.capitalFixed : s.capitalPct}
                onChange={e => set(s.capitalMode === 'fixed' ? 'capitalFixed' : 'capitalPct', e.target.value === '' ? '' : +e.target.value)} />
              <span>{s.capitalMode === 'fixed' ? 'USDT' : '%'}</span>
            </div>
            <span className="note">all'inizio = <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.capital)} USDT</b></span>
          </div>
          <MarginField s={s} set={set} sz={sz} />
          <Select label="Leva" value={s.leverage} options={OPTIONS.leverage} fmt={v => `${v}x`} onChange={v => set('leverage', v)}
            hint={<>posizione da <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.notional)} USDT</b></>} />
          <PositionsField s={s} set={set} />
          <Select label="Commissione per lato" value={s.fee} options={OPTIONS.fee} fmt={v => `${num(v)}%`} onChange={v => set('fee', v)}
            hint={`${X} taker 0,06%, sul valore della posizione`} />
          <Select label="Slittamento per lato" value={s.slip} options={OPTIONS.slip} fmt={v => `${num(v)}%`} onChange={v => set('slip', v)}
            hint="su entrata e uscita a mercato" />
          <Select label="Funding medio" value={s.funding} options={OPTIONS.funding} fmt={v => `${num(v)}% a periodo`} onChange={v => set('funding', v)}
            hint={`pagato a ogni orario del funding di ${X} con la posizione aperta`} />
        </div>
        <label className="toggle">
          <span>Solo titoli operabili su {X}<div className="note">Usa solo i titoli che oggi {X} accetta via API: lo stesso elenco con cui il Reale {X} sceglie i titoli.</div></span>
          <input type="checkbox" checked={!!s.onlyBitunix} onChange={e => set('onlyBitunix', e.target.checked)} />
        </label>
        <ExposureInfo s={s} sz={sz} mins={mins} X={X} />
        <div className="note">Il minimo per ordine di {X} vale anche qui: i trade sotto il minimo non si aprono, come nel Reale.</div>
      </div>

      <RulesCard s={s} set={set} showFee={false} sim X={X} />
      <PresetsCard current={normalizeSettings(s)} onLoad={st => setS(normalizeSettings(st))} />

      {/* Periodo */}
      <div className="lab section-title">Periodo</div>
      <div className="card">
        <div className="chips">
          {PERIODS.map(([k, l]) => <button key={k} className={`chip ${period === k ? 'active' : ''}`} onClick={() => setPeriod(k)}>{l}</button>)}
        </div>
        {period === 'custom' && (
          <div className="grid2" style={{ marginTop: 10 }}>
            <label className="field"><span className="lab">Da</span><input type="date" value={custom.from} min={status?.first || undefined} max={status?.last || undefined} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} /></label>
            <label className="field"><span className="lab">A</span><input type="date" value={custom.to} min={status?.first || undefined} max={status?.last || undefined} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} /></label>
          </div>
        )}
        <div className="note" style={{ marginTop: 8 }}>
          {range ? <>Simulazione su {X} dal <b className="mono" style={{ color: 'var(--text)' }}>{dShort(range.from)}</b> al <b className="mono" style={{ color: 'var(--text)' }}>{dShort(range.to)}</b> (archivio {X}: {dShort(status?.first)} → {dShort(status?.last)}). I titoli entrano dal giorno in cui hanno abbastanza storico (5 giorni).</> : status && !status.first ? `Prima scarica l'archivio dei dati di ${X}.` : 'Scegli le date.'}
        </div>
        <div className="sim-actions" style={{ marginTop: 10 }}>
          <button className="btn" disabled={busy || !range || !s.symbols.length || !(+capital > 0)} onClick={run}>
            {busy ? 'Simulo…' : 'Avvia la simulazione'}
          </button>
          {busy && <button className="btn ghost" onClick={cancel}>Annulla</button>}
          <button className="btn ghost" disabled={busy || cmpBusy || !range || !s.symbols.length || !(+capital > 0)} onClick={compare}>{cmpBusy ? 'Confronto…' : 'Confronta Bitunix e Bitget'}</button>
        </div>
        {(live || result) && <SimSphere live={live} result={result} capital={+capital} />}
        {err && <div className="note" style={{ color: 'var(--short)', marginTop: 6 }}>{err}</div>}
        <p className="note" style={{ marginTop: 8 }}>Stesso motore di Prova e Reale, minuto per minuto, sulle candele da 1 minuto di {X}. Con slittamento, funding e liquidazione (margine isolato, margine di mantenimento e leva massima di {X}): un trade liquidato perde tutto il margine.</p>
      </div>

      {cmp && <CompareCard c={cmp} />}

      {result && <Results r={result} onTrade={t => setTrade({ ...t, ex: result.ex || 'bitunix' })} />}
      {trade && <TradeChart trade={trade} onClose={() => setTrade(null)} />}
    </>
  )
}
