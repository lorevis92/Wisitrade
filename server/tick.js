// Controllo ogni minuto (chiamato da cron-job.org): scarica le candele da Bitunix, poi strategia e scanner.
import { ASSETS } from '../shared/assets.js'
import { many } from './bitunix.js'
import { getMeta, setMeta } from './db.js'
import { nyInfo } from './session.js'
import { scan, getPairs } from './scanner.js'
import { runStrategy } from './strategy.js'
import { fillArchive } from './archive.js'

export async function tick() {
  const t0 = Date.now()
  // evita due controlli sovrapposti se uno dura più di un minuto
  const lock = await getMeta('lock:tick')
  if (lock && t0 - lock.at < 55000) return { skipped: 'controllo precedente ancora in corso' }
  await setMeta('lock:tick', { at: t0 })
  try {
    const info = nyInfo(t0)
    const perps = new Set((await getPairs()).map(p => p.symbol))
    // titoli: dalle 9:25 alla chiusura (New York); crypto: sempre
    const stocksOn = info.isWeekday && info.minutes >= 565 && info.minutes < 965
    const list = ASSETS.filter(a => perps.has(a.perp) && (a.kind === 'crypto' || stocksOn))
    const jobs = list.flatMap(a => [
      { key: a.symbol, tf: '1m', symbol: a.perp, interval: '1m', limit: 120 },
      { key: a.symbol, tf: '15m', symbol: a.perp, interval: '15m', limit: 200 },
    ])
    const series = {}
    const errors = []
    for (const r of await many(jobs)) {
      if (!r.bars) { errors.push(`${r.key} ${r.tf}: ${r.error}`); continue }
      ;(series[r.key] ||= {})[r.tf] = r.bars
    }
    const out = { ny: `${info.date} ${Math.floor(info.minutes / 60)}:${String(info.minutes % 60).padStart(2, '0')}`, assets: list.length }
    // prima la strategia (conta il tempo), poi lo scanner
    try { out.strategy = await runStrategy(series, info) } catch (e) { out.strategy = { error: e.message } }
    try { out.scan = await scan(series, info) } catch (e) { out.scan = { error: e.message } }
    if (errors.length) out.dataErrors = errors.slice(0, 5)
    // archivio per la Simulazione: solo lontano dall'orario della strategia (dopo le 16:35 o prima delle 7:50 di New York, e nel fine settimana)
    const quiet = !info.isWeekday || info.minutes >= 995 || info.minutes < 470
    if (quiet) {
      try {
        const left = 50000 - (Date.now() - t0)
        if (left > 15000) {
          const r = await fillArchive({ budgetMs: Math.min(30000, left - 5000), source: 'auto' })
          out.archive = r.busy ? { busy: true } : { saved: r.saved, remaining: r.remaining, ...(r.errors.length ? { errors: r.errors.slice(0, 2) } : {}) }
        }
      } catch (e) { out.archive = { error: e.message } }
    }
    out.ms = Date.now() - t0
    await setMeta('last:tick', { at: t0, ms: out.ms, strategy: out.strategy, scan: out.scan })
    return out
  } finally {
    await setMeta('lock:tick', { at: 0 })
  }
}
