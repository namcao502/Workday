import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'
import {
  buildRemoteApp,
  ENABLED_REMOTE,
  pairDevice,
  PUBLIC_HOST,
  remoteHeaders,
} from '../testing/remoteTestApp.js'
import { classifyRequest } from './remoteGate.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function remoteApp(...args: Parameters<typeof buildRemoteApp>): Promise<TestApp> {
  const testApp = await buildRemoteApp(...args)
  openApps.push(testApp.app)
  return testApp
}

describe('classifyRequest', () => {
  it('a loopback request without cf headers stays local', () => {
    expect(classifyRequest({ host: '127.0.0.1:4870' }, PUBLIC_HOST)).toBe('local')
    expect(classifyRequest({ host: 'localhost:4870' }, null)).toBe('local')
  })

  it('a request with cf-ray is remote even with a loopback Host', () => {
    expect(classifyRequest({ host: '127.0.0.1:4870', 'cf-ray': 'x' }, PUBLIC_HOST)).toBe('remote')
    expect(classifyRequest({ host: '127.0.0.1:4870', 'cf-ray': 'x' }, null)).toBe('remote')
    expect(classifyRequest({ host: `${PUBLIC_HOST}:443` }, PUBLIC_HOST)).toBe('remote')
  })
})

describe('remote gate', () => {
  it('a loopback request still reaches every route', async () => {
    const { app } = await remoteApp()

    const reply = await app.inject({ url: '/api/remote', headers: LOOPBACK_HEADERS })

    expect(reply.statusCode).toBe(200)
  })

  it('remote is refused while remote access is off', async () => {
    const off = await remoteApp({ ...ENABLED_REMOTE, enabled: false })
    const unset = await remoteApp(null)
    const headers = { ...remoteHeaders(), host: LOOPBACK_HEADERS.host }

    const replies = await Promise.all([
      off.app.inject({ url: '/api/health', headers: remoteHeaders() }),
      unset.app.inject({ url: '/api/health', headers }),
    ])

    for (const reply of replies) {
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ ok: false, error: { code: 'remoteDisabled' } })
    }
  })

  it('a remote request without a valid Access JWT gets 403', async () => {
    const { app } = await remoteApp()
    const withoutJwt = Object.fromEntries(
      Object.entries(remoteHeaders()).filter(([name]) => name !== 'cf-access-jwt-assertion'),
    )

    const missing = await app.inject({ url: '/', headers: withoutJwt })
    const forged = await app.inject({
      url: '/api/health',
      headers: { ...withoutJwt, cookie: 'CF_Authorization=forged' },
    })

    for (const reply of [missing, forged]) {
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ ok: false, error: { code: 'accessRequired' } })
    }
  })

  it('the SPA shell loads remotely without a device', async () => {
    const clientDist = mkdtempSync(join(tmpdir(), 'workday-client-'))
    writeFileSync(join(clientDist, 'index.html'), '<!doctype html>')
    const { app } = await remoteApp(ENABLED_REMOTE, { clientDist })

    const shell = await app.inject({ url: '/board', headers: remoteHeaders() })
    const me = await app.inject({ url: '/api/me', headers: remoteHeaders() })

    expect(shell.statusCode).toBe(200)
    expect(shell.body).toBe('<!doctype html>')
    expect(me.json()).toEqual({ mode: 'unpaired' })
  })

  it('an unpaired remote api call gets 401 notPaired', async () => {
    const { app } = await remoteApp()

    const plain = await app.inject({ url: '/api/board', headers: remoteHeaders() })
    const encoded = await app.inject({ url: '/%61pi/board', headers: remoteHeaders() })
    const wrongToken = await app.inject({ url: '/api/board', headers: remoteHeaders('nope') })

    for (const reply of [plain, encoded, wrongToken]) {
      expect(reply.statusCode).toBe(401)
      expect(reply.json()).toEqual({ ok: false, error: { code: 'notPaired' } })
    }
  })

  it('a view device cannot call a board action', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)

    const view = await testApp.app.inject({ url: '/api/board', headers: remoteHeaders(token) })
    const action = await testApp.app.inject({
      method: 'POST',
      url: '/api/board/MDP-1/done',
      headers: remoteHeaders(token),
    })

    expect(view.statusCode).toBe(200)
    expect(action.statusCode).toBe(403)
    expect(action.json()).toEqual({ ok: false, error: { code: 'forbidden' } })
  })

  it('a remote call to a route without access config gets 403', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)

    const replies = await Promise.all([
      testApp.app.inject({ url: '/api/remote', headers: remoteHeaders(token) }),
      testApp.app.inject({
        method: 'POST',
        url: '/api/settings/tsc/sign-in',
        headers: remoteHeaders(token),
      }),
      testApp.app.inject({ url: '/api/nothing-here', headers: remoteHeaders(token) }),
    ])

    for (const reply of replies) {
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ ok: false, error: { code: 'forbidden' } })
    }
  })

  it('a remote POST with a foreign Origin gets 403', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)
    const payload = { date: '2026-11-10', tickets: ['MDP-1'], minutes: null }

    const foreign = await testApp.app.inject({
      method: 'POST',
      url: '/api/timesheet/queue',
      headers: { ...remoteHeaders(token), origin: 'https://evil.example' },
      payload,
    })
    const own = await testApp.app.inject({
      method: 'POST',
      url: '/api/timesheet/queue',
      headers: remoteHeaders(token),
      payload,
    })

    expect(foreign.statusCode).toBe(403)
    expect(foreign.json()).toEqual({ ok: false, error: { code: 'forbidden' } })
    expect(own.statusCode).toBe(200)
  })

  it('a remote pair POST with a foreign Origin gets 403', async () => {
    const { app } = await remoteApp()
    await app.inject({ method: 'POST', url: '/api/remote/pairing', headers: LOOPBACK_HEADERS })

    const reply = await app.inject({
      method: 'POST',
      url: '/api/pair',
      headers: { ...remoteHeaders(), origin: 'https://evil.example' },
      payload: { code: 'ABCDEF', name: 'iPhone' },
    })

    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual({ ok: false, error: { code: 'forbidden' } })
  })
})
