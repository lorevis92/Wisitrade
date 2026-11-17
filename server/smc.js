// Strategia SMC dal vivo (Prova e Reale) e Simulazione. Regole in shared/smc.js, spiegazione in docs/smc.md.
// Indipendente dalle altre strategie: impostazioni, conti, storico e configurazioni propri in wt_meta (nessuna tabella nuova):
//   smc:set:<mode>            impostazioni (cleanSmc + active)
//   smc:acc:<mode>            conto { start, balance, startAt, epoch, curve, day, dayStart, dayPnl }
//   smc:pos:<mode>:<id>       posizioni (aperte e chiuse) con tutte le variabili del setup
//   smc:st:<mode>             stato dell'analisi: ultima candela per titolo, direzione, setup in corso, notifiche, registro
//   smc:presets               configurazioni salvate con nome (comuni alle tre schede SMC)
//   smc:bars:<perp>:<tf>      ultime candele chiuse (Prova e Reale), smc:m:<perp>:<tf>:<mese> archivio a mesi (Simulazione)
//   smc:m1:<perp>             candele da 1 minuto delle candele con stop e target insieme (Simulazione)
//   smc:marks                 titoli rifiutati da Bitunix via API (si riprovano dopo 7 giorni)
// Reale: stesse protezioni di Apertura USA e Turtle (server/live.js), senza eccezioni: ordini solo con LIVE_TRADING=on, chiavi e
// conto attivo; margine isolato verificato; leva mai oltre il massimo di Bitunix; stop dentro l'ordine e ricontrollato; chiusura
// subito se lo stop manca o è oltre la liquidazione; mai su titoli con posizioni o ordini non suoi (manuali, Apertura USA, Turtle);
// mai il capitale riservato ad Apertura USA; prenotazione del segnale (wt_meta claim:smc-live:<ora>:<titolo>).
import * as bx from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { ASSET_MAP } from '../shared/assets.js'
import { settingsFor } from '../shared/opening.js'
import { getCapital } from './capital.js'
import { getPairs } from './scanner.js'
import { openLive, closeOurs, checkStop, LiveSkip } from './live.js'
import { liveAllowed, claimSymbol } from './strategy.js'
import { notifyTrades } from './push.js'
import { loadLiveSlip, slipValues } from './pslip.js'
import { cleanSmc, analyze, checkEntry, sizeSmc, closeSmc, exitOnBar, simulate, TF_MS, dayKey } from '../shared/smc.js'

const DAY = 864e5, MIN = 6e4
export const MODES = ['paper', 'live']
const PERP_SYM = Object.fromEntries(Object.values(ASSET_MAP).map(a => [a.perp, a.symbol]))

// Dipendenze sostituibili nelle prove (tests/smc-live.test.mjs)
export const D = {
  bx, getMeta, setMeta, getPairs, liveAllowed, claimSymbol, notifyTrades, loadLiveSlip,
  aperturaLive: (...a) => aperturaLive(...a), listPos: (...a) => listPos(...a), wait: ms => new Promise(r => setTimeout(r, ms)),
}
export class SmcError extends Error { constructor(msg, status = 400) { super(msg); this.status = status } }

// ---------- Candele ----------
const pack = b => [b.t, b.o, b.h, b.l, b.c]
const unpack = a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4] })
const closedOnly = (bars, tf, now) => bars.filter(b => b.t + TF_MS[tf] <= now)
// Candele da `from` a `to` (escluso), pagina per pagina all'indietro
async function fetchRange(perp, tf, from, to) {
  let out = [], end = to - 1
  for (let guard = 0; guard < 400; guard++) {
    const page = await D.bx.klines(perp, tf, 200, { endTime: end })
    const fresh = page.filter(b => b.t >= from && b.t < to && (!out.length || b.t < out[0].t))
    out = [...fresh, ...out]
    if (!page.length || page[0].t <= from || page.length < 200 || !fresh.length) break
    end = page[0].t - 1
  }
  return out
}
// Ultime n candele chiuse (Prova e Reale): archivio in wt_meta, si scaricano solo quelle nuove
export async function recentBars(perp, tf, n, now = Date.now()) {
  const key = `smc:bars:${perp}:${tf}`, step = TF_MS[tf]
  const c = await D.getMeta(key).catch(() => null)
  let bars = c?.bars?.map(unpack) || []
  const lastClosed = Math.floor(now / step) * step - step
  if (bars.length && bars.at(-1).t >= lastClosed && bars.length >= Math.min(n, c.n || n)) return bars.slice(-n)
  const missing = bars.length ? Math.ceil((now - bars.at(-1).t) / step) + 2 : n
  if (bars.length && missing < n) {
    const fresh = await D.bx.klinesBack(perp, tf, missing)
    const m = new Map(bars.map(b => [b.t, b]))
    for (const b of fresh) m.set(b.t, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })
    bars = [...m.values()].sort((a, b) => a.t - b.t)
  } else bars = (await D.bx.klinesBack(perp, tf, n + 2)).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }))
  bars = closedOnly(bars, tf, now).slice(-n)
  if (bars.length) await D.setMeta(key, { at: now, n, bars: bars.map(pack) }).catch(() => {})
  return bars
}
const monthStart = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) }
const nextMonth = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) }
// Storico per la Simulazione: mesi completi archiviati in wt_meta (si scaricano una volta), il mese in corso sempre da Bitunix
export async function historyBars(perp, tf, from, now = Date.now(), onMonth = null) {
  const months = []
  for (let m = monthStart(from); m < now; m = nextMonth(m)) months.push(m)
  const out = []
  let emptyRun = 0
  for (const m of months.reverse()) { // dal più recente: l'inizio dello storico di Bitunix si riconosce da due mesi vuoti
    const end = nextMonth(m), complete = end + TF_MS[tf] <= now
    const key = `smc:m:${perp}:${tf}:${new Date(m).toISOString().slice(0, 7)}`
    let bars = complete ? (await D.getMeta(key).catch(() => null))?.bars?.map(unpack) : null
    if (!bars) {
      bars = closedOnly(await fetchRange(perp, tf, m, Math.min(end, now)), tf, now)
      if (complete) await D.setMeta(key, { at: now, bars: bars.map(pack) }).catch(() => {})
    }
    onMonth?.()
    out.unshift(bars)
    if (!bars.length) { if (++emptyRun >= 2) break } else emptyRun = 0
  }
  return out.flat().filter(b => b.t >= from)
}

