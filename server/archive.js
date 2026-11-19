// Archivio delle candele da 1 minuto dei titoli della strategia, per la Simulazione, per exchange (shared/venues.js).
// Una riga per titolo, giorno ed exchange (tabella wt_bars), dalle 9:00 alle 16:30 di New York (450 minuti):
// o, h, l, c, v in Float32 a colonne, compressi (deflate) e in base64 → ~6 KB a riga.
// Chiave della riga (colonna symbol): il titolo per Bitunix (righe di prima, invariate), "<titolo>@<exchange>" per gli altri
// (es. NVDA@bitget). I nomi del perpetual diversi tra exchange (CATERPILLAR → CATUSDT su Bitget) li dà l'adattatore.
// Lo scaricamento è a blocchi con un tempo massimo e riparte da dove si era fermato (scarica solo i giorni mancanti).
import zlib from 'node:zlib'
import { ASSET_MAP } from '../shared/assets.js'
import { STRATEGY_SYMBOLS, isTradingDay } from '../shared/opening.js'
import { ny, nyTs, weekdayOf, addDays } from '../shared/time.js'
import { DEFAULT_EX, exSuffix } from '../shared/venues.js'
import { klines } from './bitunix.js'
import * as bg from './exchanges/bitget.js'
import { db, q, getMeta, setMeta } from './db.js'

const MIN = 60000
export const START_MIN = 540   // 9:00 New York
export const SPAN = 450        // fino alle 16:30
// Oltre ai titoli della strategia: QQQ e SPY (mercato) e BTC (per l'Analisi). BTC dalle 8:00 per avere l'ora prima delle 9:35.
export const EXTRA_SYMBOLS = ['QQQ', 'SPY', 'BTC']
export const ARCHIVE_SYMBOLS = [...new Set([...STRATEGY_SYMBOLS, ...EXTRA_SYMBOLS])]
const startOf = sym => (sym === 'BTC' ? 480 : START_MIN)
const READY_MIN = 992          // un giorno è completo dalle 16:32 di New York
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- Exchange ----------
// floor = l'archivio non va più indietro di così; perp = perpetual del titolo; fetchDay e listing = come si scarica
const SOURCES = {
  bitunix: { floor: '2026-03-09', perp: sym => ASSET_MAP[sym]?.perp, fetchDay: (...a) => fetchDay(...a), listing: perp => findListing(perp) }, // i titoli Bitunix partono a marzo 2026
  bitget: { floor: '2025-08-01', perp: sym => bg.perpOf(sym), fetchDay: (...a) => fetchDayBitget(...a), listing: perp => listingBitget(perp) },
}
export const ARCHIVE_EXCHANGES = Object.keys(SOURCES)
const src = ex => { const x = SOURCES[ex]; if (!x) throw new Error(`Archivio: exchange sconosciuto ${ex}`); return x }
// chiave della riga di wt_bars e ritorno al titolo
export const barKey = (ex, sym) => (ex === DEFAULT_EX ? sym : `${sym}@${ex}`)
const symOfKey = (ex, key) => (ex === DEFAULT_EX ? key : key.slice(0, -(ex.length + 1)))
export const listingKey = (ex = DEFAULT_EX) => `archive:listing${exSuffix(ex)}`
export const LISTING_KEY = listingKey(DEFAULT_EX)
const lockKey = ex => `lock:archive${exSuffix(ex)}`
const doneKey = ex => `archive:done${exSuffix(ex)}`

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

