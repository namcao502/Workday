import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveConfig, saveSecrets } from '../config.js'
import { buildTestApp, LOOPBACK_HEADERS, newDataDir, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

beforeEach(() => {
  vi.stubEnv('WORKDAY_JIRA_API_TOKEN', '')
  vi.stubEnv('WORKDAY_HRM_API_KEY', '')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function timesheetApp(): Promise<TestApp> {
  const dataDir = newDataDir()
  await saveConfig(dataDir, {
    host: '127.0.0.1',
    port: 4870,
    timeZone: 'Asia/Ho_Chi_Minh',
    pollMinutes: 5,
    theme: 'dark',
    language: 'en',
    jira: null,
    timesheet: {
      logTime: '18:00',
      hrm: { mcpUrl: 'https://hrm.example/mcp', projectId: 'P1' },
      tsc: null,
    },
  })
  await saveSecrets(dataDir, { jiraApiToken: null, hrmApiKey: 'hrm-key' })
  const testApp = await buildTestApp({ dataDir })
  openApps.push(testApp.app)
  return testApp
}

function send(
  testApp: TestApp,
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return testApp.app.inject({
    method,
    url,
    headers: LOOPBACK_HEADERS,
    ...(payload ? { payload } : {}),
  })
}

describe('timesheet routes', () => {
  it('queues, edits and removes tickets', async () => {
    const testApp = await timesheetApp()

    const added = await send(testApp, 'POST', '/api/timesheet/queue', {
      date: '2026-11-10',
      tickets: ['MDP-1', 'MDP-2'],
      minutes: null,
    })
    const edited = await send(testApp, 'PUT', '/api/timesheet/queue/2026-11-10/minutes', {
      tickets: ['MDP-1', 'MDP-2'],
      minutes: [300, 300],
    })
    const removed = await send(testApp, 'DELETE', '/api/timesheet/queue/2026-11-10/MDP-1')
    const view = await testApp.app.inject({ url: '/api/timesheet', headers: LOOPBACK_HEADERS })

    expect(added.json()).toEqual({ ok: true })
    expect(edited.json()).toEqual({ ok: false, error: { code: 'overEightHours' } })
    expect(removed.statusCode).toBe(204)
    expect(view.json()).toMatchObject({
      hrmConnected: true,
      queue: [{ date: '2026-11-10', tickets: ['MDP-2'], minutes: null }],
    })
  })

  it('rejects a malformed body with 400', async () => {
    const testApp = await timesheetApp()

    const replies = await Promise.all([
      send(testApp, 'POST', '/api/timesheet/queue', {
        date: 'today',
        tickets: ['MDP-1'],
        minutes: null,
      }),
      send(testApp, 'POST', '/api/timesheet/queue', {
        date: '2026-11-10',
        tickets: ['MDP-1'],
        minutes: [0],
      }),
      send(testApp, 'POST', '/api/timesheet/log', {
        date: '2026-11-10',
        tickets: ['MDP-1'],
        minutes: null,
        target: 'x',
      }),
      send(testApp, 'POST', '/api/timesheet/week', { monday: '2026-11-10', allowSniff: false }),
      send(testApp, 'POST', '/api/timesheet/tickets/check', { keys: 'MDP-1' }),
    ])

    expect(replies.map((reply) => reply.statusCode)).toEqual([400, 400, 400, 400, 400])
  })

  it('refuses to log today before 18:00 with HRM', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T03:00:00Z'))
    const testApp = await timesheetApp()

    const reply = await send(testApp, 'POST', '/api/timesheet/log', {
      date: '2026-11-11',
      tickets: ['MDP-1'],
      minutes: null,
      target: 'both',
    })

    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toEqual({ ok: false, error: { code: 'hrmClosedForToday' } })
    expect(testApp.hours.logs).toEqual([])
  })

  it('refuses a log over eight hours or with a ticket that is not a key', async () => {
    const testApp = await timesheetApp()
    const log = (tickets: string[], minutes: number[] | null): Promise<LightMyRequestResponse> =>
      send(testApp, 'POST', '/api/timesheet/log', {
        date: '2026-11-10',
        tickets,
        minutes,
        target: 'both',
      })

    const overDay = await log(['MDP-1', 'MDP-2'], [300, 300])
    const notKey = await log(['nope'], null)
    const impossibleDate = await send(testApp, 'POST', '/api/timesheet/queue', {
      date: '2026-02-30',
      tickets: ['MDP-1'],
      minutes: null,
    })

    expect([overDay.statusCode, notKey.statusCode, impossibleDate.statusCode]).toEqual([
      409, 409, 400,
    ])
    expect(overDay.json()).toEqual({ ok: false, error: { code: 'overEightHours' } })
    expect(notKey.json()).toEqual({ ok: false, error: { code: 'invalidTicket' } })
    expect(testApp.hours.logs).toEqual([])
  })

  it('ticket check ignores text that is not a ticket key', async () => {
    const testApp = await timesheetApp()

    const reply = await send(testApp, 'POST', '/api/timesheet/tickets/check', {
      keys: ['MDP-1', 'not a key'],
    })

    expect(reply.json()).toEqual([
      { key: 'MDP-1', status: 'unknown', summary: null, isMine: null, suggestedKey: null },
    ])
  })

  it('starts a week read and answers 202', async () => {
    const testApp = await timesheetApp()

    const reply = await send(testApp, 'POST', '/api/timesheet/week', {
      monday: '2026-11-09',
      allowSniff: false,
    })

    expect(reply.statusCode).toBe(202)
    expect(testApp.services.timesheet.view().week).toMatchObject({ monday: '2026-11-09' })
  })
})
