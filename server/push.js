// Notifiche Web Push (VAPID) con la libreria web-push.
import webpush from 'web-push'
import { db, q } from './db.js'

let ready = false
function init() {
  if (ready) return true
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:info@wisiverse.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  ready = true
  return true
}

export async function sendPush(sub, payload, { topic, urgency = 'high' } = {}) {
  if (!init()) return 0
  try {
    const r = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 3600, urgency, ...(topic ? { topic: topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}) },
    )
    return r.statusCode
  } catch (e) { return e.statusCode || 500 }
}

// items: [{ sub, payload, topic }] — rimuove le iscrizioni scadute (404/410)
export async function deliver(items) {
  if (!items.length || !init()) return { sent: 0, removed: 0 }
  let sent = 0
  const dead = new Set()
  for (let i = 0; i < items.length; i += 20) {
    const batch = items.slice(i, i + 20)
    const res = await Promise.all(batch.map(it => sendPush(it.sub, it.payload, { topic: it.topic })))
    res.forEach((s, k) => { if (s >= 200 && s < 300) sent++; if (s === 404 || s === 410) dead.add(batch[k].sub.id) })
  }
  if (dead.size) await q(db().from('wt_subs').delete().in('id', [...dead]))
  return { sent, removed: dead.size }
}

// Notifica a chi ha attivato gli avvisi delle operazioni della strategia
export async function notifyTrades(payloads) {
  if (!payloads.length) return { sent: 0 }
  const subs = await q(db().from('wt_subs').select('*').eq('trade_alerts', true))
  const items = []
  for (const p of payloads) for (const sub of subs) items.push({ sub, payload: p, topic: p.tag })
  return deliver(items)
}
