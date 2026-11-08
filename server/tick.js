// Controllo ogni minuto (chiamato da cron-job.org): scarica le candele da Bitunix, poi strategia e scanner.
// Bitunix accetta ~10 richieste al secondo: bitunix.js ne fa al massimo 8. Per restare sotto il minuto anche con
// molti titoli nella strategia si scaricano prima solo le candele da 1 minuto che servono alla strategia
// (posizioni aperte e titoli ancora in gioco nella finestra d'entrata), poi quelle dello scanner.
import { ASSETS, ASSET_MAP } from '../shared/assets.js'
import { many } from './bitunix.js'
import { getMeta, setMeta } from './db.js'
import { nyInfo } from './session.js'
import { scan, getPairs } from './scanner.js'
import { runStrategy, strategyNeeds } from './strategy.js'
import { fillArchive } from './archive.js'
import { ensureIndex } from './mindex.js'
import { getLimits } from './limits.js'
import { recordSpreads } from './spreads.js'
import { isTradingDay } from '../shared/opening.js'

const SCAN_DEADLINE = 40000 // oltre questo tempo dall'inizio lo scanner salta il giro (la strategia ha la precedenza)

export async function tick() {
  const t0 = Date.now()
  // evita due controlli sovrapposti se uno dura più di un minuto
  const lock = await getMeta('lock:tick')
  if (lock && t0 - lock.at < 55000) return { skipped: 'controllo precedente ancora in corso' }
  await setMeta('lock:tick', { at: t0 })
  try {
    const info = nyInfo(t0)
    const perps = new Set((await getPairs()).map(p => p.symbol))
    const series = {}
    const errors = []
    const load = async jobs => {
      for (const r of await many(jobs)) {
        if (!r.bars) { errors.push(`${r.key} ${r.tf}: ${r.error}`); continue }
        ;(series[r.key] ||= {})[r.tf] = r.bars
      }
    }
    const job1m = sym => ({ key: sym, tf: '1m', symbol: ASSET_MAP[sym].perp, interval: '1m', limit: 120 })
    const out = { ny: `${info.date} ${Math.floor(info.minutes / 60)}:${String(info.minutes % 60).padStart(2, '0')}` }

    // limiti di Bitunix (leva massima, margine di mantenimento) aggiornati prima dell'apertura, non durante le entrate
    if (info.isWeekday && info.minutes >= 480 && info.minutes < 565) await getLimits().catch(() => null)

    // 1. strategia: solo i titoli che servono in questo minuto
    let need = []
    try { need = (await strategyNeeds(info)).filter(s => ASSET_MAP[s] && perps.has(ASSET_MAP[s].perp)) } catch (e) { errors.push(`titoli strategia: ${e.message}`) }
    await load(need.map(job1m))
    out.strategySymbols = need.length
    try { out.strategy = await runStrategy(series, info) } catch (e) { out.strategy = { error: e.message } }
    out.strategyMs = Date.now() - t0

    // 2. scanner: titoli dalle 9:25 alla chiusura (New York), crypto sempre; le candele da 1 minuto già scaricate si riusano
    const stocksOn = info.isWeekday && info.minutes >= 565 && info.minutes < 965
    const list = ASSETS.filter(a => perps.has(a.perp) && (a.kind === 'crypto' || stocksOn))
    out.assets = list.length
    if (Date.now() - t0 < SCAN_DEADLINE) {
      await load(list.flatMap(a => [
        ...(series[a.symbol]?.['1m'] ? [] : [job1m(a.symbol)]),
        { key: a.symbol, tf: '15m', symbol: a.perp, interval: '15m', limit: 200 },
      ]))
      try { out.scan = await scan(series, info) } catch (e) { out.scan = { error: e.message } }
    } else out.scan = { skipped: 'tempo esaurito: la strategia ha la precedenza' }
    // 3. spread e profondità del libro ordini alle 9:30–9:35 (solo se resta tempo: al massimo fino a 48 s dall'inizio)
    if (isTradingDay(info.date, info.isWeekday)) {
      const left = 48000 - (Date.now() - t0)
      if (left > 2000) try { const r = await recordSpreads(info, perps, { maxMs: Math.min(9000, left) }); if (r) out.spreads = r } catch (e) { errors.push(`spread: ${e.message}`) }
    }
    if (errors.length) out.dataErrors = errors.slice(0, 5)
    // archivio per la Simulazione: solo lontano dall'orario della strategia (dopo le 16:35 o prima delle 7:50 di New York, e nel fine settimana)
    const quiet = !info.isWeekday || info.minutes >= 995 || info.minutes < 470
    if (quiet) {
      try {
        const left = 50000 - (Date.now() - t0)
        if (left > 15000) {
          const r = await fillArchive({ budgetMs: Math.min(30000, left - 5000), source: 'auto' })
          out.archive = r.busy ? { busy: true } : { saved: r.saved, remaining: r.remaining, ...(r.errors.length ? { errors: r.errors.slice(0, 2) } : {}) }
          // valori dell'indice di attività per i giorni appena archiviati
          const left2 = 50000 - (Date.now() - t0)
          if (!r.busy && left2 > 10000 && (r.saved > 0 || info.minutes % 30 === 0)) out.index = await ensureIndex({ budgetMs: left2 - 8000 }).catch(e => ({ error: e.message }))
        }
      } catch (e) { out.archive = { error: e.message } }
    }
    out.ms = Date.now() - t0
    await setMeta('last:tick', { at: t0, ms: out.ms, strategy: out.strategy, scan: out.scan, strategySymbols: out.strategySymbols, strategyMs: out.strategyMs })
    return out
  } finally {
    await setMeta('lock:tick', { at: 0 })
  }
}
