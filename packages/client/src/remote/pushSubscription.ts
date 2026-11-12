import { deletePush, getPushKey, putPush } from '../api/remoteApi.js'

const SERVICE_WORKER_URL = '/sw.js'

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

export async function subscribePush(): Promise<SubscribeResult> {
  if ((await Notification.requestPermission()) !== 'granted') {
    return 'denied'
  }
  const key = await getPushKey()
  await navigator.serviceWorker.register(SERVICE_WORKER_URL)
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  })
  await putPush(subscription.toJSON())
  return 'subscribed'
}

export async function unsubscribePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL)
  const subscription = await registration?.pushManager.getSubscription()
  await subscription?.unsubscribe()
  await deletePush()
}
