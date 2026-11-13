import type { KnowledgeScanConfig, SchedulesView } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

const SCAN: KnowledgeScanConfig = {
  enabled: true,
  command: 'pwsh',
  args: ['-NoProfile'],
  day: 'mon',
  time: '07:00',
  limitHours: 2,
  logFile: null,
}

async function appWithScan(): Promise<TestApp> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  const saved = await testApp.app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers: LOOPBACK_HEADERS,
    payload: { knowledgeScan: SCAN },
  })
  expect(saved.statusCode).toBe(200)
  return testApp
}

describe('schedules routes', () => {
  it('saves the scan config through settings and shows it with its next run', async () => {
    const testApp = await appWithScan()

    const reply = await testApp.app.inject({ url: '/api/schedules', headers: LOOPBACK_HEADERS })
    const view = reply.json<SchedulesView>()

    expect(view.scan.config).toEqual(SCAN)
    expect(view.scan.nextRunAt).not.toBeNull()
    expect(view.scan.runs).toEqual([])
    expect(Object.keys(view.jobs)).toHaveLength(5)
    testApp.services.scanRunner.stop()
  })

  it('refuses an invalid scan config', async () => {
    const testApp = await buildTestApp()
    openApps.push(testApp.app)
    for (const knowledgeScan of [
      { ...SCAN, command: '' },
      { ...SCAN, day: 'funday' },
      { ...SCAN, limitHours: 5 },
    ]) {
      const reply = await testApp.app.inject({
        method: 'PUT',
        url: '/api/settings',
        headers: LOOPBACK_HEADERS,
        payload: { knowledgeScan },
      })
      expect(reply.statusCode).toBe(400)
    }
  })

  it('run now while running answers 409', async () => {
    const testApp = await appWithScan()
    const first = await testApp.app.inject({
      method: 'POST',
      url: '/api/schedules/scan/run',
      headers: LOOPBACK_HEADERS,
    })
    const second = await testApp.app.inject({
      method: 'POST',
      url: '/api/schedules/scan/run',
      headers: LOOPBACK_HEADERS,
    })

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(409)
    expect(testApp.scans).toHaveLength(1)
    testApp.scans[0]?.end(0)
    await testApp.services.scanRunner.idle()
    testApp.services.scanRunner.stop()
  })

  it('a bad run is badged until scan/seen', async () => {
    const testApp = await appWithScan()
    await testApp.app.inject({
      method: 'POST',
      url: '/api/schedules/scan/run',
      headers: LOOPBACK_HEADERS,
    })
    testApp.scans[0]?.end(1)
    await testApp.services.scanRunner.idle()
    const read = async (): Promise<SchedulesView> =>
      (await testApp.app.inject({ url: '/api/schedules', headers: LOOPBACK_HEADERS })).json()

    expect((await read()).scan.unseenBad).toBe(true)
    await testApp.app.inject({
      method: 'POST',
      url: '/api/schedules/scan/seen',
      headers: LOOPBACK_HEADERS,
    })
    expect((await read()).scan.unseenBad).toBe(false)
    testApp.services.scanRunner.stop()
  })

  it('the log route refuses an unknown run id and a bad offset', async () => {
    const testApp = await appWithScan()
    for (const url of [
      '/api/schedules/scan/runs/2000-01-01T00-00-00-000Z/log',
      '/api/schedules/scan/runs/..%2F..%2Fconfig/log',
    ]) {
      const reply = await testApp.app.inject({ url, headers: LOOPBACK_HEADERS })
      expect(reply.statusCode, url).toBe(404)
    }
    const bad = await testApp.app.inject({
      url: '/api/schedules/scan/runs/x/log?from=-1',
      headers: LOOPBACK_HEADERS,
    })
    expect(bad.statusCode).toBe(400)
    testApp.services.scanRunner.stop()
  })

  it('is local-only', async () => {
    const remote = await buildRemoteApp()
    openApps.push(remote.app)
    const token = await pairDevice(remote)
    const reply = await remote.app.inject({ url: '/api/schedules', headers: remoteHeaders(token) })
    expect(reply.statusCode).toBe(403)
  })
})
