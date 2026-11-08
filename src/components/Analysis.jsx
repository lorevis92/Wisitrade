// Sezione "Analisi" della Simulazione: tabelle sui trade e sui giorni della simulazione appena fatta.
// Tutti i valori sono calcolati sul server con i soli dati noti in quel minuto (shared/analysis.js).
import { useMemo, useState } from 'react'
import { fmtSigned } from '../lib/api.js'
import { MOMENTS, quartiles, toCsv } from '@shared/analysis.js'

const n2 = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','))
const pctOf = (a, b) => (b ? Math.round(a / b * 100) : 0)
const avg = (xs, f) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : 0)

const GAIN_BANDS = [['sotto −0,5', g => g < -0.5], ['da −0,5 a 0', g => g >= -0.5 && g < 0], ['da 0 a +0,5', g => g >= 0 && g <= 0.5], ['sopra +0,5', g => g > 0.5]]
const MAE_BANDS = [['meno di −0,25', x => x > -0.25], ['da −0,25 a −0,5', x => x <= -0.25 && x > -0.5], ['da −0,5 a −1', x => x <= -0.5 && x > -1], ['oltre −1', x => x <= -1]]

const DAY_IND = [
  ['breadth', 'Titoli nella stessa direzione', v => `${n2(v, 0)}%`],
  ['absMove', 'Movimento medio dei titoli', v => `${n2(v)}%`],
  ['vol5', 'Volume primi 5 minuti / normale', v => `${n2(v)}×`],
  ['qqqMove', 'Movimento QQQ', v => `${n2(v)}%`],
  ['qqqVol', 'Volume QQQ / normale', v => `${n2(v)}×`],
  ['spyMove', 'Movimento SPY', v => `${n2(v)}%`],
  ['spyVol', 'Volume SPY / normale', v => `${n2(v)}×`],
  ['gap', 'Gap medio dalla chiusura di ieri', v => `${n2(v)}%`],
  ['volat', 'Volatilità 5 giorni / 20 giorni', v => `${n2(v)}×`],
  ['btc1h', 'BTC nell\'ultima ora', v => `${n2(v)}%`],
]
const TRADE_IND = [
  ['volPre', 'Volume prima del segnale / normale', v => `${n2(v)}×`],
  ['minutes', 'Minuti dall\'apertura', v => `${n2(v, 0)} min`],
  ['speed', 'Velocità del movimento', v => `${n2(v, 3)}%/min`],
  ['gap', 'Gap del titolo (+ = a favore)', v => `${n2(v)}%`],
]

const CROWD = { stessa: 'con la maggioranza', contro: 'contro la maggioranza', pari: 'titoli in parità', nd: 'n/d (segnale nel primo minuto)' }

