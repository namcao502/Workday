import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('notice routes and Teams', () => {
  const TEAMS_NOTICE = {
    topic: 'teamsMention',
    tone: 'info',
    event: { type: 'teamsMessage', key: 'MDP-1', title: 'T', sender: 'Minh', mention: true },
    target: { kind: 'teams', key: 'MDP-1', conversationId: 'c1' },
    place: 'teams:k1',
  } as const

  it('reading a Teams notice, or all notices, also marks its conversation seen', async () => {
    const testApp = await localApp()
    const seen = vi.spyOn(testApp.services.teamsWatcher, 'seen').mockResolvedValue()
    const first = await testApp.services.notices.add(TEAMS_NOTICE)
    await testApp.services.notices.add({
      ...TEAMS_NOTICE,
      target: { ...TEAMS_NOTICE.target, key: 'MDP-2', conversationId: 'c2' },
      place: 'teams:k2',
    })

    await post(testApp, `/api/notices/${String(first.id)}/read`)
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenLastCalledWith('MDP-1', 'c1')
    await post(testApp, '/api/notices/read-all')
    expect(seen).toHaveBeenCalledTimes(2)
    expect(seen).toHaveBeenLastCalledWith('MDP-2', 'c2')
  })
})

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
    await testApp.app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: LOOPBACK_HEADERS,
      payload: { workspace: { devRepoPath: testApp.homeDir } },
    })
    await workspace.addTerminal(null)

    workspace.prompt('claude', 'one')
    testApp.agent.last().emit({ type: 'turnEnded', ok: true })
    testApp.agent.last().emit({ type: 'turnEnded', ok: true })

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
})
