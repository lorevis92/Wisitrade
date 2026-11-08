// Capitale dedicato (Prova e Reale) e limiti di perdita. Stato in wt_meta `capital:<mode>`:
// { set: cifra impostata, start: punto di partenza, startAt, current: capitale dedicato attuale, lossRef: riferimento
//   per la perdita massima totale (= partenza, o il capitale al riavvio dopo uno stop), halted: { at, why } | null,
//   dayStop: { day, at } | null, trades, history: [{ at, type: 'set' | 'restart', from, to }] }
// Il capitale si aggiorna con il risultato vero di ogni trade chiuso (nel Reale con commissioni e funding di Bitunix).
import { getMeta, setMeta } from './db.js'

const key = mode => `capital:${mode}`
export const getCapital = async mode => (await getMeta(key(mode))) || null

// Cifra impostata dall'utente: se è cambiata diventa il nuovo punto di partenza (con storico)
export async function syncCapitalSetting(mode, s, now = Date.now()) {
  if (s.capitalMode !== 'dedicated' || !(s.capitalDedicated > 0)) return getCapital(mode)
  const st = await getCapital(mode)
  if (st && st.set === s.capitalDedicated) return st
  const next = {
    ...(st || {}), set: s.capitalDedicated, start: s.capitalDedicated, startAt: now, current: s.capitalDedicated, lossRef: s.capitalDedicated,
    halted: null, dayStop: null, trades: 0,
    history: [...(st?.history || []), { at: now, type: 'set', from: st?.current ?? null, to: s.capitalDedicated }].slice(-200),
  }
  await setMeta(key(mode), next)
  return next
}

// Risultato di un trade chiuso
export async function applyTrade(mode, pnl) {
  const st = await getCapital(mode)
  if (!st) return null
  st.current = Math.max(0, st.current + pnl)
  st.trades = (st.trades || 0) + 1
  st.updatedAt = Date.now()
  await setMeta(key(mode), st)
  return st
}

// Riavvio dopo lo stop per perdita massima: il riferimento riparte dal capitale attuale
export async function restartCapital(mode, now = Date.now()) {
  const st = await getCapital(mode)
  if (!st?.halted) return st
  const next = { ...st, halted: null, lossRef: st.current, history: [...(st.history || []), { at: now, type: 'restart', from: st.lossRef, to: st.current }].slice(-200) }
  await setMeta(key(mode), next)
  return next
}

// Limiti di sicurezza in % del capitale dedicato. dayPnl = risultato dei trade chiusi oggi.
// Restituisce { ok, day: bool (stop di oggi), total: bool (strategia fermata), why }
export function checkLimits(st, s, dayPnl, today) {
  if (!st || s.capitalMode !== 'dedicated') return { ok: true }
  if (st.halted) return { ok: false, total: true, why: st.halted.why }
  if (s.maxTotalLoss > 0 && st.current <= st.lossRef * (1 - s.maxTotalLoss / 100)) {
    return { ok: false, total: true, fresh: true, why: `perdita massima totale superata: capitale ${st.current.toFixed(2)} USDT da ${st.lossRef.toFixed(2)} (limite ${s.maxTotalLoss}%)` }
  }
  const dayStart = st.current - dayPnl
  if (s.maxDayLoss > 0 && dayPnl < 0 && -dayPnl >= dayStart * s.maxDayLoss / 100) {
    return { ok: false, day: true, fresh: st.dayStop?.day !== today, why: `perdita massima giornaliera superata: ${dayPnl.toFixed(2)} USDT oggi (limite ${s.maxDayLoss}% di ${dayStart.toFixed(2)})` }
  }
  return { ok: true }
}

export async function markHalted(mode, why, now = Date.now()) {
  const st = await getCapital(mode)
  if (!st) return
  st.halted = { at: now, why }
  await setMeta(key(mode), st)
}
export async function markDayStop(mode, day, now = Date.now()) {
  const st = await getCapital(mode)
  if (!st) return
  st.dayStop = { day, at: now }
  await setMeta(key(mode), st)
}
