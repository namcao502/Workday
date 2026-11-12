// Handles Web Push only; there is no offline cache. Payload: { title, body, url, tag }.
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
