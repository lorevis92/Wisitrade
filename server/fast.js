// Controllo veloce dell'apertura (solo entrate; le uscite restano al controllo ogni minuto).
// Dalle 9:29:30 alle 10:00 di New York (fine della finestra d'entrata) legge i prezzi di tutti i perpetual con UNA richiesta al secondo (tickers di Bitunix)
// e, appena un titolo supera la soglia (apertura ± 1,25 × movimento), apre il trade con le stesse regole del controllo
// ogni minuto (accountGate + openSignal in server/strategy.js: spazio dal livello, posti liberi, limiti, posizioni manuali,
// margine isolato, minimo d'ordine). Vale per Prova e Reale.
// Una chiamata dura al massimo MAX_RUN (limite delle funzioni Vercel Pro: 800 s); cron-job.org ne lancia due in sequenza
// (9:29, 9:41 e 9:53 New York). Un blocco in wt_meta (fast:lock) evita due controlli veloci insieme e dice al controllo ogni
// minuto di non aprire trade nelle modalità seguite qui; in più ogni titolo si prenota prima dell'ordine (claimSymbol).
// Le funzioni esterne arrivano in deps: così il controllo si prova con un Bitunix e un database finti (tests/fast.test.mjs).
import { OPEN_MIN, INDEX_FROM, thresholds, roomCheck, entryUntil } from '../shared/engine.js'
import { nyTs } from '../shared/time.js'

export const FAST_START_MS = 30000          // si comincia alle 9:29:30 (30 s prima dell'apertura)
export const FAST_END_MIN = OPEN_MIN + 30   // fino alle 10:00 (fine della finestra d'entrata; servono 3 chiamate: 9:29, 9:41, 9:53)
export const MAX_RUN = 740000               // ogni chiamata al massimo ~12 minuti e 20 secondi (sotto gli 800 s di Vercel Pro)
const POLL_MS = 1000
const REFRESH_MS = 10000

// Ordine tra segnali dello stesso giro: come la regola di scelta, con i dati disponibili qui (niente candele)
function fastRank(s, sig, prep, idx) {
  if (s.pick === 'move') return -Math.abs(sig.entry / sig.open - 1)
  if (s.pick === 'volat') return -(prep.unit / sig.open)
  return idx // 'list' e 'volume' (il volume della giornata qui non c'è): ordine della lista
}
// Primo minuto in cui si può entrare (indice di attività: dalle 9:35; ritardo d'entrata)
const fromMinOf = s => Math.max(s.idxMode !== 'off' ? INDEX_FROM : OPEN_MIN, OPEN_MIN + (s.entryDelay || 0))

