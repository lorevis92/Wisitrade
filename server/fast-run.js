// Collegamento del controllo veloce (server/fast.js) con Bitunix, Supabase e le regole d'entrata di server/strategy.js
import { runFast } from './fast.js'
import { entryEnv, accountGate, openSignal, liveAllowed, onlyOperable } from './strategy.js'
import { operable } from './operable.js'
import { allTickers, klines } from './bitunix.js'
import { db, q, getMeta, setMeta } from './db.js'
import { notifyTrades } from './push.js'
import { nyInfo } from './session.js'
import { ASSET_MAP } from '../shared/assets.js'
import { settingsFor, isTradingDay } from '../shared/opening.js'
import { nyTs } from '../shared/time.js'
import { OPEN_MIN } from '../shared/engine.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export const realFastDeps = () => ({
  now: () => Date.now(),
  sleep,
  nyDay: t => { const i = nyInfo(t); return { date: i.date, trading: isTradingDay(i.date, i.isWeekday) } },
  getLock: () => getMeta('fast:lock'),
  setLock: v => setMeta('fast:lock', v),
  getOpens: d => getMeta(`fast:opens:${d}`),
  saveOpens: (d, o) => setMeta(`fast:opens:${d}`, o),
  // apertura delle 9:30 dalla candela da 1 minuto (solo se il controllo parte dopo le 9:30)
  backfillOpens: async (d, syms) => {
    const t = nyTs(d, OPEN_MIN), out = {}
    for (const sym of syms) {
      const perp = ASSET_MAP[sym]?.perp
      if (!perp) continue
      const b = (await klines(perp, '1m', 2, { endTime: t + 59999 }).catch(() => [])).find(x => x.t === t)
      if (b) out[sym] = b.o
    }
    return out
  },
  prices: async () => {
    const all = await allTickers()
    const out = {}
    for (const [sym, a] of Object.entries(ASSET_MAP)) if (all[a.perp]) out[sym] = all[a.perp]
    return out
  },
  loadState: async day => {
    const [accRows, prepRows, dayPos, brake, mindex, skips] = await Promise.all([
      q(db().from('wt_accounts').select('*')),
      q(db().from('wt_prep').select('symbol, data').eq('day', day)),
      q(db().from('wt_positions').select('*').eq('day', day)),
      getMeta(`brake:${day}`), getMeta(`mindex:${day}`), getMeta(`orbskip:${day}`),
    ])
    const accounts = Object.fromEntries(accRows.map(a => [a.mode, a]))
    // solo i titoli operabili via API (stessa lista per Prova e Reale)
    const active = onlyOperable(accRows.filter(a => a.enabled && (a.mode !== 'live' || liveAllowed())).map(a => ({ ...a, s: settingsFor(a.mode, a.settings) })), await operable())
    return {
      accounts, active, dayPos, skips: skips || { paper: {}, live: {} },
      preps: Object.fromEntries(prepRows.map(r => [r.symbol, r.data])),
      braked: { paper: !!brake?.paper, live: !!brake?.live }, mindex: mindex || null,
    }
  },
  entryEnv, accountGate, openSignal,
  notify: notes => notifyTrades(notes),
})

export const fastEntries = () => runFast(realFastDeps())
