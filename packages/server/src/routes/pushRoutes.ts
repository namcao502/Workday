import type { PushSubscriptionJson } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isRecord } from '../jsonFile.js'
import type { RemoteService } from '../remote/remoteService.js'
import type { SettingsService } from '../settings/settingsService.js'
import { testPushMessage } from '../timesheet/runNotification.js'

// A paired device may call these; the push routes act on the calling device only.
const ANY_DEVICE = { config: { access: { area: 'any' } } } as const

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

// Null unless the endpoint is an https URL and both keys are text.
function parseSubscription(body: unknown): PushSubscriptionJson | null {
  const raw = isRecord(body) ? body['subscription'] : undefined
  if (!isRecord(raw) || !nonEmptyText(raw['endpoint']) || !isRecord(raw['keys'])) {
    return null
  }
  const { p256dh, auth } = raw['keys']
  if (!isHttpsUrl(raw['endpoint']) || !nonEmptyText(p256dh) || !nonEmptyText(auth)) {
    return null
  }
  return { endpoint: raw['endpoint'], keys: { p256dh, auth } }
}

// A request from this PC has no device, so there is no subscription to set.
function deviceRequired(reply: FastifyReply): FastifyReply {
  return reply.code(409).send({ error: 'Only a paired device can use push' })
}

export function registerPushRoutes(
  app: FastifyInstance,
  remote: RemoteService,
  settings: SettingsService,
): void {
  app.get('/api/push/key', ANY_DEVICE, async () => ({ publicKey: await remote.push.publicKey() }))

  app.put('/api/push', ANY_DEVICE, async (request, reply) => {
    const device = request.remoteDevice
    if (device === null) {
      return deviceRequired(reply)
    }
    const subscription = parseSubscription(request.body)
    if (subscription === null) {
      return reply.code(400).send({ error: 'Body must be { subscription } with an https endpoint' })
    }
    await remote.setPushSubscription(device.id, subscription)
    return reply.code(204).send()
  })

  app.delete('/api/push', ANY_DEVICE, async (request, reply) => {
    const device = request.remoteDevice
    if (device === null) {
      return deviceRequired(reply)
    }
    await remote.setPushSubscription(device.id, null)
    return reply.code(204).send()
  })

  app.post('/api/push/test', ANY_DEVICE, async (request, reply) => {
    const device = request.remoteDevice
    if (device === null) {
      return deviceRequired(reply)
    }
    return remote.push.sendToDevice(device.id, testPushMessage(settings.language))
  })

  // From the PC's Settings: no access config, so local-only.
  app.post<{ Params: { id: string } }>('/api/remote/devices/:id/test-push', (request) =>
    remote.push.sendToDevice(request.params.id, testPushMessage(settings.language)),
  )
}
