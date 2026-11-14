// Ordini manuali dalla pagina RSI: apertura a mercato LONG/SHORT senza stop loss, posizioni aperte con CHIUDI, storico.
// Solo con il codice di controllo; le regole di sicurezza sono sul server (server/manual.js).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { get, post, fmtPrice, fmtSigned } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { liqPriceOf } from '@shared/opening.js'

const LIQ_FEE = 0.1 // commissione di liquidazione stimata in % (come nella strategia)
const STATE = { oversold: 'ipervenduto', overbought: 'ipercomprato', neutral: 'neutro' }
const sideName = s => (s === 1 ? 'LONG' : s === -1 ? 'SHORT' : '—')
const short = s => s.replace(/USDT$/, '')
const dur = ms => {
  if (!(ms >= 0)) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}g ${h % 24}h`
}
const when = t => new Date(t).toLocaleString('it-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const pctTxt = v => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`)
const tone = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'sec')

function Gate({ onOk }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState(null)
  const go = async e => {
    e.preventDefault(); setErr(null)
    save('adminCode', code.trim())
    try { await get('/api/admin/check'); onOk() } catch (x) { save('adminCode', ''); setErr(x.message) }
  }
  return (
    <form className="card" onSubmit={go} style={{ padding: 12 }}>
      <div className="lab">Ordini manuali · area privata</div>
      <p className="note" style={{ margin: '6px 0' }}>Apri e chiudi ordini veri su Bitunix da qui. Serve il codice di controllo, lo stesso della pagina Strategia.</p>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Codice di controllo" autoComplete="current-password" /></div>
        <button className="btn" style={{ width: 'auto' }} disabled={!code.trim()}>Entra</button>
      </div>
      {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
    </form>
  )
}

// Stato dello Stocastico RSI da salvare con l'apertura
export function snapshotOf(reads, tfs, suggestion, params) {
  return {
    tfs: Object.fromEntries(tfs.filter(tf => reads[tf]).map(tf => [tf, { k: reads[tf].K, d: reads[tf].D, state: reads[tf].state, cross: reads[tf].cross ? { dir: reads[tf].cross.dir, ago: reads[tf].cross.ago, inZone: reads[tf].cross.inZone } : null }])),
    suggestion, params,
  }
}

function useNow(active) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!active) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [active])
  return now
}

