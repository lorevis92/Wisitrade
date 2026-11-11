import { load } from './store.js'

// Codice di controllo (ADMIN_TOKEN) salvato solo in questo browser: serve per la pagina Strategia
const authHeaders = () => { const c = load('adminCode', ''); return c ? { authorization: `Bearer ${c}` } : {} }

export async function get(path) {
  const res = await fetch(path, { headers: { accept: 'application/json', ...authHeaders() } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `Errore ${res.status}`)
  return j
}

export async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `Errore ${res.status}`)
  return j
}

// Risposta in streaming NDJSON (una riga JSON per evento): onEvent riceve ogni evento appena arriva.
// signal (AbortController) annulla la richiesta; un errore prima dello streaming arriva come eccezione.
export async function postStream(path, body, { onEvent, signal } = {}) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify(body), signal })
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j.error || `Errore ${res.status}`)
  }
  const reader = res.body.getReader(), dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) onEvent?.(JSON.parse(line))
    }
    if (done) break
  }
  if (buf.trim()) onEvent?.(JSON.parse(buf))
}

export const fmtPrice = p => {
  if (p === null || p === undefined) return '—'
  const d = p >= 1000 ? 1 : p >= 100 ? 2 : p >= 1 ? 3 : 5
  return p.toLocaleString('it-CH', { minimumFractionDigits: d, maximumFractionDigits: d })
}
export const fmtPct = v => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`)
export const ago = ts => {
  if (!ts) return ''
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'ora'
  if (m < 60) return `${m} min fa`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m fa`
  return `${Math.floor(h / 24)}g fa`
}
export const timeCH = ts => new Date(ts).toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })
export const dateCH = ts => new Date(ts).toLocaleDateString('it-CH', { day: '2-digit', month: 'short' })
export const fmtUsd = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('it-CH', { minimumFractionDigits: d, maximumFractionDigits: d }))
export const fmtSigned = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${fmtUsd(v, d)}`)
