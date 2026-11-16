// Strategia Turtle dal vivo (Prova e Reale) e Simulazione. Regole in shared/turtle.js (riproduzione del Pine "Turtle Breakout").
// Indipendente dalle altre strategie: impostazioni, conti e storico propri in wt_meta (nessuna tabella nuova):
//   turtle:set:<mode>        impostazioni (cleanTurtle + active)
//   turtle:acc:<mode>        conto { start, balance, startAt, epoch, curve }
//   turtle:pos:<mode>:<id>   posizioni (aperte e chiuse)
//   turtle:lv:<mode>:<day>   livelli del giorno (massimo N, minimo M, ATR) per ogni titolo
//   turtle:d1:<SYM>          candele giornaliere chiuse di Bitunix (archivio per livelli e Simulazione)
// Reale: stesse regole di sicurezza di Apertura USA (server/live.js): ordini solo con LIVE_TRADING=on, chiavi e conto attivo;
// leva mai oltre il massimo di Bitunix; stop dentro l'ordine e verificato, mai oltre la liquidazione; margine isolato verificato;
// mai su titoli con posizioni o ordini non suoi (comprese quelle di Apertura USA e quelle manuali); prenotazione del titolo
// (wt_meta claim:turtle-live:<giorno>:<titolo>). Lo stop su Bitunix si alza ogni giorno al livello d'uscita (minimo M giorni).
import * as bx from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { ASSET_MAP, CRYPTO } from '../shared/assets.js'
import { STRATEGY_SYMBOLS, settingsFor } from '../shared/opening.js'
import { getCapital } from './capital.js'
import { getLimits } from './limits.js'
import { getPairs } from './scanner.js'
import { operable, markNotOperable } from './operable.js'
import { openLive, closeOurs, checkStop, LiveSkip } from './live.js'
import { liveAllowed, claimSymbol } from './strategy.js'
import { notifyTrades } from './push.js'
import { cleanTurtle, levelsOf, sizeTrade, exitOf, closeResult, simulate, dayKey } from '../shared/turtle.js'

const DAY = 864e5
export const MODES = ['paper', 'live']

// Dipendenze sostituibili nelle prove (tests/turtle.test.mjs): Bitunix, database, notifiche
export const D = {
  bx, getMeta, setMeta, getPairs, operable, markNotOperable, liveAllowed, claimSymbol, notifyTrades, getLimits,
  aperturaLive: (...a) => aperturaLive(...a), listPos: (...a) => listPos(...a), wait: ms => new Promise(r => setTimeout(r, ms)),
}
export class TurtleError extends Error { constructor(msg, status = 400) { super(msg); this.status = status } }

// Universo: i titoli di Apertura USA più le crypto dello scanner
export const UNIVERSE = [...new Set([...STRATEGY_SYMBOLS, ...CRYPTO.map(c => c.symbol)])].filter(s => ASSET_MAP[s])
export const universeFor = s => UNIVERSE.filter(sym => (ASSET_MAP[sym].kind === 'crypto' ? s.crypto : s.stocks))

// ---------- Candele giornaliere (archivio in wt_meta, solo candele chiuse) ----------
const DKEY = sym => `turtle:d1:${sym}`, KEEP = 800
const pack = b => [b.t, b.o, b.h, b.l, b.c]
const unpack = a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4] })
// fresche = l'ultima candela chiusa è quella di ieri (o di oggi appena chiusa)
const isFresh = (bars, now) => bars?.length && bars.at(-1).t + 2 * DAY > now
export async function daily(sym, now = Date.now(), { fetch = true } = {}) {
  const c = await D.getMeta(DKEY(sym)).catch(() => null)
  const old = c?.bars?.map(unpack) || null
  if (isFresh(old, now) || !fetch) return old
  const perp = ASSET_MAP[sym].perp
  let bars
  if (old?.length && now - old.at(-1).t < 300 * DAY) {
    const need = Math.ceil((now - old.at(-1).t) / DAY) + 3
    const fresh = await D.bx.klinesBack(perp, '1d', need)
    const m = new Map(old.map(b => [b.t, b]))
    for (const b of fresh) m.set(b.t, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })
    bars = [...m.values()].sort((a, b) => a.t - b.t)
  } else bars = (await D.bx.klinesBack(perp, '1d', KEEP)).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }))
  bars = bars.filter(b => b.t + DAY <= now).slice(-KEEP)
  if (bars.length) await D.setMeta(DKEY(sym), { at: now, bars: bars.map(pack) })
  return bars
}
async function pool(list, n, fn) {
  const queue = [...list]
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()) }))
}

