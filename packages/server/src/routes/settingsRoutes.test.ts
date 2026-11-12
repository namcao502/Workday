import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { JiraConfig } from '@workday/core'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_SECRETS, readFileSecrets, saveConfig, saveSecrets } from '../config.js'
import { buildTestApp, LOOPBACK_HEADERS, newDataDir, type TestApp } from '../testing/testApp.js'

const SAVED_TOKEN = 'saved-secret-token'
const JIRA: JiraConfig = {
  baseUrl: 'https://jira.example',
  email: 'me@example.com',
  projectKey: 'MDP',
  assignedJql: 'assignee = currentUser()',
  mineJql: 'assignee = currentUser()',
  maxResults: 50,
  etaFieldId: null,
  devPriorityFieldId: null,
  statusFlow: { preWorkStatuses: [], reworkStatuses: [] },
}

const SAVED_HRM_KEY = 'saved-hrm-key'
const HRM_URL = 'https://hrm.example/mcp'
const TIMESHEET = { logTime: '18:00', hrm: { mcpUrl: HRM_URL, projectId: 'P1' }, tsc: null }

const openApps: FastifyInstance[] = []

beforeEach(() => {
  vi.stubEnv('WORKDAY_JIRA_API_TOKEN', '')
  vi.stubEnv('WORKDAY_HRM_API_KEY', '')
  vi.stubEnv('WORKDAY_TUNNEL_TOKEN', '')
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
    timesheet: { logTime: '18:00', hrm: null, tsc: null },
    remote: null,
  })
  await saveSecrets(dataDir, { ...NO_SECRETS, jiraApiToken: SAVED_TOKEN })
  return track(await buildTestApp({ dataDir }))
}

async function hrmApp(): Promise<TestApp> {
  const dataDir = newDataDir()
  await saveConfig(dataDir, {
    host: '127.0.0.1',
    port: 4870,
    timeZone: 'Asia/Ho_Chi_Minh',
    pollMinutes: 5,
    theme: 'dark',
    language: 'en',
    jira: null,
    timesheet: TIMESHEET,
    remote: null,
  })
  await saveSecrets(dataDir, { ...NO_SECRETS, hrmApiKey: SAVED_HRM_KEY })
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
        timesheet: { logTime: '18:00', hrm: null, tsc: null },
        remote: null,
      },
      jiraTokenSource: 'file',
      hrmKeySource: null,
      tunnelTokenSource: null,
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
    const secrets = readFileSecrets(testApp.dataDir)
    expect(secrets).toEqual({ ...NO_SECRETS, jiraApiToken: 'new-token', hrmApiKey: null })
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
    const secrets = readFileSecrets(testApp.dataDir)
    expect(secrets).toEqual({ ...NO_SECRETS, jiraApiToken: SAVED_TOKEN, hrmApiKey: null })
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

  it('GET /api/settings never returns the HRM key', async () => {
    const testApp = await hrmApp()

    const response = await testApp.app.inject({ url: '/api/settings', headers: LOOPBACK_HEADERS })

    expect(response.body).not.toContain(SAVED_HRM_KEY)
    expect(response.json()).toMatchObject({
      hrmKeySource: 'file',
      config: { timesheet: TIMESHEET },
    })
    expect(testApp.hoursLogCalls).toEqual([{ hrm: TIMESHEET.hrm, apiKey: SAVED_HRM_KEY }])
    const timesheet = await testApp.app.inject({ url: '/api/timesheet', headers: LOOPBACK_HEADERS })
    expect(timesheet.json()).toMatchObject({ hrmConnected: true, tscConnected: false })
  })

  it('the saved HRM key is never sent to another MCP URL', async () => {
    const testApp = await hrmApp()
    const callsAtStart = testApp.hoursLogCalls.length
    const check = (payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
      testApp.app.inject({
        method: 'POST',
        url: '/api/settings/hrm/check',
        headers: LOOPBACK_HEADERS,
        payload,
      })

    const otherUrl = await check({ mcpUrl: 'https://evil.example/mcp' })
    const sameUrl = await check({ mcpUrl: `${HRM_URL}/` })
    const moved = await putSettings(testApp, {
      timesheet: { ...TIMESHEET, hrm: { ...TIMESHEET.hrm, mcpUrl: 'https://evil.example/mcp' } },
    })
    const badLogTime = await putSettings(testApp, { timesheet: { ...TIMESHEET, logTime: '25:00' } })

    expect(otherUrl.statusCode).toBe(400)
    expect(sameUrl.json()).toEqual({ ok: true })
    expect(moved.statusCode).toBe(400)
    expect(badLogTime.statusCode).toBe(400)
    expect(testApp.hoursLogCalls.slice(callsAtStart)).toEqual([
      { hrm: { mcpUrl: `${HRM_URL}/`, projectId: 'P1' }, apiKey: SAVED_HRM_KEY },
    ])
  })

  it('PUT /api/settings with an HRM key keeps the Jira token in secrets.json', async () => {
    const testApp = await connectedApp()

    const response = await putSettings(testApp, { timesheet: TIMESHEET, hrmApiKey: 'new-key' })

    expect(response.statusCode).toBe(200)
    expect(response.body).not.toContain('new-key')
    const secrets = readFileSecrets(testApp.dataDir)
    expect(secrets).toEqual({ ...NO_SECRETS, jiraApiToken: SAVED_TOKEN, hrmApiKey: 'new-key' })
    expect(testApp.hoursLogCalls.at(-1)).toEqual({ hrm: TIMESHEET.hrm, apiKey: 'new-key' })
  })

  it('saving an HRM key keeps the Jira token saved in the file while the env overrides it', async () => {
    vi.stubEnv('WORKDAY_JIRA_API_TOKEN', 'env-token')
    const testApp = await connectedApp()

    const response = await putSettings(testApp, { timesheet: TIMESHEET, hrmApiKey: 'new-key' })

    expect(response.statusCode).toBe(200)
    const secrets = readFileSecrets(testApp.dataDir)
    expect(secrets).toEqual({ ...NO_SECRETS, jiraApiToken: SAVED_TOKEN, hrmApiKey: 'new-key' })
  })

  it('PUT /api/settings saves remote and the tunnel token beside the other secrets', async () => {
    const testApp = await connectedApp()
    const remote = {
      enabled: true,
      publicHost: 'https://Workday.Example.com/',
      accessTeamDomain: 'team.cloudflareaccess.com',
      accessAud: 'aud-123',
      cloudflaredPath: null,
    }

    const response = await putSettings(testApp, { remote, tunnelToken: 'tunnel-secret' })

    expect(response.statusCode).toBe(200)
    expect(response.body).not.toContain('tunnel-secret')
    expect(response.json()).toMatchObject({
      config: { remote: { publicHost: 'workday.example.com' } },
      tunnelTokenSource: 'file',
    })
    expect(readFileSecrets(testApp.dataDir)).toEqual({
      ...NO_SECRETS,
      jiraApiToken: SAVED_TOKEN,
      tunnelToken: 'tunnel-secret',
    })
    expect(readFileSync(join(testApp.dataDir, 'config.json'), 'utf8')).not.toContain(
      'tunnel-secret',
    )
    expect(testApp.services.remote.config?.publicHost).toBe('workday.example.com')
  })

  it('PUT /api/settings rejects an incomplete remote block', async () => {
    const testApp = await connectedApp()

    const response = await putSettings(testApp, { remote: { publicHost: 'workday.example.com' } })

    expect(response.statusCode).toBe(400)
    expect(testApp.services.remote.config).toBeNull()
  })
})
