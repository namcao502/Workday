import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('insights route', () => {
  it('returns a report view for a preset and a custom range', async () => {
    const testApp = await buildTestApp()
    openApps.push(testApp.app)

    const preset = await testApp.app.inject({
      url: '/api/insights?kind=thisWeek',
      headers: LOOPBACK_HEADERS,
    })
    const custom = await testApp.app.inject({
      url: '/api/insights?kind=custom&from=2026-10-01&to=2026-10-31',
      headers: LOOPBACK_HEADERS,
    })

    expect(preset.statusCode).toBe(200)
    expect(preset.json<{ report: { range: { kind: string } } }>().report.range.kind).toBe(
      'thisWeek',
    )
    expect(custom.json<{ report: { range: { from: string } } }>().report.range.from).toBe(
      '2026-10-01',
    )
  })

  it('insights route rejects a bad range and is local-only', async () => {
    const testApp = await buildTestApp()
    openApps.push(testApp.app)
    for (const query of [
      'kind=nope',
      'kind=custom',
      'kind=custom&from=2026-1-1&to=2026-10-31',
      'kind=custom&from=2026-02-30&to=2026-03-01',
      'kind=custom&from=2025-01-01&to=2026-06-01',
      'kind=custom&from=2026-10-31&to=2026-10-01',
    ]) {
      const reply = await testApp.app.inject({
        url: `/api/insights?${query}`,
        headers: LOOPBACK_HEADERS,
      })
      expect(reply.statusCode, query).toBe(400)
    }

    const remote = await buildRemoteApp()
    openApps.push(remote.app)
    const token = await pairDevice(remote)
    const reply = await remote.app.inject({
      url: '/api/insights?kind=thisWeek',
      headers: remoteHeaders(token),
    })
    expect(reply.statusCode).toBe(403)
  })

  it('answers 500 insightsFailed when the read throws', async () => {
    const testApp = await buildTestApp()
    openApps.push(testApp.app)
    testApp.services.insights.read = () => Promise.reject(new Error('boom'))

    const reply = await testApp.app.inject({
      url: '/api/insights?kind=thisWeek',
      headers: LOOPBACK_HEADERS,
    })

    expect(reply.statusCode).toBe(500)
    expect(reply.json()).toEqual({ ok: false, error: { code: 'insightsFailed' } })
  })
})