// Leva massima, scaglioni e intervallo del funding: titoli da server/limits.js, crypto qui (una volta al giorno)
async function limitsAll(syms) {
  const stocks = await D.getLimits().catch(() => ({}))
  let cr = await D.getMeta('turtle:limits:crypto').catch(() => null)
  const cryptoSyms = syms.filter(s => ASSET_MAP[s].kind === 'crypto')
  if (cryptoSyms.length && (!cr || Date.now() - cr.at > DAY)) {
    try {
      const [pairs, fr] = await Promise.all([D.bx.tradingPairs(), D.bx.fundingRates().catch(() => ({}))])
      const by = Object.fromEntries(pairs.map(p => [p.symbol, p])), data = {}
      await pool(CRYPTO.map(c => c.symbol), 4, async sym => {
        const perp = ASSET_MAP[sym].perp, pair = by[perp]
        const tiers = pair ? await D.bx.positionTiers(perp).catch(() => null) : null
        data[sym] = { available: !!pair, maxLev: pair?.maxLeverage ?? null, tiers: tiers?.length ? tiers : null, fundingH: fr[perp]?.hours || 8 }
      })
      cr = { at: Date.now(), data }
      await D.setMeta('turtle:limits:crypto', cr).catch(() => {})
    } catch { /* restano i valori salvati */ }
  }
  return Object.fromEntries(syms.map(s => [s, stocks[s] || cr?.data?.[s] || { maxLev: null, tiers: null, fundingH: 8 }]))
}

// ---------- Simulazione (in streaming: avanzamento del caricamento, poi il risultato) ----------
export async function turtleSim(body, send, isClosed = () => false) {
  const s = cleanTurtle(body?.settings)
  const syms = universeFor(s)
  if (!syms.length) throw new TurtleError('Nessun titolo: accendi azioni o crypto')
  const now = Date.now(), data = {}, errors = []
  let done = 0
  send({ t: 'phase', msg: `carico le candele giornaliere di ${syms.length} titoli` })
  await pool(syms, 6, async sym => {
    if (isClosed()) return
    try { const b = await daily(sym, now); if (b?.length) data[sym] = b } catch (e) { errors.push(`${sym}: ${e.message}`) }
    done++
    if (done % 5 === 0 || done === syms.length) send({ t: 'load', done, total: syms.length })
  })
  if (isClosed()) return null
  send({ t: 'phase', msg: 'leggo i limiti di Bitunix (leva massima, margine)' })
  const limits = await limitsAll(syms)
  send({ t: 'phase', msg: 'calcolo' })
  const from = body?.from ? Date.parse(body.from) : null, to = body?.to ? Date.parse(body.to) : null
  const r = simulate(data, limits, s, { from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null })
  const step = Math.ceil(r.curve.length / 1200)
  return {
    ...r, curve: r.curve.filter((_, i) => i % step === 0 || i === r.curve.length - 1),
    trades: r.trades.slice(-600), tradesTotal: r.trades.length, errors: errors.slice(0, 10), missing: syms.filter(x => !data[x]),
    dataFrom: Math.min(...Object.values(data).map(b => b[0].t)),
  }
}

// ---------- Conti, impostazioni, posizioni ----------
const setKey = mode => `turtle:set:${mode}`, accKey = mode => `turtle:acc:${mode}`, posKey = (mode, id) => `turtle:pos:${mode}:${id}`
export async function getSettings(mode) { return { ...cleanTurtle((await D.getMeta(setKey(mode))) || {}), active: !!(await D.getMeta(setKey(mode)))?.active } }
const newAccount = (capital, now, epoch = 1) => ({ start: capital, balance: capital, startAt: now, epoch, curve: [{ t: now, balance: capital }] })
export async function getAccount(mode) { return D.getMeta(accKey(mode)) }
async function listPos(mode) {
  const rows = await q(db().from('wt_meta').select('key, value').like('key', `turtle:pos:${mode}:%`).order('key', { ascending: false }).limit(800))
  return rows.map(r => r.value).filter(Boolean)
}
const savePos = (mode, p) => D.setMeta(posKey(mode, p.id), p)

