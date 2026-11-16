// Pagina Livelli (src/pages/Levels.jsx): supporti e resistenze di struttura (4h e giornaliero), profilo di volume settimanale
// e commento automatico scritto da regole (nessun modello AI). Solo analisi, nessun ordine.
// Candele: { t: ms, o, h, l, c, v }. Le letture dello Stocastico RSI arrivano già calcolate (readStoch di src/lib/stochrsi.js).
import { atr } from './indicators.js'
import { weekProfiles, trend4h } from './range.js'

export const LEVELS_DEFAULTS = {
  pivot4h: 3, pivot1d: 2, // candele per lato perché un massimo/minimo sia una reazione (swing)
  tol4h: 0.3, tol1d: 0.25, // tolleranza del livello in ATR del suo timeframe
  min4h: 3, min1d: 2, // tocchi minimi: 3 a 4 ore oppure 2 sul giornaliero (o 2 a 4 ore + 1 giornaliero)
  near: 0.6, // "vicino" = entro 0,6 ATR a 4 ore dal bordo del livello
  range: 10, // si guardano i livelli entro 10 ATR a 4 ore dal prezzo
}
const last = a => a[a.length - 1]
const lastNum = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null && a[i] !== undefined) return a[i]; return null }

// Massimi e minimi di swing: la candela ha il massimo (minimo) più alto (basso) delle w candele prima e dopo
function pivots(bars, w) {
  const out = []
  for (let i = w; i < bars.length - w; i++) {
    let hi = true, lo = true
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue
      if (bars[j].h >= bars[i].h) hi = false
      if (bars[j].l <= bars[i].l) lo = false
    }
    if (hi) out.push({ i, t: bars[i].t, p: bars[i].h, type: 'h' })
    if (lo) out.push({ i, t: bars[i].t, p: bars[i].l, type: 'l' })
  }
  return out
}

// Raggruppa i prezzi dei pivot entro la tolleranza (ogni gruppo largo al massimo 2 tolleranze, così livelli vicini non si
// fondono a catena): ogni gruppo è un livello candidato. I tocchi sono le reazioni del prezzo lì, contate su tutte le candele:
// i pivot del gruppo e le candele che toccano il livello con lo stoppino e chiudono lontano (rifiuto), anche se non sono un
// pivot (per esempio i massimi decrescenti di un ribasso che ritestano una resistenza). Un tocco ogni 3 candele al massimo.
function cluster(bars, piv, tol, tf) {
  const sorted = piv.slice().sort((a, b) => a.p - b.p)
  const groups = []
  for (const x of sorted) {
    const g = last(groups)
    if (g && x.p - g.items[0].p <= 2 * tol) { g.items.push(x); g.mean = g.items.reduce((s, y) => s + y.p, 0) / g.items.length }
    else groups.push({ mean: x.p, items: [x] })
  }
  return groups.map(g => {
    const p = g.mean, hits = new Map()
    for (const x of g.items) hits.set(x.i, x.type)
    bars.forEach((b, i) => {
      if (!i || hits.has(i)) return
      const pc = bars[i - 1].c, top = Math.max(b.o, b.c), bot = Math.min(b.o, b.c)
      // rifiuto dall'alto: arriva da sotto, lo stoppino entra nel livello, il corpo resta sotto
      if (pc < p - tol && b.h >= p - tol && b.h <= p + tol && top < p - tol) hits.set(i, 'h')
      // rifiuto dal basso: arriva da sopra, lo stoppino entra nel livello, il corpo resta sopra
      else if (pc > p + tol && b.l <= p + tol && b.l >= p - tol && bot > p + tol) hits.set(i, 'l')
    })
    const items = [...hits].map(([i, type]) => ({ i, type, t: bars[i].t })).sort((a, b) => a.i - b.i)
      .filter((x, k, arr) => k === 0 || x.i - arr[k - 1].i >= 3)
    return { p, tf, touches: items.length, highs: items.filter(x => x.type === 'h').length, lows: items.filter(x => x.type === 'l').length, lastT: Math.max(...items.map(x => x.t)), tol }
  })
}

