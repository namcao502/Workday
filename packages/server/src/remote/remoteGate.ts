import type { IncomingHttpHeaders } from 'node:http'
import { allows, type AppError, type RemoteArea } from '@workday/core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { StoredDevice } from './deviceStore.js'
import type { RemoteService } from './remoteService.js'

// Declared on each route that a paired device may call; a route without it is local-only.
export type RouteAccess =
  | { readonly area: RemoteArea; readonly level: 'view' | 'act' }
  | { readonly area: 'any' }
  | { readonly area: 'unpaired' }

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: RouteAccess
  }
  interface FastifyRequest {
    remoteDevice: StoredDevice | null // set by the gate; null for a local request
    isRemote: boolean
    accessEmail: string | null // the Cloudflare Access identity of a remote request
  }
}

export const DEVICE_COOKIE = 'wd_device'
const ACCESS_COOKIE = 'CF_Authorization'
const ACCESS_HEADER = 'cf-access-jwt-assertion'
const TUNNEL_HEADERS: readonly string[] = ['cf-ray', 'cf-connecting-ip', ACCESS_HEADER]
const READ_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD'])
const DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60

export function headerText(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name]
  const text = Array.isArray(value) ? value[0] : value
  return text === undefined || text === '' ? null : text
}

// Remote when the Host is the public host or any Cloudflare header is present; the tunnel adds them.
export function classifyRequest(
  headers: IncomingHttpHeaders,
  publicHost: string | null,
): 'local' | 'remote' {
  if (TUNNEL_HEADERS.some((name) => headers[name] !== undefined)) {
    return 'remote'
  }
  const host = (headers.host ?? '').toLowerCase().replace(/:\d+$/, '')
  return publicHost !== null && host === publicHost ? 'remote' : 'local'
}

export function readCookie(headers: IncomingHttpHeaders, name: string): string | null {
  for (const pair of (headers.cookie ?? '').split(';')) {
    const separator = pair.indexOf('=')
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      const value = pair.slice(separator + 1).trim()
      return value === '' ? null : value
    }
  }
  return null
}

export function deviceCookie(token: string): string {
  return `${DEVICE_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${String(DEVICE_COOKIE_MAX_AGE_SECONDS)}`
}

function deny(reply: FastifyReply, status: number, code: AppError['code']): FastifyReply {
  return reply.code(status).send({ ok: false, error: { code } })
}

// The matched route pattern counts too, so an encoded path (/%61pi/...) cannot pass as a static file.
function isApiRequest(request: FastifyRequest): boolean {
  const routeUrl = request.routeOptions.url ?? ''
  return routeUrl.startsWith('/api') || request.url.startsWith('/api')
}

async function checkRemote(
  request: FastifyRequest,
  reply: FastifyReply,
  remote: RemoteService,
): Promise<FastifyReply | undefined> {
  const config = remote.config
  if (config === null || !config.enabled) {
    return deny(reply, 403, 'remoteDisabled')
  }
  const jwt =
    headerText(request.headers, ACCESS_HEADER) ?? readCookie(request.headers, ACCESS_COOKIE)
  const identity = jwt === null ? null : await remote.verifyAccess(jwt)
  if (identity === null) {
    return deny(reply, 403, 'accessRequired')
  }
  request.accessEmail = identity.email
  if (!isApiRequest(request)) {
    return undefined
  }
  const token = readCookie(request.headers, DEVICE_COOKIE)
  const device = token === null ? null : remote.findDevice(token)
  request.remoteDevice = device
  // Before the unpaired exit, so a page on another site cannot submit a pairing either.
  const origin = headerText(request.headers, 'origin')
  if (!READ_METHODS.has(request.method) && origin !== `https://${config.publicHost}`) {
    return deny(reply, 403, 'forbidden')
  }
  const { access } = request.routeOptions.config
  if (access?.area === 'unpaired') {
    return undefined
  }
  if (device === null) {
    return deny(reply, 401, 'notPaired')
  }
  remote.markSeen(device)
  if (access === undefined) {
    return deny(reply, 403, 'forbidden')
  }
  if (access.area !== 'any' && !allows(device.rights, access.area, access.level)) {
    return deny(reply, 403, 'forbidden')
  }
  return undefined
}

// Register after the Host check: every remote request needs Access, a paired device and the route's right.
export function registerRemoteGate(app: FastifyInstance, remote: RemoteService): void {
  app.decorateRequest('remoteDevice', null)
  app.decorateRequest('isRemote', false)
  app.decorateRequest('accessEmail', null)

  app.addHook('onRequest', async (request, reply) => {
    if (classifyRequest(request.headers, remote.config?.publicHost ?? null) === 'local') {
      return undefined
    }
    request.isRemote = true
    return checkRemote(request, reply, remote)
  })

  // Records the route pattern only: never the real URL or the body.
  app.addHook('onResponse', async (request, reply) => {
    const device = request.remoteDevice
    if (!request.isRemote || device === null || READ_METHODS.has(request.method)) {
      return
    }
    remote.record({
      deviceId: device.id,
      deviceName: device.name,
      method: request.method,
      route: request.routeOptions.url ?? '(no route)',
      status: reply.statusCode,
    })
  })
}
