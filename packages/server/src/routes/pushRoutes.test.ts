import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_SECRETS, saveConfig, saveSecrets } from '../config.js'
import {
  ENABLED_REMOTE,
  pairDevice,
  remoteHeaders,
  buildRemoteApp,
} from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, newDataDir, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []
const SUBSCRIPTION = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }

beforeEach(() => {
  vi.stubEnv('WORKDAY_HRM_API_KEY', '')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function remoteApp(): Promise<TestApp> {
  const testApp = await buildRemoteApp()
  openApps.push(testApp.app)
  return testApp
}

async function subscribe(testApp: TestApp, token: string, endpoint: string): Promise<void> {
  const reply = await testApp.app.inject({
    method: 'PUT',
    url: '/api/push',
    headers: remoteHeaders(token),
    payload: { subscription: { ...SUBSCRIPTION, endpoint } },
  })
  expect(reply.statusCode).toBe(204)
}

// HRM is configured so a scheduled run on an empty queue is a reminder.
async function timesheetApp(language: 'en' | 'vi'): Promise<TestApp> {
  const dataDir = newDataDir()
  await saveConfig(dataDir, {
    host: '127.0.0.1',
    port: 4870,
    timeZone: 'Asia/Ho_Chi_Minh',
    pollMinutes: 5,
    theme: 'dark',
    language,
    jira: null,
    remote: ENABLED_REMOTE,
    timesheet: {
      logTime: '18:00',
      hrm: { mcpUrl: 'https://hrm.example/mcp', projectId: 'P1' },
      tsc: null,
    },
  })
  await saveSecrets(dataDir, { ...NO_SECRETS, hrmApiKey: 'hrm-key' })
  const testApp = await buildTestApp({ dataDir })
  openApps.push(testApp.app)
  return testApp
}

describe('push routes', () => {
  it('GET /api/push/key gives a device the same public key every time', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)

    const first = await testApp.app.inject({ url: '/api/push/key', headers: remoteHeaders(token) })
    const second = await testApp.app.inject({ url: '/api/push/key', headers: remoteHeaders(token) })

    const { publicKey } = first.json<{ publicKey: string }>()
    expect(publicKey).not.toBe('')
    expect(second.json()).toEqual({ publicKey })
  })

  it('PUT /api/push stores the subscription and DELETE clears it', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)

    await subscribe(testApp, token, SUBSCRIPTION.endpoint)
    const on = await testApp.app.inject({ url: '/api/me', headers: remoteHeaders(token) })
    const removed = await testApp.app.inject({
      method: 'DELETE',
      url: '/api/push',
      headers: remoteHeaders(token),
    })
    const off = await testApp.app.inject({ url: '/api/me', headers: remoteHeaders(token) })

    expect(on.json()).toMatchObject({ device: { pushEnabled: true, hasPushSubscription: true } })
    expect(removed.statusCode).toBe(204)
    expect(off.json()).toMatchObject({ device: { pushEnabled: false, hasPushSubscription: false } })
  })

  it('PUT /api/push rejects a subscription whose endpoint is not https', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)
    const bodies = [
      { subscription: { ...SUBSCRIPTION, endpoint: 'http://push.example/abc' } },
      { subscription: { ...SUBSCRIPTION, endpoint: 'not a url' } },
      { subscription: { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: 'p' } } },
      { subscription: null },
    ]

    const replies = await Promise.all(
      bodies.map((payload) =>
        testApp.app.inject({
          method: 'PUT',
          url: '/api/push',
          headers: remoteHeaders(token),
          payload,
        }),
      ),
    )

    expect(replies.map((reply) => reply.statusCode)).toEqual([400, 400, 400, 400])
  })

  it('answers 409 to a request from this PC, which has no device', async () => {
    const testApp = await remoteApp()

    const replies = await Promise.all([
      testApp.app.inject({
        method: 'PUT',
        url: '/api/push',
        headers: LOOPBACK_HEADERS,
        payload: { subscription: SUBSCRIPTION },
      }),
      testApp.app.inject({ method: 'DELETE', url: '/api/push', headers: LOOPBACK_HEADERS }),
      testApp.app.inject({ method: 'POST', url: '/api/push/test', headers: LOOPBACK_HEADERS }),
    ])

    expect(replies.map((reply) => reply.statusCode)).toEqual([409, 409, 409])
  })

  it('POST /api/push/test sends only to the calling device', async () => {
    const testApp = await remoteApp()
    const phone = await pairDevice(testApp, 'Phone')
    const tablet = await pairDevice(testApp, 'Tablet')
    await subscribe(testApp, phone, 'https://push.example/phone')
    await subscribe(testApp, tablet, 'https://push.example/tablet')

    const reply = await testApp.app.inject({
      method: 'POST',
      url: '/api/push/test',
      headers: remoteHeaders(tablet),
    })

    expect(reply.json()).toEqual({ ok: true })
    expect(testApp.pushes.map((push) => push.endpoint)).toEqual(['https://push.example/tablet'])
  })

  it('POST /api/remote/devices/:id/test-push is local-only and reaches that device', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)
    await subscribe(testApp, token, 'https://push.example/phone')
    const [device] = testApp.services.remote.status().devices
    const url = `/api/remote/devices/${device?.id ?? ''}/test-push`

    const fromPhone = await testApp.app.inject({
      method: 'POST',
      url,
      headers: remoteHeaders(token),
    })
    const fromPc = await testApp.app.inject({ method: 'POST', url, headers: LOOPBACK_HEADERS })

    expect(fromPhone.statusCode).toBe(403)
    expect(fromPc.json()).toEqual({ ok: true })
    expect(testApp.pushes).toHaveLength(1)
  })
})

describe('timesheet run push', () => {
  it('the reminder run pushes to timesheet devices in the configured language', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
    const testApp = await timesheetApp('vi')
    const token = await pairDevice(testApp)
    await subscribe(testApp, token, SUBSCRIPTION.endpoint)

    await testApp.services.timesheet.runSchedule()
    await vi.waitFor(() => {
      expect(testApp.pushes).toHaveLength(1)
    })

    expect(testApp.pushes[0]?.endpoint).toBe(SUBSCRIPTION.endpoint)
    expect(JSON.parse(testApp.pushes[0]?.payload ?? '')).toEqual({
      title: 'Workday',
      body: 'Hôm nay chưa có gì trong hàng đợi - hãy log công việc trước khi ra về.',
      url: '/#/timesheet',
      tag: 'log-reminder-2026-11-11',
    })
  })

  it('a drain without kept days pushes nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
    const testApp = await timesheetApp('en')
    const token = await pairDevice(testApp)
    await subscribe(testApp, token, SUBSCRIPTION.endpoint)

    const outcome = await testApp.services.timesheet.drain('user')
    await vi.advanceTimersByTimeAsync(10)

    expect(outcome.ok).toBe(true)
    expect(testApp.pushes).toEqual([])
  })
})
