// Parti della pagina Strategia usate da Prova, Reale e Simulazione: regole e impostazioni salvate.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { get, post } from '../lib/api.js'
import { OPTIONS, LABELS, ORIGINAL_SYMBOLS, NEW_SYMBOLS, LOW_LIQ_SYMBOLS, LEV_SYMBOLS, normalizeSettings } from '@shared/opening.js'
import { ASSET_MAP } from '@shared/assets.js'

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

// Scelta dei titoli: tre gruppi (originali, nuovi, bassa liquidità), pulsanti di gruppo e ricerca per simbolo o nome
const GROUPS = [
  { key: 'orig', title: 'Originali', list: ORIGINAL_SYMBOLS },
  { key: 'new', title: 'Nuovi', list: NEW_SYMBOLS },
  { key: 'low', title: 'Bassa liquidità', list: LOW_LIQ_SYMBOLS, note: 'volume medio sotto 100.000 USDT al giorno: slittamento probabilmente più alto' },
  { key: 'lev', title: 'ETF a leva', list: LEV_SYMBOLS, note: 'ETF 2x, 3x, inversi e VIX: si muovono 2–3 volte il titolo di riferimento, quindi la soglia del movimento scatta molto più facilmente; sono doppioni dei titoli originali' },
]
const ALL_SYMBOLS = GROUPS.flatMap(g => g.list)
const nameOf = x => ASSET_MAP[x]?.name || x
const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function SymbolPicker({ symbols, onChange }) {
  const [query, setQuery] = useState('')
  const sel = useMemo(() => new Set(symbols), [symbols])
  const q = norm(query.trim())
  const match = x => !q || norm(x).includes(q) || norm(nameOf(x)).includes(q)
  const toggle = x => onChange(sel.has(x) ? symbols.filter(y => y !== x) : [...symbols, x])
  const shown = ALL_SYMBOLS.filter(match)
  const count = list => list.filter(x => sel.has(x)).length
  const chip = x => (
    <button key={x} title={nameOf(x)} className={`chip ${sel.has(x) ? 'active' : ''} ${LOW_LIQ_SYMBOLS.includes(x) || LEV_SYMBOLS.includes(x) ? 'low' : ''}`} onClick={() => toggle(x)}>{x}</button>
  )
  return (
    <>
      <div className="lab" style={{ marginTop: 14 }}>Titoli · {count(ALL_SYMBOLS)} scelti su {ALL_SYMBOLS.length}</div>
      <div className="chips" style={{ marginTop: 6 }}>
        <button className="chip" onClick={() => onChange(ALL_SYMBOLS)}>tutti</button>
        <button className="chip" onClick={() => onChange([])}>nessuno</button>
        <button className="chip" onClick={() => onChange(ORIGINAL_SYMBOLS)}>i {ORIGINAL_SYMBOLS.length} originali</button>
        <button className="chip" onClick={() => onChange(NEW_SYMBOLS)}>solo i nuovi</button>
        <button className="chip" onClick={() => onChange(LOW_LIQ_SYMBOLS)}>solo bassa liquidità</button>
        <button className="chip" onClick={() => onChange(LEV_SYMBOLS)}>solo ETF a leva</button>
        <button className="chip" onClick={() => onChange(TOP10)}>i 10 principali</button>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca per simbolo o nome, es. NVDA o Nvidia" style={{ fontFamily: 'var(--font-ui)' }} />
      </div>
      {q && <div className="chips" style={{ marginTop: 6 }}>
        <span className="note" style={{ alignSelf: 'center' }}>{shown.length} trovati</span>
        {shown.length > 0 && <button className="chip" onClick={() => onChange([...new Set([...symbols, ...shown])])}>aggiungi questi</button>}
        {shown.length > 0 && <button className="chip" onClick={() => onChange(symbols.filter(x => !shown.includes(x)))}>togli questi</button>}
      </div>}
      {GROUPS.map(g => {
        const list = g.list.filter(match)
        if (!list.length) return null
        return (
          <details key={g.key} className="symgroup" open={!!q || g.key === 'orig'}>
            <summary><span>{g.title}</span> <span className="note">{count(g.list)}/{g.list.length} scelti</span></summary>
            {g.note && <div className="note" style={{ margin: '2px 0 6px' }}>{g.note}</div>}
            <div className="chips">{list.map(chip)}</div>
          </details>
        )
      })}
      {q && !shown.length && <div className="note" style={{ marginTop: 6 }}>Nessun titolo trovato.</div>}
    </>
  )
}

