// Strategia Turtle (breakout giornaliero, solo long): Simulazione sullo storico, Prova (capitale fittizio) e Reale (Bitunix).
// Regole in shared/turtle.js, server in server/turtle.js. Indipendente dalle altre strategie.
import { useEffect, useRef, useState } from 'react'
import { get, post, postStream, fmtPrice, fmtUsd, fmtSigned, dateCH } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import StrategyTabs, { useStrategyMode } from '../components/StrategyTabs.jsx'
import { Sparkline } from '../components/ManualTrade.jsx'
import { TURTLE_DEFAULTS, TURTLE_LIMITS, cleanTurtle } from '@shared/turtle.js'

const FIELDS = [
  ['entryN', 'Entrata: massimo di N giorni', 1], ['exitM', 'Uscita: minimo di M giorni', 1], ['atrK', 'Stop: K × ATR sotto l\'entrata', 0.5],
  ['atrN', 'Giorni dell\'ATR (Wilder)', 1], ['riskPct', 'Rischio per trade (% del capitale)', 0.1], ['leverage', 'Leva (entro il massimo di Bitunix)', 1],
  ['capital', 'Capitale (USDT)', 50], ['maxPos', 'Posizioni aperte al massimo (0 = nessun limite)', 1],
  ['fee', 'Commissione per lato %', 0.01], ['slip', 'Slittamento per lato %', 0.01], ['funding', 'Funding medio per periodo % (Simulazione)', 0.005],
]
const tone = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'sec')
const pct = v => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)
const r2 = v => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`)

function Gate({ onOk }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(null)
  return (
    <form className="card" style={{ padding: 12 }} onSubmit={async e => {
      e.preventDefault(); save('adminCode', code.trim())
      try { await get('/api/admin/check'); onOk() } catch (x) { save('adminCode', ''); setErr(x.message) }
    }}>
      <div className="lab">Turtle · area privata</div>
      <p className="note" style={{ margin: '6px 0' }}>Serve il codice di controllo, lo stesso della pagina Strategia.</p>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1, minWidth: 0 }}><input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Codice di controllo" autoComplete="current-password" /></div>
        <button className="btn" style={{ width: 'auto' }} disabled={!code.trim()}>Entra</button>
      </div>
      {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
    </form>
  )
}

function SettingsForm({ value, onChange, title, extra = null, open = false }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, String(value[k])])))
  useEffect(() => { setDraft(Object.fromEntries(FIELDS.map(([k]) => [k, String(value[k])]))) }, [value])
  const bad = k => { const v = +draft[k], [lo, hi] = TURTLE_LIMITS[k]; return !(Number.isFinite(v) && v >= lo && v <= hi) }
  const apply = () => { if (!FIELDS.some(([k]) => bad(k))) onChange(cleanTurtle({ ...value, ...Object.fromEntries(FIELDS.map(([k]) => [k, +draft[k]])) })) }
  return (
    <details className="card" style={{ padding: 12 }} open={open}>
      <summary className="row"><span className="lab">{title}</span><span className="mono muted" style={{ fontSize: 11 }}>{value.entryN}/{value.exitM} · {value.atrK} ATR · {value.riskPct}% · {value.leverage}x</span></summary>
      <div className="tt-grid">
        {FIELDS.map(([k, l, step]) => (
          <label key={k} className="field">
            <span className="lab" style={{ fontSize: 10 }}>{l}</span>
            <input type="number" inputMode="decimal" step={step} value={draft[k]} style={bad(k) ? { borderColor: '#FF5C7A' } : undefined}
              onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} onBlur={apply} onKeyDown={e => e.key === 'Enter' && apply()} />
          </label>
        ))}
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        <button className={`chip ${value.stocks ? 'active' : ''}`} onClick={() => onChange({ ...value, stocks: !value.stocks })}>Azioni USA</button>
        <button className={`chip ${value.crypto ? 'active' : ''}`} onClick={() => onChange({ ...value, crypto: !value.crypto })}>Crypto</button>
        <button className="chip" onClick={() => onChange(cleanTurtle({ ...TURTLE_DEFAULTS, active: value.active }))}>Valori classici</button>
      </div>
      {extra}
    </details>
  )
}

function Tiles({ items }) {
  return <div className="tt-tiles">{items.map(([l, v, cls]) => <div key={l} className="tile"><div className="lab" style={{ fontSize: 10 }}>{l}</div><div className={`mono ${cls || ''}`} style={{ fontSize: 15, fontWeight: 700 }}>{v}</div></div>)}</div>
}

function TradeRow({ t, onClose }) {
  const res = t.status === 'open' ? t.upnl : t.pnl
  return (
    <div className="lv-item">
      <div className="lv-head mono">
        <b>{t.symbol}</b>
        <span className="sec">{dateCH(t.openedAt ?? t.in)}{t.closedAt || t.out ? ` → ${dateCH(t.closedAt ?? t.out)}` : ''}</span>
        <span>{fmtPrice(t.entry)} → {fmtPrice(t.status === 'open' ? t.last : t.exit)}</span>
        <b className={tone(res)}>{fmtSigned(res)} USDT</b>
        {t.R !== undefined && t.R !== null && <span className={tone(t.R)}>{r2(t.R)}</span>}
      </div>
      <div className="note">
        {t.status === 'open'
          ? <>leva {t.leverage}x · {+t.qty.toPrecision(6)} unità · stop fisso {fmtPrice(t.stop0)} · uscita adesso {fmtPrice(t.exitNow)}{t.liq ? ` · liquidazione ${fmtPrice(t.liq)}` : ''}{t.funding ? ` · funding ${fmtSigned(-t.funding)}` : ''}</>
          : <>{t.reason}{t.status === 'azzerata' ? 'azzerata' : ''} · leva {t.leverage}x{t.fees !== undefined ? ` · commissioni ${fmtUsd(t.fees)}` : ''}{t.funding ? ` · funding ${fmtSigned(-t.funding)}` : ''}{t.days ? ` · ${t.days} giorni` : ''}</>}
      </div>
      {onClose && <button className="chip" style={{ marginTop: 6 }} onClick={() => onClose(t)}>Chiudi adesso</button>}
    </div>
  )
}

// ---------- Simulazione ----------
function SimTab() {
  const [s, setSRaw] = useState(() => cleanTurtle(load('turtleSim', TURTLE_DEFAULTS)))
  const setS = v => { setSRaw(v); save('turtleSim', v) }
  const [from, setFrom] = useState(() => load('turtleFrom', ''))
  const [to, setTo] = useState(() => load('turtleTo', ''))
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(null)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const ctl = useRef(null)
  const run = async () => {
    setBusy(true); setErr(null); setRes(null); setProg({ msg: 'avvio' })
    ctl.current = new AbortController()
    try {
      await postStream('/api/turtle/sim', { settings: s, from: from || null, to: to || null }, {
        signal: ctl.current.signal,
        onEvent: ev => {
          if (ev.t === 'phase') setProg(p => ({ ...p, msg: ev.msg }))
          if (ev.t === 'load') setProg(p => ({ ...p, done: ev.done, total: ev.total }))
          if (ev.t === 'result') setRes(ev.result)
          if (ev.t === 'error') setErr(ev.error)
        },
      })
    } catch (e) { if (e.name !== 'AbortError') setErr(e.message) } finally { setBusy(false); setProg(null) }
  }
  const S = res?.summary
  return (
    <>
      <SettingsForm value={s} onChange={setS} title="Impostazioni della Simulazione" open />
      <div className="card" style={{ padding: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1, minWidth: 130 }}><span className="lab" style={{ fontSize: 10 }}>Dal (vuoto = tutto lo storico)</span><input type="date" value={from} onChange={e => { setFrom(e.target.value); save('turtleFrom', e.target.value) }} /></label>
          <label className="field" style={{ flex: 1, minWidth: 130 }}><span className="lab" style={{ fontSize: 10 }}>Al (vuoto = oggi)</span><input type="date" value={to} onChange={e => { setTo(e.target.value); save('turtleTo', e.target.value) }} /></label>
        </div>
        {busy
          ? <button className="btn" style={{ marginTop: 8 }} onClick={() => ctl.current?.abort()}>Annulla</button>
          : <button className="btn" style={{ marginTop: 8 }} onClick={run}>Avvia la simulazione</button>}
        {prog && <p className="note" style={{ marginTop: 6 }}>{prog.msg}{prog.total ? ` · ${prog.done}/${prog.total} titoli` : ''}</p>}
        {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
        <p className="note" style={{ marginTop: 6 }}>Candele giornaliere di Bitunix (archiviate nell'app, scaricate la prima volta: circa un minuto). Un solo conto per tutti i titoli: ogni giorno prima le uscite, poi le entrate in ordine di forza del breakout. Funding stimato sempre pagato.</p>
      </div>
      {S && (
        <>
          <div className="card" style={{ padding: 12 }}>
            <div className="row"><span className="lab">Risultato</span><span className="note mono">{dateCH(S.from)} {new Date(S.from).getFullYear()} → {dateCH(S.to)} {new Date(S.to).getFullYear()} · {S.symbols} titoli</span></div>
            <Tiles items={[
              ['capitale finale', `${fmtUsd(S.equity)} USDT`], ['rendimento', pct(S.ret), tone(S.ret)], ['massimo calo', `−${S.maxDD.toFixed(1)}%`, 'down'],
              ['trade', `${S.trades} · vinti ${S.winRate?.toFixed(0) ?? '—'}%`], ['media per trade', r2(S.avgR), tone(S.avgR)], ['durata media', S.avgDays ? `${S.avgDays.toFixed(1)} giorni` : '—'],
              ['lordo', fmtSigned(S.gross), tone(S.gross)], ['commissioni', `−${fmtUsd(S.fees)}`, 'down'], ['funding', fmtSigned(-S.funding), tone(-S.funding)],
              ['vincita media', fmtSigned(S.avgWin), 'up'], ['perdita media', fmtSigned(S.avgLoss), 'down'], ['ancora aperte', String(S.open)],
            ]} />
            <Sparkline points={res.curve} height={90} />
            {Object.keys(res.skipped).length > 0 && <p className="note">Breakout non presi: {Object.entries(res.skipped).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
            {res.missing?.length > 0 && <p className="note">Senza candele su Bitunix: {res.missing.join(', ')}</p>}
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="lab">Per titolo</div>
            <div className="lv-list">
              {(showAll ? res.bySymbol : res.bySymbol.slice(0, 12).concat(res.bySymbol.length > 24 ? res.bySymbol.slice(-12) : res.bySymbol.slice(12))).map(x => (
                <div key={x.symbol} className="lv-head mono" style={{ padding: '4px 2px', borderBottom: '1px solid var(--border)' }}>
                  <b style={{ minWidth: 56 }}>{x.symbol}</b><span className="sec">{x.trades} trade · vinti {x.wins}</span><b className={tone(x.pnl)}>{fmtSigned(x.pnl)}</b><span className={tone(x.R)}>{r2(x.R)}</span>
                </div>
              ))}
            </div>
            {res.bySymbol.length > 24 && <button className="chip" style={{ marginTop: 8 }} onClick={() => setShowAll(v => !v)}>{showAll ? 'Solo i migliori e i peggiori' : `Tutti i ${res.bySymbol.length} titoli`}</button>}
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="lab">Ultimi trade {res.tradesTotal > res.trades.length ? `(${res.trades.length} di ${res.tradesTotal})` : ''}</div>
            <div className="lv-list">{res.trades.slice(-40).reverse().map((t, i) => <TradeRow key={i} t={t} />)}</div>
            {res.open.length > 0 && <><div className="lab" style={{ marginTop: 10 }}>Aperte a fine periodo</div><div className="lv-list">{res.open.map(t => <TradeRow key={t.symbol} t={{ ...t, status: 'open', exitNow: t.stop0 }} />)}</div></>}
          </div>
        </>
      )}
    </>
  )
}

// ---------- Prova e Reale ----------
function LiveTab({ mode }) {
  const [st, setSt] = useState(null)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const [cap, setCap] = useState('')
  const reload = () => get(`/api/turtle/state?mode=${mode}`).then(x => { setSt(x); setErr(null) }).catch(e => setErr(e.message))
  useEffect(() => { setSt(null); reload(); const id = setInterval(reload, 30000); return () => clearInterval(id) }, [mode])
  const act = async (path, body, ok) => { try { setSt(await post(path, { mode, ...body })); setMsg({ ok: true, text: ok }) } catch (e) { setMsg({ ok: false, text: e.message }) } }
  if (err && !st) return <div className="warn">{err}</div>
  if (!st) return <div className="card note" style={{ padding: 12 }}>Carico…</div>
  const s = st.settings, acc = st.account, live = mode === 'live'
  const res = acc ? acc.balance - acc.start : 0
  const onClose = t => { if (window.confirm(`Chiudere ${t.symbol} adesso${live ? ' su Bitunix' : ''}?`)) act('/api/turtle/close', { id: t.id }, `${t.symbol} chiusa`) }
  return (
    <>
      {live && !st.liveAllowed && <div className="warn">Reale non abilitato: servono LIVE_TRADING=on e le chiavi Bitunix su Vercel. Puoi preparare le impostazioni.</div>}
      <div className="card" style={{ padding: 12 }}>
        <div className="row">
          <span className="lab">{live ? 'Reale · capitale dedicato' : 'Prova · capitale fittizio'}</span>
          <span className={`pill ${s.active ? 'long' : 'closed'}`}>{s.active ? 'attiva' : 'ferma'}</span>
        </div>
        {acc ? (
          <>
            <Tiles items={[['capitale', `${fmtUsd(acc.balance)} USDT`], ['risultato', `${fmtSigned(res)} (${pct(res / acc.start * 100)})`, tone(res)], ['posizioni aperte', String(st.open.length)]]} />
            <Sparkline points={(acc.curve || []).map(p => ({ t: p.t, v: p.balance }))} />
          </>
        ) : <p className="note">Conto non ancora avviato: scegli le impostazioni e premi Avvia.</p>}
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn" style={{ width: 'auto' }} onClick={() => act('/api/turtle/settings', { settings: { ...s, active: !s.active } }, s.active ? 'Fermata: niente nuove entrate, le posizioni aperte restano gestite' : 'Avviata')}>{s.active ? 'Ferma le entrate' : 'Avvia'}</button>
          <div className="input-suffix" style={{ flex: 1, minWidth: 130 }}><input type="number" inputMode="decimal" placeholder={`capitale (ora ${acc?.start ?? s.capital})`} value={cap} onChange={e => setCap(e.target.value)} /><span>USDT</span></div>
          <button className="chip" onClick={() => { if (window.confirm(live ? 'Azzerare il capitale dedicato del Reale?' : 'Azzerare il conto di prova? Le posizioni di prova aperte si chiudono senza risultato.')) act('/api/turtle/reset', { capital: +(cap || acc?.start || s.capital) }, 'Conto azzerato') }}>Azzera il conto</button>
        </div>
        {msg && <div className={`note ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 6 }}>{msg.text}</div>}
        <p className="note" style={{ marginTop: 6 }}>
          {live
            ? 'Ordini veri su Bitunix: a mercato quando il prezzo supera il massimo di N giorni, margine isolato, leva mai oltre il massimo di Bitunix, stop dentro l\'ordine e verificato (mai oltre la liquidazione), alzato ogni giorno al minimo di M giorni. Mai su titoli con posizioni o ordini non suoi, né su quelli di Apertura USA nel Reale; il capitale dedicato di Apertura USA resta riservato.'
            : 'Nessun ordine vero: entrate e uscite al prezzo di Bitunix di quel momento con slittamento e commissione delle impostazioni, funding al tasso di Bitunix a ogni orario del funding, liquidazione simulata.'}
          {' '}Livelli di oggi: {st.levels ? `${st.levels.n}/${st.levels.total} titoli` : 'non ancora calcolati'} (si aggiornano dopo la chiusura della candela giornaliera, 00:00 UTC). Entrate controllate ogni minuto, mai durante l'apertura USA (9:25–10:40 New York).
        </p>
      </div>
      <SettingsForm value={s} onChange={v => act('/api/turtle/settings', { settings: v }, 'Impostazioni salvate')} title={`Impostazioni ${live ? 'del Reale' : 'della Prova'}`} />
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Posizioni aperte</div>
        {st.open.length ? <div className="lv-list">{st.open.map(t => <TradeRow key={t.id} t={t} onClose={onClose} />)}</div> : <p className="note">Nessuna.</p>}
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Storico</div>
        {st.history.length ? <div className="lv-list">{st.history.map(t => <TradeRow key={t.id} t={t} />)}</div> : <p className="note">Ancora nessun trade chiuso.</p>}
      </div>
    </>
  )
}

export default function Turtle() {
  const [mode, setMode] = useStrategyMode('turtle', 'sim')
  const [authed, setAuthed] = useState(() => !!load('adminCode', ''))
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <div className="lab">Strategia · Turtle</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>Breakout giornaliero, solo long</div>
        </div>
      </div>
      <StrategyTabs mode={mode} setMode={setMode} />
      {!authed ? <Gate onOk={() => setAuthed(true)} /> : mode === 'sim' ? <SimTab /> : <LiveTab key={mode} mode={mode} />}
      <p className="note">Entrata quando il prezzo supera il massimo degli ultimi N giorni (prezzo = massimo tra quel livello e l'apertura del giorno). Stop fisso K × ATR (Wilder) sotto quel prezzo; dal giorno dopo esce al più alto tra lo stop e il minimo degli ultimi M giorni (se apre già sotto, all'apertura). Dopo un'uscita serve un nuovo breakout. Rischio = % del capitale attuale. Titoli: azioni USA di Apertura USA e crypto dello scanner, perpetual Bitunix.</p>
    </div>
  )
}