// Leva massima, scaglioni e funding di Bitunix per le coppie scelte
async function limitsFor(perps) {
  const [pairs, fr] = await Promise.all([D.getPairs(), D.bx.fundingRates().catch(() => ({}))])
  const out = {}
  for (const perp of perps) {
    const p = pairs.find(x => x.symbol === perp)
    const tiers = p ? await D.bx.positionTiers(perp).catch(() => null) : null
    out[perp] = { available: !!p, api: p?.api !== false, maxLev: p?.maxLeverage ?? null, tiers: tiers?.length ? tiers : null, fundingH: fr[perp]?.hours || 8, pair: p || null }
  }
  return out
}

// ---------- Simulazione (in streaming) ----------
export async function smcSim(body, send, isClosed = () => false) {
  const s = cleanSmc(body?.settings)
  const now = Date.now()
  const from = Number.isFinite(Date.parse(body?.from)) ? Date.parse(body.from) : now - 365 * DAY
  const to = Number.isFinite(Date.parse(body?.to)) ? Date.parse(body.to) + DAY : null
  const warm = Math.max(300 * TF_MS[s.dirTf], s.ageE * TF_MS[s.entryTf], 14 * DAY) // storico prima del periodo per livelli e direzione
  const data = {}, errors = []
  const lim = await limitsFor(s.symbols)
  for (const perp of s.symbols) {
    if (isClosed()) return null
    if (!lim[perp].available) { errors.push(`${perp}: non è una coppia di Bitunix`); continue }
    try {
      let k = 0
      const tick = what => () => { k++; if (k % 3 === 0) send({ t: 'phase', msg: `${perp}: candele ${what} (${k} mesi)` }) }
      send({ t: 'phase', msg: `${perp}: candele ${s.entryTf}` })
      const E = await historyBars(perp, s.entryTf, from - warm, now, tick(s.entryTf))
      k = 0; const Dd = await historyBars(perp, s.dirTf, from - warm - 30 * TF_MS[s.dirTf], now, tick(s.dirTf))
      k = 0; const D1 = await historyBars(perp, '1d', from - warm - 30 * DAY, now, tick('1d'))
      if (E.length) data[perp] = { E: to ? E.filter(b => b.t < to) : E, Dd, D1 }
      send({ t: 'load', sym: perp, bars: E.length, first: E[0]?.t ?? null })
    } catch (e) { errors.push(`${perp}: ${e.message}`) }
  }
  if (isClosed()) return null
  if (!Object.keys(data).length) throw new SmcError(`Nessuna candela disponibile${errors.length ? `: ${errors[0]}` : ''}`)
  send({ t: 'phase', msg: 'calcolo' })
  // il periodo parte quando c'è abbastanza storico (200 candele d'entrata) per ATR, livelli e direzione
  const realFrom = Math.max(from, Math.min(...Object.values(data).map(d => d.E[0].t)) + 200 * TF_MS[s.entryTf])
  let m1 = {}, r = simulate(data, lim, s, { from: realFrom, to })
  // stop e target nella stessa candela: si guardano le candele da 1 minuto (archivio smc:m1, altrimenti Bitunix), al massimo 300
  for (let pass = 0; pass < 3 && r.needM1.length; pass++) {
    send({ t: 'phase', msg: `candele da 1 minuto per ${r.needM1.length} candele con stop e target insieme` })
    const got = await loadM1(r.needM1.slice(0, 300), s.entryTf)
    if (!Object.keys(got).length) break
    m1 = { ...m1, ...got }
    r = simulate(data, lim, s, { from: realFrom, to, m1 })
  }
  const step = Math.ceil(r.curve.length / 1500)
  return {
    ...r, curve: r.curve.filter((_, i) => i % step === 0 || i === r.curve.length - 1), trades: r.trades.slice(-800), tradesTotal: r.trades.length,
    discarded: r.discarded.slice(-600), discardedTotal: r.discarded.length, discardedBy: countBy(r.discarded, d => d.reason.replace(/[\d.]+/g, '#')),
    errors, dataFrom: Object.fromEntries(Object.entries(data).map(([k, d]) => [k, d.E[0].t])), m1Used: Object.keys(m1).length, unresolved: r.needM1.length,
  }
}
const countBy = (list, f) => list.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m }, {})
async function loadM1(keys, tf) {
  const by = {}
  for (const k of keys) { const [perp, t] = k.split(':'); (by[perp] ||= []).push(+t) }
  const out = {}
  for (const [perp, ts] of Object.entries(by)) {
    const key = `smc:m1:${perp}`
    const cache = (await D.getMeta(key).catch(() => null)) || {}
    let changed = false
    for (const t of ts) {
      if (!cache[t]) {
        try { cache[t] = (await D.bx.klines(perp, '1m', Math.min(200, TF_MS[tf] / MIN), { startTime: t, endTime: t + TF_MS[tf] - 1 })).filter(b => b.t >= t && b.t < t + TF_MS[tf]).map(pack); changed = true } catch { continue }
      }
      if (cache[t]?.length) out[`${perp}:${t}`] = cache[t].map(unpack)
    }
    if (changed) {
      const keep = Object.keys(cache).sort((a, b) => b - a).slice(0, 1500)
      await D.setMeta(key, Object.fromEntries(keep.map(k => [k, cache[k]]))).catch(() => {})
    }
  }
  return out
}