// Supporti e resistenze di struttura su 4 ore e giornaliero, uniti quando coincidono
export function structureLevels(bars4h, bars1d, cfg = LEVELS_DEFAULTS) {
  const a4 = lastNum(atr(bars4h, 14)) || 0, a1 = lastNum(atr(bars1d, 14)) || a4 * 2.5
  const c4 = bars4h.length > 30 ? cluster(bars4h, pivots(bars4h, cfg.pivot4h), cfg.tol4h * a4, '4h') : []
  const c1 = bars1d.length > 20 ? cluster(bars1d, pivots(bars1d, cfg.pivot1d), cfg.tol1d * a1, '1d') : []
  const all = [...c4, ...c1].sort((a, b) => a.p - b.p)
  const merged = []
  for (const x of all) {
    const m = last(merged)
    if (m && x.p - m.p <= Math.max(m.tol, x.tol)) {
      const w = m.n4 + m.n1, wx = x.touches
      m.p = (m.p * w + x.p * wx) / (w + wx)
      if (x.tf === '4h') m.n4 += x.touches; else m.n1 += x.touches
      m.highs += x.highs; m.lows += x.lows; m.lastT = Math.max(m.lastT, x.lastT); m.tol = Math.max(m.tol, x.tol)
    } else merged.push({ p: x.p, n4: x.tf === '4h' ? x.touches : 0, n1: x.tf === '1d' ? x.touches : 0, highs: x.highs, lows: x.lows, lastT: x.lastT, tol: x.tol })
  }
  return { atr4h: a4, atr1d: a1, levels: merged.filter(l => l.n4 >= cfg.min4h || l.n1 >= cfg.min1d || (l.n4 >= 2 && l.n1 >= 1)) }
}

// Zone di volume della settimana precedente e di quella in corso (stesso calcolo della pagina Range)
function volumeNodes(wp) {
  const out = []
  for (const [w, sfx] of [[wp?.cur, 'sett.'], [wp?.prev, 'sett. prec.']]) {
    if (!w) continue
    out.push({ kind: 'poc', name: `POC ${sfx}`, lo: w.poc, hi: w.poc, p: w.poc })
    for (const z of w.hvn || []) out.push({ kind: 'hvn', name: `zona ad alto volume ${sfx}`, lo: z.lo, hi: z.hi, p: (z.lo + z.hi) / 2 })
    out.push({ kind: 'vah', name: `VAH ${sfx}`, lo: w.vah, hi: w.vah, p: w.vah }, { kind: 'val', name: `VAL ${sfx}`, lo: w.val, hi: w.val, p: w.val })
  }
  return out
}

// Tutti i livelli con il voto forte/debole e il perché. Forte = struttura che coincide (o quasi) con una zona ad alto volume
// o con un POC; gli altri sono deboli (solo struttura, oppure solo volume: POC e zone ad alto volume senza struttura).
export function buildLevels({ bars4h, bars1d, bars1h, now = Date.now(), price, cfg = LEVELS_DEFAULTS }) {
  const st = structureLevels(bars4h, bars1d, cfg)
  const wp = weekProfiles(bars1h, now)
  const nodes = volumeNodes(wp)
  const a4 = st.atr4h, near = Math.max(0.25 * a4, price * 0.0015)
  const used = new Set()
  const levels = st.levels.map(l => {
    const hits = nodes.filter(n => n.lo - near <= l.p + l.tol && n.hi + near >= l.p - l.tol)
    hits.forEach(n => used.add(n))
    const heavy = hits.filter(n => n.kind === 'hvn' || n.kind === 'poc')
    const why = []
    if (l.n4) why.push(`${l.n4} ${l.n4 === 1 ? 'reazione' : 'reazioni'} a 4 ore`)
    if (l.n1) why.push(`${l.n1} sul giornaliero`)
    const flip = l.highs > 0 && l.lows > 0
    return {
      p: l.p, lo: l.p - l.tol, hi: l.p + l.tol, source: 'struttura', strong: heavy.length > 0, n4: l.n4, n1: l.n1, touches: l.n4 + l.n1, flip, lastT: l.lastT,
      structure: `${why.join(' e ')}${flip ? ', ha fatto sia da supporto sia da resistenza' : l.highs ? ', finora come resistenza' : ', finora come supporto'}`,
      volume: hits.length ? [...new Set(hits.map(n => n.name))].join(', ') : null,
    }
  })
  // livelli solo di volume (POC e zone ad alto volume senza struttura vicina)
  for (const n of nodes) {
    if (used.has(n) || (n.kind !== 'poc' && n.kind !== 'hvn')) continue
    if (levels.some(l => l.source === 'volume' && Math.abs(l.p - n.p) <= near)) continue
    levels.push({ p: n.p, lo: Math.min(n.lo, n.p - near / 2), hi: Math.max(n.hi, n.p + near / 2), source: 'volume', strong: false, touches: 0, structure: null, volume: n.name })
  }
  const inRange = levels.filter(l => Math.abs(l.p - price) <= cfg.range * a4).sort((a, b) => b.p - a.p)
  return { levels: inRange, all: levels, wp, atr4h: a4, near }
}

