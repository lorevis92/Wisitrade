// Gestione notifiche push della PWA.
import { get, post } from './api.js'
import { load } from './store.js'

const b64ToBytes = s => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null
  try { return await navigator.serviceWorker.register('/sw.js') } catch { return null }
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function syncSubscription(sub) {
  if (!sub) return null
  return post('/api/push/subscribe', {
    subscription: sub.toJSON(),
    watchlist: load('watchlist', []),
    allAlerts: load('allAlerts', true),
    tradeAlerts: load('tradeAlerts', false),
  })
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Questo browser non supporta le notifiche push')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permesso notifiche negato')
  const { key } = await get('/api/push/key')
  if (!key) throw new Error('Chiave VAPID non configurata sul server')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) })
  await syncSubscription(sub)
  return sub
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
  await sub.unsubscribe()
}

export async function testPush() {
  const sub = await currentSubscription()
  if (!sub) throw new Error('Notifiche non attive')
  return post('/api/push/test', { endpoint: sub.endpoint })
}