// Float32 → prezzo originale (i prezzi hanno al massimo 7 cifre). toPrecision è lento: i valori si ripetono
// moltissimo, quindi si tiene il risultato in una cache (stesso risultato, molto più veloce)
const r7memo = new Map()
const r7 = x => {
  let v = r7memo.get(x)
  if (v === undefined) { v = +x.toPrecision(7); if (r7memo.size >= 2e6) r7memo.clear(); r7memo.set(x, v) }
  return v
}
// withMin: aggiunge il minuto di New York (min) a ogni candela, così la simulazione non deve ricalcolarlo né copiare le candele
export function decodeDay(data, t0, opts) {
  return decodeBuf(Buffer.from(data, 'base64'), t0, opts)
}
function decodeBuf(z, t0, { withMin = false } = {}) {
  const buf = zlib.inflateSync(z)
  const a = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const out = []
  const m0 = withMin ? ny(t0).min : 0
  for (let i = 0; i < SPAN; i++) {
    if (Number.isNaN(a[i])) continue
    const b = { t: t0 + i * MIN, o: r7(a[i]), h: r7(a[SPAN + i]), l: r7(a[2 * SPAN + i]), c: r7(a[3 * SPAN + i]), v: r7(a[4 * SPAN + i]) }
    if (withMin) b.min = m0 + i
    out.push(b)
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

// ---------- Bitget ----------
// Storico delle candele da 1 minuto: history-candles con startTime ed endTime (al massimo 200 per richiesta, finestra
// di 90 giorni al massimo): 3 richieste per giornata. Verificato il 19/11/2026: lo storico arriva al primo giorno del perpetuo.
const bgRetry = async fn => {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (e) {
      if (/40034|does not exist|symbol.*not/i.test(e.message)) throw Object.assign(new Error('perpetuo non disponibile su Bitget'), { unavailable: true })
      if (i >= 3) throw e
      await sleep(1000 * (i + 1))
    }
  }
}
export async function fetchDayBitget(perp, day, startMin = START_MIN) {
  const t0 = nyTs(day, startMin), end = t0 + SPAN * MIN
  const got = new Map()
  for (let t = t0; t < end; t += 200 * MIN) {
    const page = await bgRetry(() => bg.klines(perp, '1m', 200, { startTime: t, endTime: Math.min(end, t + 200 * MIN) }))
    for (const b of page) if (b.t >= t0 && b.t < end) got.set(b.t, b)
  }
  return { t0, bars: [...got.values()].sort((a, b) => a.t - b.t) }
}
// Primo giorno del perpetuo: candele giornaliere all'indietro, a finestre di 90 giorni (limite di history-candles)
async function listingBitget(perp) {
  let end = Date.now(), first = null
  for (let i = 0; i < 16; i++) {
    const page = await bgRetry(() => bg.klines(perp, '1d', 200, { endTime: end }))
    if (!page.length) break
    first = page[0].t
    end = page[0].t - 1
  }
  return first ? ny(first + 12 * 3600000).date : null
}

// ---------- Stato ----------
// Righe dell'archivio di un exchange: { symbol (titolo), day, n }
export async function existing(ex = DEFAULT_EX) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    let query = db().from('wt_bars').select('symbol, day, n')
    query = ex === DEFAULT_EX ? query.not('symbol', 'like', '%@%') : query.like('symbol', `%@${ex}`)
    const page = await q(query.order('symbol').order('day').range(from, from + 999))
    rows.push(...page.map(r => ({ ...r, symbol: symOfKey(ex, r.symbol) })))
    if (page.length < 1000) break
  }
  return rows
}

// Ultimo giorno di borsa completo (oggi solo dopo le 16:32 di New York)
export function lastReadyDay(now = Date.now()) {
  const n = ny(now)
  let d = n.min >= READY_MIN ? n.date : addDays(n.date, -1)
  while (!isTradingDay(d, weekdayOf(d))) d = addDays(d, -1)
  return d
}

export function tradingDays(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (isTradingDay(d, weekdayOf(d))) out.push(d)
  return out
}

export async function archiveStatus(ex = DEFAULT_EX) {
  const [listing, rows, lock] = await Promise.all([getMeta(listingKey(ex)), existing(ex), getMeta(lockKey(ex))])
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
      symbol: sym, perp: src(ex).perp(sym) || null, checked: !!info, unavailable: !!info?.unavailable, listed: info?.first || null,
      first: days[0]?.day || null, last: days.at(-1)?.day || null, days: days.length,
      partial: days.filter(r => r.n < SPAN - 10).length, empty: have.length - days.length, missing,
    }
  })
  const withData = symbols.filter(s => s.days)
  // periodo in cui i titoli della strategia hanno dati: dal primo giorno di qualunque titolo e dal giorno in cui ne ha almeno metà
  const firsts = withData.filter(s => STRATEGY_SYMBOLS.includes(s.symbol)).map(s => s.first).sort()
  return {
    ex, lastReady: last, missing: missingTotal, rows: rows.length,
    first: withData.length ? withData.map(s => s.first).sort()[0] : null,
    last: withData.length ? withData.map(s => s.last).sort().at(-1) : null,
    half: firsts.length ? firsts[Math.floor(firsts.length / 2)] : null,
    running: !!(lock?.until && lock.until > Date.now()),
    symbols,
  }
}

