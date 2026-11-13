import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeProjectDirName } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildRemoteApp, pairDevice, remoteHeaders } from '../testing/remoteTestApp.js'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const SESSION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

async function localApp(): Promise<TestApp> {
  const testApp = await buildTestApp()
  openApps.push(testApp.app)
  return testApp
}

describe('hook route', () => {
  it('a wrong token gets 404', async () => {
    const { app } = await localApp()
    const reply = await app.inject({
      method: 'POST',
      url: '/api/hooks/wrong/claude',
      headers: { ...LOOPBACK_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({ hook_event_name: 'Stop' }),
    })
    expect(reply.statusCode).toBe(404)
  })

  it('the right token gets 200 {} even for a junk body or an unknown session', async () => {
    const { app, services } = await localApp()
    const token = services.workspace.hookToken
    const junk = await app.inject({
      method: 'POST',
      url: `/api/hooks/${token}/claude`,
      headers: { ...LOOPBACK_HEADERS, 'content-type': 'application/json' },
      payload: '{not json',
    })
    const unknown = await app.inject({
      method: 'POST',
      url: `/api/hooks/${token}/ghost`,
      headers: { ...LOOPBACK_HEADERS, 'content-type': 'text/plain' },
      payload: JSON.stringify({ hook_event_name: 'Stop' }),
    })
    expect([junk.statusCode, junk.json()]).toEqual([200, {}])
    expect([unknown.statusCode, unknown.json()]).toEqual([200, {}])
  })

  it('a remote request gets 403', async () => {
    const testApp = await buildRemoteApp()
    openApps.push(testApp.app)
    const deviceToken = await pairDevice(testApp)
    const reply = await testApp.app.inject({
      method: 'POST',
      url: `/api/hooks/${testApp.services.workspace.hookToken}/claude`,
      headers: { ...remoteHeaders(deviceToken), 'content-type': 'application/json' },
      payload: JSON.stringify({ hook_event_name: 'Stop' }),
    })
    expect(reply.statusCode).toBe(403)
  })

  it('a session id that cannot be saved still answers 200 {}', async () => {
    const { app, services, dataDir, homeDir } = await localApp()
    const devRepoPath = mkdtempSync(join(tmpdir(), 'workday-repo-'))
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: LOOPBACK_HEADERS,
      payload: { workspace: { devRepoPath } },
    })
    await services.workspace.addTerminal(null)
    services.workspace.host('claude')?.start(80, 24)
    // A folder where the temp file goes makes the next workspace.json write fail.
    mkdirSync(join(dataDir, 'workspace.json.tmp'))
    const transcript = join(
      homeDir,
      '.claude',
      'projects',
      claudeProjectDirName(devRepoPath),
      `${SESSION_ID}.jsonl`,
    )
    const reply = await app.inject({
      method: 'POST',
      url: `/api/hooks/${services.workspace.hookToken}/claude`,
      headers: { ...LOOPBACK_HEADERS, 'content-type': 'application/json' },
      payload: JSON.stringify({
        hook_event_name: 'Stop',
        session_id: SESSION_ID,
        transcript_path: transcript,
      }),
    })
    expect([reply.statusCode, reply.json()]).toEqual([200, {}])
  })
})
