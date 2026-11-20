import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp, LOOPBACK_HEADERS } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('backup routes', () => {
  it('export sends an attachment', async () => {
    const { app } = await buildTestApp()
    openApps.push(app)
    const reply = await app.inject({
      method: 'POST',
      url: '/api/backup/export',
      headers: LOOPBACK_HEADERS,
      payload: { password: 'long-enough' },
    })
    expect(reply.statusCode).toBe(200)
    expect(reply.headers['content-type']).toContain('application/octet-stream')
    expect(reply.headers['content-disposition']).toMatch(
      /^attachment; filename="workday-backup-\d{8}\.wdbackup"$/,
    )
    expect(reply.json<{ format: string }>().format).toBe('workday-backup')
  })

  it('short password is refused', async () => {
    const { app } = await buildTestApp()
    openApps.push(app)
    const reply = await app.inject({
      method: 'POST',
      url: '/api/backup/export',
      headers: LOOPBACK_HEADERS,
      payload: { password: 'short' },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.json()).toEqual({ ok: false, error: { code: 'backupPasswordTooShort' } })
  })

  it('import stages files and reports them', async () => {
    const { app, dataDir } = await buildTestApp()
    openApps.push(app)
    writeFileSync(join(dataDir, 'extra.json'), '{}')
    const exported = await app.inject({
      method: 'POST',
      url: '/api/backup/export',
      headers: LOOPBACK_HEADERS,
      payload: { password: 'long-enough' },
    })
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/backup/import',
      headers: LOOPBACK_HEADERS,
      payload: { password: 'other-pass', data: exported.body },
    })
    expect(wrong.statusCode).toBe(400)
    expect(wrong.json()).toEqual({ ok: false, error: { code: 'backupWrongPassword' } })
    expect(existsSync(join(dataDir, 'import-pending'))).toBe(false)
    const reply = await app.inject({
      method: 'POST',
      url: '/api/backup/import',
      headers: LOOPBACK_HEADERS,
      payload: { password: 'long-enough', data: exported.body },
    })
    expect(reply.statusCode).toBe(200)
    const { files } = reply.json<{ files: string[] }>()
    expect(files).toContain('extra.json')
    expect(files).toContain('master.key')
    expect([...files].sort()).toEqual(files)
    expect(readdirSync(join(dataDir, 'import-pending')).sort()).toEqual(files)
  })

  it('a body without a password is a 400', async () => {
    const { app } = await buildTestApp()
    openApps.push(app)
    const reply = await app.inject({
      method: 'POST',
      url: '/api/backup/import',
      headers: LOOPBACK_HEADERS,
      payload: { data: 'x' },
    })
    expect(reply.statusCode).toBe(400)
  })
})
