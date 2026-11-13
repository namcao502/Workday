import type { PushSubscriptionJson } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isRecord } from '../jsonFile.js'
import { parsePushSubscription } from '../notices/localPushStore.js'
import type { RemoteService } from '../remote/remoteService.js'
import type { SettingsService } from '../settings/settingsService.js'
import { testPushMessage } from '../timesheet/runNotification.js'

// A paired device may call these; the push routes act on the calling device only.
const ANY_DEVICE = { config: { access: { area: 'any' } } } as const

// Null unless the body is { subscription } with an https endpoint and both keys.
function parseSubscription(body: unknown): PushSubscriptionJson | null {
  return parsePushSubscription(isRecord(body) ? body['subscription'] : undefined)
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

  // This PC's browser subscription: no access config, so local-only.
  app.put('/api/push/local', async (request, reply) => {
    const subscription = parseSubscription(request.body)
    if (subscription === null) {
      return reply.code(400).send({ error: 'Body must be { subscription } with an https endpoint' })
    }
    await remote.push.local.add(subscription)
    return reply.code(204).send()
  })

  app.delete('/api/push/local', async (request, reply) => {
    const endpoint = isRecord(request.body) ? request.body['endpoint'] : undefined
    if (typeof endpoint !== 'string' || endpoint === '') {
      return reply.code(400).send({ error: 'Body must be { endpoint }' })
    }
    await remote.push.local.remove(endpoint)
    return reply.code(204).send()
  })

  // From the PC's Settings: no access config, so local-only.
  app.post<{ Params: { id: string } }>('/api/remote/devices/:id/test-push', (request) =>
    remote.push.sendToDevice(request.params.id, testPushMessage(settings.language)),
  )
}