// ---------- Scaricamento a blocchi ----------
// budgetMs: tempo massimo di questo blocco. Restituisce quanto ha fatto e quanto manca. Riprende da dove si è fermato
// (scarica solo i giorni che non ci sono), dal più recente al più vecchio.
export async function fillArchive({ budgetMs = 240000, source = 'manual', ex = DEFAULT_EX } = {}) {
  const S = src(ex)
  const t0 = Date.now(), deadline = t0 + budgetMs
  // già completo fino all'ultimo giorno pronto: niente da fare (ricontrollo completo al massimo ogni 6 ore)
  const done = await getMeta(doneKey(ex))
  if (source === 'auto' && done?.day === lastReadyDay() && t0 - done.at < 6 * 3600000) return { ex, saved: 0, empty: 0, remaining: 0, errors: [], upToDate: true }
  const lock = await getMeta(lockKey(ex))
  if (lock?.until && lock.until > t0) return { ex, busy: true, by: lock.source, until: lock.until }
  await setMeta(lockKey(ex), { until: deadline + 30000, source })
  const out = { ex, listed: 0, saved: 0, empty: 0, errors: [] }
  try {
    // 1. primo giorno disponibile per ogni titolo (una volta sola; i titoli non disponibili si ricontrollano ogni settimana)
    const listing = (await getMeta(listingKey(ex))) || {}
    for (const sym of ARCHIVE_SYMBOLS) {
      const info = listing[sym]
      if (info && (!info.unavailable || t0 - info.checked < 7 * 864e5)) continue
      if (Date.now() > deadline - 15000) break
      const perp = S.perp(sym)
      try {
        const first = perp ? await S.listing(perp) : null
        listing[sym] = first ? { first: first < S.floor ? S.floor : first, checked: Date.now() } : { unavailable: true, checked: Date.now() }
      } catch (e) {
        if (e.unavailable) listing[sym] = { unavailable: true, checked: Date.now() }
        else { out.errors.push(`${sym}: ${e.message}`); continue }
      }
      out.listed++
      await setMeta(listingKey(ex), listing)
    }

    // 2. giorni mancanti, dal più recente al più vecchio
    const have = new Set((await existing(ex)).map(r => `${r.symbol}|${r.day}`))
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
          const { t0: start, bars } = await S.fetchDay(S.perp(job.sym), job.day, startOf(job.sym))
          const { n, data } = encodeDay(bars, start)
          pending.push({ symbol: barKey(ex, job.sym), day: job.day, t0: start, n, data, created_at: Date.now() })
          if (n) out.saved++; else out.empty++
          if (pending.length >= 25) await flush()
        } catch (e) { out.errors.push(`${job.sym} ${job.day}: ${e.message}`) }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker))
    await flush()
    out.remaining = Math.max(0, todo.length - out.saved - out.empty) + ARCHIVE_SYMBOLS.filter(x => !listing[x]).length
    out.unlisted = ARCHIVE_SYMBOLS.filter(x => !listing[x]).length
    if (!out.remaining && !out.unlisted && !out.errors.length) await setMeta(doneKey(ex), { day: last, at: Date.now() })
    out.ms = Date.now() - t0
    out.errors = out.errors.slice(0, 5)
    return out
  } finally {
    await setMeta(lockKey(ex), { until: 0, source })
  }
}

// ---------- Lettura per la simulazione ----------
// In memoria restano solo i dati compressi (~4,5 KB per titolo e giorno): le candele si decomprimono quando il motore
// le chiede, e solo le ultime usate restano decompresse. Così anche 180 titoli per 8 mesi stanno nella memoria di Vercel.
// La stessa istanza riusa i dati già scaricati tra una simulazione e l'altra.
const store = new Map() // `${chiave riga}|${day}` → { v, t0, z }
const STORE_MAX = 45000

// onSymbol (facoltativo): chiamata dopo ogni titolo caricato, { sym, days, done, total } (per l'avanzamento della Simulazione)
// ex: archivio di quale exchange (le candele restano per titolo: days[giorno][titolo])
export async function loadDays(symbols, from, to, { decodeMax = 8000, onSymbol = null, ex = DEFAULT_EX } = {}) {
  const days = {}
  const lru = new Map()
  const barsOf = (key, e) => {
    let b = lru.get(key)
    if (b) { lru.delete(key); lru.set(key, b); return b }
    b = decodeBuf(e.z, e.t0, { withMin: true })
    lru.set(key, b)
    if (lru.size > decodeMax) lru.delete(lru.keys().next().value)
    return b
  }
  const queue = [...new Set(symbols)], total = queue.length
  let done = 0
  const worker = async () => {
    while (queue.length) {
      const sym = queue.shift(), rk = barKey(ex, sym)
      // prima chiede solo l'elenco dei giorni, poi scarica i dati di quelli non ancora in memoria
      const list = await q(db().from('wt_bars').select('day, created_at').eq('symbol', rk).gte('day', from).lte('day', to).gt('n', 0).order('day').limit(2000))
      const need = list.filter(r => store.get(`${rk}|${r.day}`)?.v !== r.created_at).map(r => r.day)
      for (let k = 0; k < need.length; k += 120) {
        const part = need.slice(k, k + 120)
        const rows = await q(db().from('wt_bars').select('day, t0, data, created_at').eq('symbol', rk).in('day', part))
        for (const r of rows) {
          const key = `${rk}|${r.day}`
          store.delete(key)
          if (store.size >= STORE_MAX) store.delete(store.keys().next().value)
          store.set(key, { v: r.created_at, t0: +r.t0, z: Buffer.from(r.data, 'base64') })
        }
      }
      for (const r of list) {
        const key = `${rk}|${r.day}`, e = store.get(key)
        if (!e) continue
        Object.defineProperty(days[r.day] ||= {}, sym, { get: () => barsOf(key, e), enumerable: true, configurable: true })
      }
      try { onSymbol?.({ sym, days: list.length, done: ++done, total }) } catch { /* solo avanzamento */ }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return days
}

export async function dayBars(sym, day, ex = DEFAULT_EX) {
  const r = await q(db().from('wt_bars').select('t0, data').eq('symbol', barKey(ex, sym)).eq('day', day).maybeSingle())
  return r ? decodeDay(r.data, r.t0) : []
}
