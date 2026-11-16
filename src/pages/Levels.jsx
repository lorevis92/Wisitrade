// Pagina Livelli: supporti e resistenze (4h e giornaliero), profilo di volume settimanale, Stocastico RSI multi-timeframe
// e commento automatico da regole (shared/levels.js). Solo analisi: nessun ordine, nessun conto.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, CandlestickSeries, BaselineSeries, LineStyle } from 'lightweight-charts'
import { get, post, fmtPrice } from '../lib/api.js'
import { load, save } from '../lib/store.js'
import { readStoch, RSI_DEFAULTS } from '../lib/stochrsi.js'
import { BASE, NAMES, SymbolPicker, TfCard, Summary, BigView, cleanParams } from './Rsi.jsx'
import { buildLevels, narrate } from '@shared/levels.js'

const STOCH_TFS = ['4h', '1h', '15m', '5m', '1m']
const TFS = ['1d', '4h', '1h', '15m', '5m', '1m']
const REFRESH = { '1m': 15000, '5m': 30000, '15m': 60000, '1h': 120000, '4h': 300000, '1d': 600000 }
const short = s => s.replace(/USDT$/, '')
const tzShift = t => Math.floor(t / 1000) - new Date(t).getTimezoneOffset() * 60
const TONE = { interesting: '#00E5C7', watch: '#F5B83D', risk: '#FF5C7A', neutral: '#9AA6C2' }

function LevelsChart({ bars, levels, wp, price, viewKey, height = 420 }) {
  const box = useRef(null)
  const view = useRef({ key: null, range: null })
  useEffect(() => {
    if (!box.current || !bars?.length) return
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#6B7590', fontFamily: 'DM Mono, monospace', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: '#121826' }, horzLines: { color: '#121826' } },
      rightPriceScale: { borderColor: '#1C2233' }, timeScale: { borderColor: '#1C2233', timeVisible: true, rightOffset: 4 },
      handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: true, axisDoubleClickReset: true }, handleScroll: { horzTouchDrag: true, vertTouchDrag: true, mouseWheel: false, pressedMouseMove: true },
    })
    const t = bars.map(b => tzShift(b.t))
    const flat = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }
    const band = (lo, hi, color) => {
      const s = chart.addSeries(BaselineSeries, { ...flat, baseValue: { type: 'price', price: lo }, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: color, topFillColor2: color, bottomFillColor1: 'transparent', bottomFillColor2: 'transparent' })
      s.setData(t.map(x => ({ time: x, value: hi })))
    }
    for (const w of [wp?.cur, wp?.prev].filter(Boolean)) {
      for (const z of w.hvn || []) band(z.lo, z.hi, 'rgba(245,184,61,0.08)')
      for (const z of w.lvn || []) band(z.lo, z.hi, 'rgba(139,124,255,0.08)')
    }
    const cs = chart.addSeries(CandlestickSeries, { upColor: '#00E5C7', downColor: '#FF5C7A', borderVisible: false, wickUpColor: '#00E5C7', wickDownColor: '#FF5C7A' })
    cs.setData(bars.map((b, i) => ({ time: t[i], open: b.o, high: b.h, low: b.l, close: b.c })))
    for (const l of levels || []) {
      const sup = l.p < price, col = sup ? '0,229,199' : '255,92,122'
      cs.createPriceLine({ price: l.p, color: `rgba(${col},${l.strong ? 0.95 : 0.45})`, lineWidth: l.strong ? 2 : 1, lineStyle: l.strong ? LineStyle.Solid : LineStyle.Dashed, title: `${l.strong ? 'forte' : 'debole'} · ${sup ? 'S' : 'R'}`, axisLabelVisible: l.strong })
    }
    // la vista (zoom e scorrimento) resta com'è quando arrivano candele nuove; riparte solo cambiando titolo o timeframe
    const saved = view.current.key === viewKey ? view.current.range : null
    chart.timeScale().setVisibleLogicalRange(saved || { from: Math.max(0, bars.length - 140), to: bars.length + 4 })
    return () => { view.current = { key: viewKey, range: chart.timeScale().getVisibleLogicalRange() }; chart.remove() }
  }, [bars, levels, wp, price, viewKey])
  return <div ref={box} style={{ height }} />
}

