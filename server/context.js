// Contesto settimanale per ogni asset, generato con l'API di Claude + ricerca web.
// Il controllo orario ne rigenera pochi per volta: quelli mai generati, "dirty" (evento importante) o più vecchi di 7 giorni.
import { ASSETS, ASSET_MAP } from '../shared/assets.js'
import { atr, sma, last } from '../shared/indicators.js'
import { klinesBack } from './bitunix.js'
import { db, q } from './db.js'

const DAY = 86400000
const pct = (a, b) => (b ? (a / b - 1) * 100 : 0)

// Candele giornaliere del perpetual su Bitunix (per i titoli lo storico parte da quando il perpetual è quotato)
const dailyBars = a => klinesBack(a.perp, '1d', 300)

function priceSummary(bars) {
  const c = bars.map(b => b.c)
  const p = c[c.length - 1]
  const at = n => c[Math.max(0, c.length - 1 - n)]
  const last60 = bars.slice(-60)
  const dAtr = last(atr(bars, 14))
  return {
    price: p,
    ch1w: +pct(p, at(5)).toFixed(1),
    ch1m: +pct(p, at(21)).toFixed(1),
    ch3m: +pct(p, at(63)).toFixed(1),
    high3m: Math.max(...last60.map(b => b.h)),
    low3m: Math.min(...last60.map(b => b.l)),
    sma50: last(sma(c, 50)),
    dailyAtrPct: dAtr ? +((dAtr / p) * 100).toFixed(2) : null,
    lastDays: bars.slice(-10).map(b => ({ d: new Date(b.t).toISOString().slice(0, 10), c: +b.c.toPrecision(6) })),
  }
}

function prompt(a, s, reason) {
  const today = new Date().toISOString().slice(0, 10)
  return `Oggi è ${today}. Sei un analista di mercato. Scrivi il "Contesto" settimanale per ${a.name} (${a.symbol}, ${a.kind === 'crypto' ? 'criptovaluta' : 'azione USA'}) per un trader che opera in intraday sui perpetual (long e short).

Dati di prezzo reali (giornalieri):
${JSON.stringify(s)}
${reason ? `\nMotivo dell'aggiornamento: ${reason}.` : ''}

Cerca sul web le notizie degli ultimi 7-10 giorni che spiegano il movimento (trimestrali, notizie aziendali, settore, macro, per le crypto anche flussi ETF e regolamentazione) e la data della prossima trimestrale se è un'azione.

Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo, in italiano, con questa struttura:
{
  "headline": "una frase: dove siamo ora (es. 'In ripresa dopo il calo del -8% della settimana scorsa')",
  "where": "2-3 frasi sulla situazione attuale del prezzo",
  "why": ["motivo 1", "motivo 2"],
  "bias": "long" | "short" | "neutral",
  "biasNote": "una frase su come sfruttarlo in intraday (es. 'i segnali long sono più affidabili, gli short vanno contro corrente')",
  "watch": ["cosa tenere d'occhio questa settimana"],
  "nextEarnings": "YYYY-MM-DD" oppure null,
  "keyLevels": { "support": numero o null, "resistance": numero o null },
  "sources": [{ "title": "...", "url": "..." }]
}
Massimo 4 elementi per lista. Sii concreto e onesto: se il quadro è incerto usa "neutral".`
}

async function callClaude(model, text) {
  const messages = [{ role: 'user', content: text }]
  const tools = [{ type: process.env.WEB_SEARCH_TOOL || 'web_search_20250305', name: 'web_search', max_uses: 4 }]
  let data
  for (let turn = 0; turn < 3; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 2000, messages, tools }),
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
    data = await res.json()
    if (data.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: data.content })
  }
  const out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  const i = out.indexOf('{'), j = out.lastIndexOf('}')
  if (i < 0 || j < i) throw new Error('Risposta senza JSON')
  return JSON.parse(out.slice(i, j + 1))
}

export async function generateContext(symbol, reason = null) {
  const a = ASSET_MAP[symbol]
  if (!a) throw new Error(`Asset sconosciuto: ${symbol}`)
  const bars = await dailyBars(a)
  if (!bars?.length) throw new Error(`Nessun dato giornaliero per ${symbol}`)
  const s = priceSummary(bars)
  const model = a.tier === 1 ? (process.env.CONTEXT_MODEL || 'claude-sonnet-5-5') : (process.env.CONTEXT_MODEL_LIGHT || 'claude-haiku-5-5')
  const c = await callClaude(model, prompt(a, s, reason))
  const bias = ['long', 'short', 'neutral'].includes(c.bias) ? c.bias : 'neutral'
  const data = { ...c, bias, stats: { ch1w: s.ch1w, ch1m: s.ch1m, ch3m: s.ch3m, price: s.price }, reason, model, generatedAt: Date.now() }
  await q(db().from('wt_context').upsert({
    symbol, data, bias, next_earnings: /^\d{4}-\d{2}-\d{2}$/.test(c.nextEarnings || '') ? c.nextEarnings : null,
    daily_atr_pct: s.dailyAtrPct, generated_at: Date.now(), dirty: false, dirty_reason: null,
  }))
  return data
}

// Cron orario: genera fino a N contesti, priorità a quelli "dirty", poi mancanti, poi i più vecchi
export async function refreshContexts(perRun = Number(process.env.CONTEXT_PER_RUN || 1)) {
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: 'ANTHROPIC_API_KEY mancante' }
  const results = await q(db().from('wt_context').select('symbol, generated_at, dirty, dirty_reason'))
  const byS = Object.fromEntries(results.map(r => [r.symbol, r]))
  const weekAgo = Date.now() - 7 * DAY
  const queue = ASSETS.map(a => ({ a, r: byS[a.symbol] }))
    .filter(({ r }) => !r || r.dirty || !r.generated_at || r.generated_at < weekAgo)
    .sort((x, y) => (y.r?.dirty || 0) - (x.r?.dirty || 0) || (x.r?.generated_at || 0) - (y.r?.generated_at || 0) || x.a.tier - y.a.tier)
    .slice(0, perRun)
  const done = [], failed = []
  for (const { a, r } of queue) {
    try { await generateContext(a.symbol, r?.dirty ? r.dirty_reason : null); done.push(a.symbol) }
    catch (e) { failed.push(`${a.symbol}: ${e.message}`) }
  }
  return { done, failed, left: Math.max(0, ASSETS.filter(a => { const r = byS[a.symbol]; return !r || r.dirty || r.generated_at < weekAgo }).length - done.length) }
}
