import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS } from '../testing/testApp.js'

// Real git processes: the first run on a cold machine exceeds the 5 s default.
vi.setConfig({ testTimeout: 30_000 })

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('cleanup routes', () => {
  it('GET returns no rows until the dev repo is set', async () => {
    const { app } = await buildTestApp()
    openApps.push(app)
    const reply = await app.inject({ url: '/api/workspace/cleanup', headers: LOOPBACK_HEADERS })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ rows: [] })
  })

  it('POST remove with a bad key is a 400, and a bad body is a 400', async () => {
    const { app } = await buildTestApp()
    openApps.push(app)
    const bad = await app.inject({
      method: 'POST',
      url: '/api/workspace/cleanup/..%2Fetc/remove',
      headers: LOOPBACK_HEADERS,
      payload: { dirtyFiles: 0 },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toEqual({ ok: false, error: { code: 'invalidKey' } })
    const noBody = await app.inject({
      method: 'POST',
      url: '/api/workspace/cleanup/MDP-1/remove',
      headers: LOOPBACK_HEADERS,
      payload: { dirtyFiles: 'many' },
    })
    expect(noBody.statusCode).toBe(400)
  })

  it('is local-only: a paired device gets a 403', async () => {
    const remote = await buildRemoteApp()
    openApps.push(remote.app)
    const device = await pairDevice(remote)
    const reply = await remote.app.inject({
      url: '/api/workspace/cleanup',
      headers: remoteHeaders(device),
    })
    expect(reply.statusCode).toBe(403)
  })
})