// Dati della pagina passati alla chat: gli stessi che si vedono (livelli vicini, stocastico, commento automatico)
function chatContext({ symbol, price, lv, reads, story, b4 }) {
  const r = v => (v === null || v === undefined || !Number.isFinite(+v) ? null : +(+v).toPrecision(6))
  const wk = w => w && { poc: r(w.poc), vah: r(w.vah), val: r(w.val), altoVolume: (w.hvn || []).map(z => [r(z.lo), r(z.hi)]), bassoVolume: (w.lvn || []).map(z => [r(z.lo), r(z.hi)]) }
  return {
    simbolo: symbol, prezzo: r(price), atr4h: r(lv?.atr4h),
    ultime6Candele4h: (b4 || []).slice(-6).map(b => ({ o: r(b.o), h: r(b.h), l: r(b.l), c: r(b.c) })),
    livelli: (lv?.levels || []).map(l => ({ prezzo: r(l.p), zona: [r(l.lo), r(l.hi)], tipo: l.p < price ? 'supporto' : 'resistenza', voto: l.strong ? 'forte' : 'debole', distanzaPct: r((l.p / price - 1) * 100), struttura: l.structure, volume: l.volume })),
    profiloSettimanale: { corrente: wk(lv?.wp?.cur), precedente: wk(lv?.wp?.prev) },
    stocasticoRsi: Object.fromEntries(STOCH_TFS.map(tf => [tf, reads[tf] && { K: r(reads[tf].K), D: r(reads[tf].D), zona: reads[tf].state, incrocio: reads[tf].cross && { verso: reads[tf].cross.dir === 'up' ? 'alto' : 'basso', candeleFa: reads[tf].cross.ago, inZonaEstrema: reads[tf].cross.inZone } }])),
    commentoAutomatico: { titolo: story.headline, testo: story.blocks.map(b => `${b.title}: ${b.text}`), avvisi: story.warnings },
  }
}

// Chat AI: domande libere sul titolo, risposte dal server (/api/levels/chat). Separata dal commento automatico.
function LevelsChat({ symbol, makeContext }) {
  const [authed, setAuthed] = useState(() => !!load('adminCode', ''))
  const [code, setCode] = useState('')
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const box = useRef(null)
  useEffect(() => { setMsgs([]); setErr(null) }, [symbol])
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [msgs, busy])
  const send = async e => {
    e.preventDefault()
    const q = text.trim()
    if (!q || busy) return
    const next = [...msgs, { role: 'user', content: q }]
    setMsgs(next); setText(''); setBusy(true); setErr(null)
    try {
      const j = await post('/api/levels/chat', { symbol, context: makeContext(), messages: next })
      setMsgs(m => [...m, { role: 'assistant', content: j.text + (j.truncated ? '\n\n(risposta interrotta: troppo lunga)' : '') }])
    } catch (x) {
      if (/codice/i.test(x.message)) { save('adminCode', ''); setAuthed(false) }
      setErr(x.message)
      setMsgs(msgs); setText(q) // la domanda torna nella casella per riprovare
    } finally { setBusy(false) }
  }
  const login = async e => {
    e.preventDefault(); save('adminCode', code.trim())
    try { await get('/api/admin/check'); setAuthed(true); setErr(null) } catch (x) { save('adminCode', ''); setErr(x.message) }
  }
  if (!authed) {
    return (
      <form className="card" style={{ padding: 12 }} onSubmit={login}>
        <div className="lab">Chiedi all'AI</div>
        <p className="note" style={{ margin: '6px 0' }}>Domande libere su questo titolo, con i dati della pagina. Ogni risposta usa l'API di Anthropic, quindi serve il codice di controllo.</p>
        <div className="row" style={{ gap: 8 }}>
          <div className="field" style={{ flex: 1, minWidth: 0 }}><input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Codice di controllo" autoComplete="current-password" /></div>
          <button className="btn" style={{ width: 'auto' }} disabled={!code.trim()}>Entra</button>
        </div>
        {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
      </form>
    )
  }
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row"><span className="lab">Chiedi all'AI · {short(symbol)}</span>{msgs.length > 0 && <button className="chip" onClick={() => setMsgs([])}>Nuova chat</button>}</div>
      <div className="lv-chat" ref={box}>
        {!msgs.length && <p className="note">Esempi: “fammi una strategia dato che il prezzo sta scendendo e spiegamela”, “quale livello conta di più adesso?”, “cosa dice lo stocastico sui timeframe grandi?”. Riceve i livelli, lo stocastico e il commento automatico di questo momento.</p>}
        {msgs.map((m, i) => <div key={i} className={`lv-msg ${m.role}`}>{m.content}</div>)}
        {busy && <div className="lv-msg assistant muted">Sto pensando…</div>}
      </div>
      {err && <div className="note down" style={{ marginTop: 6 }}>{err}</div>}
      <form className="lv-chat-input" onSubmit={send}>
        <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Scrivi una domanda…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e) }} />
        <button className="btn" style={{ width: 'auto' }} disabled={busy || !text.trim()}>Invia</button>
      </form>
      <p className="note" style={{ marginTop: 6 }}>Risposte generate dall'AI a scopo informativo, non consulenza finanziaria. Separate dal commento automatico qui sopra, che resta calcolato da regole.</p>
    </div>
  )
}

