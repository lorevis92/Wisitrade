// Registrazione dei dati dal vivo (Prova e Reale) per confrontare ogni giorno quello che succede davvero con la
// Simulazione (server/compare.js). Solo registrazione: niente qui cambia quando o come si apre o si chiude un trade.
// Cosa si salva e dove: docs/dati-dal-vivo.md.
//  - per ogni trade: exchange.rec nella riga di wt_positions (entrata, stato del conto, massimo e minimo toccati, uscite)
//  - segnali (aperti e scartati): wt_meta `sig:<giorno>:<modalità>:<titolo>` (lista di eventi)
//  - impostazioni e capitale del giorno: wt_meta `dayset:<modalità>:<giorno>` (scritta una volta, alle 9:25)
import { db, q } from './db.js'

export const REC_V = 1
const num = x => (Number.isFinite(x) ? +(+x).toPrecision(10) : null)
// slittamento in % a favore del trade (negativo = peggio per te), come nella pagina del Reale
export const slipPct = (side, sig, fill) => (sig > 0 && fill > 0 ? num(side * (fill - sig) / sig * 100) : null)
const slipIn = (side, sig, fill) => (sig > 0 && fill > 0 ? num(side * (sig - fill) / sig * 100) : null)

// Livelli del mattino e volatilità usati dalla strategia (dalla preparazione del giorno)
export const prepSnap = prep => (prep?.ok ? { levels: prep.levels, atr: num(prep.atr), atrOpen: num(prep.atrOpen), unit: num(prep.unit), yClose: num(prep.yClose), days: prep.days ?? null } : null)

// Dati all'entrata. pos = posizione già con i valori eseguiti; tm = tempi (segnale, ordine, esecuzione); gate = stato del conto
export function entryRec({ pos, sig, prep, tm, gate, dayPos, ctx }) {
  const { mode, taken, ded, rule, s } = gate
  const mine = dayPos.filter(p => p.mode === mode)
  const dayPnl = mine.filter(p => p.status === 'closed').reduce((a, p) => a + (p.pnl || 0), 0)
  const fillAt = tm.fillAt ?? null
  return {
    v: REC_V,
    open: num(sig.open), threshold: num(tm.level), unit: num(prep?.unit), prep: prepSnap(prep), nearest: sig.R || null,
    stop0: num(pos.init_stop), stopBx: num(pos.exchange?.sl ?? null),
    entry: {
      src: tm.src, bar: sig.k?.t ?? null, sigAt: tm.signalAt ?? null, sigPx: num(tm.sigPx), level: num(tm.level),
      orderAt: tm.orderAt ?? null, sentAt: pos.exchange?.sentAt ?? null, fillAt, fillPx: num(pos.entry),
      delayMs: fillAt && tm.signalAt ? fillAt - tm.signalAt : null, slipPct: slipIn(pos.side, tm.level, pos.entry),
      orderId: pos.exchange?.orderId ?? null, positionId: pos.exchange?.positionId ?? null, slOrderId: pos.exchange?.slOrderId ?? null,
    },
    size: { qty: num(pos.qty), leverage: pos.leverage, margin: num(pos.margin), notional: num(pos.qty * pos.entry), capital: num(pos.capital), liq: num(pos.liq_price) },
    state: {
      openNow: mine.filter(p => p.status === 'open').length, takenToday: taken.length, maxPos: rule?.maxPos ?? s.maxPos, reduced: !!rule?.reduced,
      mindex: ctx.mindex?.idx ?? null, braked: !!ctx.braked?.[mode], dayPnl: num(dayPnl), dedicated: num(ded?.current ?? null),
      brakePct: s.brakePct, maxDayLoss: s.maxDayLoss, maxTotalLoss: s.maxTotalLoss,
    },
    // prezzi più alto e più basso toccati con la posizione aperta (candele chiuse dopo quella d'entrata e prezzi letti);
    // k = massimo e minimo della candela d'entrata (contiene anche i prezzi prima dell'entrata)
    mx: { hi: num(pos.entry), hiAt: fillAt, lo: num(pos.entry), loAt: fillAt, k: null },
    exits: [],
  }
}

