import type { MeView } from '@workday/core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { isRecord } from '../jsonFile.js'
import { firewallCommand, openFirewall, type FirewallResult } from '../remote/firewall.js'
import { deviceCookie } from '../remote/remoteGate.js'
import { toRemoteDevice, type DeviceChanges, type RemoteService } from '../remote/remoteService.js'

const UNPAIRED = { config: { access: { area: 'unpaired' } } } as const
const REMOTE_DISABLED = { ok: false, error: { code: 'remoteDisabled' } } as const
const PAIRING_CLOSED = { ok: false, error: { code: 'pairingClosed' } } as const

function badRequest(reply: FastifyReply, shape: string): FastifyReply {
  return reply.code(400).send({ error: `Body must be ${shape}` })
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ error: 'Not found' })
}

// Null when any field it carries is invalid.
function parseDeviceChanges(body: unknown): DeviceChanges | null {
  if (!isRecord(body)) {
    return null
  }
  const { name, pushEnabled } = body
  if (
    (name !== undefined && typeof name !== 'string') ||
    (pushEnabled !== undefined && typeof pushEnabled !== 'boolean')
  ) {
    return null
  }
  return {
    ...(name === undefined ? {} : { name }),
    ...(pushEnabled === undefined ? {} : { pushEnabled }),
  }
}

// /api/me and /api/pair* are open to an unpaired device; every other route needs a paired device.
export function registerRemoteRoutes(
  app: FastifyInstance,
  remote: RemoteService,
  runFirewall: (command: string) => Promise<FirewallResult> = (command) => openFirewall(command),
): void {
  app.get('/api/me', UNPAIRED, (request): MeView => {
    if (!request.isRemote) {
      return { mode: 'local' }
    }
    const device = request.remoteDevice
    return device === null
      ? { mode: 'unpaired' }
      : { mode: 'remote', device: toRemoteDevice(device) }
  })

  app.post('/api/pair', UNPAIRED, async (request, reply) => {
    const body: unknown = request.body
    const code = isRecord(body) ? body['code'] : undefined
    const name = isRecord(body) ? body['name'] : undefined
    if (typeof code !== 'string' || typeof name !== 'string') {
      return badRequest(reply, '{ code, name }')
    }
    const result = remote.submitPairing(code, name, {
      email: request.accessEmail,
      ip: request.remoteIp,
    })
    if (!result.ok) {
      return reply.code(409).send({ ok: false, error: { code: result.reason } })
    }
    return { requestId: result.request.requestId }
  })

  app.get<{ Querystring: { id?: string } }>('/api/pair/status', UNPAIRED, (request, reply) => {
    const { id } = request.query
    if (typeof id !== 'string' || id === '') {
      return reply.code(400).send({ error: 'Query must carry id' })
    }
    // The answer can carry the device cookie; no cache may keep it.
    reply.header('cache-control', 'no-store')
    const outcome = remote.pairingStatus(id)
    if (outcome.status === 'approved') {
      reply.header('set-cookie', deviceCookie(outcome.token))
    }
    return { status: outcome.status }
  })

  app.get('/api/remote', () => remote.status())

  app.post('/api/remote/pairing', () => remote.openPairing())

  // Opens the VPN ports for the allowed ranges; Windows shows the elevation prompt.
  app.post('/api/remote/firewall', async (_request, reply) => {
    const vpn = remote.vpnConfig
    if (vpn === null || vpn.allowedRanges.length === 0) {
      return reply.code(409).send(REMOTE_DISABLED)
    }
    return runFirewall(firewallCommand([vpn.httpsPort, vpn.setupPort], vpn.allowedRanges))
  })

  app.post('/api/remote/pairing/approve', async (_request, reply) => {
    if (!(await remote.approvePairing())) {
      return reply.code(409).send(PAIRING_CLOSED)
    }
    return remote.status()
  })

  app.post('/api/remote/pairing/reject', (_request, reply) => {
    if (!remote.rejectPairing()) {
      return reply.code(409).send(PAIRING_CLOSED)
    }
    return remote.status()
  })

  app.put<{ Params: { id: string } }>('/api/remote/devices/:id', async (request, reply) => {
    const changes = parseDeviceChanges(request.body)
    if (changes === null) {
      return badRequest(reply, '{ name?, pushEnabled? }')
    }
    if (!(await remote.updateDevice(request.params.id, changes))) {
      return notFound(reply)
    }
    return remote.status()
  })

  app.delete<{ Params: { id: string } }>('/api/remote/devices/:id', async (request, reply) => {
    if (!(await remote.revokeDevice(request.params.id))) {
      return notFound(reply)
    }
    return remote.status()
  })
}
