// Collegamento del controllo veloce (server/fast.js) con gli exchange (adattatori in server/exchanges/), Supabase e le regole
// d'entrata di server/strategy.js. Ogni giro legge i prezzi in blocco degli exchange accesi, in parallelo (una richiesta ciascuno).
import { runFast } from './fast.js'
import { entryEnv, accountGate, openSignal, liveAllowed, onlyOperable, brakeKey, skipKey } from './strategy.js'
import { operable } from './operable.js'
import { adapter } from './exchanges/index.js'
import { db, q, getMeta, setMeta } from './db.js'
import { notifyTrades } from './push.js'
import { loadLiveSlip } from './pslip.js'
import { nyInfo } from './session.js'
import { ASSET_MAP } from '../shared/assets.js'
import { settingsFor, isTradingDay } from '../shared/opening.js'
import { nyTs } from '../shared/time.js'
import { OPEN_MIN } from '../shared/engine.js'
import { EX_LIST, exOf, isLive, exSuffix, prepDay } from '../shared/venues.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))
// aperture delle 9:30: wt_meta fast:opens:<giorno> (Bitunix, come prima) o fast:opens:<exchange>:<giorno>
const opensKey = (d, ex = 'bitunix') => `fast:opens${exSuffix(ex)}:${d}`
// titolo della strategia per ogni perpetual dell'exchange (per leggere i prezzi in blocco)
const perpMaps = {}
const perpMap = ex => (perpMaps[ex] ||= Object.keys(ASSET_MAP).map(sym => [sym, adapter(ex).perpOf(sym)]).filter(([, p]) => p))

export const realFastDeps = () => ({
  now: () => Date.now(),
  sleep,
  nyDay: t => { const i = nyInfo(t); return { date: i.date, trading: isTradingDay(i.date, i.isWeekday) } },
  getLock: () => getMeta('fast:lock'),
  setLock: v => setMeta('fast:lock', v),
  getOpens: (d, ex) => getMeta(opensKey(d, ex)),
  saveOpens: (d, o, ex) => setMeta(opensKey(d, ex), o),
  // primo prezzo letto oltre la soglia, per conto e titolo (solo registrazione)
  getFirsts: d => getMeta(`fast:first:${d}`),
  saveFirsts: (d, f) => setMeta(`fast:first:${d}`, f),
  // apertura delle 9:30 dalla candela da 1 minuto dell'exchange (solo se il controllo parte dopo le 9:30)
  backfillOpens: async (d, syms, ex = 'bitunix') => {
    const a = adapter(ex), t = nyTs(d, OPEN_MIN), out = {}
    for (const sym of syms) {
      const perp = a.perpOf(sym)
      if (!perp) continue
      const b = (await a.klines(perp, '1m', 2, { endTime: t + 59999 }).catch(() => [])).find(x => x.t === t)
      if (b) out[sym] = b.o
    }
    return out
  },
  // prezzi di tutti i perpetual, una richiesta per exchange, in parallelo: { bitunix: { SYM: prezzo }, bitget: {...} }
  prices: async (exs = ['bitunix']) => {
    const res = await Promise.allSettled(exs.map(ex => adapter(ex).allPrices()))
    const out = {}
    exs.forEach((ex, i) => {
      if (res[i].status !== 'fulfilled') return
      const all = res[i].value, m = (out[ex] = {})
      for (const [sym, perp] of perpMap(ex)) if (all[perp]) m[sym] = all[perp]
    })
    if (!Object.keys(out).length) throw new Error(`prezzi non letti: ${res.map(r => r.reason?.message).filter(Boolean).join('; ')}`)
    return out
  },
  loadState: async day => {
    const [accRows, dayPos, mindex] = await Promise.all([
      q(db().from('wt_accounts').select('*')),
      q(db().from('wt_positions').select('*').eq('day', day)),
      getMeta(`mindex:${day}`),
    ])
    const accounts = Object.fromEntries(accRows.map(a => [a.mode, a]))
    const exs = EX_LIST.filter(ex => accRows.some(a => exOf(a.mode) === ex && a.enabled))
    const active = [], preps = {}, pslipBy = {}, skips = {}, braked = {}
    await Promise.all(exs.map(async ex => {
      // solo i titoli operabili via API su quell'exchange (stessa lista per la sua Prova e il suo Reale)
      const list = accRows.filter(a => exOf(a.mode) === ex && a.enabled && (!isLive(a.mode) || liveAllowed(ex))).map(a => ({ ...a, s: settingsFor(a.mode, a.settings) }))
      const [op, prepRows, sk, brake, pslip] = await Promise.all([
        operable(Date.now(), ex), q(db().from('wt_prep').select('symbol, data').eq('day', prepDay(ex, day))),
        getMeta(skipKey(ex, day)), getMeta(brakeKey(ex, day)), loadLiveSlip(ex), // slittamento misurato nel Reale di quell'exchange
      ])
      active.push(...onlyOperable(list, op))
      preps[ex] = Object.fromEntries(prepRows.map(r => [r.symbol, r.data]))
      pslipBy[ex] = pslip || null
      Object.assign(skips, sk || {})
      for (const a of accRows.filter(x => exOf(x.mode) === ex)) braked[a.mode] = !!brake?.[a.mode]
    }))
    // stesso ordine dei conti ogni volta (Bitunix prima)
    active.sort((a, b) => EX_LIST.indexOf(exOf(a.mode)) - EX_LIST.indexOf(exOf(b.mode)) || (a.mode < b.mode ? -1 : 1))
    for (const a of active) skips[a.mode] ||= {}
    return { accounts, active, dayPos, skips, preps, braked, mindex: mindex || null, pslipBy }
  },
  entryEnv, accountGate, openSignal,
  notify: notes => notifyTrades(notes),
})

export const fastEntries = () => runFast(realFastDeps())