// ---------- Commento ----------
const BIG = ['4h', '1h'], SMALL = ['15m', '5m', '1m']
const STATE = { oversold: 'ipervenduto', overbought: 'ipercomprato', neutral: 'neutro' }
const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} e ${last(a)}`)
const HOURS = { '4h': 4, '1h': 1, '15m': 0.25, '5m': 1 / 12, '1m': 1 / 60 }

// quante candele di fila (fino all'ultima) K è rimasto nella zona estrema
function stuckBars(read, p) {
  if (!read?.k || !read.state || read.state === 'neutral') return 0
  let n = 0
  for (let i = read.k.length - 1; i >= 0; i--) {
    const v = read.k[i]
    if (v === null || (read.state === 'overbought' ? v <= p.high : v >= p.low)) break
    n++
  }
  return n
}

// Lettura dello stocastico rispetto alla direzione attesa (dir +1 = rimbalzo verso l'alto, −1 verso il basso, 0 = nessuna)
export function stochPicture(reads, tfs, dir, p) {
  const ready = tfs.filter(tf => reads[tf]?.state)
  const os = ready.filter(tf => reads[tf].state === 'oversold'), ob = ready.filter(tf => reads[tf].state === 'overbought')
  const crossOf = (tf, d) => { const c = reads[tf]?.cross; return c && c.ago <= 2 && c.dir === d ? c : null }
  const up = ready.filter(tf => crossOf(tf, 'up')), dn = ready.filter(tf => crossOf(tf, 'down'))
  const fav = dir > 0 ? { ext: os, cross: up, word: 'ipervenduto', cw: "verso l'alto" } : dir < 0 ? { ext: ob, cross: dn, word: 'ipercomprato', cw: 'verso il basso' } : null
  const opp = dir > 0 ? { ext: ob, cross: dn, word: 'ipercomprato', cw: 'verso il basso' } : dir < 0 ? { ext: os, cross: up, word: 'ipervenduto', cw: "verso l'alto" } : null
  // timeframe grandi appena girati contro (incrocio nell'ultima candela o in quella prima)
  const against = opp ? BIG.filter(tf => ready.includes(tf) && reads[tf].cross?.ago <= 1 && opp.cross.includes(tf)) : []
  let cat
  if (!ready.length) cat = 'none'
  else if (fav) {
    const zoneCross = fav.cross.filter(tf => reads[tf].cross.inZone)
    if (zoneCross.length || fav.cross.length >= 2) cat = 'cross'
    else if (fav.ext.length >= 2 || fav.ext.some(tf => BIG.includes(tf))) cat = 'extreme'
    else if (against.length) cat = 'against'
    else if (opp.ext.length >= 2) cat = 'opposite'
    else cat = 'neutral'
  } else {
    const zc = ready.filter(tf => reads[tf].cross?.ago <= 2 && reads[tf].cross.inZone)
    cat = zc.length ? 'cross' : os.length >= 2 || ob.length >= 2 ? 'extreme' : 'neutral'
  }
  const stuck = BIG.map(tf => ({ tf, n: stuckBars(reads[tf], p), state: reads[tf]?.state })).filter(x => x.n >= (x.tf === '4h' ? 3 : 8))
  return { ready, os, ob, up, dn, fav, opp, against, cat, stuck }
}

function describeStoch(reads, sp) {
  const grp = tfs => {
    const r = tfs.filter(tf => reads[tf]?.state)
    if (!r.length) return null
    const st = [...new Set(r.map(tf => reads[tf].state))]
    if (st.length === 1) return `${st[0] === 'neutral' ? 'in zona neutra' : `in ${STATE[st[0]]}`} (K ${r.map(tf => `${tf} ${reads[tf].K.toFixed(0)}`).join(', ')})`
    return r.map(tf => `${tf} ${STATE[reads[tf].state]} (K ${reads[tf].K.toFixed(0)})`).join(', ')
  }
  const parts = []
  const b = grp(BIG), s = grp(SMALL)
  if (b) parts.push(`Sui timeframe grandi (4h, 1h) lo stocastico è ${b}`)
  if (s) parts.push(`sui piccoli (15m, 5m, 1m) è ${s}`)
  let txt = parts.length ? `${parts.join('; ')}.` : 'Lo stocastico non è ancora caricato.'
  const cr = []
  if (sp.up.length) cr.push(`K ha appena incrociato D verso l'alto su ${list(sp.up.map(tf => tf + (reads[tf].cross.inZone ? ' (in zona estrema)' : '')))}`)
  if (sp.dn.length) cr.push(`K ha appena incrociato D verso il basso su ${list(sp.dn.map(tf => tf + (reads[tf].cross.inZone ? ' (in zona estrema)' : '')))}`)
  if (cr.length) txt += ` ${cr.join('; ')}.`
  else if (sp.ready.length) txt += ' Nessun incrocio K/D nelle ultime candele.'
  const bigUp = BIG.filter(tf => reads[tf]?.K > reads[tf]?.D), bigDn = BIG.filter(tf => reads[tf]?.K < reads[tf]?.D)
  if (bigUp.length === 2) txt += ' Sui grandi K sta sopra D: la spinta di fondo è verso l\'alto.'
  else if (bigDn.length === 2) txt += ' Sui grandi K sta sotto D: la spinta di fondo è verso il basso.'
  else if (bigUp.length && bigDn.length) txt += ` Sui grandi la spinta è discorde (K sopra D sul ${bigUp[0]}, sotto sul ${bigDn[0]}).`
  return txt
}

