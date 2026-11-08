// Parti della pagina Strategia usate da Prova, Reale e Simulazione: regole e impostazioni salvate.
import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../lib/api.js'
import { OPTIONS, LABELS, ORB_SYMBOLS, normalizeSettings } from '@shared/opening.js'

export const TOP10 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NFLX', 'NVDA', 'META', 'TSLA', 'AMD', 'PLTR']
export const num = v => String(v).replace('.', ',')
export const lab = (k, v) => LABELS[k]?.[v] ?? null
export const dayFmt = (d, o = { weekday: 'short', day: '2-digit', month: '2-digit' }) => new Date(d + 'T12:00:00Z').toLocaleDateString('it-CH', o)
export const hm = t => new Date(t).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })

export function Select({ label, value, options, onChange, fmt, hint }) {
  const opts = options.includes(value) || value === undefined ? options : [...options, value].sort((a, b) => (typeof a === 'number' ? (a || 1e9) - (b || 1e9) : 0))
  return (
    <label className="field">
      <span className="lab">{label}</span>
      <select value={String(value)} onChange={e => onChange(isNaN(+e.target.value) ? e.target.value : +e.target.value)}>
        {opts.map(o => <option key={o} value={String(o)}>{fmt ? fmt(o) : o}</option>)}
      </select>
      {hint && <span className="note">{hint}</span>}
    </label>
  )
}

// Regole della strategia (sezione richiudibile)
export function RulesCard({ s, set, showFee, feeLabel = 'Commissione per lato (Prova)' }) {
  const symSet = new Set(s.symbols)
  const toggleSym = x => set('symbols', symSet.has(x) ? s.symbols.filter(y => y !== x) : [...s.symbols, x])
  return (
    <details className="card">
      <summary className="lab" style={{ cursor: 'pointer' }}>Regole della strategia · tocca per modificare</summary>
      <div className="grid2" style={{ marginTop: 12, alignItems: 'start' }}>
        <Select label="Segnale: movimento dall'apertura" value={s.movePct} options={OPTIONS.movePct} fmt={v => `${num(v)}% (entrata a ${num(+(v * 1.25).toFixed(3))}%)`} onChange={v => set('movePct', v)} />
        <Select label="Stop loss" value={s.sl} options={OPTIONS.sl} fmt={v => lab('sl', v) || num(v)} onChange={v => set('sl', v)} />
        <Select label="In guadagno: stop che segue" value={s.trail} options={OPTIONS.trail} fmt={v => lab('trail', v) || num(v)} onChange={v => set('trail', v)} />
        <Select label="Protezione guadagno" value={s.giveback} options={OPTIONS.giveback} fmt={v => lab('giveback', v) || num(v)} onChange={v => set('giveback', v)} />
        <Select label="Spazio dal livello più vicino" value={s.room} options={OPTIONS.room} fmt={v => lab('room', v) || num(v)} onChange={v => set('room', v)} />
        <Select label="Trade fermi dopo 60 min" value={s.stale} options={OPTIONS.stale} fmt={v => lab('stale', v)} onChange={v => set('stale', v)} />
        {showFee && <Select label={feeLabel} value={s.fee} options={OPTIONS.fee} fmt={v => `${num(v)}%`} onChange={v => set('fee', v)} />}
      </div>
      <div className="lab" style={{ marginTop: 14 }}>Uscite da testare · spente di default</div>
      <div className="grid2" style={{ marginTop: 6, alignItems: 'start' }}>
        <Select label="Nessun progresso: dopo" value={s.npMin} options={OPTIONS.npMin} fmt={v => lab('npMin', v) || `${v} minuti`} onChange={v => set('npMin', v)}
          hint="chiudi se il trade non ha mai raggiunto il guadagno minimo" />
        {s.npMin > 0 && <Select label="Guadagno minimo" value={s.npUnits} options={OPTIONS.npUnits} fmt={v => `${num(v)} unità`} onChange={v => set('npUnits', v)} />}
        <Select label="Metà subito: a guadagno" value={s.halfAt} options={OPTIONS.halfAt} fmt={v => lab('halfAt', v) || `+${num(v)} unità`} onChange={v => set('halfAt', v)}
          hint="chiudi metà posizione e porta lo stop del resto al prezzo d'entrata" />
      </div>
      <div className="lab" style={{ marginTop: 14 }}>Indice di attività del mercato · spento di default</div>
      <div className="grid2" style={{ marginTop: 6, alignItems: 'start' }}>
        <Select label="Regola dell'indice" value={s.idxMode} options={OPTIONS.idxMode} fmt={v => lab('idxMode', v)} onChange={v => set('idxMode', v)}
          hint="indice da 0 a 100 alle 9:35 di New York; con la regola attiva si entra dalle 9:35" />
        {s.idxMode !== 'off' && <Select label={s.idxMode === 'min' ? 'Opera solo se l\'indice è almeno' : 'Sotto questo indice'} value={s.idxMin} options={OPTIONS.idxMin} fmt={v => String(v)} onChange={v => set('idxMin', v)} />}
        {s.idxMode === 'reduce' && <Select label="…usa solo" value={s.idxPos} options={OPTIONS.idxPos} fmt={v => `${v} ${v === 1 ? 'posizione' : 'posizioni'}`} onChange={v => set('idxPos', v)} />}
      </div>
      <div className="lab" style={{ marginTop: 14 }}>Liquidazione · margine isolato</div>
      <div className="grid2" style={{ marginTop: 6, alignItems: 'start' }}>
        <Select label="Stop oltre la liquidazione" value={s.liqGuard ? 'on' : 'off'} options={['on', 'off']} fmt={v => (v === 'on' ? 'non aprire il trade' : 'apri comunque')}
          onChange={v => set('liqGuard', v === 'on')} hint="nel Reale non si apre mai, qualunque sia la scelta" />
        <Select label="Margine di mantenimento" value={s.mmr} options={OPTIONS.mmr} fmt={v => `${num(v)}%`} onChange={v => set('mmr', v)}
          hint="usato solo se Bitunix non lo fornisce per quel titolo" />
        <Select label="Commissione di liquidazione" value={s.liqFee} options={OPTIONS.liqFee} fmt={v => `${num(v)}%`} onChange={v => set('liqFee', v)}
          hint="del valore della posizione" />
      </div>
      <div className="lab" style={{ marginTop: 14 }}>Titoli · {s.symbols.length} scelti</div>
      <div className="chips" style={{ marginTop: 6 }}>
        {ORB_SYMBOLS.map(x => <button key={x} className={`chip ${symSet.has(x) ? 'active' : ''}`} onClick={() => toggleSym(x)}>{x}</button>)}
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        <button className="chip" onClick={() => set('symbols', ORB_SYMBOLS)}>tutti</button>
        <button className="chip" onClick={() => set('symbols', [])}>nessuno</button>
        <button className="chip" onClick={() => set('symbols', TOP10)}>i 10 principali</button>
      </div>
      <p className="note" style={{ marginTop: 10 }}>Unità di volatilità = la più grande tra l'ATR delle candele da 15 minuti e l'escursione media della prima candela dei giorni precedenti. Finché il guadagno non supera mezza unità resta solo lo stop loss.</p>
    </details>
  )
}

