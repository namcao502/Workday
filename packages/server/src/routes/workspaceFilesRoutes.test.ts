import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChangeGroupView, FileContentView, FilesGroupView } from '@workday/core'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

interface Setup {
  readonly testApp: TestApp
  readonly worktree: string
}

// A started MDP-1 tab: docs folder, plus a git-initialised worktree the fake service created.
async function setup(): Promise<Setup> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  const devRepoPath = mkdtempSync(join(tmpdir(), 'workday-repo-'))
  mkdirSync(join(devRepoPath, 'docs', 'MDP-1'), { recursive: true })
  writeFileSync(join(devRepoPath, 'docs', 'MDP-1', 'plan.md'), '# plan')
  const worktree = join(devRepoPath, '.claude', 'worktrees', 'MDP-1')
  mkdirSync(worktree, { recursive: true })
  execFileSync('git', ['init', '-b', 'main'], { cwd: worktree, stdio: 'ignore' })
  writeFileSync(join(worktree, 'a.txt'), 'hello')
  writeFileSync(join(worktree, 'pic.png'), Buffer.from([1, 2, 3]))
  const { app } = testApp
  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers: LOOPBACK_HEADERS,
    payload: { workspace: { devRepoPath } },
  })
  await app.inject({ method: 'POST', url: '/api/workspace/start/MDP-1', headers: LOOPBACK_HEADERS })
  return { testApp, worktree }
}

function get(app: FastifyInstance, url: string): Promise<LightMyRequestResponse> {
  return app.inject({ url, headers: LOOPBACK_HEADERS })
}

describe('workspace files routes', () => {
  it('lists docs and worktree files', async () => {
    const { testApp } = await setup()
    const reply = await get(testApp.app, '/api/workspace/tabs/MDP-1/files')
    const groups = reply.json<FilesGroupView[]>()
    expect(groups.map((group) => [group.id, group.label, group.paths])).toEqual([
      ['docs', 'Docs - MDP-1', ['plan.md']],
      ['wt0', expect.stringMatching(/^BE - /) as string, ['a.txt', 'pic.png']],
    ])
  })

  it('reads text, and an image as kind image', async () => {
    const { testApp } = await setup()
    const text = await get(testApp.app, '/api/workspace/tabs/MDP-1/files/content?group=wt0&path=a.txt')
    expect(text.json<FileContentView>()).toEqual({ kind: 'text', text: 'hello' })
    const image = await get(testApp.app, '/api/workspace/tabs/MDP-1/files/content?group=wt0&path=pic.png')
    expect(image.json<FileContentView>()).toEqual({ kind: 'image' })
  })

  it('serves an image raw with the lock-down headers; a non-image is 400', async () => {
    const { testApp } = await setup()
    const raw = await get(testApp.app, '/api/workspace/tabs/MDP-1/files/raw?group=wt0&path=pic.png')
    expect(raw.statusCode).toBe(200)
    expect(raw.headers['content-type']).toBe('image/png')
    expect(raw.headers['x-content-type-options']).toBe('nosniff')
    expect(raw.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    )
    expect(raw.headers['cache-control']).toBe('no-store')
    const text = await get(testApp.app, '/api/workspace/tabs/MDP-1/files/raw?group=wt0&path=a.txt')
    expect(text.statusCode).toBe(400)
  })

  it('refuses a path outside the group with 400', async () => {
    const { testApp } = await setup()
    for (const url of [
      '/api/workspace/tabs/MDP-1/files/content?group=wt0&path=../x',
      '/api/workspace/tabs/MDP-1/files/raw?group=wt0&path=../x.png',
      '/api/workspace/tabs/MDP-1/changes/diff?group=wt0&path=../x',
    ]) {
      const reply = await get(testApp.app, url)
      expect(reply.statusCode).toBe(400)
      expect(reply.json()).toEqual({ ok: false, error: { code: 'pathOutside' } })
    }
  })

  it('an unknown tab or group is 404', async () => {
    const { testApp } = await setup()
    for (const url of [
      '/api/workspace/tabs/MDP-9/files',
      '/api/workspace/tabs/MDP-9/changes',
      '/api/workspace/tabs/MDP-1/files/content?group=nope&path=a.txt',
      '/api/workspace/tabs/MDP-1/changes/diff?group=docs&path=plan.md',
    ]) {
      expect((await get(testApp.app, url)).statusCode).toBe(404)
    }
  })

  it('a worktree where git fails gets an error group', async () => {
    const { testApp } = await setup()
    const reply = await get(testApp.app, '/api/workspace/tabs/MDP-1/changes')
    const groups = reply.json<ChangeGroupView[]>()
    expect(groups).toHaveLength(1)
    expect(groups[0]?.error).toEqual({ code: 'gitFailed' })
  })

  it('vscode opens the worktree, or a file inside it; an outside path is 400', async () => {
    const { testApp, worktree } = await setup()
    const post = (payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
      testApp.app.inject({
        method: 'POST',
        url: '/api/workspace/vscode',
        headers: LOOPBACK_HEADERS,
        payload,
      })
    expect((await post({ tabId: 'MDP-1' })).json()).toEqual({ ok: true })
    expect((await post({ tabId: 'MDP-1', group: 'wt0', path: 'a.txt' })).json()).toEqual({ ok: true })
    expect((await post({ tabId: 'MDP-1', path: '../x' })).statusCode).toBe(400)
    expect((await post({ tabId: 'MDP-9' })).statusCode).toBe(404)
    const targets = testApp.editorCommands.map((command) =>
      process.platform === 'win32' ? command.env['WORKDAY_VSCODE_TARGET'] : command.args[0],
    )
    expect(targets).toEqual([worktree, join(worktree, 'a.txt')])
  })

  it('a paired device gets 403', async () => {
    const remoteApp = await buildRemoteApp()
    openApps.push(remoteApp.app)
    const token = await pairDevice(remoteApp)
    const reply = await remoteApp.app.inject({
      url: '/api/workspace/tabs/MDP-1/files',
      headers: remoteHeaders(token),
    })
    expect(reply.statusCode).toBe(403)
  })
})
