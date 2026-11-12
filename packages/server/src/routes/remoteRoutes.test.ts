import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RemoteStatusView } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildRemoteApp,
  ENABLED_REMOTE,
  pairDevice,
  remoteHeaders,
} from '../testing/remoteTestApp.js'
import { ACCESS_EMAIL, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function remoteApp(): Promise<TestApp> {
  const testApp = await buildRemoteApp()
  openApps.push(testApp.app)
  return testApp
}

async function remoteStatus(testApp: TestApp): Promise<RemoteStatusView> {
  const reply = await testApp.app.inject({ url: '/api/remote', headers: LOOPBACK_HEADERS })
  return reply.json<RemoteStatusView>()
}

describe('remote routes', () => {
  it('pairing sets the device cookie once after approve', async () => {
    const testApp = await remoteApp()
    const { app } = testApp
    const opened = await app.inject({
      method: 'POST',
      url: '/api/remote/pairing',
      headers: LOOPBACK_HEADERS,
    })
    const { code } = opened.json<{ code: string }>()
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/pair',
      headers: remoteHeaders(),
      payload: { code: 'ZZZZZZ', name: 'iPhone' },
    })
    const submitted = await app.inject({
      method: 'POST',
      url: '/api/pair',
      headers: remoteHeaders(),
      payload: { code, name: 'iPhone' },
    })
    const { requestId } = submitted.json<{ requestId: string }>()
    const statusUrl = `/api/pair/status?id=${requestId}`
    const waiting = await app.inject({ url: statusUrl, headers: remoteHeaders() })
    const pending = (await remoteStatus(testApp)).pairing.pending

    await app.inject({
      method: 'POST',
      url: '/api/remote/pairing/approve',
      headers: LOOPBACK_HEADERS,
    })
    const approved = await app.inject({ url: statusUrl, headers: remoteHeaders() })
    const again = await app.inject({ url: statusUrl, headers: remoteHeaders() })

    expect(wrong.statusCode).toBe(409)
    expect(wrong.json()).toEqual({ ok: false, error: { code: 'wrongCode' } })
    expect(waiting.json()).toEqual({ status: 'waiting' })
    expect(waiting.headers['set-cookie']).toBeUndefined()
    expect(pending).toMatchObject({ name: 'iPhone', email: ACCESS_EMAIL, ip: '203.0.113.7' })
    expect(approved.json()).toEqual({ status: 'approved' })
    expect(approved.headers['cache-control']).toBe('no-store')
    expect(waiting.headers['cache-control']).toBe('no-store')
    const cookie = String(approved.headers['set-cookie'])
    expect(cookie).toMatch(
      /^wd_device=[\w-]+; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=31536000$/,
    )
    expect(again.headers['set-cookie']).toBeUndefined()
    const token = /^wd_device=([^;]+);/.exec(cookie)?.[1] ?? ''
    const me = await app.inject({ url: '/api/me', headers: remoteHeaders(token) })
    expect(me.json()).toMatchObject({ mode: 'remote', device: { name: 'iPhone' } })
    expect(JSON.stringify(me.json())).not.toContain('tokenHash')
  })

  it('a remote week read never sniffs', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)
    const readWeek = vi.spyOn(testApp.services.timesheet, 'readWeek').mockResolvedValue()
    const payload = { monday: '2026-11-09', allowSniff: true }

    await testApp.app.inject({
      method: 'POST',
      url: '/api/timesheet/week',
      headers: remoteHeaders(token),
      payload,
    })
    await testApp.app.inject({
      method: 'POST',
      url: '/api/timesheet/week',
      headers: LOOPBACK_HEADERS,
      payload,
    })

    expect(readWeek.mock.calls).toEqual([
      ['2026-11-09', false],
      ['2026-11-09', true],
    ])
  })

  it('revoking a device closes its event socket', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)
    const { id } = (await remoteStatus(testApp)).devices[0] ?? { id: '' }
    const socket = await testApp.app.injectWS('/api/events', { headers: remoteHeaders(token) })
    const closed = new Promise<number>((resolve) => {
      socket.on('close', resolve)
    })

    const revoked = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/remote/devices/${id}`,
      headers: LOOPBACK_HEADERS,
    })

    expect(revoked.json<RemoteStatusView>().devices).toEqual([])
    expect(await closed).toBe(1008)
    const after = await testApp.app.inject({ url: '/api/board', headers: remoteHeaders(token) })
    expect(after.statusCode).toBe(401)
  })

  it('lowering a right closes the socket and the new right applies', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)
    const { id } = (await remoteStatus(testApp)).devices[0] ?? { id: '' }
    const socket = await testApp.app.injectWS('/api/events', { headers: remoteHeaders(token) })
    const closed = new Promise<number>((resolve) => {
      socket.on('close', resolve)
    })

    const updated = await testApp.app.inject({
      method: 'PUT',
      url: `/api/remote/devices/${id}`,
      headers: LOOPBACK_HEADERS,
      payload: { name: 'Pixel', rights: { board: 'off', timesheet: 'act' }, pushEnabled: true },
    })

    expect(updated.json<RemoteStatusView>().devices[0]).toMatchObject({
      name: 'Pixel',
      rights: { board: 'off', timesheet: 'act' },
      pushEnabled: true,
    })
    expect(await closed).toBe(1008)
    const board = await testApp.app.inject({ url: '/api/board', headers: remoteHeaders(token) })
    expect(board.statusCode).toBe(403)
  })

  it('a remote write is recorded in the activity log without its body', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)

    await testApp.app.inject({
      method: 'POST',
      url: '/api/timesheet/queue',
      headers: remoteHeaders(token),
      payload: { date: '2026-11-10', tickets: ['SECRET-42'], minutes: null },
    })

    await vi.waitFor(async () => {
      expect((await remoteStatus(testApp)).activity).toHaveLength(1)
    })
    const [entry] = (await remoteStatus(testApp)).activity
    expect(entry).toMatchObject({
      deviceName: 'iPhone',
      method: 'POST',
      route: '/api/timesheet/queue',
      status: 200,
    })
    const file = readFileSync(join(testApp.dataDir, 'remote-activity.json'), 'utf8')
    expect(file).not.toContain('SECRET-42')
  })

  it('GET /api/remote is refused remotely', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)

    const reply = await testApp.app.inject({ url: '/api/remote', headers: remoteHeaders(token) })
    const pairing = await testApp.app.inject({
      method: 'POST',
      url: '/api/remote/pairing',
      headers: remoteHeaders(token),
    })

    expect(reply.statusCode).toBe(403)
    expect(pairing.statusCode).toBe(403)
  })

  it('turning remote access off closes the device sockets', async () => {
    const testApp = await remoteApp()
    const token = await pairDevice(testApp)
    const remoteSocket = await testApp.app.injectWS('/api/events', {
      headers: remoteHeaders(token),
    })
    const localSocket = await testApp.app.injectWS('/api/events', { headers: LOOPBACK_HEADERS })
    const closed = new Promise<number>((resolve) => {
      remoteSocket.on('close', resolve)
    })

    const saved = await testApp.app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: LOOPBACK_HEADERS,
      payload: { remote: { ...ENABLED_REMOTE, enabled: false } },
    })

    expect(saved.statusCode).toBe(200)
    expect(await closed).toBe(1008)
    expect(localSocket.readyState).toBe(localSocket.OPEN)
    localSocket.terminate()
  })
})