export async function saveSettings(mode, raw, now = Date.now()) {
  if (!MODES.includes(mode)) throw new TurtleError('Modalità non valida')
  const s = cleanTurtle(raw)
  const prev = await D.getMeta(setKey(mode))
  const active = typeof raw?.active === 'boolean' ? raw.active : !!prev?.active
  if (mode === 'live' && active && !D.liveAllowed()) throw new TurtleError('Reale non attivabile: servono LIVE_TRADING=on e le chiavi Bitunix su Vercel')
  await D.setMeta(setKey(mode), { ...s, active })
  if (!(await getAccount(mode))) await D.setMeta(accKey(mode), newAccount(s.capital, now))
  return getState(mode)
}

// Azzeramento: Prova chiude le posizioni di prova senza risultato e riparte; Reale solo senza posizioni aperte
export async function resetAccount(mode, capital, now = Date.now()) {
  const c = +capital
  if (!(c >= 50 && c < 1e8)) throw new TurtleError('Capitale non valido (minimo 50 USDT)')
  const acc = await getAccount(mode)
  const open = (await D.listPos(mode)).filter(p => p.status === 'open')
  if (mode === 'live' && open.length) throw new TurtleError('Chiudi prima le posizioni aperte del Reale')
  for (const p of open) { p.status = 'azzerata'; p.closedAt = now; await savePos(mode, p) }
  await D.setMeta(accKey(mode), newAccount(c, now, (acc?.epoch || 1) + 1))
  const s = await D.getMeta(setKey(mode))
  await D.setMeta(setKey(mode), { ...cleanTurtle(s || {}), active: !!s?.active, capital: c })
  return getState(mode)
}

async function bookClose(mode, p, res, now) {
  Object.assign(p, res, { status: 'closed', closedAt: now, closedDay: dayKey(now), days: Math.round((now - p.openedAt) / DAY * 10) / 10 })
  await savePos(mode, p)
  const acc = (await getAccount(mode)) || newAccount(p.margin, now)
  if (p.epoch === acc.epoch) {
    acc.balance = Math.max(0, acc.balance + res.pnl)
    acc.curve = [...(acc.curve || []), { t: now, balance: acc.balance }].slice(-500)
    await D.setMeta(accKey(mode), acc)
  }
}

export async function getState(mode, now = Date.now()) {
  if (!MODES.includes(mode)) throw new TurtleError('Modalità non valida')
  const [settings, acc, all] = await Promise.all([getSettings(mode), getAccount(mode), D.listPos(mode)])
  const open = all.filter(p => p.status === 'open')
  let prices = {}
  if (open.length) prices = await D.bx.allTickers().catch(() => ({}))
  const lv = (await D.getMeta(`turtle:lv:${mode}:${dayKey(now)}`).catch(() => null)) || null
  const openView = open.map(p => {
    const last = prices[ASSET_MAP[p.symbol]?.perp] ?? null
    const L = lv?.bySym?.[p.symbol]
    const exit = p.day === dayKey(now) ? p.stop0 : exitOf(p, L?.loM ?? p.loM)
    return { ...p, last, exitNow: exit, upnl: last !== null ? (last - p.entry) * p.qty : null }
  })
  return {
    mode, settings, account: acc, open: openView, history: all.filter(p => p.status !== 'open' && (!acc || p.epoch === acc.epoch)).slice(0, 300),
    levels: lv ? { day: lv.day, n: Object.keys(lv.bySym || {}).length, total: lv.total, at: lv.at } : null,
    liveAllowed: D.liveAllowed(), universe: universeFor(settings).length,
  }
}

