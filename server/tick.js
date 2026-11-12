// Controllo ogni minuto (chiamato da cron-job.org): scarica le candele da Bitunix, poi strategia e scanner.
// Bitunix accetta ~10 richieste al secondo: bitunix.js ne fa al massimo 8. Per restare sotto il minuto anche con
// molti titoli nella strategia si scaricano prima solo le candele da 1 minuto che servono alla strategia
// (posizioni aperte e titoli ancora in gioco nella finestra d'entrata), poi quelle dello scanner.
import { ASSETS, ASSET_MAP } from '../shared/assets.js'
import { many } from './bitunix.js'
import { getMeta, setMeta } from './db.js'
import { nyInfo } from './session.js'
import { scan, getPairs } from './scanner.js'
import { runStrategy, strategyNeeds, strategyOpenSymbols, repairLiveClosed } from './strategy.js'
import { fillArchive } from './archive.js'
import { ensureIndex } from './mindex.js'
import { getLimits } from './limits.js'
import { presetLive } from './strategy.js'
import { recordSpreads } from './spreads.js'
import { isTradingDay } from '../shared/opening.js'
import { eveningCompare } from './compare.js'

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
    // Reale: margine isolato e leva impostati prima dell'apertura (9:05–9:28), sui titoli dove non hai posizioni
    if (info.isWeekday && info.minutes >= 545 && info.minutes <= 568) { try { out.preset = await presetLive(info, 15000) } catch (e) { errors.push(`preparazione Reale: ${e.message}`) } }

    // 1. strategia: prima le uscite (candele delle sole posizioni aperte), poi le entrate con i titoli che servono in questo minuto
    const ok = s => ASSET_MAP[s] && perps.has(ASSET_MAP[s].perp)
    const tm = { start: t0 - Math.floor(t0 / 60000) * 60000 } // ms dall'inizio del minuto (ritardo di cron-job.org e avvio)
    let openSyms = []
    try { openSyms = (await strategyOpenSymbols()).filter(ok) } catch (e) { errors.push(`posizioni aperte: ${e.message}`) }
    if (openSyms.length) {
      await load(openSyms.map(job1m))
      tm.exitKl = Date.now() - t0
      try { out.exits = await runStrategy(series, info, { only: 'exits' }) } catch (e) { out.exits = { error: e.message } }
      tm.exits = Date.now() - t0
    }
    let need = []
    try { need = (await strategyNeeds(info)).filter(ok) } catch (e) { errors.push(`titoli strategia: ${e.message}`) }
    await load(need.filter(s => !series[s]?.['1m']).map(job1m))
    tm.entryKl = Date.now() - t0
    out.strategySymbols = need.length
    try { out.strategy = await runStrategy(series, info, { skipManage: openSyms.length > 0 }) } catch (e) { out.strategy = { error: e.message } }
    out.strategyMs = tm.strategy = Date.now() - t0
    // registro dei tempi del controllo ogni minuto all'apertura (9:25–10:30 New York), per capire i ritardi
    if (info.isWeekday && info.minutes >= 565 && info.minutes <= 630) {
      const k = `ticklog:${info.date}`
      await setMeta(k, [...((await getMeta(k)) || []), { min: info.minutes, ...tm, need: need.length, open: openSyms.length }].slice(-80)).catch(() => {})
    }
    // Reale: trade chiusi senza i dati veri di Bitunix → si riprovano (fuori dall'apertura)
    if (info.minutes > 610 && info.minutes % 5 === 0) await repairLiveClosed().catch(e => errors.push(`dati Bitunix: ${e.message}`))

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
          // confronto serale Reale · Prova · Simulazione (un giorno per giro, quando l'archivio ha le candele del giorno)
          const left3 = 50000 - (Date.now() - t0)
          if (!r.busy && left3 > 20000) out.compare = await eveningCompare(info, { budgetMs: left3 - 8000 }).then(x => (x?.modes ? { day: x.day, ms: x.ms } : x), e => ({ error: e.message }))
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
