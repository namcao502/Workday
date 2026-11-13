import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeProjectDirName, type ChatView } from '@workday/core'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp, LOOPBACK_HEADERS, type TestApp } from '../testing/testApp.js'

const SESSION_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const PROMPT_LINE = `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`
const openApps: FastifyInstance[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

interface Setup {
  readonly testApp: TestApp
  readonly devRepoPath: string
}

// The main dev-repo terminal "claude"; its agent starts with the first prompt.
async function setup(): Promise<Setup> {
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
  return { testApp, devRepoPath }
}

function post(
  testApp: TestApp,
  path: string,
  payload: unknown,
  session = 'claude',
): Promise<LightMyRequestResponse> {
  return testApp.app.inject({
    method: 'POST',
    url: `/api/workspace/sessions/${session}/${path}`,
    headers: LOOPBACK_HEADERS,
    payload: payload as object,
  })
}

describe('chat routes', () => {
  it('rejects an empty prompt with 400 and normalizes a sent one', async () => {
    const { testApp } = await setup()
    const empty = await post(testApp, 'prompt', { text: '  ' })
    expect(empty.statusCode).toBe(400)
    expect(testApp.agent.handles).toEqual([])
    const reply = await post(testApp, 'prompt', { text: 'café\r\nline 2' })
    expect(reply.json()).toEqual({ ok: true })
    expect(testApp.agent.last().sent).toEqual(['café\nline 2'])
  })

  it('answers 404 for an unknown session', async () => {
    const { testApp } = await setup()
    const chat = await testApp.app.inject({
      url: '/api/workspace/sessions/ghost/chat',
      headers: LOOPBACK_HEADERS,
    })
    const replies = await Promise.all([
      post(testApp, 'prompt', { text: 'x' }, 'ghost'),
      post(testApp, 'interrupt', {}, 'ghost'),
      post(testApp, 'mode', { mode: 'plan' }, 'ghost'),
      post(testApp, 'requests/call-1', { kind: 'approvePlan' }, 'ghost'),
    ])
    expect([chat, ...replies].map((reply) => reply.statusCode)).toEqual([404, 404, 404, 404, 404])
  })

  it('a worktree-missing start answers the prompt route with 409 worktreeMissing', async () => {
    const { testApp } = await setup()
    await testApp.services.workspace.openTicketTab('MDP-9')
    const reply = await post(testApp, 'prompt', { text: 'x' }, 'MDP-9')
    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toEqual({ ok: false, error: { code: 'worktreeMissing' } })
  })

  it('a prompt while a request is open answers 409 claudeWaiting', async () => {
    const { testApp } = await setup()
    await post(testApp, 'prompt', { text: 'one' })
    void testApp.agent.last().toolCall('Bash', { command: 'ls' })
    const reply = await post(testApp, 'prompt', { text: 'two' })
    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toEqual({ ok: false, error: { code: 'claudeWaiting' } })
  })

  it('answering a request through the route resolves it; a wrong kind is 400, an unknown id 404', async () => {
    const { testApp } = await setup()
    await post(testApp, 'prompt', { text: 'one' })
    const call = testApp.agent.last().toolCall('Bash', { command: 'ls' })
    const malformed = await Promise.all([
      post(testApp, `requests/${call.call.id}`, { kind: 'allow' }),
      post(testApp, `requests/${call.call.id}`, { kind: 'answers', answers: { q: 1 } }),
      post(testApp, `requests/${call.call.id}`, { kind: 'nope' }),
    ])
    const wrongKind = await post(testApp, `requests/${call.call.id}`, { kind: 'approvePlan' })
    const unknown = await post(testApp, 'requests/call-99', { kind: 'deny', message: 'no' })
    const ok = await post(testApp, `requests/${call.call.id}`, { kind: 'allow', always: true })
    expect(malformed.map((reply) => reply.statusCode)).toEqual([400, 400, 400])
    expect(wrongKind.statusCode).toBe(400)
    expect(unknown.statusCode).toBe(404)
    expect(ok.json()).toEqual({ ok: true })
    expect(await call.decision).toEqual({ kind: 'allow', always: false })
  })

  it('interrupt and mode routes reach the session', async () => {
    const { testApp } = await setup()
    await post(testApp, 'prompt', { text: 'one' })
    const interrupt = await post(testApp, 'interrupt', {})
    const mode = await post(testApp, 'mode', { mode: 'acceptEdits' })
    const badMode = await post(testApp, 'mode', { mode: 'dontAsk' })
    expect(interrupt.json()).toEqual({ ok: true })
    expect(mode.json()).toEqual({ ok: true })
    expect(badMode.statusCode).toBe(400)
    expect(testApp.agent.last().interrupts).toBe(1)
    expect(testApp.agent.last().modes).toEqual(['acceptEdits'])
  })

  it('chat reads the transcript of the session id from init', async () => {
    const { testApp, devRepoPath } = await setup()
    const url = '/api/workspace/sessions/claude/chat'
    const empty = await testApp.app.inject({ url, headers: LOOPBACK_HEADERS })
    expect(empty.json<ChatView>()).toMatchObject({ messages: [], running: false, mode: 'default' })

    const folder = join(testApp.homeDir, '.claude', 'projects', claudeProjectDirName(devRepoPath))
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, `${SESSION_ID}.jsonl`), PROMPT_LINE)
    await post(testApp, 'prompt', { text: 'hi' })
    testApp.agent
      .last()
      .emit({ type: 'init', sessionId: SESSION_ID, model: 'opus', mode: 'default' })
    const chat = (await testApp.app.inject({ url, headers: LOOPBACK_HEADERS })).json<ChatView>()
    expect(chat.messages.map((message) => message.text)).toEqual(['hi'])
    expect(chat).toMatchObject({ working: true, running: true, model: 'opus' })
  })

  it('the terminal and hook routes are gone (404)', async () => {
    const { testApp } = await setup()
    const replies = await Promise.all([
      testApp.app.inject({ url: '/api/terminal/claude', headers: LOOPBACK_HEADERS }),
      post(testApp, 'key', { key: 'escape' }),
      testApp.app.inject({
        method: 'POST',
        url: '/api/hooks/token/claude',
        headers: LOOPBACK_HEADERS,
        payload: {},
      }),
    ])
    expect(replies.map((reply) => reply.statusCode)).toEqual([404, 404, 404])
  })
})
