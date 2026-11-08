// Archivio delle candele da 1 minuto Bitunix dei titoli della strategia, per la Simulazione.
// Una riga per titolo e per giorno (tabella wt_bars), dalle 9:00 alle 16:30 di New York (450 minuti):
// o, h, l, c, v in Float32 a colonne, compressi (deflate) e in base64 → ~6 KB a riga.
// Lo scaricamento è a blocchi con un tempo massimo e riparte da dove si era fermato (scarica solo i giorni mancanti).
import zlib from 'node:zlib'
import { ASSET_MAP } from '../shared/assets.js'
import { ORB_SYMBOLS, isTradingDay } from '../shared/opening.js'
import { ny, nyTs, weekdayOf, addDays } from '../shared/time.js'
import { klines } from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'

const MIN = 60000
export const START_MIN = 540   // 9:00 New York
export const SPAN = 450        // fino alle 16:30
// Oltre ai titoli della strategia: QQQ e SPY (mercato) e BTC (per l'Analisi). BTC dalle 8:00 per avere l'ora prima delle 9:35.
export const EXTRA_SYMBOLS = ['QQQ', 'SPY', 'BTC']
export const ARCHIVE_SYMBOLS = [...ORB_SYMBOLS, ...EXTRA_SYMBOLS]
const startOf = sym => (sym === 'BTC' ? 480 : START_MIN)
const FLOOR_DAY = '2026-03-09' // l'archivio non va più indietro di così (i titoli Bitunix partono a marzo 2026)
const READY_MIN = 992          // un giorno è completo dalle 16:32 di New York
const LISTING_KEY = 'archive:listing'
const LOCK_KEY = 'lock:archive'
const DONE_KEY = 'archive:done'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- Formato compatto ----------
export function encodeDay(bars, t0) {
  const a = new Float32Array(5 * SPAN).fill(NaN)
  let n = 0
  for (const b of bars) {
    const i = Math.round((b.t - t0) / MIN)
    if (i < 0 || i >= SPAN) continue
    if (Number.isNaN(a[i])) n++
    a[i] = b.o; a[SPAN + i] = b.h; a[2 * SPAN + i] = b.l; a[3 * SPAN + i] = b.c; a[4 * SPAN + i] = b.v
  }
  return { n, data: zlib.deflateSync(Buffer.from(a.buffer), { level: 9 }).toString('base64') }
}

const r7 = x => +x.toPrecision(7) // Float32 → prezzo originale (i prezzi Bitunix hanno al massimo 7 cifre)
export function decodeDay(data, t0) {
  const buf = zlib.inflateSync(Buffer.from(data, 'base64'))
  const a = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const out = []
  for (let i = 0; i < SPAN; i++) {
    if (Number.isNaN(a[i])) continue
    out.push({ t: t0 + i * MIN, o: r7(a[i]), h: r7(a[SPAN + i]), l: r7(a[2 * SPAN + i]), c: r7(a[3 * SPAN + i]), v: r7(a[4 * SPAN + i]) })
  }
  return out
}

// ---------- Bitunix ----------
async function kl(perp, endTime) {
  for (let i = 0; ; i++) {
    try { return await klines(perp, '1m', 200, { endTime }) } catch (e) {
      if (/not allowed|20015/i.test(e.message)) throw Object.assign(new Error('perpetual non disponibile su Bitunix'), { unavailable: true })
      if (i >= 3) throw e
      await sleep(1000 * (i + 1)) // limite di richieste o errore temporaneo: aspetta e riprova
    }
  }
}

// Bitunix ignora startTime quando c'è endTime: si scorre all'indietro con endTime (3 richieste per giornata)
export async function fetchDay(perp, day, startMin = START_MIN) {
  const t0 = nyTs(day, startMin), end = t0 + SPAN * MIN
  const got = new Map()
  let e = end - 1
  for (let i = 0; i < 4; i++) {
    const page = await kl(perp, e)
    if (!page.length) break
    for (const b of page) if (b.t >= t0 && b.t < end) got.set(b.t, b)
    const first = page[0].t
    if (first <= t0 || page.length < 200) break
    e = first - 1
  }
  return { t0, bars: [...got.values()].sort((a, b) => a.t - b.t) }
}