export default function Levels() {
  const [custom, setCustomRaw] = useState(() => load('levelsCustom', []).filter(s => typeof s === 'string'))
  const [symbol, setSymbolRaw] = useState(() => load('levelsSymbol', BASE[0]))
  const [chartTf, setChartTfRaw] = useState(() => load('levelsTf', '4h'))
  const [data, setData] = useState({})
  const [open, setOpen] = useState(null)
  const params = useMemo(() => cleanParams(load('rsiParams', RSI_DEFAULTS)), [])
  const setCustom = v => { setCustomRaw(v); save('levelsCustom', v) }
  const setSymbol = s => { setSymbolRaw(s); save('levelsSymbol', s) }
  const setChartTf = v => { setChartTfRaw(v); save('levelsTf', v) }
  const symRef = useRef(symbol); symRef.current = symbol

  useEffect(() => {
    setData({})
    const timers = {}, inflight = {}
    const fetchTf = tf => {
      if (inflight[tf] || document.visibilityState === 'hidden') return
      inflight[tf] = true
      get(`/api/${tf === '4h' || tf === '1d' ? 'levels' : 'rsi'}/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}`)
        .then(j => { if (symRef.current === symbol) setData(d => ({ ...d, [tf]: { bars: j.bars, error: null } })) })
        .catch(e => { if (symRef.current === symbol) setData(d => ({ ...d, [tf]: { ...d[tf], error: e.message } })) })
        .finally(() => { inflight[tf] = false })
    }
    TFS.forEach(tf => { fetchTf(tf); timers[tf] = setInterval(() => fetchTf(tf), REFRESH[tf]) })
    const onVis = () => document.visibilityState === 'visible' && TFS.forEach(fetchTf)
    document.addEventListener('visibilitychange', onVis)
    return () => { Object.values(timers).forEach(clearInterval); document.removeEventListener('visibilitychange', onVis) }
  }, [symbol])

  const reads = useMemo(() => Object.fromEntries(STOCH_TFS.map(tf => [tf, data[tf]?.bars?.length ? readStoch(data[tf].bars, params) : null])), [data, params])
  const price = data['1m']?.bars?.at(-1)?.c ?? data['15m']?.bars?.at(-1)?.c ?? null
  const b4 = data['4h']?.bars, b1d = data['1d']?.bars, b1h = data['1h']?.bars
  const lv = useMemo(() => (b4?.length && b1d?.length && b1h?.length && price ? buildLevels({ bars4h: b4, bars1d: b1d, bars1h: b1h, price }) : null), [b4, b1d, b1h, price])
  const story = useMemo(() => narrate({ price, levels: lv?.levels, atr4h: lv?.atr4h, reads, params, bars4h: b4, bars15: data['15m']?.bars, wp: lv?.wp, fmt: fmtPrice }), [price, lv, reads, params, b4, data])
  const err = TFS.map(tf => data[tf]?.error).find(Boolean)

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <div className="lab">Mercato · Livelli</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{short(symbol)}{NAMES[symbol] ? <span className="sec" style={{ fontSize: 14, fontWeight: 600 }}> · {NAMES[symbol]}</span> : null}</div>
        </div>
        <span className="note mono">{price ? fmtPrice(price) : symbol}</span>
      </div>
      <SymbolPicker symbol={symbol} setSymbol={setSymbol} custom={custom} setCustom={setCustom} />
      {err && <div className="warn">Dati non disponibili: {err}</div>}

      <div className="card" style={{ padding: 12 }}>
        <div className="lab">Commento</div>
        <div style={{ color: TONE[story.tone], fontSize: 16, fontWeight: 800, margin: '4px 0 8px', overflowWrap: 'anywhere' }}>{story.headline}</div>
        {story.blocks.map(b => <p key={b.title} style={{ margin: '0 0 8px', lineHeight: 1.5 }}><b>{b.title}.</b> {b.text}</p>)}
        {story.warnings.map((w, i) => <div key={i} className="warn" style={{ marginTop: 6 }}>⚠ {w}</div>)}
        <p className="note" style={{ marginTop: 8 }}>Commento scritto da regole fisse, si aggiorna da solo con le candele. Non è un consiglio di investimento.</p>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="lab">Grafico con i livelli</span>
          <div className="seg" style={{ whiteSpace: 'nowrap' }}>{['4h', '1d'].map(k => <button key={k} className={chartTf === k ? 'on' : ''} onClick={() => setChartTf(k)}>{k === '1d' ? '1 giorno' : '4 ore'}</button>)}</div>
        </div>
        {data[chartTf]?.bars?.length && lv
          ? <LevelsChart bars={data[chartTf].bars} levels={lv.all} wp={lv.wp} price={price} viewKey={symbol + chartTf} />
          : <div className="empty" style={{ padding: '80px 10px' }}>Carico le candele…</div>}
        <p className="note">Rotella, pizzico o trascinando la scala dei prezzi per ingrandire; doppio clic sulla scala per tornare alla vista automatica. Linea piena = livello forte (struttura + volume), tratteggiata = debole. Verde sotto il prezzo (supporto), rossa sopra (resistenza). Fasce gialle = zone ad alto volume, viola = basso volume (settimana in corso e precedente).</p>
      </div>

      {lv && (
        <div className="card" style={{ padding: 12 }}>
          <div className="lab">Livelli vicini</div>
          <div className="lv-list">
            {lv.levels.map((l, i) => (
              <div key={i} className="lv-item">
                <div className="lv-head mono">
                  <b>{fmtPrice(l.p)}</b>
                  <span className={l.p < price ? 'up' : 'down'}>{l.p < price ? 'supporto' : 'resistenza'}</span>
                  <span style={{ color: l.strong ? '#F5B83D' : '#6B7590' }}>{l.strong ? 'forte' : 'debole'}</span>
                  <span className="sec">{((l.p / price - 1) * 100 >= 0 ? '+' : '')}{((l.p / price - 1) * 100).toFixed(2)}%</span>
                </div>
                <div className="note">{[l.structure && `Struttura: ${l.structure}`, l.volume && `volume: ${l.volume}`].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <LevelsChat symbol={symbol} makeContext={() => chatContext({ symbol, price, lv, reads, story, b4 })} />

      <Summary reads={reads} tfs={STOCH_TFS} />
      <div className="rsi-grid">
        {STOCH_TFS.map(tf => <TfCard key={symbol + tf} tf={tf} entry={data[tf]} read={reads[tf]} params={params} onOpen={() => setOpen(tf)} />)}
      </div>
      <p className="note">Livelli di struttura: massimi e minimi di swing a 4 ore e giornalieri toccati almeno 3 volte (4h, circa 5 mesi di storico) o 2 (giornaliero, circa 1 anno e mezzo); un tocco è un massimo/minimo di swing o uno stoppino che entra nel livello e chiude fuori, con tolleranza di circa 0,3 ATR. Profilo di volume della settimana in corso e della precedente come nella pagina Range. Stocastico con le impostazioni della pagina RSI.</p>
      {open && <BigView symbol={symbol} tf={open} entry={data[open]} read={reads[open]} params={params} onClose={() => setOpen(null)} />}
    </div>
  )
}
