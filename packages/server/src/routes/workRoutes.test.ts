import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function post(
  testApp: TestApp,
  url: string,
  headers: Record<string, string> = LOOPBACK_HEADERS,
) {
  return await testApp.app.inject({ method: 'POST', url, headers })
}

describe('work routes', () => {
  it('work routes reject a malformed key with 400 and a paired device may write', async () => {
    const local = await buildTestApp()
    openApps.push(local.app)

    const view = await local.app.inject({ url: '/api/work', headers: LOOPBACK_HEADERS })
    const replies = await Promise.all([
      post(local, '/api/work/ready-to-test/nope'),
      post(local, '/api/work/comments/nope/seen'),
      post(local, '/api/work/reviews/api/abc/hide'),
      post(local, '/api/work/suggestions/nope/take'),
      post(local, '/api/work/suggestions/nope/hide'),
      post(local, '/api/work/bugs/nope/fix'),
    ])
    const noAdo = await post(local, '/api/work/comments/MDP-1/seen')

    expect(view.statusCode).toBe(200)
    expect(view.json<{ adoConnected: boolean; suggestions: unknown }>()).toMatchObject({
      adoConnected: false,
      suggestions: null,
    })
    expect(replies.map((reply) => reply.statusCode)).toEqual([400, 400, 400, 400, 400, 400])
    expect(replies[0].json()).toEqual({ ok: false, error: { code: 'invalidKey' } })
    expect(noAdo.statusCode).toBe(409)
    expect(noAdo.json()).toEqual({ ok: false, error: { code: 'adoNotConfigured' } })

    const remote = await buildRemoteApp()
    openApps.push(remote.app)
    const token = await pairDevice(remote)
    const read = await remote.app.inject({ url: '/api/work', headers: remoteHeaders(token) })
    const write = await post(remote, '/api/work/suggestions/MDP-1/hide', remoteHeaders(token))
    const fix = await post(remote, '/api/work/bugs/MDP-9/fix', remoteHeaders(token))

    expect(read.statusCode).toBe(200)
    expect(write.statusCode).not.toBe(403)
    expect(fix.statusCode).not.toBe(403)
  })

  it('fix_rejects_a_key_that_is_not_a_bug', async () => {
    const local = await buildTestApp()
    openApps.push(local.app)

    const reply = await post(local, '/api/work/bugs/MDP-9/fix')

    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({ ok: false, error: { code: 'notABug' } })
  })
})
