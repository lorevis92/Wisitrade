import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../App.jsx'
import Chart from '../components/Chart.jsx'
import { get, fmtPrice, fmtPct, ago, dateCH, timeCH } from '../lib/api.js'
import { load, save, defaultRisk } from '../lib/store.js'

const BIAS = { long: 'Long', short: 'Short', neutral: 'Neutro' }

function RiskCalc({ price, stop, direction }) {
  const [r, setR] = useState(() => ({ ...defaultRisk, ...load('risk', {}) }))
  useEffect(() => { save('risk', r) }, [r])
  const upd = (k, v) => setR(x => ({ ...x, [k]: v === '' ? '' : Number(v) }))
  const dist = price && stop ? Math.abs(price - stop) / price : null
  const notional = dist ? (r.capital * r.riskPct / 100) / dist : null
  const margin = notional ? notional / (r.leverage || 1) : null
  const tooBig = margin && margin > r.capital * (r.maxMarginPct / 100)
  const qty = notional && price ? notional / price : null
  return (
    <div className="card">
      <div className="lab" style={{ marginBottom: 8 }}>Calcolo rischio</div>
      <div className="grid2" style={{ marginBottom: 8 }}>
        <label className="field"><span className="lab">Capitale (USDT)</span><input inputMode="decimal" value={r.capital} onChange={e => upd('capital', e.target.value)} /></label>
        <label className="field"><span className="lab">Rischio %</span><input inputMode="decimal" value={r.riskPct} onChange={e => upd('riskPct', e.target.value)} /></label>
        <label className="field"><span className="lab">Leva</span><input inputMode="decimal" value={r.leverage} onChange={e => upd('leverage', e.target.value)} /></label>
        <label className="field"><span className="lab">Max margine %</span><input inputMode="decimal" value={r.maxMarginPct} onChange={e => upd('maxMarginPct', e.target.value)} /></label>
      </div>
      <div className="kv"><span>Stop suggerito ({direction === 'long' ? 'sotto' : 'sopra'} 1.2 ATR)</span><span className="mono">{fmtPrice(stop)}</span></div>
      <div className="kv"><span>Distanza stop</span><span className="mono">{dist ? `${(dist * 100).toFixed(2)}%` : '—'}</span></div>
      <div className="kv"><span>Posizione (nozionale)</span><span className="mono">{notional ? `${notional.toFixed(0)} USDT` : '—'}</span></div>
      <div className="kv"><span>Quantità</span><span className="mono">{qty ? qty.toPrecision(4) : '—'}</span></div>
      <div className="kv"><span>Margine isolato</span><span className={`mono ${tooBig ? 'down' : ''}`}>{margin ? `${margin.toFixed(1)} USDT` : '—'}</span></div>
      {tooBig && <div className="note down" style={{ marginTop: 6 }}>Il margine supera il {r.maxMarginPct}% del capitale: riduci il rischio o allarga meno lo stop.</div>}
    </div>
  )
}

function Context({ c }) {
  if (!c) return (
    <div className="card"><div className="lab">Contesto</div><div className="note" style={{ marginTop: 6 }}>Non ancora generato: arriva entro qualche ora dal primo avvio e poi si aggiorna ogni settimana.</div></div>
  )
  return (
    <div className="card">
      <div className="row">
        <span className="lab">Contesto della settimana</span>
        <span className={`pill ${c.bias}`}>bias {BIAS[c.bias]}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, margin: '10px 0 4px' }}>{c.headline}</div>
      <p className="body">{c.where}</p>
      {c.stats && (
        <div className="chips" style={{ margin: '8px 0' }}>
          <span className="chip">1 sett {fmtPct(c.stats.ch1w)}</span>
          <span className="chip">1 mese {fmtPct(c.stats.ch1m)}</span>
          <span className="chip">3 mesi {fmtPct(c.stats.ch3m)}</span>
        </div>
      )}
      {c.why?.length > 0 && <><div className="lab" style={{ marginTop: 10 }}>Perché</div><ul className="list">{c.why.map((w, i) => <li key={i}>{w}</li>)}</ul></>}
      {c.biasNote && <><div className="lab" style={{ marginTop: 10 }}>Come sfruttarlo</div><p className="body">{c.biasNote}</p></>}
      {c.watch?.length > 0 && <><div className="lab" style={{ marginTop: 10 }}>Da tenere d'occhio</div><ul className="list">{c.watch.map((w, i) => <li key={i}>{w}</li>)}</ul></>}
      {(c.keyLevels?.support || c.keyLevels?.resistance || c.nextEarnings) && (
        <div style={{ marginTop: 8 }}>
          {c.keyLevels?.support && <div className="kv"><span>Supporto chiave</span><span className="mono">{fmtPrice(c.keyLevels.support)}</span></div>}
          {c.keyLevels?.resistance && <div className="kv"><span>Resistenza chiave</span><span className="mono">{fmtPrice(c.keyLevels.resistance)}</span></div>}
          {c.nextEarnings && <div className="kv"><span>Prossima trimestrale</span><span className="mono" style={{ color: 'var(--warn)' }}>{c.nextEarnings}</span></div>}
        </div>
      )}
      {c.sources?.length > 0 && (
        <div className="note" style={{ marginTop: 10 }}>
          Fonti: {c.sources.map((s, i) => <span key={i}>{i ? ' · ' : ''}<a href={s.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{s.title}</a></span>)}
        </div>
      )}
      <div className="note" style={{ marginTop: 8 }}>
        Aggiornato {dateCH(c.generatedAt)}{c.reason ? ` · ${c.reason}` : ''}{c.pendingUpdate ? ` · in aggiornamento (${c.pendingReason})` : ''}
      </div>
    </div>
  )
}

