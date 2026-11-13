// Web Push (payload: { title, body, url, tag }) and an offline page for navigations; nothing else is cached.
const CACHE_NAME = 'workday-offline-v1'
const PRECACHE = ['/offline.html', '/icons/icon-192.png']
// 5xx from the tunnel or a proxy when the local server is down.
const DOWN_STATUSES = new Set([502, 503, 504, 530])

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  )
})

function offlinePage() {
  return caches.match('/offline.html').then((cached) => cached || Response.error())
}

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') {
    return
  }
  event.respondWith(
    fetch(event.request).then(
      (response) => (DOWN_STATUSES.has(response.status) ? offlinePage() : response),
      () => offlinePage(),
    ),
  )
})

function readPayload(event) {
  try {
    return event.data ? event.data.json() : {}
  } catch {
    return { body: event.data ? event.data.text() : '' }
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event)
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Workday', {
      body: payload.body || '',
      tag: payload.tag || undefined,
      icon: '/icons/icon-192.png',
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => 'focus' in client)
      if (open === undefined) {
        return self.clients.openWindow(url)
      }
      return open
        .focus()
        .then((focused) => ('navigate' in focused ? focused.navigate(url) : focused))
    }),
  )
})