// ---------- Grafico e analisi di un titolo (pagina) ----------
export async function smcChart(perp, raw, now = Date.now()) {
  const s = cleanSmc(raw)
  const [E, Dd, D1] = await Promise.all([recentBars(perp, s.entryTf, 1500, now), recentBars(perp, s.dirTf, 400, now), recentBars(perp, '1d', 400, now)])
  if (!E.length) throw new SmcError(`${perp} non ha candele su Bitunix`, 404)
  const r = analyze({ E, Dd, D1, s0: s, keepFrom: Math.max(0, E.length - 500) })
  const from = E[Math.max(0, E.length - 500)].t
  return {
    symbol: perp, entryTf: s.entryTf, dirTf: s.dirTf, bars: E.slice(-500), flow: r.flow, atr: r.atr, levels: r.levels, taken: r.taken.slice(-150),
    obs: r.obs.slice(-40), fvgs: r.fvgs.slice(-60), pending: r.pending, signals: r.signals.filter(x => x.t >= from), decayed: r.decayed.filter(x => x.at >= from).slice(-40),
  }
}

// ---------- Conti, impostazioni, posizioni, configurazioni ----------
const setKey = mode => `smc:set:${mode}`, accKey = mode => `smc:acc:${mode}`, posKey = (mode, id) => `smc:pos:${mode}:${id}`, stKey = mode => `smc:st:${mode}`
export async function getSettings(mode) { const raw = await D.getMeta(setKey(mode)); return { ...cleanSmc(raw || {}), active: !!raw?.active } }
const newAccount = (capital, now, epoch = 1) => ({ start: capital, balance: capital, startAt: now, epoch, curve: [{ t: now, balance: capital }], day: dayKey(now), dayStart: capital, dayPnl: 0 })
const getAccount = mode => D.getMeta(accKey(mode))
async function listPos(mode) {
  const rows = await q(db().from('wt_meta').select('key, value').like('key', `smc:pos:${mode}:%`).order('key', { ascending: false }).limit(600))
  return rows.map(r => r.value).filter(Boolean)
}
const savePos = (mode, p) => D.setMeta(posKey(mode, p.id), p)

export async function saveSettings(mode, raw, now = Date.now()) {
  if (!MODES.includes(mode)) throw new SmcError('Modalità non valida')
  const s = cleanSmc(raw)
  const prev = await D.getMeta(setKey(mode))
  const active = typeof raw?.active === 'boolean' ? raw.active : !!prev?.active
  if (mode === 'live' && active && !D.liveAllowed()) throw new SmcError('Reale non attivabile: servono LIVE_TRADING=on e le chiavi Bitunix su Vercel')
  await D.setMeta(setKey(mode), { ...s, active })
  if (!(await getAccount(mode))) await D.setMeta(accKey(mode), newAccount(s.capital, now))
  return getState(mode, now)
}
export async function resetAccount(mode, capital, now = Date.now()) {
  if (!MODES.includes(mode)) throw new SmcError('Modalità non valida')
  const c = +capital
  if (!(c >= 50 && c < 1e8)) throw new SmcError('Capitale non valido (minimo 50 USDT)')
  const acc = await getAccount(mode)
  const open = (await D.listPos(mode)).filter(p => p.status === 'open')
  if (mode === 'live' && open.length) throw new SmcError('Chiudi prima le posizioni aperte del Reale')
  for (const p of open) { p.status = 'azzerata'; p.closedAt = now; await savePos(mode, p) }
  await D.setMeta(accKey(mode), newAccount(c, now, (acc?.epoch || 1) + 1))
  const s = await D.getMeta(setKey(mode))
  await D.setMeta(setKey(mode), { ...cleanSmc(s || {}), active: !!s?.active, capital: c })
  return getState(mode, now)
}
export async function getPresets() { return (await D.getMeta('smc:presets')) || [] }
export async function savePreset(name, settings) {
  const nm = String(name || '').trim().slice(0, 40)
  if (!nm) throw new SmcError('Serve un nome')
  const list = (await getPresets()).filter(p => p.name !== nm)
  const { active, ...s } = cleanSmc(settings)
  list.unshift({ name: nm, settings: s, at: Date.now() })
  await D.setMeta('smc:presets', list.slice(0, 50))
  return list
}
export async function deletePreset(name) { const list = (await getPresets()).filter(p => p.name !== name); await D.setMeta('smc:presets', list); return list }
export async function smcPairs() {
  const [pairs, marks] = await Promise.all([D.getPairs(), D.getMeta('smc:marks').catch(() => null)])
  return pairs.filter(p => p.api !== false).map(p => ({ symbol: p.symbol, maxLev: p.maxLeverage ?? null, mark: marks?.[p.symbol] && Date.now() - marks[p.symbol].at < 7 * DAY ? marks[p.symbol].why : null })).sort((a, b) => a.symbol.localeCompare(b.symbol))
}
async function markNotOperable(perp, why, now = Date.now()) {
  const m = (await D.getMeta('smc:marks').catch(() => null)) || {}
  m[perp] = { why: String(why).slice(0, 200), at: now }
  await D.setMeta('smc:marks', m).catch(() => {})
}

