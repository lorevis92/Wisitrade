// Supabase lato server (chiave service_role: mai nel browser).
import { createClient } from '@supabase/supabase-js'

let client = null
export function db() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase non configurato (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  }
  return client
}

// Risultato o errore leggibile
// solo per i test automatici
export const __setDb = c => { client = c }

export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(`Database: ${error.message}`)
  return data
}

export async function getMeta(key) {
  const row = await q(db().from('wt_meta').select('value').eq('key', key).maybeSingle())
  return row ? row.value : null
}
export async function setMeta(key, value) {
  await q(db().from('wt_meta').upsert({ key, value }))
}