export function ManualPanel({ symbol, price, suggestion, makeSnapshot, positions, reloadPositions, onAuthError }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState(null)
  const [prefs, setPrefsRaw] = useState(() => ({ leverage: 5, margin: 10, confirm: true, ...load('manualPrefs', {}) }))
  const [levTxt, setLevTxt] = useState(String(prefs.leverage))
  const [mgTxt, setMgTxt] = useState(String(prefs.margin))
  const [pending, setPending] = useState(null) // lato in attesa di conferma
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const setPrefs = p => setPrefsRaw(x => { const n = { ...x, ...p }; save('manualPrefs', n); return n })

  const loadInfo = useCallback(() => get(`/api/manual/info?symbol=${encodeURIComponent(symbol)}`)
    .then(j => { setInfo(j); setErr(null) })
    .catch(e => { if (/codice/i.test(e.message)) onAuthError(); else setErr(e.message) }), [symbol, onAuthError])
  useEffect(() => { setInfo(null); setPending(null); setMsg(null); loadInfo(); const id = setInterval(loadInfo, 30000); return () => clearInterval(id) }, [loadInfo])

  const lev = Math.round(+levTxt), margin = +mgTxt
  const notional = lev > 0 && margin > 0 ? lev * margin : null
  const tier = info?.tiers && notional ? (info.tiers.find(t => notional >= t.start && notional < t.end) || info.tiers.at(-1)) : null
  const maxLev = Math.min(info?.pair?.maxLev || Infinity, tier?.lev || Infinity)
  const qty = notional && price ? notional / price : null
  const liq = (side, mmr) => (qty && mmr !== undefined ? liqPriceOf({ side, entry: price, qty, margin }, mmr, LIQ_FEE) : null)
  const mmr = tier?.mmr ?? info?.tiers?.[0]?.mmr
  const liqL = liq(1, mmr), liqS = liq(-1, mmr)
  const mineHere = positions?.open?.some(p => p.perp === symbol)

  const problems = []
  if (info && !info.allowed) problems.push('Ordini veri disattivati sul server (LIVE_TRADING o chiavi Bitunix)')
  if (info && !info.pair) problems.push(`${symbol} non è una coppia aperta su Bitunix`)
  if (info?.pair?.api === false) problems.push('Bitunix non accetta ordini via API su questa coppia')
  if (info?.strategyOpen) problems.push('La strategia ha una posizione aperta su questo titolo')
  if (info?.strategyWindow) problems.push(info.strategyWindow[0].toUpperCase() + info.strategyWindow.slice(1))
  if (mineHere) problems.push('Hai già una posizione manuale su questo titolo: chiudila prima')
  if (!(lev >= 1)) problems.push('Leva non valida')
  else if (Number.isFinite(maxLev) && lev > maxLev) problems.push(`Leva oltre il massimo di Bitunix (${maxLev}x)`)
  if (!(margin >= 1)) problems.push('Margine minimo 1 USDT')
  else if (info?.free !== null && info?.free !== undefined && margin > info.free) problems.push(`Margine oltre il saldo libero (${info.free.toFixed(2)} USDT)`)
  if (qty && info?.pair?.minQty && qty < info.pair.minQty) problems.push(`Posizione sotto il minimo di Bitunix (${info.pair.minQty})`)
  const blocked = !info || problems.length > 0 || busy

  const send = async side => {
    setBusy(true); setMsg(null); setPending(null)
    try {
      const { trade } = await post('/api/manual/open', { symbol, side, leverage: lev, margin, snapshot: makeSnapshot() })
      setMsg({ ok: true, text: `${sideName(side)} aperto: ${trade.qty} ${short(symbol)} a ${fmtPrice(trade.entry)}` })
    } catch (e) {
      if (/codice/i.test(e.message)) onAuthError()
      setMsg({ ok: false, text: e.message })
    } finally { setBusy(false); reloadPositions(); loadInfo() }
  }
  const click = side => { if (blocked) return; if (prefs.confirm) setPending(side); else send(side) }

  return (
    <div className="card manual">
      <div className="row">
        <span className="lab">Ordine manuale · {short(symbol)}</span>
        <span className="note mono">{info?.free !== null && info?.free !== undefined ? `libero ${info.free.toFixed(2)} USDT` : info?.accErr ? 'saldo non leggibile' : ''}</span>
      </div>
      <div className={`manual-hint ${suggestion.side === 1 ? 'up' : suggestion.side === -1 ? 'down' : 'sec'}`}>{suggestion.reason}</div>
      <div className="manual-btns">
        {[1, -1].map(side => (
          <button key={side} className={`mbtn ${side > 0 ? 'long' : 'short'} ${suggestion.side === side ? 'hint' : ''}`} disabled={blocked} onClick={() => click(side)}>
            {side > 0 ? 'LONG' : 'SHORT'}
            {suggestion.side === side && <small>suggerito</small>}
          </button>
        ))}
      </div>
      {pending && (
        <div className="manual-confirm">
          <span>Apri <b className={pending > 0 ? 'up' : 'down'}>{sideName(pending)}</b> {short(symbol)} · {lev}x · margine {margin} USDT · valore {notional?.toFixed(0)} USDT?</span>
          <div className="row" style={{ gap: 6 }}>
            <button className="chip" onClick={() => setPending(null)}>Annulla</button>
            <button className={`chip mconfirm ${pending > 0 ? 'long' : 'short'}`} onClick={() => send(pending)}>Invia</button>
          </div>
        </div>
      )}
      <div className="manual-grid">
        <label className="field">
          <span className="lab" style={{ fontSize: 10 }}>Leva{Number.isFinite(maxLev) ? ` (max ${maxLev}x)` : ''}</span>
          <div className="input-suffix"><input type="number" inputMode="numeric" min="1" value={levTxt} onChange={e => setLevTxt(e.target.value)} onBlur={() => lev >= 1 && setPrefs({ leverage: lev })} /><span>x</span></div>
        </label>
        <label className="field">
          <span className="lab" style={{ fontSize: 10 }}>Margine</span>
          <div className="input-suffix"><input type="number" inputMode="decimal" min="1" step="any" value={mgTxt} onChange={e => setMgTxt(e.target.value)} onBlur={() => margin >= 1 && setPrefs({ margin })} /><span>USDT</span></div>
        </label>
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        {[2, 5, 10, 20].map(v => <button key={'l' + v} className={`chip ${lev === v ? 'on' : ''}`} onClick={() => { setLevTxt(String(v)); setPrefs({ leverage: v }) }}>{v}x</button>)}
        <span style={{ width: 8 }} />
        {[5, 10, 25, 50].map(v => <button key={'m' + v} className={`chip ${margin === v ? 'on' : ''}`} onClick={() => { setMgTxt(String(v)); setPrefs({ margin: v }) }}>{v}$</button>)}
      </div>
      <div className="manual-calc mono">
        <div><span className="muted">valore posizione</span> <b>{notional ? `${notional.toFixed(2)} USDT` : '—'}</b></div>
        <div><span className="muted">quantità</span> <b>{qty ? qty.toPrecision(4) : '—'}</b></div>
        <div><span className="muted">liquidazione long</span> <b className="down">{liqL ? fmtPrice(liqL) : '—'}</b> <span className="muted">{liqL && price ? pctTxt((liqL / price - 1) * 100) : ''}</span></div>
        <div><span className="muted">liquidazione short</span> <b className="down">{liqS ? fmtPrice(liqS) : '—'}</b> <span className="muted">{liqS && price ? pctTxt((liqS / price - 1) * 100) : ''}</span></div>
      </div>
      <label className="toggle" style={{ paddingBottom: 0 }}>
        <span style={{ fontSize: 13 }}>Conferma prima dell'invio</span>
        <input type="checkbox" checked={prefs.confirm} onChange={e => setPrefs({ confirm: e.target.checked })} />
      </label>
      {problems.length > 0 && info && <div className="warn">{problems.join(' · ')}</div>}
      {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
      {msg && <div className={`note ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 6 }}>{msg.text}</div>}
      <p className="note" style={{ marginTop: 6 }}>Ordine a mercato su Bitunix, margine isolato, senza stop loss: puoi perdere al massimo il margine. Liquidazione stimata dal prezzo attuale ({price ? fmtPrice(price) : '—'}). Separati dalla strategia: non usano il suo capitale e non contano nei suoi risultati.</p>
    </div>
  )
}

export function ManualPositions({ positions, reloadPositions, onAuthError }) {
  const [closing, setClosing] = useState({})
  const [msg, setMsg] = useState(null)
  const open = positions?.open || []
  const now = useNow(open.length > 0)
  const close = async t => {
    setClosing(c => ({ ...c, [t.id]: true })); setMsg(null)
    try {
      const { trade } = await post('/api/manual/close', { id: t.id })
      setMsg({ ok: true, text: `${short(t.perp)} chiusa${trade.pnl !== null ? `: ${fmtSigned(trade.pnl)} USDT` : ''}` })
    } catch (e) { if (/codice/i.test(e.message)) onAuthError(); setMsg({ ok: false, text: e.message }) } finally { setClosing(c => ({ ...c, [t.id]: false })); reloadPositions() }
  }
  if (!open.length && !msg) return null
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="lab">Posizioni manuali aperte</div>
      {open.map(t => (
        <div key={t.id} className="mpos">
          <div className="mpos-main">
            <div><b>{short(t.perp)}</b> <span className={`pill ${t.side > 0 ? 'long' : 'short'}`}>{sideName(t.side)} {t.leverage}x</span></div>
            <div className="mono note">entrata {fmtPrice(t.entry)} · ora {t.last ? fmtPrice(t.last) : '—'} · liq {t.liqPrice ? fmtPrice(t.liqPrice) : '—'} · {dur(now - (t.fillAt || t.openedAt))}</div>
          </div>
          <div className="mpos-pnl mono">
            <b className={tone(t.upnl)}>{t.upnl !== null && t.upnl !== undefined ? `${fmtSigned(t.upnl)}` : '—'}</b>
            <span className={tone(t.upnl)}>{pctTxt(t.upnlPct)}</span>
          </div>
          <button className="mclose" disabled={!!closing[t.id]} onClick={() => close(t)}>{closing[t.id] ? '…' : 'CHIUDI'}</button>
        </div>
      ))}
      {positions?.error && <div className="note down">Bitunix: {positions.error}</div>}
      {msg && <div className={`note ${msg.ok ? 'up' : 'down'}`} style={{ marginTop: 6 }}>{msg.text}</div>}
      <p className="note" style={{ marginTop: 6 }}>Risultato non realizzato in USDT e in % del margine, aggiornato ogni 2 secondi. CHIUDI chiude subito a mercato solo quella posizione.</p>
    </div>
  )
}

function SnapDetail({ t }) {
  const tfs = Object.entries(t.snapshot?.tfs || {})
  return (
    <div className="msnap">
      <div className="note" style={{ marginBottom: 4 }}>{t.snapshot?.suggestion?.reason || 'Nessun suggerimento salvato'}</div>
      <div className="msnap-grid mono">
        {tfs.map(([tf, r]) => (
          <div key={tf}>
            <b>{tf}</b> <span className={r.state === 'oversold' ? 'up' : r.state === 'overbought' ? 'down' : 'sec'}>{STATE[r.state] || '—'}</span>
            <div className="muted">K {r.k ?? '—'} · D {r.d ?? '—'}{r.cross ? ` · ${r.cross.dir === 'up' ? '↑' : '↓'} ${r.cross.ago === 0 ? 'ora' : `${r.cross.ago}c fa`}${r.cross.inZone ? ' in zona' : ''}` : ''}</div>
          </div>
        ))}
      </div>
      <div className="note mono" style={{ marginTop: 4 }}>
        aperta {when(t.openedAt)} a {fmtPrice(t.entry ?? t.priceAtSend)} · margine {t.margin?.toFixed?.(2)} USDT × {t.leverage}x
        {t.closedAt ? ` · chiusa ${when(t.closedAt)} a ${t.exit ? fmtPrice(t.exit) : '—'} · ${t.reason || ''}` : ''}
        {t.fee !== null && t.fee !== undefined ? ` · commissioni ${t.fee.toFixed(3)}` : ''}{t.funding ? ` · funding ${fmtSigned(t.funding, 3)}` : ''}{t.closedAt && !t.final ? ' · provvisorio' : ''}
      </div>
    </div>
  )
}

export function ManualHistory({ positions }) {
  const [openId, setOpenId] = useState(null)
  const hist = positions?.history || []
  const stats = useMemo(() => {
    const done = hist.filter(t => t.status === 'closed' && t.pnl !== null && t.pnl !== undefined)
    const grp = f => { const a = done.filter(f); return { n: a.length, pnl: a.reduce((s, t) => s + t.pnl, 0), win: a.filter(t => t.pnl > 0).length } }
    return { all: grp(() => true), follow: grp(t => t.snapshot?.suggestion?.side && t.snapshot.suggestion.side === t.side), against: grp(t => t.snapshot?.suggestion?.side && t.snapshot.suggestion.side === -t.side), none: grp(t => !t.snapshot?.suggestion?.side) }
  }, [hist])
  if (!hist.length) return null
  const row = (label, s) => s.n > 0 && <div><span className="muted">{label}</span> <b>{s.n}</b> trade · vinti {s.win} · <b className={tone(s.pnl)}>{fmtSigned(s.pnl)} USDT</b></div>
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="lab">Storico ordini manuali</div>
      <div className="manual-calc mono" style={{ gridTemplateColumns: '1fr' }}>
        {row('totale', stats.all)}
        {row('seguendo il suggerimento', stats.follow)}
        {row('contro il suggerimento', stats.against)}
        {row('senza suggerimento', stats.none)}
      </div>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table className="tbl clickable">
          <thead><tr><th>Quando</th><th>Titolo</th><th>Tu</th><th>App</th><th>Risultato</th><th>%</th><th>Durata</th></tr></thead>
          <tbody>
            {hist.map(t => {
              const sg = t.snapshot?.suggestion?.side ?? null
              return [
                <tr key={t.id} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                  <td>{when(t.openedAt)}</td>
                  <td>{short(t.perp)}</td>
                  <td className={t.side > 0 ? 'up' : 'down'}>{sideName(t.side)}</td>
                  <td className={sg === 1 ? 'up' : sg === -1 ? 'down' : 'muted'}>{sg ? sideName(sg) : '—'}{sg ? (sg === t.side ? ' ✓' : ' ✗') : ''}</td>
                  <td className={tone(t.pnl)}>{t.status === 'unknown' ? 'da verificare' : t.pnl !== null && t.pnl !== undefined ? fmtSigned(t.pnl) : '—'}</td>
                  <td className={tone(t.pnl)}>{pctTxt(t.pnlPct)}</td>
                  <td>{dur(t.durationMs)}</td>
                </tr>,
                openId === t.id && <tr key={t.id + 'd'}><td colSpan={7} style={{ whiteSpace: 'normal' }}><SnapDetail t={t} /></td></tr>,
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 6 }}>Tocca un trade per vedere lo Stocastico RSI di tutti i timeframe al momento dell'apertura. Risultato con commissioni e funding veri di Bitunix; % sul margine.</p>
    </div>
  )
}

// Stato condiviso: codice, posizioni (ogni 2 s con posizioni aperte, altrimenti ogni 20 s; ferme a pagina nascosta)
export function useManual() {
  const [authed, setAuthed] = useState(() => !!load('adminCode', ''))
  const [positions, setPositions] = useState(null)
  const onAuthError = useCallback(() => { save('adminCode', ''); setAuthed(false) }, [])
  const reloadPositions = useCallback(() => {
    if (!load('adminCode', '') || document.visibilityState === 'hidden') return Promise.resolve()
    return get('/api/manual/positions').then(setPositions).catch(e => { if (/codice/i.test(e.message)) onAuthError() })
  }, [onAuthError])
  const hasOpen = !!positions?.open?.length
  useEffect(() => {
    if (!authed) return
    reloadPositions()
    const id = setInterval(reloadPositions, hasOpen ? 2000 : 20000)
    return () => clearInterval(id)
  }, [authed, hasOpen, reloadPositions])
  return { authed, setAuthed, positions, reloadPositions, onAuthError, Gate }
}