function bookDay(acc, now) { const d = dayKey(now); if (acc.day !== d) { acc.day = d; acc.dayStart = acc.balance; acc.dayPnl = 0 } }
async function bookClose(mode, p, res, now) {
  Object.assign(p, res, { status: 'closed', closedAt: now, rrReal: p.risk > 0 ? res.pnl / p.risk : null })
  await savePos(mode, p)
  const acc = (await getAccount(mode)) || newAccount(p.margin, now)
  if (p.epoch === acc.epoch) {
    bookDay(acc, now)
    acc.balance = Math.max(0, acc.balance + res.pnl); acc.dayPnl += res.pnl
    acc.curve = [...(acc.curve || []), { t: now, balance: acc.balance }].slice(-500)
    await D.setMeta(accKey(mode), acc)
  }
  const s = await getSettings(mode)
  if (s.notifyExit) await D.notifyTrades([{ title: `SMC ${mode === 'live' ? 'Reale' : 'Prova'} · ${p.symbol} ${p.side > 0 ? 'long' : 'short'} chiusa`, body: `${p.reason} · ${res.pnl >= 0 ? '+' : ''}${res.pnl.toFixed(2)} USDT (${(res.R ?? 0).toFixed(2)}R)`, url: `/smc?mode=${mode}`, tag: `smc-${mode}-${p.symbol}` }]).catch(() => {})
}

export async function getState(mode, now = Date.now()) {
  if (!MODES.includes(mode)) throw new SmcError('Modalità non valida')
  const [settings, acc, all, st] = await Promise.all([getSettings(mode), getAccount(mode), D.listPos(mode), D.getMeta(stKey(mode)).catch(() => null)])
  const open = all.filter(p => p.status === 'open')
  const prices = open.length ? await D.bx.allTickers().catch(() => ({})) : {}
  return {
    mode, settings, account: acc,
    open: open.map(p => { const last = prices[p.symbol] ?? null; return { ...p, last, upnl: last !== null ? (last - p.entry) * p.qty * p.side : null } }),
    history: all.filter(p => p.status !== 'open' && (!acc || p.epoch === acc.epoch)).slice(0, 300),
    analysis: st?.bySym || {}, log: (st?.log || []).slice(0, 150), checkedAt: st?.at || null, liveAllowed: D.liveAllowed(),
  }
}

