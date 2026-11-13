import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { AMS_URL } from '../testing/fakeTeams.js'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function teamsApp(): Promise<TestApp> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  testApp.teamsChat.addChannel('c1')
  await testApp.services.settings.update({
    teams: { watchedChannels: ['team > c1'], postLeadName: null, postGreeting: null },
  })
  return testApp
}

describe('teams routes', () => {
  it('status says whether Teams is configured', async () => {
    const testApp = await buildTestApp()
    openApps.push(testApp.app)
    const before = await testApp.app.inject({ url: '/api/teams/status', headers: LOOPBACK_HEADERS })
    await testApp.services.settings.update({
      teams: { watchedChannels: ['team > c1'], postLeadName: null, postGreeting: null },
    })
    const after = await testApp.app.inject({ url: '/api/teams/status', headers: LOOPBACK_HEADERS })

    expect(before.json()).toEqual({ configured: false, signedIn: null })
    expect(after.json()).toEqual({ configured: true, signedIn: null })
  })

  it('GET reads the conversation and rejects a wrong key', async () => {
    const { app } = await teamsApp()

    const read = await app.inject({ url: '/api/teams/MDP-1', headers: LOOPBACK_HEADERS })
    const wrong = await app.inject({ url: '/api/teams/mdp1', headers: LOOPBACK_HEADERS })

    expect(read.json<{ state: string }>().state).toBe('notPosted')
    expect(wrong.statusCode).toBe(400)
    expect(wrong.json()).toEqual({ ok: false, error: { code: 'invalidKey' } })
  })

  it('image route serves only AMS urls', async () => {
    const { app, teamsChat } = await teamsApp()

    const foreign = await app.inject({
      url: `/api/teams/image?url=${encodeURIComponent('https://evil.example.com/a.png')}`,
      headers: LOOPBACK_HEADERS,
    })
    const ams = await app.inject({
      url: `/api/teams/image?url=${encodeURIComponent(AMS_URL)}`,
      headers: LOOPBACK_HEADERS,
    })

    expect(foreign.statusCode).toBe(400)
    expect(teamsChat.imageCalls).toEqual([AMS_URL])
    expect(ams.statusCode).toBe(200)
    expect(ams.headers['content-type']).toBe('image/png')
    expect(ams.headers['cache-control']).toBe('private, max-age=86400')
    expect(ams.headers['content-security-policy']).toContain('sandbox')
    expect([...ams.rawPayload]).toEqual([1, 2, 3])
  })

  it('a reply with a body that is not a draft is a 400', async () => {
    const { app, teamsChat } = await teamsApp()

    const reply = await app.inject({
      method: 'POST',
      url: '/api/teams/MDP-1/reply',
      headers: LOOPBACK_HEADERS,
      payload: { conversationId: 'c1', rootId: null, draft: { html: 5, mentions: [] } },
    })

    expect(reply.statusCode).toBe(400)
    expect(teamsChat.sent).toEqual([])
  })

  it('a post goes out once, then warns until confirm', async () => {
    const { app, teamsChat } = await teamsApp()
    const payload = {
      channelId: 'c1',
      subject: 'MDP-1 Fix',
      draft: { html: '<p>Done</p>', mentions: [] },
    }
    const send = (body: object): Promise<LightMyRequestResponse> =>
      app.inject({
        method: 'POST',
        url: '/api/teams/MDP-1/post',
        headers: LOOPBACK_HEADERS,
        payload: body,
      })

    const first = await send(payload)
    const second = await send(payload)

    expect(first.json()).toEqual({ ok: true, id: 'sent-1' })
    expect(second.json()).toEqual({ ok: false, error: { code: 'teamsUncertain' } })
    expect(teamsChat.sent).toHaveLength(1)
  })

  it('handoff to an unknown session is refused', async () => {
    const { app } = await teamsApp()

    const reply = await app.inject({
      method: 'POST',
      url: '/api/teams/MDP-1/handoff',
      headers: LOOPBACK_HEADERS,
      payload: { conversationId: 'chat-x', messageId: 'm1', session: 'nobody' },
    })

    expect(reply.json()).toEqual({ ok: false, error: { code: 'teamsFailed' } })
  })

  it('teams routes are local-only', async () => {
    const testApp = await buildRemoteApp()
    openApps.push(testApp.app)
    const token = await pairDevice(testApp)

    for (const url of [
      '/api/teams/status',
      '/api/teams/MDP-1',
      `/api/teams/image?url=${encodeURIComponent(AMS_URL)}`,
    ]) {
      const reply = await testApp.app.inject({ url, headers: remoteHeaders(token) })
      expect(reply.statusCode).toBe(403)
    }
    const write = await testApp.app.inject({
      method: 'POST',
      url: '/api/teams/MDP-1/reply',
      headers: remoteHeaders(token),
      payload: {},
    })
    expect(write.statusCode).toBe(403)
  })
})
