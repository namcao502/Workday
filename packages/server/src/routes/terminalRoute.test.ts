import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, TEST_PORT, type TestApp } from '../testing/testApp.js'

const LOCAL_ORIGIN = `http://127.0.0.1:${String(TEST_PORT)}`
const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

// An app with a dev repo and one terminal tab, "claude".
async function appWithTerminal(): Promise<TestApp> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  const devRepoPath = mkdtempSync(join(tmpdir(), 'workday-repo-'))
  await testApp.app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers: LOOPBACK_HEADERS,
    payload: { workspace: { devRepoPath } },
  })
  await testApp.services.workspace.addTerminal(null)
  return testApp
}

function collect(socket: WebSocket): unknown[] {
  const messages: unknown[] = []
  socket.on('message', (raw: Buffer) => {
    messages.push(JSON.parse(raw.toString('utf8')))
  })
  return messages
}

async function open(app: FastifyInstance, session: string): Promise<WebSocket> {
  return app.injectWS(`/api/terminal/${session}`, {
    headers: { ...LOOPBACK_HEADERS, origin: LOCAL_ORIGIN },
  })
}

describe('terminal route', () => {
  it('attach starts the session, then replays its output to a second view', async () => {
    const { app, ptys } = await appWithTerminal()
    const first = await open(app, 'claude')
    first.send(JSON.stringify({ type: 'attach', columns: 80, rows: 24 }))
    await vi.waitFor(() => {
      expect(ptys.spawned).toHaveLength(1)
    })
    ptys.last().emitData('hello')
    const second = await open(app, 'claude')
    const messages = collect(second)
    second.send(JSON.stringify({ type: 'attach', columns: 100, rows: 30 }))
    await vi.waitFor(() => {
      expect(messages).toEqual([{ type: 'output', data: 'hello' }])
    })
    expect(ptys.spawned).toHaveLength(1)
    expect(ptys.last().resizes).toEqual([{ columns: 100, rows: 30 }])
    first.terminate()
    second.terminate()
  })

  it('input reaches the PTY; a size outside 2..1000 is dropped', async () => {
    const { app, ptys } = await appWithTerminal()
    const socket = await open(app, 'claude')
    socket.send(JSON.stringify({ type: 'attach', columns: 1, rows: 24 }))
    socket.send(JSON.stringify({ type: 'attach', columns: 80, rows: 24 }))
    socket.send(JSON.stringify({ type: 'input', data: 'ls\r' }))
    await vi.waitFor(() => {
      expect(ptys.last().writes).toEqual(['ls\r'])
    })
    expect(ptys.spawned).toHaveLength(1)
    socket.terminate()
  })

  it('a session that exits sends exited', async () => {
    const { app, ptys } = await appWithTerminal()
    const socket = await open(app, 'claude')
    const messages = collect(socket)
    socket.send(JSON.stringify({ type: 'attach', columns: 80, rows: 24 }))
    await vi.waitFor(() => {
      expect(ptys.spawned).toHaveLength(1)
    })
    ptys.last().emitExit()
    await vi.waitFor(() => {
      expect(messages).toEqual([{ type: 'exited' }])
    })
    socket.terminate()
  })

  it('a foreign Origin is rejected', async () => {
    const { app } = await appWithTerminal()
    await expect(
      app.injectWS('/api/terminal/claude', {
        headers: { ...LOOPBACK_HEADERS, origin: 'http://evil.example' },
      }),
    ).rejects.toThrow()
  })

  it('an unknown session gets error sessionNotFound', async () => {
    const { app } = await appWithTerminal()
    const socket = await open(app, 'ghost')
    const messages = collect(socket)
    socket.send(JSON.stringify({ type: 'attach', columns: 80, rows: 24 }))
    await vi.waitFor(() => {
      expect(messages).toEqual([{ type: 'error', code: 'sessionNotFound' }])
    })
    socket.terminate()
  })

  it('a lone Esc clears a permission wait', async () => {
    const { app, ptys, services } = await appWithTerminal()
    const { workspace } = services
    const socket = await open(app, 'claude')
    socket.send(JSON.stringify({ type: 'attach', columns: 80, rows: 24 }))
    await vi.waitFor(() => {
      expect(ptys.spawned).toHaveLength(1)
    })
    await workspace.onHook('claude', workspace.hookToken, {
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
    })
    socket.send(JSON.stringify({ type: 'input', data: '' }))
    await vi.waitFor(() => {
      expect(ptys.last().writes).toEqual([''])
    })
    expect(workspace.view().sessions[0]?.wait).toBeNull()
    socket.terminate()
  })

  it('closing the tab tells the socket exited; a later start spawns nothing', async () => {
    const { app, ptys, services } = await appWithTerminal()
    const socket = await open(app, 'claude')
    const messages = collect(socket)
    socket.send(JSON.stringify({ type: 'attach', columns: 80, rows: 24 }))
    await vi.waitFor(() => {
      expect(ptys.spawned).toHaveLength(1)
    })
    await services.workspace.closeTab('claude')
    socket.send(JSON.stringify({ type: 'start', columns: 80, rows: 24 }))
    await vi.waitFor(() => {
      expect(messages).toEqual([{ type: 'exited' }, { type: 'error', code: 'sessionNotFound' }])
    })
    expect(ptys.spawned).toHaveLength(1)
    socket.terminate()
  })

  it('a paired device gets 403', async () => {
    const testApp = await buildRemoteApp()
    openApps.push(testApp.app)
    const token = await pairDevice(testApp)
    await expect(
      testApp.app.injectWS('/api/terminal/claude', { headers: remoteHeaders(token) }),
    ).rejects.toThrow(/403/)
  })
})