// Primo giorno con candele da 1 minuto (ricerca binaria sulla data)
async function findListing(perp) {
  const now = Date.now()
  const has = async t => (await kl(perp, t)).length > 0
  if (!(await has(now))) return null
  let lo = now - 1000 * 864e5, hi = now
  if (await has(lo)) return ny(lo).date
  while (hi - lo > 3600000) {
    const mid = Math.floor((lo + hi) / 2)
    if (await has(mid)) hi = mid; else lo = mid
  }
  const page = await kl(perp, hi + 199 * MIN)
  return page.length ? ny(page[0].t).date : ny(hi).date
}

// ---------- Stato ----------
async function existing() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const page = await q(db().from('wt_bars').select('symbol, day, n').order('symbol').order('day').range(from, from + 999))
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

// Ultimo giorno di borsa completo (oggi solo dopo le 16:32 di New York)
function lastReadyDay(now = Date.now()) {
  const n = ny(now)
  let d = n.min >= READY_MIN ? n.date : addDays(n.date, -1)
  while (!isTradingDay(d, weekdayOf(d))) d = addDays(d, -1)
  return d
}

function tradingDays(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d, weekdayOf(d))) out.push(d)
  return out
}

export async function archiveStatus() {
  const [listing, rows, lock] = await Promise.all([getMeta(LISTING_KEY), existing(), getMeta(LOCK_KEY)])
  const L = listing || {}
  const last = lastReadyDay()
  const by = {}
  for (const r of rows) (by[r.symbol] ||= []).push(r)
  let missingTotal = 0
  const symbols = ARCHIVE_SYMBOLS.map(sym => {
    const info = L[sym] || null
    const have = by[sym] || []
    const days = have.filter(r => r.n > 0)
    const expected = info?.first ? tradingDays(info.first, last) : []
    const haveSet = new Set(have.map(r => r.day))
    const missing = info?.unavailable ? 0 : expected.filter(d => !haveSet.has(d)).length
    missingTotal += info ? missing : 1
    return {
      symbol: sym, checked: !!info, unavailable: !!info?.unavailable, listed: info?.first || null,
      first: days[0]?.day || null, last: days.at(-1)?.day || null, days: days.length,
      partial: days.filter(r => r.n < SPAN - 10).length, empty: have.length - days.length, missing,
    }
  })
  const withData = symbols.filter(s => s.days)
  return {
    lastReady: last, missing: missingTotal, rows: rows.length,
    first: withData.length ? withData.map(s => s.first).sort()[0] : null,
    last: withData.length ? withData.map(s => s.last).sort().at(-1) : null,
    running: !!(lock?.until && lock.until > Date.now()),
    symbols,
  }
}

