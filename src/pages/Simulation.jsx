// Scheda Simulazione della pagina Strategia: la strategia Apertura USA sulle candele da 1 minuto archiviate di Bitunix,
// con lo stesso motore di Prova e Reale (shared/engine.js, eseguito sul server).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, post, fmtPrice, fmtUsd, fmtSigned } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { OPTIONS, STRATEGY_DEFAULTS, normalizeSettings, sizing } from '@shared/opening.js'
import { addDays } from '@shared/time.js'
import { Select, RulesCard, PresetsCard, num, lab, dayFmt, hm } from '../components/StrategyForm.jsx'
import TradeChart from '../components/TradeChart.jsx'

const PERIODS = [['1w', '1 settimana', 7], ['1m', '1 mese', 30], ['3m', '3 mesi', 91], ['6m', '6 mesi', 182], ['all', 'tutto'], ['custom', 'date a scelta']]
const dShort = d => (d ? dayFmt(d, { day: '2-digit', month: 'short', year: '2-digit' }) : '—')
const sleep = ms => new Promise(r => setTimeout(r, ms))

function ArchiveCard({ status, onStatus, onAuthError }) {
  const [filling, setFilling] = useState(false)
  const [progress, setProgress] = useState(null)
  const stop = useRef(false)

  const fill = async () => {
    setFilling(true); stop.current = false; setProgress('Inizio lo scaricamento da Bitunix…')
    let saved = 0
    try {
      for (let round = 0; round < 200 && !stop.current; round++) {
        const r = await post('/api/sim/fill', {})
        if (r.busy) {
          setProgress('Lo scaricamento automatico è già in corso: aspetto che finisca il suo blocco…')
          await sleep(15000)
          onStatus(await get('/api/sim/status'))
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
      <div className="lab">Archivio dati Bitunix · candele da 1 minuto</div>
      {status.first
        ? <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>dal {dShort(status.first)} al {dShort(status.last)}</div>
        : <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>Archivio vuoto</div>}
      <p className="body">
        {avail.length} titoli su {status.symbols.length} con dati{unavailable.length ? ` (${unavailable.map(x => x.symbol).join(', ')}: perpetual non disponibile su Bitunix)` : ''}.
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
            <thead><tr><th>Titolo</th><th>Su Bitunix dal</th><th>Archivio</th><th>Giorni</th><th>Note</th></tr></thead>
            <tbody>{status.symbols.map(x => (
              <tr key={x.symbol}>
                <td><b>{x.symbol}</b></td>
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

function Results({ r, onTrade }) {
  const [shown, setShown] = useState(100)
  const [sym, setSym] = useState('')
  const days = r.daily.filter(d => d.n > 0).slice().reverse()
  const maxAbs = Math.max(1, ...days.map(d => Math.abs(d.pnl)))
  const trades = useMemo(() => r.trades.filter(t => !sym || t.symbol === sym).slice().reverse(), [r, sym])
  const syms = useMemo(() => [...new Set(r.trades.map(t => t.symbol))].sort(), [r])
  const best = days.length ? days.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null
  const worst = days.length ? days.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null

  return (
    <>
      <div className="lab section-title">Risultato · {dShort(r.firstDay)} → {dShort(r.lastDay)} · {r.days} giorni di borsa</div>
      <div className="stat-grid">
        <div className="tile"><div className="lab">Risultato</div><div className={`mono big ${r.net >= 0 ? 'up' : 'down'}`}>{fmtSigned(r.net)} USDT</div><div className={`note ${r.net >= 0 ? 'up' : 'down'}`}>{fmtSigned(r.pct)}% · saldo {fmtUsd(r.final)}</div></div>
        <div className="tile"><div className="lab">Trade vinti</div><div className="mono big">{r.wins} su {r.n}</div><div className="note">{r.n ? Math.round(r.wins / r.n * 100) : 0}% · {r.daysUp} giorni su {r.daysWithTrades} in guadagno</div></div>
        <div className="tile"><div className="lab">Profit factor</div><div className="mono big">{r.pf ? fmtUsd(r.pf) : '—'}</div><div className="note">vinto {fmtUsd(r.grossWin, 0)} · perso {fmtUsd(r.grossLoss, 0)}</div></div>
        <div className="tile"><div className="lab">Peggior calo</div><div className="mono big down">−{fmtUsd(r.maxDDPct)}%</div><div className="note">−{fmtUsd(r.maxDD)} USDT dal massimo</div></div>
        <div className="tile"><div className="lab">Giorno peggiore</div><div className={`mono big ${!r.worstDay || r.worstDay.pct >= 0 ? '' : 'down'}`}>{r.worstDay ? `${fmtSigned(r.worstDay.pct)}%` : '—'}</div><div className="note">{r.worstDay ? `${fmtSigned(r.worstDay.pnl)} USDT · ${dShort(r.worstDay.day)}` : 'nessuna operazione'}</div></div>
        <div className="tile"><div className="lab">Liquidazioni</div><div className={`mono big ${r.liquidations ? 'down' : ''}`}>{r.liquidations ?? 0}</div><div className="note">{r.liquidations ? 'margine perso per intero' : 'nessun trade liquidato'}</div></div>
      </div>
      <div className="card" style={{ padding: '10px 14px' }}>
        <div className="row"><span className="lab">Costi</span><span className="mono down">−{fmtUsd(r.costs ?? r.fees)} USDT</span></div>
        <div className="kv"><span className="sec">Commissioni (entrata e uscita, sul valore della posizione)</span><span className="mono">{fmtUsd(r.fees)}</span></div>
        <div className="kv"><span className="sec">Funding stimato</span><span className="mono">{fmtUsd(r.funding ?? 0)}</span></div>
        <div className="kv"><span className="sec">Slittamento</span><span className="mono">{fmtUsd(r.slippage ?? 0)}</span></div>
        {r.mmrFrom && Object.values(r.mmrFrom).includes('impostato') && <div className="note" style={{ color: 'var(--warn)' }}>Margine di mantenimento non disponibile da Bitunix per {Object.entries(r.mmrFrom).filter(([, v]) => v === 'impostato').map(([k]) => k).join(', ')}: usato quello impostato.</div>}
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

      <div className="lab section-title row">
        <span>Trade · {trades.length}{r.tradesCut ? ` (solo gli ultimi, ${r.tradesCut} più vecchi non mostrati)` : ''}</span>
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
    </>
  )
}

export default function Simulation({ onAuthError }) {
  const [status, setStatus] = useState(null)
  const [s, setS] = useState(() => normalizeSettings(load('simSettings', STRATEGY_DEFAULTS)))
  const [capital, setCapital] = useState(() => load('simCapital', 300))
  const [period, setPeriod] = useState(() => load('simPeriod', '1m'))
  const [custom, setCustom] = useState(() => load('simCustom', { from: '', to: '' }))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [trade, setTrade] = useState(null)
  const authErr = useRef(onAuthError)
  authErr.current = onAuthError

  useEffect(() => { save('simSettings', s) }, [s])
  useEffect(() => { save('simCapital', capital) }, [capital])
  useEffect(() => { save('simPeriod', period) }, [period])
  useEffect(() => { save('simCustom', custom) }, [custom])

  const refreshStatus = useCallback(() => get('/api/sim/status').then(setStatus).catch(e => { if (/codice/i.test(e.message)) authErr.current(); setErr(e.message) }), [])
  useEffect(() => { refreshStatus() }, [refreshStatus])

  const set = (k, v) => setS(d => ({ ...d, [k]: v }))
  const sz = sizing(s, +capital || 0)
  const range = useMemo(() => {
    if (!status?.first) return null
    const end = status.last
    if (period === 'custom') return custom.from && custom.to ? { from: custom.from, to: custom.to } : null
    if (period === 'all') return { from: status.first, to: end }
    const days = PERIODS.find(p => p[0] === period)[2]
    const from = addDays(end, -days + 1)
    return { from: from < status.first ? status.first : from, to: end }
  }, [status, period, custom])

  const run = async () => {
    setBusy(true); setErr(null); setTrade(null)
    try { setResult(await post('/api/sim/run', { settings: normalizeSettings(s), capital: +capital, ...range })) }
    catch (e) { if (/codice/i.test(e.message)) onAuthError(); setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <>
      <ArchiveCard status={status} onStatus={st => st && setStatus(st)} onAuthError={onAuthError} />

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
          <Select label="Margine per trade" value={s.marginPct} options={OPTIONS.marginPct} fmt={v => `${v}% del capitale`} onChange={v => set('marginPct', v)}
            hint={<>= <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.margin)} USDT</b> a trade all'inizio</>} />
          <Select label="Leva" value={s.leverage} options={OPTIONS.leverage} fmt={v => `${v}x`} onChange={v => set('leverage', v)}
            hint={<>posizione da <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsd(sz.notional)} USDT</b></>} />
          <Select label="Posizioni al giorno" value={s.maxPos} options={OPTIONS.maxPos} fmt={v => lab('maxPos', v) || `massimo ${v}`} onChange={v => set('maxPos', v)} />
          <Select label="Commissione per lato" value={s.fee} options={OPTIONS.fee} fmt={v => `${num(v)}%`} onChange={v => set('fee', v)}
            hint="Bitunix taker 0,06%, sul valore della posizione" />
          <Select label="Slittamento per lato" value={s.slip} options={OPTIONS.slip} fmt={v => `${num(v)}%`} onChange={v => set('slip', v)}
            hint="su entrata e uscita a mercato" />
          <Select label="Funding medio" value={s.funding} options={OPTIONS.funding} fmt={v => `${num(v)}% a periodo`} onChange={v => set('funding', v)}
            hint="pagato a ogni orario del funding di Bitunix con la posizione aperta" />
        </div>
      </div>

      <RulesCard s={s} set={set} showFee={false} />
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
          {range ? <>dal <b className="mono" style={{ color: 'var(--text)' }}>{dShort(range.from)}</b> al <b className="mono" style={{ color: 'var(--text)' }}>{dShort(range.to)}</b>. I titoli entrano dal giorno in cui hanno abbastanza storico (5 giorni).</> : status && !status.first ? 'Prima scarica l\'archivio dei dati.' : 'Scegli le date.'}
        </div>
        <button className="btn" style={{ marginTop: 10 }} disabled={busy || !range || !s.symbols.length || !(+capital > 0)} onClick={run}>
          {busy ? 'Simulo…' : 'Avvia la simulazione'}
        </button>
        {err && <div className="note" style={{ color: 'var(--short)', marginTop: 6 }}>{err}</div>}
        <p className="note" style={{ marginTop: 8 }}>Stesso motore di Prova e Reale, minuto per minuto, sulle candele da 1 minuto di Bitunix. Con slittamento, funding e liquidazione (margine isolato, margine di mantenimento di Bitunix): un trade liquidato perde tutto il margine.</p>
      </div>

      {result && <Results r={result} onTrade={setTrade} />}
      {trade && <TradeChart trade={trade} onClose={() => setTrade(null)} />}
    </>
  )
}
