import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChatView } from '@workday/core'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'
import { SUBMIT_DELAY_MS } from './chatRoute.js'

const SESSION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

// The main dev-repo terminal "claude", started so a PTY exists.
async function setup(): Promise<TestApp> {
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
  testApp.services.workspace.host('claude')?.start(80, 24)
  return testApp
}

function post(testApp: TestApp, path: string, payload: unknown): Promise<LightMyRequestResponse> {
  return testApp.app.inject({
    method: 'POST',
    url: `/api/workspace/sessions/claude/${path}`,
    headers: LOOPBACK_HEADERS,
    payload: payload as object,
  })
}

async function hook(testApp: TestApp, transcriptPath: string): Promise<void> {
  await testApp.app.inject({
    method: 'POST',
    url: `/api/hooks/${testApp.services.workspace.hookToken}/claude`,
    headers: { ...LOOPBACK_HEADERS, 'content-type': 'application/json' },
    payload: JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      session_id: SESSION_ID,
      transcript_path: transcriptPath,
    }),
  })
}

function transcriptIn(root: string, content: string): string {
  const folder = join(root, 'p')
  mkdirSync(folder, { recursive: true })
  const path = join(folder, `${SESSION_ID}.jsonl`)
  writeFileSync(path, content)
  return path
}

const PROMPT_LINE = `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`

describe('chat routes', () => {
  it('rejects an empty prompt with 400', async () => {
    const testApp = await setup()
    const reply = await post(testApp, 'prompt', { text: '  ' })
    expect(reply.statusCode).toBe(400)
    expect(testApp.ptys.last().writes).toEqual([])
  })

  it('writes the prompt, then Enter after a delay', async () => {
    const testApp = await setup()
    const reply = await post(testApp, 'prompt', { text: 'café\r\nline 2' })
    expect(reply.statusCode).toBe(200)
    expect(testApp.ptys.last().writes).toEqual(['café\nline 2'])
    await new Promise((resolve) => setTimeout(resolve, SUBMIT_DELAY_MS + 100))
    expect(testApp.ptys.last().writes).toEqual(['café\nline 2', '\r'])
  })

  it('writes the escape and shift-tab keys and rejects others', async () => {
    const testApp = await setup()
    await post(testApp, 'key', { key: 'escape' })
    await post(testApp, 'key', { key: 'shiftTab' })
    const bad = await post(testApp, 'key', { key: 'ctrlC' })
    expect(testApp.ptys.last().writes).toEqual(['\x1b', '\x1b[Z'])
    expect(bad.statusCode).toBe(400)
  })

  it('answers 404 for an unknown session', async () => {
    const testApp = await setup()
    const reply = await testApp.app.inject({
      url: '/api/workspace/sessions/ghost/chat',
      headers: LOOPBACK_HEADERS,
    })
    expect(reply.statusCode).toBe(404)
  })

  it('reads the transcript a hook named, and nothing outside ~/.claude/projects', async () => {
    const testApp = await setup()
    const url = '/api/workspace/sessions/claude/chat'
    const empty = await testApp.app.inject({ url, headers: LOOPBACK_HEADERS })
    expect(empty.json<ChatView>().messages).toEqual([])

    const outside = transcriptIn(mkdtempSync(join(tmpdir(), 'workday-outside-')), PROMPT_LINE)
    await hook(testApp, outside)
    const refused = await testApp.app.inject({ url, headers: LOOPBACK_HEADERS })
    expect(refused.json<ChatView>().messages).toEqual([])

    const inside = transcriptIn(join(testApp.homeDir, '.claude', 'projects'), PROMPT_LINE)
    await hook(testApp, inside)
    const chat = (await testApp.app.inject({ url, headers: LOOPBACK_HEADERS })).json<ChatView>()
    expect(chat.messages.map((message) => message.text)).toEqual(['hi'])
    expect(chat.working).toBe(true)
  })
})