// ---------- Controllo ogni minuto (Prova e Reale) ----------
// 1. uscite delle posizioni aperte (sempre); 2. per ogni titolo, quando si chiude una candela del timeframe d'entrata:
// analisi (stessa funzione della Simulazione), setup in corso, notifiche; entrata se il rifiuto è sull'ultima candela chiusa
// (al massimo 3 minuti dopo la chiusura). entries = false durante l'apertura USA (come Turtle: la strategia Apertura USA ha la precedenza).
export async function runSmc({ budgetMs = 10000, entries = true, now = Date.now() } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0)
  const modes = []
  for (const mode of MODES) {
    const s = await getSettings(mode)
    const open = (await D.listPos(mode)).filter(p => p.status === 'open')
    if (s.active || open.length) modes.push({ mode, s, open })
  }
  if (!modes.length) return { idle: true }
  let prices
  try { prices = await D.bx.allTickers() } catch (e) { return { error: `prezzi non disponibili: ${e.message}` } }
  const out = {}, cache = new Map()
  for (const m of modes) {
    const r = out[m.mode] = { exits: [], entries: [] }
    // 1. uscite
    for (const p of m.open) {
      try { const x = m.mode === 'paper' ? await managePaper(p, prices[p.symbol], m.s, now) : await manageLive(p, prices[p.symbol], m.s, now); if (x) r.exits.push(`${p.symbol}: ${x}`) } catch (e) { r.exits.push(`${p.symbol}: errore ${e.message}`) }
    }
    if (!m.s.active) continue
    // 2. analisi alla chiusura di ogni candela d'entrata
    const st = (await D.getMeta(stKey(m.mode)).catch(() => null)) || { bySym: {}, notified: {}, log: [] }
    const step = TF_MS[m.s.entryTf], closeT = Math.floor(now / step) * step
    const log = x => { st.log.unshift({ at: now, ...x }); st.log = st.log.slice(0, 300) }
    let changed = false
    for (const perp of m.s.symbols) {
      if (left() < 3000) break
      const prev = st.bySym[perp]
      if (prev?.lastT >= closeT && prev.tf === `${m.s.entryTf}/${m.s.dirTf}`) continue
      const ck = `${perp}|${m.s.entryTf}|${m.s.dirTf}|${JSON.stringify([m.s.atrN, m.s.mergeAtr, m.s.fvgMinAtr, m.s.obBack, m.s.riseMax, m.s.invBars, m.s.retBars, m.s.rejBars, m.s.stopAtr, m.s.stopAtSweep, m.s.ageE, m.s.ageD, m.s.allowNeutral])}`
      let a = cache.get(ck)
      try {
        if (!a) {
          const [E, Dd, D1] = await Promise.all([recentBars(perp, m.s.entryTf, 2000, now), recentBars(perp, m.s.dirTf, 400, now), recentBars(perp, '1d', 400, now)])
          if (!E.length || E.at(-1).t + step < closeT) { r.entries.push(`${perp}: candela appena chiusa non ancora su Bitunix`); continue }
          a = { r: analyze({ E, Dd, D1, s0: m.s }), lastT: E.at(-1).t + step }
          cache.set(ck, a)
        }
      } catch (e) { r.entries.push(`${perp}: candele non disponibili (${e.message})`); continue }
      changed = true
      st.bySym[perp] = { lastT: a.lastT, tf: `${m.s.entryTf}/${m.s.dirTf}`, flow: a.r.flow, atr: a.r.atr, pending: a.r.pending, at: now }
      // notifiche: setup in attesa del ritorno, setup decaduti (solo quelli già notificati)
      for (const p of a.r.pending) {
        if (p.stage === 'ret' && !st.notified[p.id + perp]) {
          st.notified[p.id + perp] = 'ret'
          log({ sym: perp, side: p.side, kind: 'setup', text: `in attesa del ritorno nella zona ${p.ob.lo.toPrecision(6)}–${p.ob.hi.toPrecision(6)} (presa di ${p.level.p.toPrecision(6)})` })
          if (m.s.notifySetup) await D.notifyTrades([{ title: `SMC ${m.mode === 'live' ? 'Reale' : 'Prova'} · ${perp} setup ${p.side > 0 ? 'long' : 'short'}`, body: `Presa di ${p.level.p.toPrecision(6)} e inversione: in attesa del ritorno nella zona ${p.ob.lo.toPrecision(6)}–${p.ob.hi.toPrecision(6)}`, url: `/smc?mode=${m.mode}`, tag: `smc-${m.mode}-${perp}-setup` }]).catch(() => {})
        }
      }
      for (const d of a.r.decayed.filter(x => x.at === a.lastT)) {
        if (!st.notified[d.id + perp]) continue
        delete st.notified[d.id + perp]
        log({ sym: perp, side: d.side, kind: 'decaduto', text: d.reason })
        if (m.s.notifyDecay) await D.notifyTrades([{ title: `SMC ${m.mode === 'live' ? 'Reale' : 'Prova'} · ${perp} setup decaduto`, body: d.reason, url: `/smc?mode=${m.mode}`, tag: `smc-${m.mode}-${perp}-setup` }]).catch(() => {})
      }
      // entrata: rifiuto sull'ultima candela chiusa
      const sig = a.r.signals.find(x => x.t === a.lastT)
      if (!sig) continue
      delete st.notified[sig.id + perp]
      const why = await entryBlock(m, perp, sig, now, entries)
      if (why) { log({ sym: perp, side: sig.side, kind: 'scartato', text: why }); r.entries.push(`${perp}: ${why}`); continue }
      try {
        const res = m.mode === 'paper' ? await openPaper(perp, sig, prices[perp], m.s, now) : await openLiveSmc(perp, sig, prices[perp], m.s, now)
        if (res?.id) { r.entries.push(`${perp} aperto`); log({ sym: perp, side: sig.side, kind: 'entrata', text: `entrata ${res.entry.toPrecision(6)} · stop ${res.stop.toPrecision(6)} · target ${res.target.toPrecision(6)} · R/R ${res.rrPlan.toFixed(2)}` }) }
        else if (res?.skip) { r.entries.push(`${perp}: ${res.skip}`); log({ sym: perp, side: sig.side, kind: 'scartato', text: res.skip }) }
      } catch (e) { r.entries.push(`${perp}: ${e.message}`); log({ sym: perp, side: sig.side, kind: 'errore', text: e.message }) }
    }
    if (changed) {
      const keep = Object.keys(st.notified).slice(-200)
      st.notified = Object.fromEntries(keep.map(k => [k, st.notified[k]]))
      st.at = now
      await D.setMeta(stKey(m.mode), st).catch(() => {})
    }
  }
  out.ms = Date.now() - t0
  return out
}

// Regole del conto prima di un'entrata (uguali per Prova e Reale, come nella Simulazione)
async function entryBlock(m, perp, sig, now, entries) {
  if (now - sig.t > 3 * MIN) return 'rifiuto visto troppo tardi (oltre 3 minuti dalla chiusura della candela)'
  if (!entries) return 'apertura USA in corso (9:25–10:40 New York): entrate sospese'
  if (m.mode === 'live' && !D.liveAllowed()) return 'Reale non abilitato (LIVE_TRADING o chiavi)'
  const acc = await getAccount(m.mode)
  if (!acc) return 'conto non avviato'
  const all = await D.listPos(m.mode)
  const open = all.filter(p => p.status === 'open')
  if (open.some(p => p.symbol === perp)) return 'posizione già aperta sul titolo'
  if (open.length >= m.s.maxPos) return `${m.s.maxPos} posizioni già aperte`
  bookDay(acc, now)
  if (acc.dayPnl <= -acc.dayStart * m.s.maxDayLoss / 100) return `perdita massima del giorno (${m.s.maxDayLoss}%) raggiunta`
  return null
}