// ---------- Controllo dal vivo (dal controllo ogni minuto) ----------
// 1. livelli del giorno (candele giornaliere aggiornate a pezzi, entro il tempo); 2. uscite; 3. entrate (se c'è tempo e
// la modalità è attiva). entries = false durante l'apertura USA (la strategia Apertura USA ha la precedenza sul tempo).
export async function runTurtle({ budgetMs = 12000, entries = true, now = Date.now() } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0)
  const out = {}
  const modes = []
  for (const mode of MODES) {
    const s = await getSettings(mode)
    const open = (await D.listPos(mode)).filter(p => p.status === 'open')
    if (s.active || open.length) modes.push({ mode, s, open })
  }
  if (!modes.length) return { idle: true }
  const day = dayKey(now)
  let prices
  try { prices = await D.bx.allTickers() } catch (e) { return { error: `prezzi non disponibili: ${e.message}` } }
  for (const m of modes) {
    const r = out[m.mode] = {}
    // livelli del giorno
    const lk = `turtle:lv:${m.mode}:${day}`
    let lv = (await D.getMeta(lk).catch(() => null)) || { day, at: now, bySym: {}, total: 0 }
    const syms = universeFor(m.s)
    const op = m.mode === 'live' || m.mode === 'paper' ? await D.operable().catch(() => null) : null
    const list = syms.filter(x => !op?.check(x))
    lv.total = list.length
    // titoli senza candele aggiornate (o con troppo poco storico): si riprovano dopo un'ora, non a ogni minuto
    lv.miss ||= {}
    const waiting = x => lv.miss[x] && now - lv.miss[x] < 3600000
    const todo = list.filter(x => !lv.bySym[x] && !waiting(x)).concat(m.open.map(p => p.symbol).filter(x => !lv.bySym[x]))
    if (todo.length && left() > 3000) {
      const queue = [...new Set(todo)]
      await pool(queue, 6, async sym => {
        if (left() < 2500) return
        try {
          const b = await daily(sym, now)
          const L = b && levelsOf(b, m.s)
          if (L && isFresh(b, now)) { lv.bySym[sym] = { hiN: L.hiN, loM: L.loM, atr: L.atr, close: L.close }; delete lv.miss[sym] } else lv.miss[sym] = now
        } catch { lv.miss[sym] = now }
      })
      lv.at = Date.now()
      await D.setMeta(lk, lv).catch(() => {})
    }
    r.levels = `${Object.keys(lv.bySym).length}/${lv.total}`
    // uscite
    r.exits = []
    for (const p of m.open) {
      const L = lv.bySym[p.symbol]
      const ex = p.day === day ? p.stop0 : exitOf(p, L?.loM ?? p.loM)
      if (L && p.loM !== L.loM && p.day !== day) { p.loM = L.loM }
      const px = prices[ASSET_MAP[p.symbol].perp]
      try {
        if (m.mode === 'paper') {
          await accrueFunding(p, now)
          if (px && p.liq && px <= p.liq) { await bookClose('paper', p, { ...closeResult(p, p.liq, m.s, { liq: true, funding: p.funding || 0 }), exit: p.liq, reason: 'liquidazione', liquidated: true }, now); r.exits.push(p.symbol); continue }
          if (px && px < ex) {
            const exit = px * (1 - m.s.slip / 100)
            await bookClose('paper', p, { ...closeResult(p, exit, m.s, { funding: p.funding || 0 }), exit, reason: ex === p.stop0 ? 'stop ATR' : `minimo ${m.s.exitM} giorni` }, now)
            r.exits.push(p.symbol); continue
          }
          await savePos('paper', p)
        } else {
          const res = await manageLive(p, ex, px, m.s, now)
          if (res) r.exits.push(`${p.symbol}: ${res}`)
        }
      } catch (e) { r.exits.push(`${p.symbol}: errore ${e.message}`) }
    }
    // entrate
    if (!m.s.active || !entries || left() < 3000) continue
    if (m.mode === 'live' && !D.liveAllowed()) { r.entries = 'Reale non abilitato (LIVE_TRADING o chiavi)'; continue }
    const all = await D.listPos(m.mode)
    const openNow = all.filter(p => p.status === 'open')
    const exitedToday = new Set(all.filter(p => p.closedDay === day).map(p => p.symbol))
    const cands = list.filter(sym => {
      const L = lv.bySym[sym], px = prices[ASSET_MAP[sym].perp]
      return L && px > L.hiN && !openNow.some(p => p.symbol === sym) && !exitedToday.has(sym)
    }).map(sym => ({ sym, L: lv.bySym[sym], px: prices[ASSET_MAP[sym].perp] })).sort((a, b) => (b.px - b.L.hiN) / b.L.atr - (a.px - a.L.hiN) / a.L.atr)
    r.entries = []
    for (const c of cands.slice(0, 3)) {
      if (left() < 2500) break
      if (m.s.maxPos && openNow.length >= m.s.maxPos) { r.entries.push('posizioni massime raggiunte'); break }
      try {
        const p = m.mode === 'paper' ? await openPaper(c, m.s, openNow, now) : await openLiveTurtle(c, m.s, openNow, now)
        if (p?.id) { openNow.push(p); r.entries.push(`${c.sym} aperto`) } else if (p?.skip) r.entries.push(`${c.sym}: ${p.skip}`)
      } catch (e) { r.entries.push(`${c.sym}: ${e.message}`) }
    }
  }
  out.ms = Date.now() - t0
  return out
}

