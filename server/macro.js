// Notizie macro degli Stati Uniti con data e ora, per il Calendario e la pagina Range. Fonti gratuite:
//  - Federal Reserve (ufficiale): date delle riunioni FOMC, decisione sui tassi alle 14:00 di New York dell'ultimo giorno
//    (https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm);
//  - BEA (ufficiale): PIL e redditi e spese personali (inflazione PCE), con ora (https://apps.bea.gov/API/signup/release_dates.json);
//  - calendario settimanale di ForexFactory (https://nfs.faireconomy.media/ff_calendar_thisweek.json): eventi USA ad alto
//    impatto della settimana in corso con ora, tra cui inflazione CPI e PPI, occupazione (non farm payrolls, disoccupazione) e
//    discorsi della Fed. Il calendario del BLS (fonte ufficiale di CPI e occupazione) blocca le richieste automatiche: quei dati
//    arrivano da qui, solo per la settimana in corso.
// Salvate in wt_meta `macro:events` = { at, events: [{ t, title, kind, source }], sources }; si rileggono ogni 6 ore al massimo.
import { getMeta, setMeta } from './db.js'
import { nyTs } from '../shared/time.js'

const KEY = 'macro:events'
const TTL = 6 * 3600000
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; WisiTrade/1.0)' }
const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 }
const pad = n => String(n).padStart(2, '0')
const get = async (url, as = 'json') => {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`${r.status}`)
  return as === 'json' ? r.json() : r.text()
}

// tipo di evento dal titolo inglese
export function kindOf(title) {
  const t = title.toLowerCase()
  if (/fomc|federal funds|fed chair|powell|monetary policy|interest rate/.test(t)) return 'fed'
  if (/cpi|ppi|pce|inflation|price index/.test(t)) return 'inflazione'
  if (/non-farm|nonfarm|payroll|unemployment|jobless|employment|adp|jolts|average hourly/.test(t)) return 'occupazione'
  if (/gdp|gross domestic/.test(t)) return 'pil'
  return 'altro'
}
export const KIND_IT = { fed: 'Fed', inflazione: 'Inflazione', occupazione: 'Occupazione', pil: 'PIL', altro: 'Altro' }

// riunioni FOMC dalla pagina della Fed: "2026 FOMC Meetings", mese e giorni (es. "27-28", "17-18*", "Apr/May" e "30-1")
export function parseFomc(html) {
  const out = []
  for (const m of html.matchAll(/(\d{4}) FOMC Meetings/g)) {
    const year = +m[1], seg = html.slice(m.index, m.index + 15000).split(/\d{4} FOMC Meetings/)[1] ?? html.slice(m.index + 20, m.index + 15000)
    for (const x of seg.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g)) {
      const months = x[1].trim().split('/').map(s => MONTHS[s.trim()] || MONTHS[Object.keys(MONTHS).find(k => k.startsWith(s.trim()))])
      const days = x[2].replace(/[^\d-]/g, '').split('-').map(Number).filter(Boolean)
      if (!months[0] || !days.length) continue
      const lastDay = days.at(-1), month = months.length > 1 && days.length > 1 && days[1] < days[0] ? months[1] : months.at(-1)
      const date = `${month === 1 && months[0] === 12 ? year + 1 : year}-${pad(month)}-${pad(lastDay)}`
      out.push({ t: nyTs(date, 14 * 60), title: 'Decisione sui tassi della Fed (FOMC)', kind: 'fed', source: 'Federal Reserve' })
    }
  }
  return out
}

export function parseBea(json) {
  const out = []
  const pick = { 'Gross Domestic Product': ['PIL (prima stima o revisione)', 'pil'], 'Personal Income and Outlays': ['Redditi e spese personali, inflazione PCE', 'inflazione'] }
  for (const [name, [title, kind]] of Object.entries(pick)) for (const d of json?.[name]?.release_dates || []) out.push({ t: Date.parse(d), title, kind, source: 'BEA' })
  return out
}

export function parseFf(list) {
  return (Array.isArray(list) ? list : [])
    .filter(e => e.country === 'USD' && e.impact === 'High' && e.date)
    .map(e => ({ t: Date.parse(e.date), title: e.title, kind: kindOf(e.title), source: 'ForexFactory', forecast: e.forecast || null, previous: e.previous || null }))
}

// unione senza doppioni (stesso tipo entro 30 minuti: si tiene quello di ForexFactory, più dettagliato)
export function merge(lists, now = Date.now()) {
  const all = lists.flat().filter(e => Number.isFinite(e.t) && e.t > now - 2 * 864e5 && e.t < now + 120 * 864e5).sort((a, b) => a.t - b.t)
  const out = []
  for (const e of all) {
    const dup = out.find(x => x.kind === e.kind && e.kind !== 'altro' && Math.abs(x.t - e.t) <= 30 * 60000 && x.source !== e.source)
    if (dup) { if (e.source === 'ForexFactory') Object.assign(dup, e); continue }
    out.push(e)
  }
  return out
}

export async function refreshMacro(now = Date.now()) {
  const sources = {}
  const res = await Promise.all([
    get('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', 'text').then(parseFomc).then(x => { sources.fed = x.length; return x }).catch(e => { sources.fed = `errore ${e.message}`; return [] }),
    get('https://apps.bea.gov/API/signup/release_dates.json').then(parseBea).then(x => { sources.bea = x.length; return x }).catch(e => { sources.bea = `errore ${e.message}`; return [] }),
    get('https://nfs.faireconomy.media/ff_calendar_thisweek.json').then(parseFf).then(x => { sources.ff = x.length; return x }).catch(e => { sources.ff = `errore ${e.message}`; return [] }),
  ])
  const old = await getMeta(KEY).catch(() => null)
  let events = merge(res, now)
  // una fonte non risponde: si tengono i suoi eventi già salvati
  if (old?.events?.length) {
    const lost = { fed: 'Federal Reserve', bea: 'BEA', ff: 'ForexFactory' }
    const keep = Object.entries(lost).filter(([k]) => typeof sources[k] === 'string').map(([, v]) => v)
    if (keep.length) events = merge([events, old.events.filter(e => keep.includes(e.source))], now)
  }
  const v = { at: now, events, sources }
  await setMeta(KEY, v)
  return v
}

// eventi salvati; se sono vecchi di più di 6 ore si rileggono dalle fonti
export async function getMacro(now = Date.now()) {
  const v = await getMeta(KEY).catch(() => null)
  if (v && now - v.at < TTL) return v
  try { return await refreshMacro(now) } catch { return v || { at: 0, events: [], sources: {} } }
}