// Il prezzo ha attraversato un livello nelle ultime candele da 15 minuti senza reagire (nessuna chiusura di nuovo dall'altra parte)
export function jumpedLevels(bars15, levels, atr4h, n = 16) {
  if (!bars15 || bars15.length < n + 2) return []
  const seg = bars15.slice(-(n + 1)), c0 = seg[0].c, cNow = last(seg).c
  const out = []
  for (const l of levels) {
    const d = Math.sign(cNow - c0)
    if (!d || !((l.p - c0) * d > 0 && (cNow - l.p) * d > 0)) continue
    if (Math.abs(cNow - l.p) < 0.3 * atr4h && !(Math.abs(cNow - l.p) > l.hi - l.p)) continue
    const k = seg.findIndex(b => (b.c - l.p) * d > 0)
    if (k < 0) continue
    const back = seg.slice(k + 1).some(b => (b.c - l.p) * d < 0)
    // reazione = una candela prima del passaggio che tocca il livello e chiude lontano (stoppino) almeno 0,3 ATR prima
    const reacted = seg.slice(0, k).some(b => (d > 0 ? b.h >= l.lo && l.p - b.c >= 0.3 * atr4h : b.l <= l.hi && b.c - l.p >= 0.3 * atr4h))
    if (!back && !reacted) out.push({ ...l, dir: d })
  }
  return out
}