export async function runFast(deps) {
  const { now, sleep, nyDay } = deps
  const t0 = now()
  const day = nyDay(t0)
  if (!day.trading) return { skipped: 'borsa chiusa' }
  const dayStart = nyTs(day.date, 0), openTs = nyTs(day.date, OPEN_MIN)
  const startTs = openTs - FAST_START_MS, endTs = nyTs(day.date, FAST_END_MIN)
  const deadline = Math.min(t0 + (deps.maxRun ?? MAX_RUN), endTs)
  if (now() >= deadline) return { skipped: 'fuori orario' }
  const id = `${t0}-${Math.random().toString(36).slice(2, 8)}`

  // un solo controllo veloce alla volta: se ce n'è uno attivo si aspetta che finisca
  for (;;) {
    const l = await deps.getLock()
    if (!l || l.day !== day.date || !(l.until > now())) break
    if (now() > deadline - 5000) return { skipped: 'controllo veloce precedente ancora attivo' }
    await sleep(POLL_MS)
  }
  let state = await deps.loadState(day.date)
  // modalità seguite qui: attive e senza filtro volume (che ha bisogno delle candele: lo fa il controllo ogni minuto)
  const modesOf = st => st.active.filter(a => !(a.s.volIn > 0)).map(a => a.mode)
  let modes = modesOf(state)
  await deps.setLock({ id, day: day.date, until: deadline + 5000, modes })
  // registro della chiamata (salvato in wt_meta fast:runs:<giorno>): inizio, primo e ultimo giro di prezzi, aperture
  const log = { day: day.date, id, startedAt: t0, firstPollAt: null, lastPollAt: null, endedAt: null, modes, polls: 0, opened: 0, signals: 0, firsts: 0, errors: [] }
  let opens = (await deps.getOpens(day.date)) || {}
  // registrazione (fast:first:<giorno>): per modalità e titolo, il primo prezzo letto oltre la soglia con l'ora al millisecondo,
  // l'ultimo prezzo letto prima (ancora sotto) e lo stato del titolo in quel momento. Vale per tutti i titoli scelti, anche
  // quelli già presi o scartati: serve a confrontare il vivo con la Simulazione. Non cambia nessuna entrata.
  const firsts = (deps.getFirsts ? await deps.getFirsts(day.date).catch(() => null) : null) || {}
  const prevPx = {}
  // chiamata partita dopo le 9:30 senza aperture salvate: apertura dalla candela delle 9:30
  if (now() > openTs + 5000 && deps.backfillOpens) {
    const missing = [...new Set(state.active.flatMap(a => a.s.symbols))].filter(x => !opens[x])
    if (missing.length) { opens = { ...opens, ...(await deps.backfillOpens(day.date, missing).catch(() => ({}))) }; await deps.saveOpens(day.date, opens) }
  }
  let lastRefresh = now()
  try {
    while (now() < deadline) {
      const tLoop = now()
      if (tLoop < startTs) { await sleep(Math.min(POLL_MS, startTs - tLoop)); continue }
      if (now() - lastRefresh >= REFRESH_MS) { state = await deps.loadState(day.date); modes = modesOf(state); lastRefresh = now(); await deps.setLock({ id, day: day.date, until: deadline + 5000, modes }) }
      let px
      try { px = await deps.prices() } catch (e) { log.errors.push(e.message); await sleep(POLL_MS); continue }
      const tPx = now()
      log.polls++
      log.firstPollAt ??= tPx; log.lastPollAt = tPx
      if (tPx < openTs) { await sleep(Math.max(0, POLL_MS - (now() - tLoop))); continue }
      // apertura: primo prezzo letto dalle 9:30:00 (salvata, così la chiamata successiva usa la stessa)
      let newOpens = false
      for (const a of state.active) for (const sym of a.s.symbols) {
        if (opens[sym] || !(px[sym] > 0)) continue
        opens[sym] = px[sym]; newOpens = true
      }
      if (newOpens) await deps.saveOpens(day.date, opens)
      const nowMin = Math.floor((tPx - dayStart) / 60000)
      // (salvato dopo le entrate di questo giro: la registrazione non ritarda mai un ordine)
      let newFirst = false
      if (deps.saveFirsts) {
        try {
          for (const a of state.active) {
            const f = (firsts[a.mode] ||= {})
            for (const sym of a.s.symbols) {
              const p = px[sym], open = opens[sym]
              if (f[sym] || !(p > 0) || !open) continue
              const { cu, cd } = thresholds(a.s, open)
              const side = p >= cu ? 1 : p <= cd ? -1 : 0
              if (!side) continue
              const taken = state.dayPos.some(x => x.mode === a.mode && x.symbol === sym)
              f[sym] = { at: tPx, px: p, side, level: side > 0 ? cu : cd, open, before: prevPx[sym] || null, call: id, min: nowMin,
                taken, skip: state.skips[a.mode]?.[sym] || null, early: nowMin < fromMinOf(a.s), late: nowMin >= entryUntil(a.s), followed: modes.includes(a.mode) }
              newFirst = true; log.firsts++
            }
          }
        } catch (e) { log.errors.push(`registro soglie: ${e.message}`) }
      }
      for (const sym in px) prevPx[sym] = { at: tPx, px: px[sym] }
      const ctx = { today: day.date, nowMin, notes: [], accounts: state.accounts, braked: state.braked, mindex: state.mindex, pslip: state.pslip }
      let env = null
      for (const acc of state.active) {
        if (!modes.includes(acc.mode)) continue
        const s = acc.s
        if (nowMin < fromMinOf(s) || nowMin >= entryUntil(s)) continue
        const taken = new Set(state.dayPos.filter(p => p.mode === acc.mode).map(p => p.symbol))
        const cands = []
        for (let idx = 0; idx < s.symbols.length; idx++) {
          const sym = s.symbols[idx], p = px[sym], open = opens[sym], prep = state.preps[sym]
          if (taken.has(sym) || state.skips[acc.mode]?.[sym] || !p || !open || !prep?.ok) continue
          const { cu, cd } = thresholds(s, open)
          const side = p >= cu ? 1 : p <= cd ? -1 : 0
          if (!side) continue
          env ||= await deps.entryEnv(ctx)
          // spazio dal livello controllato sulla soglia, come nella Simulazione (anche se il prezzo letto è già oltre)
          const rc = roomCheck(s, prep, open, side, side > 0 ? cu : cd)
          if (rc.skip) { env.skip(acc.mode, sym, rc.skip, { at: tPx, px: p, level: side > 0 ? cu : cd, side, src: 'veloce' }); state.skips[acc.mode] = { ...(state.skips[acc.mode] || {}), [sym]: rc.skip }; continue }
          const k = { t: Math.floor(tPx / 60000) * 60000, min: nowMin, o: p, h: p, l: p, c: p, v: 0 }
          // level = soglia in cui scatta il segnale (prezzo del segnale per lo slittamento); entry = prezzo letto adesso
          const sig = { k, side, entry: p, open, R: rc.R, level: side > 0 ? cu : cd }
          cands.push({ sym, sig, prep, idx, rank: fastRank(s, sig, prep, idx) })
        }
        if (!cands.length) continue
        log.signals += cands.length
        const gate = await deps.accountGate(env, ctx, acc, state.dayPos)
        if (!gate) continue
        cands.sort((a, b) => a.rank - b.rank || a.idx - b.idx)
        for (const c of cands) {
          try {
            const row = await deps.openSignal(env, ctx, gate, state.dayPos, { sym: c.sym, sig: c.sig, prep: c.prep, price: px[c.sym], timing: { src: 'veloce', signalAt: tPx, sigPx: px[c.sym], level: c.sig.level } })
            if (row) log.opened++
          } catch (e) { log.errors.push(`${c.sym}: ${e.message}`) }
        }
        // i titoli scartati in questo giro non si ricontrollano
        for (const [m, list] of Object.entries(env.skips || {})) state.skips[m] = { ...(state.skips[m] || {}), ...list }
      }
      if (env) await env.save()
      if (newFirst) await deps.saveFirsts(day.date, firsts).catch(e => log.errors.push(`registro soglie: ${e.message}`))
      if (ctx.notes.length) await deps.notify(ctx.notes).catch(() => {})
      await sleep(Math.max(0, POLL_MS - (now() - tLoop)))
    }
  } finally {
    await deps.setLock({ id, day: day.date, until: 0, modes: [] })
  }
  log.errors = log.errors.slice(0, 5)
  log.endedAt = now()
  return log
}