const slipNow = async () => slipValues(await D.loadLiveSlip().catch(() => null))
async function limOf(perp) {
  const pair = (await D.getPairs()).find(p => p.symbol === perp)
  const tiers = pair ? await D.bx.positionTiers(perp).catch(() => null) : null
  return { pair, lim: { maxLev: pair?.maxLeverage ?? null, tiers: tiers?.length ? tiers : null } }
}
const setupRecord = (sig, ck) => ({ level: sig.level, ob: sig.ob, fvg: sig.fvg, fvg2: sig.fvg2, sweep: sig.sweep, inv: sig.inv, rej: sig.rej, flow: sig.flow, ext: sig.ext, atr: sig.atr, target: ck.targetInfo })

async function openPaper(perp, sig, px, s, now) {
  if (!px) return { skip: 'prezzo non disponibile' }
  const acc = await getAccount('paper')
  if (!(await D.claimSymbol('smc-paper', sig.t, perp, 'smc'))) return { skip: 'segnale già usato' }
  const sl = await slipNow()
  const entry = px * (1 + sig.side * sl.in_minuto.pct / 100)
  const ck = checkEntry(sig, entry, s, s.fee + sl.segue.pct)
  if (ck.skip) return ck
  const { lim } = await limOf(perp)
  const open = (await D.listPos('paper')).filter(p => p.status === 'open' && p.epoch === acc.epoch)
  bookDay(acc, now)
  const z = sizeSmc({ side: sig.side, entry, stop: ck.stop, balance: acc.balance, free: acc.balance - open.reduce((x, p) => x + p.margin, 0), s, lim })
  if (z.skip) return z
  const fr = await D.bx.fundingRates().catch(() => ({}))
  const p = {
    id: String(now) + perp, mode: 'paper', epoch: acc.epoch, symbol: perp, side: sig.side, signalAt: sig.t, openedAt: now, signal: px, entry, slipIn: sl.in_minuto.pct,
    stop: ck.stop, target: ck.target, rrPlan: ck.rr, costPct: ck.costPct, ...z, setup: setupRecord(sig, ck), funding: 0, fundAt: now, fundingH: fr[perp]?.hours || 8, checkedTo: Math.ceil(now / MIN) * MIN, status: 'open',
  }
  await savePos('paper', p)
  if (s.notifyEntry) await D.notifyTrades([{ title: `SMC Prova · ${perp} ${sig.side > 0 ? 'long' : 'short'}`, body: `Entrata ${entry.toPrecision(6)} · stop ${ck.stop.toPrecision(6)} · target ${ck.target.toPrecision(6)} · R/R ${ck.rr.toFixed(2)} · leva ${z.leverage}x`, url: '/smc?mode=paper', tag: `smc-paper-${perp}` }]).catch(() => {})
  return p
}

// Funding della Prova al tasso di Bitunix a ogni orario del funding (positivo = pagato: il long paga se il tasso è positivo)
let frCache = null
async function accrueFunding(p, now) {
  const H = (p.fundingH || 8) * 3600000
  const nextAt = (Math.floor((p.fundAt || p.openedAt) / H) + 1) * H
  if (now < nextAt) return
  if (!frCache || now - frCache.at > 10 * MIN) frCache = { at: now, data: await D.bx.fundingRates().catch(() => ({})) }
  const rate = frCache.data[p.symbol]?.rate ?? 0
  const k = Math.floor((now - nextAt) / H) + 1
  p.funding = (p.funding || 0) + k * rate * p.qty * p.entry * p.side
  p.fundAt = now
}

// Prova: stop e target sulle candele da 1 minuto chiuse dal controllo precedente e sul prezzo di adesso
async function managePaper(p, px, s, now) {
  await accrueFunding(p, now)
  let closed = []
  if (now - p.checkedTo >= MIN) {
    try { closed = (await D.bx.klines(p.symbol, '1m', Math.min(200, Math.ceil((now - p.checkedTo) / MIN) + 1))).filter(b => b.t >= p.checkedTo && b.t + MIN <= now) } catch { /* resta il prezzo */ }
  }
  const bars = px ? [...closed, { t: now, o: px, h: px, l: px, c: px }] : closed
  for (const b of bars) {
    const ex = exitOnBar(p, b)
    if (!ex) continue
    const sl = await slipNow()
    const exit = ex.why === 'liquidazione' ? ex.px : ex.px * (1 - p.side * sl.segue.pct / 100)
    await bookClose('paper', p, { ...closeSmc(p, exit, s, { liq: ex.why === 'liquidazione', funding: p.funding || 0 }), exit, exitLevel: ex.px, reason: ex.why, liquidated: ex.why === 'liquidazione', slipOut: sl.segue.pct }, now)
    return ex.why
  }
  if (closed.length) p.checkedTo = closed.at(-1).t + MIN
  await savePos('paper', p)
  return null
}

