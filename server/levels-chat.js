// Pagina Livelli · chat AI: risponde alle domande libere sul titolo che si sta guardando, usando come contesto i dati già
// calcolati dalla pagina (livelli, Stocastico RSI multi-timeframe, commento automatico). Separata dal commento automatico.
// Usa la stessa chiave del Contesto AI (ANTHROPIC_API_KEY, solo nelle variabili d'ambiente di Vercel). Solo testo: nessun ordine.
import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.LEVELS_CHAT_MODEL || 'claude-opus-5-5'
const MAX_TURNS = 12, MAX_CHARS = 4000, MAX_CTX = 30000

const SYSTEM = `Sei l'assistente della pagina "Livelli" di Wisi Trade, un'app personale di analisi per perpetual su Bitunix (crypto e titoli USA).
Rispondi in italiano semplice, chiaro e concreto, come a un trader che conosce le basi.
Ogni domanda arriva con un blocco <dati> calcolato dalla pagina in quel momento per il simbolo che l'utente sta guardando: prezzo, trend a 4 ore, ATR, livelli di supporto e resistenza (forti = struttura che coincide con una zona ad alto volume o un POC settimanale; deboli = gli altri), profilo di volume settimanale, Stocastico RSI su 4h, 1h, 15m, 5m e 1m (K, D, zona, ultimo incrocio K/D) e il commento automatico della pagina.
Basa le risposte su questi dati e citali con i numeri. Non inventare dati che non ci sono (notizie, fondamentali, prezzi futuri): se servirebbero, dillo.
Quando ti chiedono una strategia, descrivi uno scenario operativo condizionato: condizione d'ingresso, dove andrebbe lo stop rispetto ai livelli, obiettivi sui livelli successivi, rapporto rischio/rendimento, e cosa invaliderebbe l'idea. Indica anche lo scenario alternativo.
Ricorda in una riga, senza insistere, che è un'analisi informativa e non una consulenza finanziaria; la decisione e il rischio restano dell'utente. Non dare mai istruzioni per aprire ordini nell'app.
Risposte compatte: paragrafi brevi o elenchi, niente tabelle larghe (la pagina si legge spesso sul telefono).`

let client = null

export async function levelsChat({ symbol, context, messages }) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('Chiave Anthropic non configurata su Vercel (ANTHROPIC_API_KEY)'), { status: 503 })
  const sym = String(symbol || '').toUpperCase()
  if (!/^[A-Z0-9]{2,24}$/.test(sym)) throw Object.assign(new Error('Simbolo non valido'), { status: 400 })
  const turns = (Array.isArray(messages) ? messages : []).slice(-MAX_TURNS)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
  if (!turns.length || turns.at(-1).role !== 'user') throw Object.assign(new Error('Scrivi una domanda'), { status: 400 })
  while (turns[0]?.role !== 'user') turns.shift()
  // i dati della pagina vanno sull'ultima domanda: sono quelli del momento in cui è stata fatta
  const ctx = JSON.stringify(context || {}).slice(0, MAX_CTX)
  const last = turns.pop()
  turns.push({ role: 'user', content: `<dati simbolo="${sym}" ora="${new Date().toISOString()}">\n${ctx}\n</dati>\n\n${last.content}` })

  client ||= new Anthropic()
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: turns,
  })
  if (res.stop_reason === 'refusal') return { text: 'Il modello non ha risposto a questa domanda. Prova a riformularla.', model: res.model }
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
  return { text: text || 'Nessuna risposta.', model: res.model, truncated: res.stop_reason === 'max_tokens' }
}