// ---------- Scaricamento a blocchi ----------
// budgetMs: tempo massimo di questo blocco. Restituisce quanto ha fatto e quanto manca.
export async function fillArchive({ budgetMs = 240000, source = 'manual' } = {}) {
  const t0 = Date.now(), deadline = t0 + budgetMs
  // già completo fino all'ultimo giorno pronto: niente da fare (ricontrollo completo al massimo ogni 6 ore)
  const done = await getMeta(DONE_KEY)
  if (source === 'auto' && done?.day === lastReadyDay() && t0 - done.at < 6 * 3600000) return { saved: 0, empty: 0, remaining: 0, errors: [], upToDate: true }
  const lock = await getMeta(LOCK_KEY)
  if (lock?.until && lock.until > t0) return { busy: true, by: lock.source, until: lock.until }
  await setMeta(LOCK_KEY, { until: deadline + 30000, source })
  const out = { listed: 0, saved: 0, empty: 0, errors: [] }
  try {
    // 1. primo giorno disponibile per ogni titolo (una volta sola; i titoli non disponibili si ricontrollano ogni settimana)
    const listing = (await getMeta(LISTING_KEY)) || {}
    for (const sym of ARCHIVE_SYMBOLS) {
      const info = listing[sym]
      if (info && (!info.unavailable || t0 - info.checked < 7 * 864e5)) continue
      if (Date.now() > deadline - 15000) break
      try {
        const first = await findListing(ASSET_MAP[sym].perp)
        listing[sym] = first ? { first: first < FLOOR_DAY ? FLOOR_DAY : first, checked: Date.now() } : { unavailable: true, checked: Date.now() }
      } catch (e) {
        if (e.unavailable) listing[sym] = { unavailable: true, checked: Date.now() }
        else { out.errors.push(`${sym}: ${e.message}`); continue }
      }
      out.listed++
      await setMeta(LISTING_KEY, listing)
    }

    // 2. giorni mancanti, dal più recente al più vecchio
    const have = new Set((await existing()).map(r => `${r.symbol}|${r.day}`))
    const last = lastReadyDay()
    const todo = []
    for (const sym of ARCHIVE_SYMBOLS) {
      const info = listing[sym]
      if (!info?.first) continue
      for (const d of tradingDays(info.first, last)) if (!have.has(`${sym}|${d}`)) todo.push({ sym, day: d })
    }
    todo.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    const pending = []
    const flush = async () => { if (pending.length) await q(db().from('wt_bars').upsert(pending.splice(0))) }
    let i = 0
    const worker = async () => {
      while (i < todo.length && Date.now() < deadline - 8000) {
        const job = todo[i++]
        try {
          const { t0: start, bars } = await fetchDay(ASSET_MAP[job.sym].perp, job.day, startOf(job.sym))
          const { n, data } = encodeDay(bars, start)
          pending.push({ symbol: job.sym, day: job.day, t0: start, n, data, created_at: Date.now() })
          if (n) out.saved++; else out.empty++
          if (pending.length >= 25) await flush()
        } catch (e) { out.errors.push(`${job.sym} ${job.day}: ${e.message}`) }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker))
    await flush()
    out.remaining = Math.max(0, todo.length - out.saved - out.empty) + ARCHIVE_SYMBOLS.filter(x => !listing[x]).length
    out.unlisted = ARCHIVE_SYMBOLS.filter(x => !listing[x]).length
    if (!out.remaining && !out.unlisted && !out.errors.length) await setMeta(DONE_KEY, { day: last, at: Date.now() })
    out.ms = Date.now() - t0
    out.errors = out.errors.slice(0, 5)
    return out
  } finally {
    await setMeta(LOCK_KEY, { until: 0, source })
  }
}

// ---------- Lettura per la simulazione ----------
// Cache in memoria: la stessa istanza Vercel riusa i giorni già decompressi tra una simulazione e l'altra
const cache = new Map()
const CACHE_MAX = 7000

export async function loadDays(symbols, from, to) {
  const days = {}
  const queue = [...symbols]
  const worker = async () => {
    while (queue.length) {
      const sym = queue.shift()
      // prima chiede solo l'elenco dei giorni, poi scarica i dati di quelli non in cache
      const list = await q(db().from('wt_bars').select('day, created_at').eq('symbol', sym).gte('day', from).lte('day', to).gt('n', 0).order('day').limit(2000))
      const need = list.filter(r => cache.get(`${sym}|${r.day}`)?.v !== r.created_at).map(r => r.day)
      for (let k = 0; k < need.length; k += 120) {
        const part = need.slice(k, k + 120)
        const rows = await q(db().from('wt_bars').select('day, t0, data, created_at').eq('symbol', sym).in('day', part))
        for (const r of rows) {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
          cache.set(`${sym}|${r.day}`, { v: r.created_at, bars: decodeDay(r.data, r.t0) })
        }
      }
      for (const r of list) {
        const c = cache.get(`${sym}|${r.day}`)
        if (c) (days[r.day] ||= {})[sym] = c.bars
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return days
}

export async function dayBars(sym, day) {
  const r = await q(db().from('wt_bars').select('t0, data').eq('symbol', sym).eq('day', day).maybeSingle())
  return r ? decodeDay(r.data, r.t0) : []
}