// Commento completo: livello più vicino (forte/debole/nessuno) × stocastico (estremo, incrocio, girato contro, neutro, opposto)
// + avvisi di rischio. Restituisce { tone, headline, blocks: [{ title, text }], warnings: [testo] }.
export function narrate({ price, levels, atr4h, near = LEVELS_DEFAULTS.near, reads, params, bars4h, bars15, wp, fmt = v => String(v) }) {
  const tfs = ['4h', '1h', '15m', '5m', '1m']
  const warnings = []
  const blocks = []
  if (!price || !levels || !atr4h) return { tone: 'neutral', headline: 'Carico i dati…', blocks, warnings }
  const tr = bars4h?.length > 61 ? trend4h(bars4h).trend : null
  const trWord = tr === 'up' ? 'rialzista' : tr === 'down' ? 'ribassista' : tr === 'side' ? 'laterale' : 'non chiaro'

  // livello più vicino: distanza dal bordo della sua zona, in ATR a 4 ore
  const withD = levels.map(l => ({ ...l, dist: price >= l.lo && price <= l.hi ? 0 : Math.min(Math.abs(price - l.lo), Math.abs(price - l.hi)) / atr4h }))
  withD.sort((a, b) => a.dist - b.dist)
  const nearest = withD[0] || null
  const nearList = withD.filter(l => l.dist <= near)
  const focus = nearList.find(l => l.strong) || (nearest && nearest.dist <= near ? nearest : null)
  const prox = !focus ? 'none' : focus.strong ? 'strong' : 'weak'
  const on = focus && focus.dist === 0
  // direzione attesa: sotto al prezzo = supporto (rimbalzo verso l'alto), sopra = resistenza; sul livello conta da dove arriva il prezzo
  let dir = 0
  if (focus) {
    if (!on) dir = focus.p < price ? 1 : -1
    else { const from = bars15?.length > 8 ? bars15[bars15.length - 9].c : price; dir = from >= focus.p ? 1 : -1 }
  }
  const role = dir > 0 ? 'supporto' : 'resistenza'
  const pct = l => `${((l.p / price - 1) * 100 >= 0 ? '+' : '')}${((l.p / price - 1) * 100).toFixed(2)}%`
  const why = l => (l.source === 'volume' ? `è solo una zona di volume (${l.volume}) senza reazioni di prezzo ripetute` : l.strong ? `la struttura (${l.structure}) coincide con il volume (${l.volume})` : `ha solo la struttura (${l.structure}), senza una zona ad alto volume vicina${l.volume ? ` (vicino c'è solo ${l.volume})` : ''}`)

  // 1. Livello
  if (focus) {
    const where = on ? `Il prezzo (${fmt(price)}) è dentro la zona del livello ${focus.strong ? 'forte' : 'debole'} a ${fmt(focus.p)}` : `Il livello più vicino è un ${role} ${focus.strong ? 'forte' : 'debole'} a ${fmt(focus.p)} (${pct(focus)}, ${focus.dist.toFixed(1)} ATR a 4 ore)`
    let txt = `${where}: ${focus.strong ? 'è forte perché' : 'è debole perché'} ${why(focus)}.`
    if (on) txt += ` Arriva ${dir > 0 ? "dall'alto, quindi lo sta testando come supporto" : 'dal basso, quindi lo sta testando come resistenza'}.`
    const other = nearList.filter(l => l !== focus)
    if (other.length) txt += ` Vicino c'è anche ${other.map(l => `${l.strong ? 'un forte' : 'un debole'} a ${fmt(l.p)}`).join(', ')}: più livelli insieme formano una zona più larga.`
    blocks.push({ title: 'Livello', text: txt })
  } else {
    const up = withD.filter(l => l.p > price).sort((a, b) => a.p - b.p)[0], dn = withD.filter(l => l.p < price).sort((a, b) => b.p - a.p)[0]
    const fs = l => (l ? `${l.strong ? 'forte' : 'debole'} a ${fmt(l.p)} (${pct(l)})` : 'nessuno in vista')
    blocks.push({ title: 'Livello', text: `Il prezzo (${fmt(price)}) è in mezzo, lontano dai livelli: sopra il primo è ${fs(up)}, sotto ${fs(dn)}. Qui non c'è un punto di riferimento su cui appoggiare un'idea.` })
  }

  // 2. Stocastico
  const sp = stochPicture(reads, tfs, dir || (tr === 'up' ? 1 : tr === 'down' ? -1 : 0), params)
  const spLevel = focus ? sp : stochPicture(reads, tfs, 0, params)
  blocks.push({ title: 'Stocastico RSI', text: describeStoch(reads, sp) })

  // 3. Lettura combinata: livello × stocastico
  const F = sp.fav, word = F?.word, ext = F ? list(F.ext) : '', crs = F ? list(F.cross) : ''
  const lv = focus ? `${role} ${focus.strong ? 'forte' : 'debole'} a ${fmt(focus.p)}` : ''
  const Lv = lv ? lv[0].toUpperCase() + lv.slice(1) : ''
  const M = {
    strong: {
      cross: () => `Punto interessante: ${lv} e K incrocia D ${F?.cw} su ${crs}. Livello solido e primo segnale di reazione nello stesso punto: è la combinazione da guardare, aspettando che la candela chiuda e che il prezzo non chiuda oltre il livello.`,
      extreme: () => `Punto interessante in preparazione: ${lv} con lo stocastico in ${word} su ${ext}. Manca ancora l'incrocio K/D che confermi la reazione: finché non arriva il prezzo può ancora spingersi dentro la zona.`,
      against: () => `Attenzione: ${lv}, ma lo stocastico sui timeframe grandi (${list(sp.against)}) ha appena girato ${F?.cw === "verso l'alto" ? 'verso il basso' : "verso l'alto"}, cioè contro la reazione che ci si aspetterebbe. Il livello è buono, il tempismo no: meglio aspettare.`,
      opposite: () => `${Lv}, ma lo stocastico è all'estremo opposto (${list(sp.opp.ext)} in ${sp.opp.word}): il prezzo ci arriva con spinta${dir > 0 ? ' e senza essere sceso abbastanza' : ' e senza essere salito abbastanza'}. Non è un segnale di reazione; se il livello cede, il movimento può continuare.`,
      neutral: () => `${Lv}, con lo stocastico neutro: il livello c'è ma manca un segnale di esaurimento. Da tenere d'occhio se i timeframe piccoli vanno in ${dir > 0 ? 'ipervenduto' : 'ipercomprato'} o se K incrocia D ${dir > 0 ? "verso l'alto" : 'verso il basso'}.`,
      none: () => `${Lv}; lo stocastico non è ancora caricato.`,
    },
    weak: {
      cross: () => `Segnale su un livello debole: ${lv} e K incrocia D ${F?.cw} su ${crs}. Lo stocastico dà il segnale ma il livello non ha il volume dietro: reazione possibile ma meno affidabile, spesso breve.`,
      extreme: () => `${Lv} con lo stocastico in ${word} su ${ext}: c'è esaurimento ma il livello è debole e senza incrocio K/D. Probabile una pausa più che un'inversione.`,
      against: () => `${Lv} e lo stocastico grande (${list(sp.against)}) ha appena girato contro: livello debole e tempismo sfavorevole, probabile che venga attraversato.`,
      opposite: () => `${Lv} con lo stocastico all'estremo opposto (${list(sp.opp.ext)} in ${sp.opp.word}): il prezzo arriva con forza su un livello che regge poco. È più facile che lo passi.`,
      neutral: () => `${Lv} e stocastico neutro: niente di particolare, né il livello né l'indicatore danno un segnale chiaro.`,
      none: () => `${Lv}; lo stocastico non è ancora caricato.`,
    },
    none: {
      cross: () => `Lo stocastico dà un incrocio in zona estrema (${list(spLevel.ready.filter(tf => reads[tf].cross?.ago <= 2 && reads[tf].cross.inZone))}), ma il prezzo non è vicino a nessun livello: un segnale senza un punto di appoggio vale poco, il prezzo può continuare fino al livello successivo.`,
      extreme: () => `Lo stocastico è in zona estrema (${spLevel.os.length >= spLevel.ob.length ? `${list(spLevel.os)} in ipervenduto` : `${list(spLevel.ob)} in ipercomprato`}) ma lontano dai livelli: l'esaurimento da solo non basta, conviene aspettare che il prezzo arrivi su un livello.`,
      neutral: () => 'Né livello vicino né segnale dallo stocastico: situazione senza punti di interesse, meglio aspettare.',
      none: () => 'Nessun livello vicino; lo stocastico non è ancora caricato.',
    },
  }
  const combo = (M[prox][focus ? sp.cat : spLevel.cat] || M[prox].neutral)()
  let tone = 'neutral'
  if (prox === 'strong' && sp.cat === 'cross') tone = 'interesting'
  else if (prox === 'strong' && sp.cat === 'extreme') tone = 'watch'
  else if (prox === 'weak' && (sp.cat === 'cross' || sp.cat === 'extreme')) tone = 'watch'
  blocks.push({ title: 'Insieme', text: combo })

  // 4. Avvisi di rischio
  for (const s of sp.stuck) {
    const strongTrend = (s.state === 'overbought' && tr === 'up') || (s.state === 'oversold' && tr === 'down')
    const h = Math.round(s.n * HOURS[s.tf])
    warnings.push(strongTrend
      ? `Trend forte a 4 ore (${trWord}) senza reazioni: lo stocastico ${s.tf} è incollato in ${STATE[s.state]} da ${s.n} candele (circa ${h} ore). In questi casi l'estremo non segnala un'inversione: andare contro il trend è rischioso.`
      : `Lo stocastico ${s.tf} è in ${STATE[s.state]} da ${s.n} candele (circa ${h} ore) senza che il prezzo reagisca: l'estremo da solo non basta.`)
  }
  if (sp.against.length) warnings.push(focus
    ? `Lo stocastico ${list(sp.against)} ha appena girato ${sp.opp.cw} mentre sul ${role} ci si aspettava il contrario: segnale che la spinta va contro il livello.`
    : `Lo stocastico ${list(sp.against)} ha appena girato ${sp.opp.cw}, contro il trend a 4 ore ${trWord}: il trend potrebbe fermarsi o correggere.`)
  const jumped = jumpedLevels(bars15, levels, atr4h)
  for (const j of jumped.slice(0, 2)) warnings.push(`Il prezzo ha ${j.dir > 0 ? 'superato' : 'rotto'} il livello ${j.strong ? 'forte' : 'debole'} a ${fmt(j.p)} nelle ultime ore senza reagire${j.strong ? ': un livello forte che non tiene spesso cambia ruolo (' + (j.dir > 0 ? 'da resistenza a supporto' : 'da supporto a resistenza') + ')' : ''}. Chi aspettava una reazione lì è rimasto fuori o in perdita.`)
  if (!focus) warnings.push(`Nessun livello rilevante vicino al prezzo (il più vicino è a ${nearest ? nearest.dist.toFixed(1) : '—'} ATR a 4 ore): non c'è un punto dove mettere uno stop sensato.`)
  const lvn = [wp?.cur, wp?.prev].filter(Boolean).flatMap(w => w.lvn || []).find(z => price >= z.lo && price <= z.hi)
  if (lvn) warnings.push(`Il prezzo è in una zona a basso volume (${fmt(lvn.lo)}–${fmt(lvn.hi)}): di solito la attraversa in fretta, fino alla zona di volume successiva.`)
  if (warnings.length && tone === 'interesting') tone = 'watch'
  if (warnings.length >= 2 && tone !== 'watch') tone = 'risk'
  if (sp.against.length || jumped.some(j => j.strong)) tone = tone === 'interesting' ? 'watch' : 'risk'
  if (sp.stuck.length && tone === 'neutral') tone = 'risk'

  const headline = {
    interesting: `Punto interessante: ${lv} con segnale dello stocastico`,
    watch: focus ? `Da seguire: ${lv}` : 'Da seguire',
    risk: 'Contesto a rischio',
    neutral: focus ? `${Lv}, nessun segnale` : 'Nessun punto di interesse',
  }[tone]
  blocks.push({ title: 'Trend a 4 ore', text: `Trend di fondo ${trWord} (prezzo rispetto alla media a 50 candele da 4 ore e la sua pendenza).` })
  return { tone, headline, blocks, warnings, focus, dir, sp }
}