// Funding della Prova: al tasso di Bitunix di quel momento, a ogni orario del funding con la posizione aperta (long paga se positivo)
let frCache = null
async function accrueFunding(p, now) {
  const H = (p.fundingH || 8) * 3600000
  const nextAt = (Math.floor((p.fundAt || p.openedAt) / H) + 1) * H
  if (now < nextAt) return
  if (!frCache || now - frCache.at > 10 * 60000) frCache = { at: now, data: await D.bx.fundingRates().catch(() => ({})) }
  const rate = frCache.data[ASSET_MAP[p.symbol].perp]?.rate ?? 0
  const n = Math.floor((now - nextAt) / H) + 1
  p.funding = (p.funding || 0) + n * rate * p.qty * p.entry
  p.fundAt = now
}

async function openPaper(c, s, openNow, now) {
  const acc = await getAccount('paper')
  if (!acc) return { skip: 'conto di prova non avviato' }
  if (!(await D.claimSymbol('turtle-paper', dayKey(now), c.sym, 'turtle'))) return { skip: 'già prenotato oggi' }
  const lim = (await limitsAll([c.sym]))[c.sym]
  const base = Math.max(c.L.hiN, c.L.close), entry = c.px * (1 + s.slip / 100)
  const free = acc.balance - openNow.filter(p => p.epoch === acc.epoch).reduce((x, p) => x + p.margin, 0)
  const z = sizeTrade({ entry, base, atr: c.L.atr, balance: acc.balance, free, s, lim })
  if (z.skip) return z
  const p = { id: String(now) + c.sym, mode: 'paper', epoch: acc.epoch, symbol: c.sym, day: dayKey(now), openedAt: now, fundAt: now, fundingH: lim.fundingH || 8, entry, signal: c.px, hiN: c.L.hiN, atr: c.L.atr, loM: c.L.loM, ...z, funding: 0, status: 'open' }
  await savePos('paper', p)
  await D.notifyTrades([{ title: `🐢 Turtle Prova · ${c.sym} long`, body: `Breakout sopra ${c.L.hiN.toPrecision(6)} · entrata ${entry.toPrecision(6)} · stop ${z.stop0.toPrecision(6)} · leva ${z.leverage}x`, url: '/turtle?mode=paper', tag: `turtle-paper-${c.sym}` }]).catch(() => {})
  return p
}

