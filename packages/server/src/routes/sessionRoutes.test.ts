import type { FastifyInstance } from 'fastify'
import { afterEach, expect, it, vi } from 'vitest'
import type { EventSocket } from '../events.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

const APP_SOCKET: EventSocket = { readyState: 1, send: () => undefined, close: () => undefined }

async function appConnected(): Promise<TestApp> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  testApp.services.events.add(APP_SOCKET, null, 'loopback', 'app')
  return testApp
}

function get(testApp: TestApp, client: string | null) {
  const headers =
    client === null ? LOOPBACK_HEADERS : { ...LOOPBACK_HEADERS, 'x-workday-client': client }
  return testApp.app.inject({ url: '/api/board', headers })
}

it('web REST is 409 while an app is connected', async () => {
  const testApp = await appConnected()
  const reply = await get(testApp, 'web')
  expect(reply.statusCode).toBe(409)
  expect(reply.json()).toEqual({ ok: false, error: { code: 'sessionInApp' } })
  expect((await get(testApp, 'app')).statusCode).toBe(200)
})

it('REST without the header passes', async () => {
  const testApp = await appConnected()
  expect((await get(testApp, null)).statusCode).toBe(200)
})

it('web REST passes while no app is connected', async () => {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  expect((await get(testApp, 'web')).statusCode).toBe(200)
})

const NOTICE = {
  topic: 'teamsMention',
  tone: 'info',
  event: { type: 'teamsMessage', key: 'MDP-1', title: 'T', sender: 'Minh', mention: true },
  target: { kind: 'teams', key: 'MDP-1', conversationId: 'c1' },
  place: 'teams:k1',
} as const

it('local push is skipped while an app is connected', async () => {
  const testApp = await appConnected()
  const send = vi.spyOn(testApp.services.remote.push, 'sendToLocal').mockResolvedValue()
  await testApp.services.notices.add(NOTICE)
  expect(send).not.toHaveBeenCalled()
})

it('local push still runs while no app is connected', async () => {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  const send = vi.spyOn(testApp.services.remote.push, 'sendToLocal').mockResolvedValue()
  await testApp.services.notices.add(NOTICE)
  expect(send).toHaveBeenCalledTimes(1)
})