// Regole della strategia (sezione richiudibile)
export function RulesCard({ s, set, showFee, feeLabel = 'Commissione per lato (Prova)', sim = false }) {
  return (
    <details className="card">
      <summary className="lab" style={{ cursor: 'pointer' }}>Regole della strategia · tocca per modificare</summary>
      <div className="grid2" style={{ marginTop: 12, alignItems: 'start' }}>
        <Select label="Segnale: movimento dall'apertura" value={s.movePct} options={OPTIONS.movePct} fmt={v => `${num(v)}% (entrata a ${num(+(v * 1.25).toFixed(3))}%)`} onChange={v => set('movePct', v)} />
        <Select label="Stop loss" value={s.sl} options={OPTIONS.sl} fmt={v => lab('sl', v) || num(v)} onChange={v => set('sl', v)} />
        <Select label="In guadagno: stop che segue" value={s.trail} options={OPTIONS.trail} fmt={v => lab('trail', v) || num(v)} onChange={v => set('trail', v)} />
        <Select label="Protezione guadagno" value={s.giveback} options={OPTIONS.giveback} fmt={v => lab('giveback', v) || num(v)} onChange={v => set('giveback', v)} />
        <Select label="Spazio dal livello più vicino" value={s.room} options={OPTIONS.room} fmt={v => lab('room', v) || num(v)} onChange={v => set('room', v)} />
        <Select label="Finestra d'entrata" value={s.entryWin} options={OPTIONS.entryWin} fmt={v => `primi ${v} minuti`} onChange={v => set('entryWin', v)} />
        <Select label="Trade fermi dopo 60 min" value={s.stale} options={OPTIONS.stale} fmt={v => lab('stale', v)} onChange={v => set('stale', v)} />
        {showFee && <Select label={feeLabel} value={s.fee} options={OPTIONS.fee} fmt={v => `${num(v)}%`} onChange={v => set('fee', v)} />}
      </div>
      <div className="grid2" style={{ marginTop: 6, alignItems: 'start' }}>
        <Select label="Segnali nello stesso minuto" value={s.pick} options={OPTIONS.pick} fmt={v => lab('pick', v)} onChange={v => set('pick', v)}
          hint="quale titolo prendere quando i posti liberi del giorno non bastano" />
      </div>
      <div className="lab" style={{ marginTop: 14 }}>Limiti di perdita e freno · in % del capitale</div>
      <div className="grid2" style={{ marginTop: 6, alignItems: 'start' }}>
        <Select label="Perdita massima giornaliera" value={s.maxDayLoss} options={OPTIONS.maxDayLoss} fmt={v => (v ? `${num(v)}%` : 'spenta')} onChange={v => set('maxDayLoss', v)}
          hint="trade chiusi di oggi: superata, niente nuovi trade fino a domani (le posizioni aperte restano)" />
        <Select label="Freno di mercato: chiudi tutto" value={s.brakePct} options={OPTIONS.brakePct} fmt={v => (v ? `oltre il ${num(v)}%` : 'spento')} onChange={v => set('brakePct', v)}
          hint="trade chiusi + posizioni aperte di oggi: superata, chiude subito tutte le posizioni e niente nuovi trade fino a domani" />
        <Select label="Perdita massima totale" value={s.maxTotalLoss} options={OPTIONS.maxTotalLoss} fmt={v => (v ? `${num(v)}% dalla partenza` : 'spenta')} onChange={v => set('maxTotalLoss', v)}
          hint={sim ? 'superata, la simulazione non apre più trade fino alla fine' : 'superata, la strategia si ferma finché non la riavvii (con capitale dedicato)'} />
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
      <SymbolPicker symbols={s.symbols} onChange={v => set('symbols', v)} />
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
  const [exists, setExists] = useState(null) // { name, activeIn }: stesso nome già salvato, serve conferma

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
          onClick={() => act(async () => {
            const r = await post('/api/presets', { name: name.trim(), settings: current })
            if (r.exists) { setExists({ name: name.trim(), activeIn: r.activeIn || [] }); return }
            setName('')
          }, null)}>Salva</button>
      </div>
      {exists && (
        <div className="warn">
          Esiste già un'impostazione salvata "{exists.name}".
          {exists.activeIn.length > 0 && <> <b>È quella attiva in {exists.activeIn.join(' e ')}.</b> Sovrascriverla non cambia {exists.activeIn.join(' né ')}: cambiano solo se premi Salva nella loro pagina.</>}
          {' '}Vuoi sovrascriverla?
          <div className="chips" style={{ marginTop: 6 }}>
            <button className="chip" disabled={busy} onClick={() => act(() => post('/api/presets', { name: exists.name, settings: current, overwrite: true }).then(() => { setName(''); setExists(null) }), `"${exists.name}" sovrascritta.`)}>Sì, sovrascrivi</button>
            <button className="chip" onClick={() => setExists(null)}>No</button>
          </div>
        </div>
      )}
      <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy || !data}
        onClick={() => { onLoad(data.defaults, 'default'); setMsg(data.defaultId ? 'Caricate le impostazioni di default (la versione scelta come default).' : 'Caricate le impostazioni di default.') }}>
        Ripristina impostazioni di default
      </button>
      {msg && <div className="note" style={{ marginTop: 6, color: 'var(--warn)' }}>{msg}</div>}
      {list.length > 0 && <div style={{ marginTop: 10 }}>
        {list.map(p => (
          <div key={p.id} className="preset">
            <button className="preset-main" disabled={busy} onClick={() => { onLoad(normalizeSettings(p.settings), p.name, p.id); setMsg(`Caricata "${p.name}".`) }}>
              <b>{p.name}</b>{p.is_default && <span className="pill long" style={{ marginLeft: 6 }}>default</span>}{data?.active?.live?.presetId === p.id && <span className="pill short" style={{ marginLeft: 6 }}>attiva nel Reale</span>}{same(p) && <span className="pill neutral" style={{ marginLeft: 6 }}>in uso</span>}
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
      <p className="note" style={{ marginTop: 8 }}>Tocca una versione per caricarla in questa scheda. Simulazione, Prova e Reale hanno impostazioni separate: caricare o cambiare una versione salvata non cambia Prova o Reale finché non premi Salva nella loro pagina.</p>
    </details>
  )
}

// ---------- Margine per trade, posizioni al giorno ed esposizione ----------
// Margine da 1% a 100% del capitale a passi di 0,5% (campo numerico e cursore)
export function MarginField({ s, set, sz }) {
  const v = s.marginPct
  const put = x => set('marginPct', x === '' ? '' : Math.min(100, Math.max(1, Math.round(+x * 2) / 2)))
  return (
    <label className="field">
      <span className="lab">Margine per trade</span>
      <div className="input-suffix"><input type="number" inputMode="decimal" min="1" max="100" step="0.5" value={v} onChange={e => set('marginPct', e.target.value === '' ? '' : +e.target.value)} onBlur={e => put(e.target.value || 10)} /><span>% del capitale</span></div>
      <input type="range" min="1" max="100" step="0.5" value={+v || 1} onChange={e => put(e.target.value)} className="range" />
      <span className="note">= <b className="mono" style={{ color: 'var(--text)' }}>{fmtUsdLocal(sz.margin)} USDT</b> a trade</span>
    </label>
  )
}

export function PositionsField({ s, set }) {
  return <Select label="Posizioni al giorno" value={s.maxPos} options={OPTIONS.maxPos} fmt={v => lab('maxPos', v) || `massimo ${v}`} onChange={v => set('maxPos', v)} />
}

// Riepilogo: margine a trade, valore della posizione, esposizione massima e avviso sul minimo di Bitunix.
// mins = { SIMBOLO: valore minimo di un ordine in USDT (quantità minima × prezzo) }
export function ExposureInfo({ s, sz, mins }) {
  const pos = s.maxPos > 0 ? s.maxPos : null
  const expo = pos ? sz.notional * pos : null
  const marginTot = pos ? sz.margin * pos : null
  const cap = sz.capital || 0
  const under = mins ? (s.symbols || []).filter(x => mins[x] && sz.notional < mins[x] * 1.05) : []
  return (
    <div className="card" style={{ padding: '10px 14px', marginTop: 10 }}>
      <div className="kv" style={{ borderTop: 0 }}><span className="sec">Margine a trade</span><span className="mono">{fmtUsdLocal(sz.margin)} USDT ({num(s.marginPct)}%)</span></div>
      <div className="kv"><span className="sec">Valore della posizione</span><span className="mono">{fmtUsdLocal(sz.notional)} USDT ({s.leverage}x)</span></div>
      <div className="kv"><span className="sec">Esposizione massima (margine × leva × posizioni)</span><span className="mono">{expo !== null ? `${fmtUsdLocal(expo, 0)} USDT · ${cap > 0 ? Math.round(expo / cap * 100) : '—'}% del capitale` : 'senza limite di posizioni'}</span></div>
      <div className="kv"><span className="sec">Margine impegnato con tutte le posizioni aperte</span><span className="mono">{marginTot !== null ? `${fmtUsdLocal(marginTot, 0)} USDT · ${cap > 0 ? Math.round(marginTot / cap * 100) : '—'}% del capitale` : '—'}</span></div>
      {marginTot !== null && cap > 0 && marginTot > cap * 1.0001 && <div className="note" style={{ color: 'var(--warn)' }}>Con tutte le posizioni aperte insieme il margine supererebbe il capitale: nel Reale le ultime si salterebbero per saldo insufficiente (la Simulazione non lo considera).</div>}
      {under.length > 0 && <div className="warn">Con {fmtUsdLocal(sz.notional)} USDT a posizione, {under.length} titoli su {s.symbols.length} sono sotto o vicini al minimo di Bitunix e nel Reale verrebbero saltati: {under.slice(0, 12).join(', ')}{under.length > 12 ? '…' : ''}.</div>}
    </div>
  )
}
const fmtUsdLocal = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('it-CH', { minimumFractionDigits: d, maximumFractionDigits: d }))

// Valore minimo di un ordine per titolo (dal server, una volta per pagina)
let minsCache = null
export function useMins() {
  const [mins, setMins] = useState(minsCache)
  useEffect(() => { if (!minsCache) get('/api/minnotional').then(r => { minsCache = r.mins; setMins(r.mins) }).catch(() => {}) }, [])
  return mins
}