// ---------- Reale ----------
// Apertura USA nel Reale (stesso conto Bitunix): i suoi titoli restano suoi e il suo capitale dedicato non impegnato resta
// riservato (stesse regole di Turtle e degli ordini manuali).
async function aperturaLive() {
  const [acc, open, ded] = await Promise.all([
    q(db().from('wt_accounts').select('enabled, settings').eq('mode', 'live').maybeSingle()),
    q(db().from('wt_positions').select('margin').eq('mode', 'live').eq('status', 'open')),
    getCapital('live').catch(() => null),
  ])
  const st = acc ? settingsFor('live', acc.settings) : null
  const used = open.reduce((x, p) => x + (+p.margin || 0), 0)
  return {
    perps: new Set(acc?.enabled ? (st?.symbols || []).map(x => ASSET_MAP[x]?.perp).filter(Boolean) : []),
    reserve: acc?.enabled && st?.capitalMode === 'dedicated' && ded?.current > 0 ? Math.max(0, ded.current - used) : 0,
  }
}
const ourLiveIds = async () => new Set((await D.listPos('live')).filter(p => p.status === 'open').map(p => p.exchange?.positionId).filter(Boolean).map(String))

async function openLiveSmc(perp, sig, px, s, now) {
  if (!px) return { skip: 'prezzo non disponibile' }
  const acc = await getAccount('live')
  const ap = await D.aperturaLive()
  if (ap.perps.has(perp)) return { skip: 'titolo della strategia Apertura USA nel Reale' }
  const marks = await D.getMeta('smc:marks').catch(() => null)
  if (marks?.[perp] && now - marks[perp].at < 7 * DAY) return { skip: `non operabile: ${marks[perp].why}` }
  const { pair: pair0, lim } = await limOf(perp)
  if (!pair0 || pair0.api === false) return { skip: 'non operabile via API su Bitunix' }
  // filtri sul prezzo d'entrata stimato (prezzo letto peggiorato dello slittamento): dopo l'esecuzione resta quasi sempre ≥ minimo
  const est = px * (1 + sig.side * s.slip / 100)
  const ck = checkEntry(sig, est, s, s.fee + s.slip)
  if (ck.skip) return ck
  const open = (await D.listPos('live')).filter(p => p.status === 'open')
  const z = sizeSmc({ side: sig.side, entry: px, stop: ck.stop, balance: acc.balance, free: acc.balance - open.reduce((x, p) => x + p.margin, 0), s, lim })
  if (z.skip) return z
  const a = await D.bx.account().catch(() => null)
  if (!a) return { skip: 'saldo di Bitunix non leggibile' }
  if (a.available - ap.reserve < z.margin) return { skip: `saldo libero su Bitunix insufficiente (${a.available.toFixed(2)} USDT${ap.reserve ? `, ${ap.reserve.toFixed(2)} riservati ad Apertura USA` : ''})` }
  if (!(await D.claimSymbol('smc-live', sig.t, perp, 'smc'))) return { skip: 'segnale già usato' }
  const pair = { ...pair0, step: 10 ** -(pair0.basePrecision ?? 3) }
  const clientId = `wtS${now.toString(36)}${perp}`.slice(0, 30)
  let r
  try {
    r = await openLive(D.bx, { perp, pair, side: sig.side, notional: z.notional, price: px, leverage: z.leverage, stopDist: Math.abs(px - ck.stop), ourIds: await ourLiveIds(), clientId, now: Date.now })
  } catch (e) {
    if (e instanceof LiveSkip) {
      if (e.noSl) await markNotOperable(perp, `stop rifiutato: ${e.message}`)
      if (e.notify) await D.notifyTrades([{ title: `⚠️ SMC Reale · ${perp}`, body: e.message, url: '/smc?mode=live', tag: `smc-live-${perp}` }]).catch(() => {})
      return { skip: e.message }
    }
    if (/not currently support trading via OpenAPI|not support.*open ?api/i.test(e.message)) await markNotOperable(perp, e.message)
    throw e
  }
  if (r.unidentified) {
    await D.notifyTrades([{ title: `⚠️ SMC Reale · ${perp}`, body: `Ordine inviato ma posizione non riconosciuta (${r.why}): controlla su Bitunix`, url: '/smc?mode=live', tag: `smc-live-${perp}` }]).catch(() => {})
    return { skip: r.why }
  }
  const stop = r.exchange.sl
  const risk = r.qty * Math.abs(r.entry - stop)
  const p = {
    id: String(now) + perp, mode: 'live', epoch: acc.epoch, symbol: perp, side: sig.side, signalAt: sig.t, openedAt: now, signal: px, entry: r.entry,
    stop, target: ck.target, rrPlan: ck.rr, rrFill: Math.abs(ck.target - r.entry) / Math.abs(r.entry - stop), costPct: ck.costPct,
    qty: r.qty, leverage: z.leverage, margin: r.qty * r.entry / z.leverage, notional: r.qty * r.entry, risk, liq: r.liqPrice || z.liq,
    setup: setupRecord(sig, ck), exchange: r.exchange, status: 'open',
  }
  await savePos('live', p)
  // stop oltre la liquidazione con i dati veri di Bitunix: chiusura subito
  if (p.liq && (p.side > 0 ? stop <= p.liq : stop >= p.liq)) {
    await closeOurs(D.bx, { perp, positionId: r.exchange.positionId, side: p.side, qty: r.qty, step: pair.step }).catch(() => {})
    await finishLive(p, 'stop oltre la liquidazione: chiusa subito', Date.now())
    return { skip: 'stop oltre la liquidazione (chiusa subito)' }
  }
  // target sull'ordine di Bitunix, se lo accetta; altrimenti lo gestisce l'app ogni minuto
  try {
    const tp = await D.bx.placeTakeProfit({ symbol: perp, positionId: r.exchange.positionId, tpPrice: +ck.target.toFixed(pair.quotePrecision ?? 6), qty: r.qty })
    p.exchange.tpOrderId = tp?.orderId ? String(tp.orderId) : 'ok'
  } catch (e) { p.exchange.tpErr = e.message; p.tpByApp = true }
  await savePos('live', p)
  if (s.notifyEntry) await D.notifyTrades([{ title: `SMC Reale · ${perp} ${sig.side > 0 ? 'long' : 'short'}`, body: `Entrata ${r.entry.toPrecision(6)} · stop ${stop.toPrecision(6)} · target ${ck.target.toPrecision(6)}${p.tpByApp ? ' (gestito dall\'app)' : ''} · leva ${z.leverage}x`, url: '/smc?mode=live', tag: `smc-live-${perp}` }]).catch(() => {})
  return p
}

