import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceView } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function localApp(): Promise<TestApp> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  return testApp
}

async function postTerminal(
  app: FastifyInstance,
  folder: unknown,
): Promise<{ status: number; body: unknown }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/workspace/terminals',
    headers: LOOPBACK_HEADERS,
    payload: { folder },
  })
  return { status: reply.statusCode, body: reply.json() }
}

describe('workspace routes', () => {
  it('GET returns the view', async () => {
    const { app } = await localApp()
    const reply = await app.inject({ url: '/api/workspace', headers: LOOPBACK_HEADERS })
    expect(reply.json<WorkspaceView>()).toEqual({
      configured: false,
      tabs: [],
      sessions: [],
      starting: [],
      recentFolders: [],
    })
  })

  it('POST terminals adds a tab and remembers the folder; a bad folder is 400', async () => {
    const { app } = await localApp()
    const folder = mkdtempSync(join(tmpdir(), 'workday-folder-'))
    const added = await postTerminal(app, folder)
    expect(added.status).toBe(200)
    const view = added.body as WorkspaceView
    expect(view.tabs).toEqual([{ id: 'claude', kind: 'terminal', folder, sessions: ['claude'] }])
    expect(view.recentFolders).toEqual([folder])
    expect((await postTerminal(app, 'relative/path')).status).toBe(400)
    expect((await postTerminal(app, join(folder, 'missing'))).status).toBe(400)
    expect((await postTerminal(app, null)).status).toBe(200)
  })

  it('DELETE a tab closes it; an unknown tab is 404', async () => {
    const { app } = await localApp()
    await postTerminal(app, null)
    const closed = await app.inject({
      method: 'DELETE',
      url: '/api/workspace/tabs/claude',
      headers: LOOPBACK_HEADERS,
    })
    expect(closed.json<WorkspaceView>().tabs).toEqual([])
    const again = await app.inject({
      method: 'DELETE',
      url: '/api/workspace/tabs/claude',
      headers: LOOPBACK_HEADERS,
    })
    expect(again.statusCode).toBe(404)
  })

  it('sessions: add, close the main one (409), close the extra one', async () => {
    const { app } = await localApp()
    await postTerminal(app, null)
    const added = await app.inject({
      method: 'POST',
      url: '/api/workspace/tabs/claude/sessions',
      headers: LOOPBACK_HEADERS,
    })
    expect(added.json<WorkspaceView>().tabs[0]?.sessions).toEqual(['claude', 'claude~2'])
    const main = await app.inject({
      method: 'DELETE',
      url: '/api/workspace/sessions/claude',
      headers: LOOPBACK_HEADERS,
    })
    expect(main.statusCode).toBe(409)
    const extra = await app.inject({
      method: 'DELETE',
      url: `/api/workspace/sessions/${encodeURIComponent('claude~2')}`,
      headers: LOOPBACK_HEADERS,
    })
    expect(extra.json<WorkspaceView>().tabs[0]?.sessions).toEqual(['claude'])
    const seen = await app.inject({
      method: 'POST',
      url: '/api/workspace/sessions/ghost/seen',
      headers: LOOPBACK_HEADERS,
    })
    expect(seen.statusCode).toBe(404)
  })

  it('a settings save with a dev repo makes the workspace configured', async () => {
    const { app } = await localApp()
    const devRepoPath = mkdtempSync(join(tmpdir(), 'workday-repo-'))
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: LOOPBACK_HEADERS,
      payload: { workspace: { devRepoPath } },
    })
    expect(saved.statusCode).toBe(200)
    const reply = await app.inject({ url: '/api/workspace', headers: LOOPBACK_HEADERS })
    expect(reply.json<WorkspaceView>().configured).toBe(true)
  })

  it('start and open: a bad key is 400, and the worktree comes from the fake service', async () => {
    const { app, worktrees } = await localApp()
    const devRepoPath = mkdtempSync(join(tmpdir(), 'workday-repo-'))
    const post = (url: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url, headers: LOOPBACK_HEADERS, payload })
    const bad = await post('/api/workspace/start/nope', {})
    expect(bad.statusCode).toBe(400)
    const unconfigured = await post('/api/workspace/start/MDP-1', {})
    expect(unconfigured.json()).toEqual({ ok: false, error: { code: 'workspaceNotConfigured' } })
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: LOOPBACK_HEADERS,
      payload: { workspace: { devRepoPath } },
    })
    const started = await post('/api/workspace/start/MDP-1', {})
    expect(started.json()).toEqual({ ok: true, warning: null })
    expect(worktrees.map((worktree) => worktree.ticketKey)).toEqual(['MDP-1'])
    const closed = await app.inject({
      method: 'DELETE',
      url: '/api/workspace/tabs/MDP-1',
      headers: LOOPBACK_HEADERS,
    })
    expect(closed.statusCode).toBe(200)
    const open = await post('/api/workspace/open/MDP-1', {})
    expect(open.json()).toEqual({ ok: true, warning: null })
    rmSync(join(devRepoPath, '.claude'), { recursive: true })
    await app.inject({ method: 'DELETE', url: '/api/workspace/tabs/MDP-1', headers: LOOPBACK_HEADERS })
    const confirm = await post('/api/workspace/open/MDP-1', {})
    expect(confirm.json()).toEqual({ ok: false, confirmRecreate: true })
    const recreated = await post('/api/workspace/open/MDP-1', { recreate: true })
    expect(recreated.json()).toEqual({ ok: true, warning: null })
    expect(worktrees).toHaveLength(2)
  })

  it('a paired device gets 403', async () => {
    const testApp = await buildRemoteApp()
    openApps.push(testApp.app)
    const token = await pairDevice(testApp)
    const reply = await testApp.app.inject({ url: '/api/workspace', headers: remoteHeaders(token) })
    expect(reply.statusCode).toBe(403)
  })
})