// Massimo e minimo toccati: candela chiusa b (dopo quella d'entrata) o prezzo letto px al tempo t
export function trackBar(rec, p, b) {
  if (!rec?.mx) return false
  if (b.t <= (p.entry_bar ?? 0)) { rec.mx.k = { h: num(b.h), l: num(b.l) }; return true }
  let ch = false
  if (b.h > rec.mx.hi) { rec.mx.hi = num(b.h); rec.mx.hiAt = b.t; ch = true }
  if (b.l < rec.mx.lo) { rec.mx.lo = num(b.l); rec.mx.loAt = b.t; ch = true }
  return ch
}
export function trackPx(rec, px, t) {
  if (!rec?.mx || !(px > 0)) return false
  let ch = false
  if (px > rec.mx.hi) { rec.mx.hi = num(px); rec.mx.hiAt = t; ch = true }
  if (px < rec.mx.lo) { rec.mx.lo = num(px); rec.mx.loAt = t; ch = true }
  return ch
}

// Un'uscita (metà o finale): motivo, livello e ora del segnale, invio e risposta, prezzo eseguito, slittamento
export function exitRec(p, { kind = 'finale', reason, level, sigAt, bar = null, sentAt = null, doneAt = null, fillPx = null, fillAt = null, qty = null, byExchange = false }) {
  return {
    kind, reason, level: num(level), sigAt: sigAt ?? null, bar, sentAt, doneAt, fillPx: num(fillPx), fillAt, qty: num(qty),
    slipPct: slipPct(p.side, level, fillPx), byExchange: !!byExchange,
  }
}

// Posizione chiusa nello storico di Bitunix: i campi utili al confronto (aperta/chiusa, prezzi medi, costi)
export function histSnap(raw) {
  if (!raw) return null
  const n = v => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : +v)
  return {
    ctime: n(raw.ctime), mtime: n(raw.mtime), entryPrice: n(raw.entryPrice ?? raw.avgOpenPrice), closePrice: n(raw.closePrice),
    maxQty: n(raw.maxQty ?? raw.qty), fee: n(raw.fee), funding: n(raw.funding), realizedPNL: n(raw.realizedPNL),
    leverage: n(raw.leverage), liqPrice: n(raw.liqPrice), liqQty: n(raw.liqQty), marginMode: raw.marginMode ?? null,
  }
}

// ---------- Segnali ----------
// Eventi di un giro (aperto, scartato, già preso): una riga wt_meta per giorno, modalità e titolo, con la lista degli eventi
const sigKey = (day, mode, sym) => `sig:${day}:${mode}:${sym}`
export async function saveEvents(day, events) {
  if (!events?.length) return
  const groups = new Map()
  for (const e of events) { const k = sigKey(day, e.mode, e.sym); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(clean(e)) }
  const keys = [...groups.keys()]
  const have = await q(db().from('wt_meta').select('key, value').in('key', keys))
  const old = Object.fromEntries(have.map(r => [r.key, r.value]))
  const rows = keys.map(k => ({ key: k, value: [...(Array.isArray(old[k]) ? old[k] : []), ...groups.get(k)].slice(-20) }))
  await q(db().from('wt_meta').upsert(rows))
}
const clean = e => Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== 'mode' && k !== 'sym' && v !== undefined && v !== null))
export async function dayEvents(day) {
  const rows = await q(db().from('wt_meta').select('key, value').like('key', `sig:${day}:%`))
  const out = { paper: {}, live: {} }
  for (const r of rows) { const [, , mode, sym] = r.key.split(':'); (out[mode] ||= {})[sym] = r.value }
  return out
}
// Dati del segnale per gli eventi: ora, prezzo letto, soglia, lato, origine, candela
export const sigEv = (sig, timing) => ({
  at: timing?.signalAt ?? Date.now(), px: num(timing?.sigPx ?? sig?.entry), level: num(timing?.level ?? sig?.entry), side: sig?.side ?? null,
  src: timing?.src || 'minuto', bar: sig?.k?.t ?? null,
})

// ---------- Impostazioni del giorno ----------
// Una volta al giorno per modalità (prima riga vince: insert con chiave primaria): impostazioni usate, titoli esclusi
// perché non operabili, capitale di partenza. Serve al confronto serale per simulare il giorno con le stesse regole.
export async function daySnapshot(day, a, { chosen, excluded, capital }) {
  const value = { at: Date.now(), settings: a.s, chosen, excluded, balance: a.balance ?? null, capital: capital ?? null }
  await db().from('wt_meta').insert({ key: `dayset:${a.mode}:${day}`, value }).then(() => null, () => null)
}