export default function Asset() {
  const { symbol } = useParams()
  const nav = useNavigate()
  const { watchlist, toggleStar } = useApp()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    const f = () => get(`/api/asset/${symbol}`).then(j => alive && (setD(j), setError(null))).catch(e => alive && setError(e.message))
    f()
    const id = setInterval(f, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [symbol])

  const s = d?.state
  const signal = s?.signal || null
  const levels = s?.levels || null
  // oggetti stabili per il grafico: cambiano solo se cambiano davvero i valori
  const chartSignal = useMemo(() => signal, [JSON.stringify(signal)]) // eslint-disable-line react-hooks/exhaustive-deps
  const chartLevels = useMemo(() => levels, [JSON.stringify(levels)]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !d) return <div className="empty">{error}</div>
  if (!d) return <div className="empty">Carico {symbol}…</div>

  const a = d.asset
  const dir = signal?.direction || s?.direction
  const starred = watchlist.includes(symbol)

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Indietro">←</button>
        <button className="icon-btn" onClick={() => toggleStar(symbol)} style={{ color: starred ? 'var(--warn)' : undefined }}>
          {starred ? '★ In watchlist' : '☆ Segui'}
        </button>
      </div>

      <div className="row">
        <span style={{ fontSize: 26, fontWeight: 800 }}>{a.symbol}</span>
        <span className={`mono ${s?.chgDay >= 0 ? 'up' : 'down'}`} style={{ fontSize: 20 }}>{fmtPct(s?.chgDay)}</span>
      </div>
      <div className="row" style={{ margin: '2px 0 12px' }}>
        <span className="mono muted" style={{ fontSize: 12 }}>
          {a.name} · {fmtPrice(s?.price)}{s?.perp?.price ? ` · perp ${fmtPrice(s.perp.price)}` : ''}
        </span>
        {!a.open ? <span className="pill closed">borsa chiusa</span>
          : signal ? <span className={`pill ${signal.direction}`}>segnale {signal.direction}</span>
          : <span className="pill neutral">nessun segnale</span>}
      </div>

      {signal && (
        <div className={`card ${signal.direction}`}>
          <div className="row">
            <span className="lab" style={{ color: signal.direction === 'long' ? 'var(--long)' : 'var(--short)' }}>{d.typeLabel}</span>
            <span className="mono muted" style={{ fontSize: 12 }}>dalle {timeCH(signal.started_at)} · {ago(signal.started_at)}</span>
          </div>
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="tile"><div className="lab">Forza</div><div className="mono" style={{ fontSize: 16 }}>{s.score}/100</div></div>
            <div className="tile"><div className="lab">Durata stimata</div><div className="mono" style={{ fontSize: 14 }}>{d.duration?.text || '—'}</div></div>
          </div>
          <div className="note" style={{ marginTop: 8 }}>
            Entrata {fmtPrice(signal.entry)} · stop {fmtPrice(signal.stop)}
            {d.duration?.win !== null && d.duration?.win !== undefined ? ` · segnali simili a favore dopo 90 min: ${d.duration.win}% (${d.duration.n})` : ` · ${d.duration?.source || ''}`}
          </div>
        </div>
      )}

      <div className="card">
        <Chart symbol={symbol} kind={a.kind} signal={chartSignal} levels={chartLevels} />
      </div>

      {s && (
        <div className="card">
          <div className="lab" style={{ marginBottom: 4 }}>{signal ? "Perché c'è il segnale" : 'Situazione attuale'} · {dir}</div>
          {s.reasons.map(r => (
            <div className="kv" key={r.key}>
              <span>{r.label}</span>
              <span className="mono" style={{ color: r.ok ? 'var(--long)' : 'var(--text-muted)' }}>{r.value ?? ''} {r.ok ? '✓' : '·'}</span>
            </div>
          ))}
          <div className="kv"><span>Forza complessiva</span><span className="mono">{s.score}/100</span></div>
        </div>
      )}

      <Context c={d.context} />

      {s && <RiskCalc price={s.price} stop={signal?.stop ?? levels?.stop} direction={dir} />}

      <div className="card">
        <div className="lab" style={{ marginBottom: 4 }}>Storico segnali su {symbol}</div>
        {d.symbolStats
          ? <div className="note" style={{ marginBottom: 6 }}>{d.symbolStats.n} segnali chiusi · {d.symbolStats.win}% a favore dopo 90 min · durata media {d.symbolStats.avgMin} min</div>
          : <div className="note">Lo storico si costruisce da solo con il tempo: dopo una decina di segnali le stime di durata diventano statistiche reali.</div>}
        {d.signals.map(x => (
          <div className="kv" key={x.id}>
            <span><span className={`pill ${x.direction}`}>{x.direction}</span> <span className="muted" style={{ fontSize: 12 }}>{dateCH(x.started_at)} {timeCH(x.started_at)}</span></span>
            <span className="mono" style={{ fontSize: 12 }}>
              {x.status === 'active' ? <span className="up">attivo</span> : <span className={x.ret90 > 0 ? 'up' : 'down'}>{x.ret90 >= 0 ? '+' : ''}{x.ret90?.toFixed(2)}%</span>}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