// ---------- Reale ----------
// Apertura USA nel Reale (stesso conto Bitunix): i suoi titoli restano suoi e il suo capitale dedicato non ancora impegnato
// resta riservato (stesse regole degli ordini manuali, server/manual.js). Così Turtle non cambia niente di Apertura USA.
async function aperturaLive() {
  const [acc, open, ded] = await Promise.all([
    q(db().from('wt_accounts').select('enabled, settings').eq('mode', 'live').maybeSingle()),
    q(db().from('wt_positions').select('margin').eq('mode', 'live').eq('status', 'open')),
    getCapital('live').catch(() => null),
  ])
  const st = acc ? settingsFor('live', acc.settings) : null
  const used = open.reduce((x, p) => x + (+p.margin || 0), 0)
  return {
    symbols: new Set(acc?.enabled ? st?.symbols || [] : []),
    reserve: acc?.enabled && st?.capitalMode === 'dedicated' && ded?.current > 0 ? Math.max(0, ded.current - used) : 0,
  }
}
const ourLiveIds = async () => new Set((await D.listPos('live')).filter(p => p.status === 'open').map(p => p.exchange?.positionId).filter(Boolean).map(String))
async function openLiveTurtle(c, s, openNow, now) {
  const acc = await getAccount('live')
  if (!acc) return { skip: 'capitale del Reale non impostato' }
  const ap = await D.aperturaLive()
  if (ap.symbols.has(c.sym)) return { skip: 'titolo della strategia Apertura USA nel Reale' }
  const pair0 = (await D.getPairs()).find(p => p.symbol === ASSET_MAP[c.sym].perp)
  if (!pair0 || pair0.api === false) return { skip: 'non operabile via API su Bitunix' }
  if (!(await D.claimSymbol('turtle-live', dayKey(now), c.sym, 'turtle'))) return { skip: 'già prenotato oggi' }
  const pair = { ...pair0, step: 10 ** -(pair0.basePrecision ?? 3) }
  const perp = pair.symbol
  const tiers = await D.bx.positionTiers(perp).catch(() => null)
  const lim = { maxLev: pair.maxLeverage, tiers: tiers?.length ? tiers : null }
  const base = Math.max(c.L.hiN, c.L.close)
  const free = acc.balance - openNow.reduce((x, p) => x + p.margin, 0)
  const z = sizeTrade({ entry: c.px, base, atr: c.L.atr, balance: acc.balance, free, s, lim })
  if (z.skip) return z
  // saldo vero disponibile su Bitunix
  const a = await D.bx.account().catch(() => null)
  if (!a) return { skip: 'saldo di Bitunix non leggibile' }
  if (a.available - ap.reserve < z.margin) return { skip: `saldo libero su Bitunix insufficiente (${a.available.toFixed(2)} USDT${ap.reserve ? `, ${ap.reserve.toFixed(2)} riservati ad Apertura USA` : ''})` }
  const clientId = `wtT${now.toString(36)}${c.sym}`.slice(0, 30)
  let r
  try {
    r = await openLive(D.bx, { perp, pair, side: 1, notional: z.notional, price: c.px, leverage: z.leverage, stopDist: c.px - z.stop0, ourIds: await ourLiveIds(), clientId, now: Date.now })
  } catch (e) {
    if (e instanceof LiveSkip) {
      if (e.noSl) await D.markNotOperable(c.sym, 'stop', e.message).catch(() => false)
      if (e.notify) await D.notifyTrades([{ title: `⚠️ Turtle Reale · ${c.sym}`, body: e.message, url: '/turtle?mode=live', tag: `turtle-live-${c.sym}` }]).catch(() => {})
      return { skip: e.message }
    }
    throw e
  }
  if (r.unidentified) {
    await D.notifyTrades([{ title: `⚠️ Turtle Reale · ${c.sym}`, body: `Ordine inviato ma posizione non riconosciuta (${r.why}): controlla su Bitunix`, url: '/turtle?mode=live', tag: `turtle-live-${c.sym}` }]).catch(() => {})
    return { skip: r.why }
  }
  const stop0 = r.exchange.sl
  const p = {
    id: String(now) + c.sym, mode: 'live', epoch: acc.epoch, symbol: c.sym, day: dayKey(now), openedAt: now, entry: r.entry, signal: c.px, hiN: c.L.hiN, atr: c.L.atr, loM: c.L.loM,
    qty: r.qty, leverage: z.leverage, margin: r.qty * r.entry / z.leverage, notional: r.qty * r.entry, stop0, sl: stop0, risk: r.qty * (r.entry - stop0), liq: r.liqPrice || z.liq, exchange: r.exchange, status: 'open',
  }
  await savePos('live', p)
  // stop oltre la liquidazione con i dati veri di Bitunix: chiusura subito (come Apertura USA)
  if (p.liq && stop0 <= p.liq) {
    await closeOurs(D.bx, { perp, positionId: r.exchange.positionId, side: 1, qty: r.qty, step: pair.step }).catch(() => {})
    await finishLive(p, 'stop oltre la liquidazione: chiusa subito', Date.now())
    return { skip: 'stop oltre la liquidazione (chiusa subito)' }
  }
  await D.notifyTrades([{ title: `🐢 Turtle Reale · ${c.sym} long`, body: `Entrata ${r.entry.toPrecision(6)} · stop ${stop0.toPrecision(6)} · leva ${z.leverage}x · ${r.qty} ${c.sym}`, url: '/turtle?mode=live', tag: `turtle-live-${c.sym}` }]).catch(() => {})
  return p
}