// Chiusura del Reale con i dati veri di Bitunix (prezzo, commissioni, funding)
async function finishLive(p, reason, now, fallbackPx = null) {
  let h = null
  for (let i = 0; i < 3 && !h; i++) { if (i) await D.wait(600); h = await D.bx.positionHistory(p.symbol, p.exchange?.positionId).catch(() => null) }
  const exit = h?.closePrice ?? fallbackPx ?? p.stop
  const gross = (exit - p.entry) * p.qty * p.side
  const fees = h?.fee !== null && h?.fee !== undefined ? Math.abs(h.fee) : p.qty * (p.entry + exit) * 0.06 / 100
  const funding = h?.funding !== null && h?.funding !== undefined ? -h.funding : 0
  const liquidated = !!(h?.liqQty > 0)
  const pnl = liquidated ? -p.margin - fees : gross - fees - funding
  let why = reason
  if (reason === 'chiusa da Bitunix') why = Math.abs(exit - p.target) < Math.abs(exit - p.stop) ? 'target' : 'stop'
  await bookClose('live', p, { exit, gross, fees, funding, pnl, R: p.risk > 0 ? pnl / p.risk : null, reason: liquidated ? 'liquidazione' : why, liquidated, real: !!h }, now)
}

async function manageLive(p, px, s, now) {
  const perp = p.symbol, positionId = p.exchange?.positionId
  // prezzo oltre il target o lo stop e posizione ancora aperta: si chiude a mercato (se Bitunix l'ha già chiusa, si registra)
  if (px && (p.side < 0 ? px <= p.target || px >= p.stop : px >= p.target || px <= p.stop)) {
    const r = await closeOurs(D.bx, { perp, positionId, side: p.side, qty: p.qty })
    const hit = p.side < 0 ? (px <= p.target ? 'target' : 'stop') : (px >= p.target ? 'target' : 'stop')
    await finishLive(p, r.gone ? 'chiusa da Bitunix' : hit, now, px)
    return 'chiusa'
  }
  // stop verificato su Bitunix ogni 5 minuti
  if (new Date(now).getUTCMinutes() % 5 === 4) {
    const prev = p.slCheck || {}
    const r = await checkStop(D.bx, { perp, positionId, slPrice: p.stop, qty: p.qty, replacedBefore: prev.state === 'replaced' }).catch(e => ({ state: 'unknown', why: e.message }))
    p.slCheck = { ...r, at: now }
    if (r.state === 'gone') { await finishLive(p, 'chiusa da Bitunix', now); return 'chiusa da Bitunix' }
    if (r.state === 'failed') {
      await closeOurs(D.bx, { perp, positionId, side: p.side, qty: p.qty }).catch(() => {})
      await finishLive(p, `stop non mantenuto su Bitunix: chiusa (${r.why})`, now, px)
      await markNotOperable(perp, `stop non mantenuto: ${r.why}`)
      await D.notifyTrades([{ title: `⚠️ SMC Reale · ${perp} chiusa`, body: `Stop non mantenuto su Bitunix (${r.why})`, url: '/smc?mode=live', tag: `smc-live-${perp}` }]).catch(() => {})
      return 'chiusa (stop mancante)'
    }
    await savePos('live', p)
  }
  return null
}

export async function closeSmcPos(mode, id, now = Date.now()) {
  if (!MODES.includes(mode)) throw new SmcError('Modalità non valida')
  const p = await D.getMeta(posKey(mode, id))
  if (!p || p.status !== 'open') throw new SmcError('Posizione non trovata o già chiusa', 404)
  const s = await getSettings(mode)
  const px = (await D.bx.allTickers())[p.symbol]
  if (!px) throw new SmcError('Prezzo non disponibile su Bitunix', 502)
  if (mode === 'paper') {
    await accrueFunding(p, now)
    const sl = await slipNow()
    const exit = px * (1 - p.side * sl.segue.pct / 100)
    await bookClose('paper', p, { ...closeSmc(p, exit, s, { funding: p.funding || 0 }), exit, exitLevel: px, reason: 'chiusa da te' }, now)
  } else {
    await closeOurs(D.bx, { perp: p.symbol, positionId: p.exchange.positionId, side: p.side, qty: p.qty })
    await finishLive(p, 'chiusa da te', now, px)
  }
  return getState(mode, now)
}
