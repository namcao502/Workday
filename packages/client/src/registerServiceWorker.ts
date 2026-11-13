export const SERVICE_WORKER_URL = '/sw.js'

// Registered on every app start (local and remote), so the offline page works before push is enabled.
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null
  }
  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL)
  } catch (error: unknown) {
    console.warn('Service worker registration failed', error)
    return null
  }
}
