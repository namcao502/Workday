import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function post(testApp: TestApp, url: string, headers: Record<string, string> = LOOPBACK_HEADERS) {
  return await testApp.app.inject({ method: 'POST', url, headers })
}

describe('work routes', () => {
  it('work routes reject a malformed key with 400 and need board act for writes', async () => {
    const local = await buildTestApp()
    openApps.push(local.app)

    const view = await local.app.inject({ url: '/api/work', headers: LOOPBACK_HEADERS })
    const replies = await Promise.all([
      post(local, '/api/work/ready-to-test/nope'),
      post(local, '/api/work/comments/nope/seen'),
      post(local, '/api/work/reviews/api/abc/hide'),
      post(local, '/api/work/suggestions/nope/take'),
      post(local, '/api/work/suggestions/nope/hide'),
    ])
    const noAdo = await post(local, '/api/work/comments/MDP-1/seen')

    expect(view.statusCode).toBe(200)
    expect(view.json<{ adoConnected: boolean; suggestions: unknown }>()).toMatchObject({
      adoConnected: false,
      suggestions: null,
    })
    expect(replies.map((reply) => reply.statusCode)).toEqual([400, 400, 400, 400, 400])
    expect(replies[0].json()).toEqual({ ok: false, error: { code: 'invalidKey' } })
    expect(noAdo.statusCode).toBe(409)
    expect(noAdo.json()).toEqual({ ok: false, error: { code: 'adoNotConfigured' } })

    const remote = await buildRemoteApp()
    openApps.push(remote.app)
    const token = await pairDevice(remote)
    const [device] = remote.services.remote.status().devices
    await remote.app.inject({
      method: 'PUT',
      url: `/api/remote/devices/${device?.id ?? ''}`,
      headers: LOOPBACK_HEADERS,
      payload: { rights: { board: 'view' } },
    })
    const read = await remote.app.inject({ url: '/api/work', headers: remoteHeaders(token) })
    const write = await post(remote, '/api/work/suggestions/MDP-1/hide', remoteHeaders(token))

    expect(read.statusCode).toBe(200)
    expect(write.statusCode).toBe(403)
  })
})
