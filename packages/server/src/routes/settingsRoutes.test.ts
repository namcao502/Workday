import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JiraConfig } from '@workday/core'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveConfig, saveSecrets } from '../config.js'
import { buildTestApp, LOOPBACK_HEADERS, newDataDir, type TestApp } from '../testing/testApp.js'

const SAVED_TOKEN = 'saved-secret-token'
const JIRA: JiraConfig = {
  baseUrl: 'https://jira.example',
  email: 'me@example.com',
  projectKey: 'MDP',
  assignedJql: 'assignee = currentUser()',
  maxResults: 50,
  etaFieldId: null,
  devPriorityFieldId: null,
  statusFlow: { preWorkStatuses: [], reworkStatuses: [] },
}

const openApps: FastifyInstance[] = []

beforeEach(() => {
  vi.stubEnv('WORKDAY_JIRA_API_TOKEN', '')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function connectedApp(): Promise<TestApp> {
  const dataDir = newDataDir()
  await saveConfig(dataDir, {
    host: '127.0.0.1',
    port: 4870,
    timeZone: 'Asia/Ho_Chi_Minh',
    pollMinutes: 5,
    theme: 'dark',
    language: 'en',
    jira: JIRA,
  })
  await saveSecrets(dataDir, { jiraApiToken: SAVED_TOKEN })
  return track(await buildTestApp({ dataDir }))
}

function track(testApp: TestApp): TestApp {
  openApps.push(testApp.app)
  return testApp
}

function putSettings(
  testApp: TestApp,
  payload: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return testApp.app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers: LOOPBACK_HEADERS,
    payload,
  })
}

