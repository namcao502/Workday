import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function localApp(): Promise<TestApp> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  return testApp
}

async function post(testApp: TestApp, url: string, payload: object = {}) {
  return await testApp.app.inject({ method: 'POST', url, headers: LOOPBACK_HEADERS, payload })
}

describe('notice routes', () => {
  it('notice routes reject a non-numeric id and an empty place with 400', async () => {
    const testApp = await localApp()

    const replies = await Promise.all([
      post(testApp, '/api/notices/abc/read'),
      post(testApp, '/api/notices/0/read'),
      post(testApp, '/api/notices/1.5/read'),
      post(testApp, '/api/notices/read-place', { place: '' }),
      post(testApp, '/api/notices/read-place', {}),
    ])

    expect(replies.map((reply) => reply.statusCode)).toEqual([400, 400, 400, 400, 400])
  })

  it('GET returns the view and the read routes mark notices read', async () => {
    const testApp = await localApp()
    const first = await testApp.services.notices.add({
      topic: 'other',
      tone: 'info',
      event: { type: 'ticketMissing', key: 'MDP-1' },
      target: null,
      place: 'board',
    })
    await testApp.services.notices.add({
      topic: 'other',
      tone: 'info',
      event: { type: 'ticketMissing', key: 'MDP-2' },
      target: null,
      place: null,
    })

    const before = await testApp.app.inject({ url: '/api/notices', headers: LOOPBACK_HEADERS })
    const byId = await post(testApp, `/api/notices/${String(first.id)}/read`)
    const byPlace = await post(testApp, '/api/notices/read-place', { place: 'board' })
    const all = await post(testApp, '/api/notices/read-all')

    expect(before.json<{ unread: number }>().unread).toBe(2)
    expect(byId.json<{ unread: number }>().unread).toBe(1)
    expect(byPlace.json<{ unread: number }>().unread).toBe(1)
    expect(all.json<{ unread: number }>().unread).toBe(0)
  })

  it('a new finished wait adds one claude notice and seeing the session reads it', async () => {
    const testApp = await localApp()
    const { workspace, notices } = testApp.services
    await workspace.addTerminal(null)

    await workspace.onHook('claude', workspace.hookToken, { hook_event_name: 'Stop' })
    await workspace.onHook('claude', workspace.hookToken, { hook_event_name: 'Stop' })

    await expect.poll(() => notices.view().notices.length).toBe(1)
    const { notices: added, unread } = notices.view()
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({
      topic: 'claude',
      place: 'session:claude',
      target: { kind: 'workspace', tab: 'claude', session: 'claude' },
      event: { type: 'claudeWait', subject: 'Terminal Dev repo', wait: 'finished' },
    })
    expect(unread).toBe(1)

    workspace.seen('claude')

    await expect.poll(() => notices.view().unread).toBe(0)
  })

  it('a remote device without board view gets 403 on GET /api/notices', async () => {
    const testApp = await buildRemoteApp()
    openApps.push(testApp.app)
    const token = await pairDevice(testApp)
    const [device] = testApp.services.remote.status().devices
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/remote/devices/${device?.id ?? ''}`,
      headers: LOOPBACK_HEADERS,
      payload: { rights: { board: 'off' } },
    })

    const reply = await testApp.app.inject({ url: '/api/notices', headers: remoteHeaders(token) })

    expect(reply.statusCode).toBe(403)
  })
})