// Chiusura del Reale con i dati veri di Bitunix (prezzo, commissioni, funding); se non ci sono ancora si usa il prezzo letto
async function finishLive(p, reason, now, fallbackPx = null) {
  const perp = ASSET_MAP[p.symbol].perp
  let h = null
  for (let i = 0; i < 3 && !h; i++) { if (i) await D.wait(600); h = await D.bx.positionHistory(perp, p.exchange?.positionId).catch(() => null) }
  const exit = h?.closePrice ?? fallbackPx ?? p.sl
  const gross = (exit - p.entry) * p.qty
  const fees = h?.fee !== null && h?.fee !== undefined ? Math.abs(h.fee) : p.qty * (p.entry + exit) * 0.06 / 100
  const funding = h?.funding !== null && h?.funding !== undefined ? -h.funding : 0 // Bitunix: negativo = pagato; qui positivo = pagato
  const liquidated = !!(h?.liqQty > 0)
  const pnl = liquidated ? -p.margin - fees : gross - fees - funding
  await bookClose('live', p, { exit, gross, fees, funding, pnl, R: p.risk > 0 ? pnl / p.risk : null, reason: liquidated ? 'liquidazione' : reason, liquidated, real: !!h }, now)
}

async function manageLive(p, ex, px, s, now) {
  const perp = ASSET_MAP[p.symbol].perp
  const positionId = p.exchange?.positionId
  // stop su Bitunix alzato al livello d'uscita (solo verso l'alto)
  if (ex > (p.sl || 0) * (1 + 1e-6) && p.exchange?.slOrderId) {
    try { await D.bx.modifyStopLoss({ orderId: p.exchange.slOrderId, slPrice: +ex.toPrecision(8), qty: p.qty }); p.sl = ex; await savePos('live', p) } catch (e) { p.slMoveErr = e.message }
  }
  // prezzo sotto il livello e posizione ancora aperta: si chiude a mercato
  if (px && px < ex) {
    const r = await closeOurs(D.bx, { perp, positionId, side: 1, qty: p.qty })
    await finishLive(p, r.gone ? 'stop su Bitunix' : (ex === p.stop0 ? 'stop ATR' : `minimo ${s.exitM} giorni`), now, px)
    return 'chiusa'
  }
  // stop verificato su Bitunix ogni 5 minuti
  if (new Date(now).getUTCMinutes() % 5 === 3) {
    const prev = p.slCheck || {}
    const r = await checkStop(D.bx, { perp, positionId, slPrice: p.sl, qty: p.qty, replacedBefore: prev.state === 'replaced' }).catch(e => ({ state: 'unknown', why: e.message }))
    p.slCheck = { ...r, at: now }
    if (r.state === 'gone') { await finishLive(p, 'stop su Bitunix', now); return 'chiusa da Bitunix' }
    if (r.state === 'failed') {
      await closeOurs(D.bx, { perp, positionId, side: 1, qty: p.qty }).catch(() => {})
      await finishLive(p, `stop non mantenuto su Bitunix: chiusa (${r.why})`, now, px)
      await D.markNotOperable(p.symbol, 'stop', r.why).catch(() => false)
      await D.notifyTrades([{ title: `⚠️ Turtle Reale · ${p.symbol} chiusa`, body: `Stop non mantenuto su Bitunix (${r.why})`, url: '/turtle?mode=live', tag: `turtle-live-${p.symbol}` }]).catch(() => {})
      return 'chiusa (stop mancante)'
    }
    await savePos('live', p)
  }
  return null
}

// Chiusura a mano dalla pagina
export async function closeTurtle(mode, id, now = Date.now()) {
  const p = await D.getMeta(posKey(mode, id))
  if (!p || p.status !== 'open') throw new TurtleError('Posizione non trovata o già chiusa', 404)
  const s = await getSettings(mode)
  const px = (await D.bx.allTickers())[ASSET_MAP[p.symbol].perp]
  if (!px) throw new TurtleError('Prezzo non disponibile su Bitunix', 502)
  if (mode === 'paper') {
    await accrueFunding(p, now)
    const exit = px * (1 - s.slip / 100)
    await bookClose('paper', p, { ...closeResult(p, exit, s, { funding: p.funding || 0 }), exit, reason: 'chiusa da te' }, now)
  } else {
    await closeOurs(D.bx, { perp: ASSET_MAP[p.symbol].perp, positionId: p.exchange.positionId, side: 1, qty: p.qty })
    await finishLive(p, 'chiusa da te', now, px)
  }
  return getState(mode)
}