describe('settings routes', () => {
  it('GET /api/settings never returns the token', async () => {
    const testApp = await connectedApp()

    const response = await testApp.app.inject({ url: '/api/settings', headers: LOOPBACK_HEADERS })

    expect(response.statusCode).toBe(200)
    expect(response.body).not.toContain(SAVED_TOKEN)
    expect(response.json()).toEqual({
      config: {
        port: 4870,
        timeZone: 'Asia/Ho_Chi_Minh',
        pollMinutes: 5,
        theme: 'dark',
        language: 'en',
        jira: JIRA,
      },
      jiraTokenSource: 'file',
    })
  })

  it('PUT /api/settings with a token stores it and rebuilds the tracker', async () => {
    const testApp = track(await buildTestApp())

    const response = await putSettings(testApp, { jira: JIRA, jiraApiToken: 'new-token' })

    expect(response.statusCode).toBe(200)
    expect(response.body).not.toContain('new-token')
    expect(response.json()).toMatchObject({ config: { jira: JIRA }, jiraTokenSource: 'file' })
    expect(testApp.trackerCalls).toEqual([{ jira: JIRA, token: 'new-token' }])
    expect(testApp.schedulerStarts).toEqual([5])
    const secrets: unknown = JSON.parse(readFileSync(join(testApp.dataDir, 'secrets.json'), 'utf8'))
    expect(secrets).toEqual({ jiraApiToken: 'new-token' })
    const board = await testApp.app.inject({ url: '/api/board', headers: LOOPBACK_HEADERS })
    expect(board.json()).toMatchObject({ connected: true })
  })

  it('PUT /api/settings rejects an out-of-range port', async () => {
    const testApp = await connectedApp()

    const lowPort = await putSettings(testApp, { port: 80 })
    const highPort = await putSettings(testApp, { port: 70000 })
    const badPoll = await putSettings(testApp, { pollMinutes: 61 })
    const badZone = await putSettings(testApp, { timeZone: 'Mars/Olympus' })

    expect([lowPort, highPort, badPoll, badZone].map((reply) => reply.statusCode)).toEqual([
      400, 400, 400, 400,
    ])
    const settings = await testApp.app.inject({ url: '/api/settings', headers: LOOPBACK_HEADERS })
    expect(settings.json()).toMatchObject({ config: { port: 4870, pollMinutes: 5 } })
  })

  it('PUT /api/settings with jira null disconnects', async () => {
    const testApp = await connectedApp()

    const response = await putSettings(testApp, { jira: null })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ config: { jira: null } })
    const board = await testApp.app.inject({ url: '/api/board', headers: LOOPBACK_HEADERS })
    expect(board.json()).toMatchObject({ connected: false })
    expect(testApp.schedulerStops.count).toBe(1)
  })

  it('PUT /api/settings broadcasts settings.changed', async () => {
    const testApp = await connectedApp()
    const broadcast = vi.spyOn(testApp.services.events, 'broadcast')

    await putSettings(testApp, { theme: 'light' })

    expect(broadcast.mock.calls).toEqual([[{ type: 'settings.changed' }]])
  })

  it('a failing token save rolls config.json back', async () => {
    const testApp = await connectedApp()
    const configPath = join(testApp.dataDir, 'config.json')
    const configBefore = readFileSync(configPath, 'utf8')
    mkdirSync(join(testApp.dataDir, 'secrets.json.tmp'))

    const response = await putSettings(testApp, {
      jira: { ...JIRA, baseUrl: 'https://other.example' },
      jiraApiToken: 'other-token',
    })

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(JSON.parse(configBefore))
    const settings = await testApp.app.inject({ url: '/api/settings', headers: LOOPBACK_HEADERS })
    expect(settings.json()).toMatchObject({ config: { jira: JIRA } })
  })

  it('a failing config save leaves the settings unchanged and broadcasts nothing', async () => {
    const testApp = await connectedApp()
    const broadcast = vi.spyOn(testApp.services.events, 'broadcast')
    // A folder where the temp file goes makes the atomic write fail.
    mkdirSync(join(testApp.dataDir, 'config.json.tmp'))

    const response = await putSettings(testApp, { theme: 'light', jiraApiToken: 'new-token' })

    expect(response.statusCode).toBe(500)
    const settings = await testApp.app.inject({ url: '/api/settings', headers: LOOPBACK_HEADERS })
    expect(settings.json()).toMatchObject({ config: { theme: 'dark' } })
    const secrets: unknown = JSON.parse(readFileSync(join(testApp.dataDir, 'secrets.json'), 'utf8'))
    expect(secrets).toEqual({ jiraApiToken: SAVED_TOKEN })
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('jira check never sends the saved token to another base URL', async () => {
    const testApp = await connectedApp()
    const callsAtStart = testApp.trackerCalls.length
    const check = (payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
      testApp.app.inject({
        method: 'POST',
        url: '/api/settings/jira/check',
        headers: LOOPBACK_HEADERS,
        payload,
      })

    const otherHost = await check({ baseUrl: 'https://evil.example', email: JIRA.email })
    const sameHost = await check({ baseUrl: `${JIRA.baseUrl}/`, email: JIRA.email })
    const otherHostWithToken = await check({
      baseUrl: 'https://other.example',
      email: JIRA.email,
      jiraApiToken: 'typed-token',
    })

    expect(otherHost.statusCode).toBe(400)
    expect(sameHost.json()).toEqual({ ok: true, displayName: 'Test User' })
    expect(otherHostWithToken.json()).toEqual({ ok: true, displayName: 'Test User' })
    const checkCalls = testApp.trackerCalls.slice(callsAtStart)
    expect(checkCalls.map((call) => [call.jira.baseUrl, call.token])).toEqual([
      [`${JIRA.baseUrl}/`, SAVED_TOKEN],
      ['https://other.example', 'typed-token'],
    ])
  })

  it('PUT /api/settings to a new Jira host without a token keeps the saved token home', async () => {
    const testApp = await connectedApp()
    const callsAtStart = testApp.trackerCalls.length

    const response = await putSettings(testApp, {
      jira: { ...JIRA, baseUrl: 'https://evil.example' },
    })

    expect(response.statusCode).toBe(400)
    expect(testApp.trackerCalls.length).toBe(callsAtStart)
  })
})