// Impostazioni salvate con un nome, in Supabase: le stesse per Prova, Reale e Simulazione
export function PresetsCard({ current, onLoad }) {
  const [data, setData] = useState(null)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [armDel, setArmDel] = useState(null)

  const refresh = useCallback(() => get('/api/presets').then(setData).catch(e => setMsg(e.message)), [])
  useEffect(() => { refresh() }, [refresh])

  const act = async (fn, ok) => {
    setBusy(true); setMsg(null)
    try { await fn(); await refresh(); if (ok) setMsg(ok) } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const same = p => JSON.stringify(normalizeSettings(p.settings)) === JSON.stringify(normalizeSettings(current))
  const list = data?.presets || []

  return (
    <details className="card">
      <summary className="lab" style={{ cursor: 'pointer' }}>Impostazioni salvate · {list.length} {list.length === 1 ? 'versione' : 'versioni'}</summary>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Nome, es. stop 1,25 leva 8x" style={{ fontFamily: 'var(--font-ui)' }} />
        </div>
        <button className="btn" style={{ width: 'auto' }} disabled={busy || !name.trim()}
          onClick={() => act(() => post('/api/presets', { name: name.trim(), settings: current }).then(() => setName('')), 'Impostazioni salvate.')}>Salva</button>
      </div>
      <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy || !data}
        onClick={() => { onLoad(data.defaults, 'default'); setMsg(data.defaultId ? 'Caricate le impostazioni di default (la versione scelta come default).' : 'Caricate le impostazioni di default.') }}>
        Ripristina impostazioni di default
      </button>
      {msg && <div className="note" style={{ marginTop: 6, color: 'var(--warn)' }}>{msg}</div>}
      {list.length > 0 && <div style={{ marginTop: 10 }}>
        {list.map(p => (
          <div key={p.id} className="preset">
            <button className="preset-main" disabled={busy} onClick={() => { onLoad(normalizeSettings(p.settings), p.name); setMsg(`Caricata "${p.name}".`) }}>
              <b>{p.name}</b>{p.is_default && <span className="pill long" style={{ marginLeft: 6 }}>default</span>}{same(p) && <span className="pill neutral" style={{ marginLeft: 6 }}>in uso</span>}
              <span className="note" style={{ display: 'block' }}>{new Date(p.created_at).toLocaleString('it-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })} · leva {p.settings.leverage}x · stop {num(p.settings.sl)} · segue {num(p.settings.trail)} · {p.settings.symbols?.length ?? 0} titoli{p.settings.slip !== undefined ? ` · slitt. ${num(p.settings.slip)}%` : ''}</span>
            </button>
            <div className="preset-actions">
              <button className="chip" disabled={busy} onClick={() => act(() => post('/api/presets/default', { id: p.is_default ? null : p.id }), p.is_default ? 'Tornato al default originale.' : `"${p.name}" è il nuovo default.`)}>{p.is_default ? 'togli default' : 'default'}</button>
              <button className="chip" disabled={busy} style={armDel === p.id ? { color: 'var(--short)', borderColor: 'var(--short-border)' } : null}
                onClick={() => { if (armDel !== p.id) { setArmDel(p.id); return } setArmDel(null); act(() => post('/api/presets/delete', { id: p.id }), 'Eliminata.') }}>{armDel === p.id ? 'confermi?' : 'elimina'}</button>
            </div>
          </div>
        ))}
      </div>}
      <p className="note" style={{ marginTop: 8 }}>Tocca una versione per caricarla. Le versioni sono le stesse in Prova, Reale e Simulazione; in Prova e Reale diventano attive solo dopo Salva.</p>
    </details>
  )
}