function Tbl({ head, rows }) {
  return (
    <div className="table-wrap" style={{ marginTop: 6 }}>
      <table className="tbl">
        <thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? 'sec' : c?.cls}>{c?.v ?? c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
const money = v => ({ v: `${fmtSigned(v)}`, cls: v >= 0 ? 'up' : 'down' })

// Risultati di un gruppo di trade
const tradeCells = list => [list.length, `${pctOf(list.filter(t => t.pnl > 0).length, list.length)}%`, money(avg(list, t => t.pnl)), { v: `${fmtSigned(avg(list, t => t.pct))}%`, cls: avg(list, t => t.pct) >= 0 ? 'up' : 'down' }]
// Risultati di un gruppo di giorni
const dayCells = list => {
  const n = list.reduce((s, d) => s + d.n, 0), pnl = list.reduce((s, d) => s + d.pnl, 0)
  return [list.length, money(n ? pnl / n : 0), `${pctOf(list.filter(d => d.pnl > 0).length, list.length)}%`, n]
}

function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const dayCols = [
  ['giorno', d => d.day], ['operazioni', d => d.n], ['vinte', d => d.wins], ['risultato_usdt', d => d.pnl], ['risultato_pct', d => d.pct], ['saldo', d => d.balance],
  ...DAY_IND.map(([k]) => [k, d => d.ctx?.[k]]), ['direzione_prevalente', d => (d.ctx ? (d.ctx.breadthDir > 0 ? 'su' : 'giù') : null)],
]
const tradeCols = [
  ['id', t => t.id], ['giorno', t => t.day], ['titolo', t => t.symbol], ['tipo', t => (t.side > 0 ? 'long' : 'short')],
  ['entrata_ora', t => new Date(t.opened_at).toISOString()], ['uscita_ora', t => new Date(t.closed_at).toISOString()],
  ['entrata', t => t.entry], ['uscita', t => t.exit], ['stop', t => t.stop], ['liquidazione', t => t.liq], ['motivo', t => t.reason],
  ['risultato_usdt', t => t.pnl], ['risultato_pct', t => t.pct], ['commissioni', t => t.fees], ['funding', t => t.funding], ['slittamento', t => t.slip],
  ['margine', t => t.margin], ['leva', t => t.leverage], ['unita', t => t.unit], ['meta_chiusa_a', t => t.half?.px],
  ...MOMENTS.flatMap(m => [[`guadagno_${m}min_unita`, t => t.states?.[m]?.g], [`max_perdita_${m}min_unita`, t => t.states?.[m]?.mae]]),
  ...TRADE_IND.map(([k]) => [`trade_${k}`, t => t.ctx?.[k]]), ['trade_con_maggioranza', t => t.ctx?.crowd],
  ...DAY_IND.map(([k]) => [`giorno_${k}`, t => t.dctx?.[k]]),
]

export default function Analysis({ r }) {
  const [mom, setMom] = useState(15)
  const dayByDate = useMemo(() => Object.fromEntries(r.daily.map(d => [d.day, d])), [r])
  const trades = useMemo(() => r.trades.map(t => ({ ...t, dctx: dayByDate[t.day]?.ctx || null })), [r, dayByDate])
  const days = useMemo(() => r.daily.filter(d => d.n > 0), [r])
  if (!trades.length) return null

  const atMom = trades.filter(t => t.states?.[mom])
  const crowd = ['stessa', 'contro', 'pari', null].map(c => [c, trades.filter(t => (t.ctx?.crowd ?? null) === c)]).filter(([, l]) => l.length)
  const stamp = `${r.firstDay}_${r.lastDay}`

  return (
    <>
      <div className="lab section-title row">
        <span>Analisi</span>
        <span className="chips" style={{ margin: 0 }}>
          <button className="chip" onClick={() => download(`trade_${stamp}.csv`, toCsv(tradeCols, trades))}>Esporta CSV trade</button>
          <button className="chip" onClick={() => download(`giorni_${stamp}.csv`, toCsv(dayCols, r.daily))}>Esporta CSV giorni</button>
        </span>
      </div>
      <p className="note" style={{ marginTop: -4 }}>Sui trade e sui giorni della simulazione appena fatta. Ogni valore usa solo quello che si sapeva in quel minuto. Gruppi da 4 con lo stesso numero di giorni o di trade; risultato medio per trade in USDT.</p>

      <details className="card" open>
        <summary className="lab" style={{ cursor: 'pointer' }}>Cosa dice il trade nei primi minuti</summary>
        <div className="chips" style={{ marginTop: 10 }}>
          {MOMENTS.map(m => <button key={m} className={`chip ${mom === m ? 'active' : ''}`} onClick={() => setMom(m)}>{m} min</button>)}
        </div>
        <div className="note" style={{ marginTop: 6 }}>A {mom} minuti dall'entrata erano ancora aperti {atMom.length} trade su {trades.length}. Valori in unità di volatilità.</div>
        <div className="lab" style={{ marginTop: 10 }}>Guadagno in quel momento</div>
        <Tbl head={['Fascia', 'Trade', 'Vincono alla fine', 'Risultato medio', '% medio']}
          rows={GAIN_BANDS.map(([l, f]) => [l, ...tradeCells(atMom.filter(t => f(t.states[mom].g)))])} />
        <div className="lab" style={{ marginTop: 10 }}>Massima perdita toccata fino a quel momento</div>
        <Tbl head={['Fascia', 'Trade', 'Vincono alla fine', 'Risultato medio', '% medio']}
          rows={MAE_BANDS.map(([l, f]) => [l, ...tradeCells(atMom.filter(t => f(t.states[mom].mae)))])} />
      </details>

      <details className="card">
        <summary className="lab" style={{ cursor: 'pointer' }}>Cosa distingue le giornate buone · alle 9:35 di New York</summary>
        {DAY_IND.map(([k, label, fmt]) => {
          const g = quartiles(days, d => d.ctx?.[k])
          return (
            <div key={k} style={{ marginTop: 12 }}>
              <div className="lab">{label}</div>
              {g.length ? <Tbl head={['Gruppo', 'Giorni', 'Medio per trade', 'Giorni positivi', 'Trade']} rows={g.map(x => [`${fmt(x.from)} → ${fmt(x.to)}`, ...dayCells(x.rows)])} />
                : <div className="note">Dati insufficienti{/QQQ|SPY|BTC/.test(label) ? ' (scarica l\'archivio di QQQ, SPY e BTC)' : ''}.</div>}
            </div>
          )
        })}
      </details>

      <details className="card">
        <summary className="lab" style={{ cursor: 'pointer' }}>Cosa distingue i trade buoni · al momento dell'entrata</summary>
        {TRADE_IND.map(([k, label, fmt]) => {
          const g = quartiles(trades, t => t.ctx?.[k])
          return (
            <div key={k} style={{ marginTop: 12 }}>
              <div className="lab">{label}</div>
              {g.length ? <Tbl head={['Gruppo', 'Trade', 'Vinti', 'Risultato medio', '% medio']} rows={g.map(x => [`${fmt(x.from)} → ${fmt(x.to)}`, ...tradeCells(x.rows)])} />
                : <div className="note">Dati insufficienti.</div>}
            </div>
          )
        })}
        <div style={{ marginTop: 12 }}>
          <div className="lab">Direzione rispetto alla maggioranza dei titoli</div>
          <Tbl head={['Direzione', 'Trade', 'Vinti', 'Risultato medio', '% medio']}
            rows={crowd.map(([c, l]) => [CROWD[c ?? 'nd'], ...tradeCells(l)])} />
        </div>
        <p className="note" style={{ marginTop: 8 }}>Volume prima del segnale: minuti dalle 9:30 alla candela prima del segnale, rispetto agli stessi minuti dei 10 giorni precedenti. Velocità: movimento dall'apertura all'entrata diviso per i minuti.</p>
      </details>
      {r.tradesCut > 0 && <div className="note">Analisi sugli ultimi {trades.length} trade.</div>}
    </>
  )
}
