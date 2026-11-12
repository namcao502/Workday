import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, LOOPBACK_HEADERS, TEST_PORT as PORT } from './testing/testApp.js'
const INDEX_HTML = '<!doctype html><title>Workday</title>'

const openApps: FastifyInstance[] = []

async function buildApp(withClient: boolean): Promise<FastifyInstance> {
  let clientDist: string | undefined
  if (withClient) {
    clientDist = mkdtempSync(join(tmpdir(), 'workday-client-'))
    writeFileSync(join(clientDist, 'index.html'), INDEX_HTML)
  }
  const { app } = await buildTestApp(clientDist === undefined ? {} : { clientDist })
  openApps.push(app)
  return app
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('createApp', () => {
  it('health returns ok and the version', async () => {
    const app = await buildApp(false)
    const response = await app.inject({ url: '/api/health', headers: LOOPBACK_HEADERS })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true, version: '9.9.9' })
  })

  it('an unknown non-api route returns index.html when the client build exists', async () => {
    const app = await buildApp(true)
    const response = await app.inject({ url: '/board/today', headers: LOOPBACK_HEADERS })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toBe(INDEX_HTML)
  })

  it('an unknown api route returns a JSON 404, never index.html', async () => {
    const app = await buildApp(true)
    const response = await app.inject({ url: '/api/nope', headers: LOOPBACK_HEADERS })
    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.body).not.toContain('<title>')
  })

  it('a request with a foreign Host header gets 403', async () => {
    const app = await buildApp(false)
    const response = await app.inject({
      url: '/api/health',
      headers: { host: 'evil.example:4870' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('the events socket rejects a foreign Origin', async () => {
    const app = await buildApp(false)
    await expect(
      app.injectWS('/api/events', {
        headers: { ...LOOPBACK_HEADERS, origin: 'http://evil.example' },
      }),
    ).rejects.toThrow()
  })

  it('the events socket accepts a loopback Origin', async () => {
    const app = await buildApp(false)
    const socket = await app.injectWS('/api/events', {
      headers: { ...LOOPBACK_HEADERS, origin: `http://127.0.0.1:${String(PORT)}` },
    })
    socket.terminate()
  })
})
