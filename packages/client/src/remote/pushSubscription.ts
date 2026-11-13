import { deleteLocalPush, deletePush, getPushKey, putLocalPush, putPush } from '../api/remoteApi.js'
import { registerServiceWorker, SERVICE_WORKER_URL } from '../registerServiceWorker.js'

export type SubscribeResult = 'subscribed' | 'denied'

// iOS outside the Home Screen has no PushManager.
export function pushSupported(): boolean {
  return typeof PushManager !== 'undefined'
}

// Decodes the URL-safe base64 VAPID key into the bytes pushManager.subscribe wants.
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key + '='.repeat((4 - (key.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function browserSubscription(): Promise<PushSubscriptionJSON | 'denied'> {
  if ((await Notification.requestPermission()) !== 'granted') {
    return 'denied'
  }
  const key = await getPushKey()
  await registerServiceWorker()
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  })
  return subscription.toJSON()
}

export async function subscribePush(): Promise<SubscribeResult> {
  const subscription = await browserSubscription()
  if (subscription === 'denied') {
    return 'denied'
  }
  await putPush(subscription)
  return 'subscribed'
}

export async function unsubscribePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL)
  const subscription = await registration?.pushManager.getSubscription()
  await subscription?.unsubscribe()
  await deletePush()
}

// Tells useNotices to re-read localPushActive after the PC's subscription changes.
export const LOCAL_PUSH_CHANGED_EVENT = 'workday:local-push-changed'

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported() || !('serviceWorker' in navigator)) {
    return null
  }
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL)
  return (await registration?.pushManager.getSubscription()) ?? null
}

// True when this browser holds a push subscription (on the PC that is the local one).
export async function localPushActive(): Promise<boolean> {
  try {
    return (await currentSubscription()) !== null
  } catch {
    return false
  }
}

// The PC's own subscription: Windows shows the notice even when the Workday window is closed.
export async function subscribeLocalPush(): Promise<SubscribeResult> {
  const subscription = await browserSubscription()
  if (subscription === 'denied') {
    return 'denied'
  }
  await putLocalPush(subscription)
  window.dispatchEvent(new Event(LOCAL_PUSH_CHANGED_EVENT))
  return 'subscribed'
}

export async function unsubscribeLocalPush(): Promise<void> {
  const subscription = await currentSubscription()
  if (subscription !== null) {
    await deleteLocalPush(subscription.endpoint)
    await subscription.unsubscribe()
  }
  window.dispatchEvent(new Event(LOCAL_PUSH_CHANGED_EVENT))
}
