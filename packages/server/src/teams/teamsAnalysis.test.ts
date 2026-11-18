import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TeamsMessage, TeamsThread } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { analysisFromReply, buildAnalysisPrompt, parseAnalysis } from './teamsAnalysis.js'
import { TeamsAnalysisRunner } from './teamsAnalysisRunner.js'
import type { PromptOutcome } from './teamsHandOff.js'

function message(id: string, sender: string, content: string): TeamsMessage {
  return {
    id,
    senderId: sender === 'me' ? 'me-id' : `${sender}-id`,
    senderName: sender,
    sentAt: '2026-11-17T02:00:00Z',
    content,
    isPlainText: true,
    editedAt: null,
    reactions: [],
    mentionMris: {},
    files: [],
  } as unknown as TeamsMessage
}

const THREAD: TeamsThread = {
  conversationId: 'conv1',
  rootId: 'm1',
  isChat: false,
  messages: [message('m1', 'me', 'posted'), message('m2', 'qc', 'check cmt giúp e')],
}

const BLOCK = (id: string): string =>
  'Here:\n```teams-analysis\n' +
  JSON.stringify({
    request: id,
    issues: [
      { text: 'Cột sai', status: 'open' },
      { text: 'Đã fix', status: 'FIXED' },
      { text: '', status: 'open' },
    ],
    diagnosis: 'd',
    nextStep: 'n',
    replies: ['r1', ' ', 'r2'],
  }) +
  '\n```\n'

describe('parseAnalysis / analysisFromReply', () => {
  it('reads issues, diagnosis, next step and replies, dropping empty ones', () => {
    const found = analysisFromReply(BLOCK('0123abcd'))
    expect(found?.requestId).toBe('0123abcd')
    expect(found?.analysis).toEqual({
      issues: [
        { text: 'Cột sai', status: 'open' },
        { text: 'Đã fix', status: 'fixed' },
      ],
      diagnosis: 'd',
      nextStep: 'n',
      replies: ['r1', 'r2'],
    })
  })

  it('is null without replies, without a block or with a bad request id', () => {
    expect(parseAnalysis('{"replies": []}')).toBeNull()
    expect(analysisFromReply('no block here')).toBeNull()
    expect(analysisFromReply(BLOCK('nope'))).toBeNull()
  })
})

describe('buildAnalysisPrompt', () => {
  it('holds the thread as data, the request id and the update rule for a check-comments ask', () => {
    const prompt = buildAnalysisPrompt({
      ticketKey: 'MDP-1',
      summary: 'Title',
      thread: THREAD,
      myId: 'me-id',
      mainPoint: 'fixed already',
      requestId: '0123abcd',
      timeZone: 'UTC',
    })
    expect(prompt).toContain('<thread>')
    expect(prompt).toContain('qc\ncheck cmt giúp e')
    expect(prompt).toContain('"request": "0123abcd"')
    expect(prompt).toContain('must contain the word "update"')
    expect(prompt).toContain('The reply must convey: fixed already')
  })
})

describe('TeamsAnalysisRunner', () => {
  function rig(outcome: PromptOutcome = 'sent') {
    const sent: string[] = []
    let replies: string[] = []
    let working = true
    let now = 1_000_000
    const repo = mkdtempSync(join(tmpdir(), 'repo-'))
    const runner = new TeamsAnalysisRunner({
      workspace: {
        promptState: () => outcome,
        prompt: (_name, text) => {
          sent.push(text)
          return 'sent'
        },
        assistantTexts: () => replies,
        isWorking: () => working,
      },
      tmpDir: mkdtempSync(join(tmpdir(), 'analysis-')),
      now: () => new Date(now),
      timeZone: () => 'UTC',
      devRepoPath: () => repo,
      logError: () => undefined,
    })
    return {
      runner,
      sent,
      reply: (texts: string[]) => {
        replies = texts
      },
      advance: (ms: number) => {
        now += ms
      },
      stop: () => {
        working = false
      },
    }
  }
  const input = {
    ticketKey: 'MDP-1',
    summary: null,
    thread: THREAD,
    myId: 'me-id',
    mainPoint: null,
    session: 'MDP-1',
  }

  it('runs: none, then running, then done once Claude answered with the request id', async () => {
    const { runner, sent, reply } = rig()
    expect(await runner.status('MDP-1', 'conv1', 'm2')).toEqual({ kind: 'none' })
    expect(await runner.start(input)).toEqual({ ok: true })
    expect(sent[0]).toMatch(/^Read .*MDP-1-analysis-.*\.md and do the analysis it asks for\.$/)
    expect(await runner.status('MDP-1', 'conv1', 'm2')).toEqual({ kind: 'running' })
    const id = /"request": "([0-9a-f]{8})"/.exec(
      (await import('node:fs')).readFileSync(sent[0]?.split(' ')[1] ?? '', 'utf8'),
    )?.[1]
    reply(['older text', BLOCK(id ?? '')])
    const done = await runner.status('MDP-1', 'conv1', 'm2')
    expect(done).toMatchObject({ kind: 'done', stale: false })
    // A newer message makes the same analysis stale.
    expect(await runner.status('MDP-1', 'conv1', 'm3')).toMatchObject({ kind: 'done', stale: true })
  })

  it('ignores an answer of another request and fails after the timeout', async () => {
    const { runner, reply, advance } = rig()
    await runner.start(input)
    reply([BLOCK('deadbeef')])
    expect(await runner.status('MDP-1', 'conv1', 'm2')).toEqual({ kind: 'running' })
    advance(21 * 60_000)
    expect(await runner.status('MDP-1', 'conv1', 'm2')).toEqual({ kind: 'failed' })
    expect(await runner.status('MDP-1', 'conv1', 'm2')).toEqual({ kind: 'none' })
  })

  it('fails at once when the session stopped working without the answer (an API error)', async () => {
    const { runner, stop } = rig()
    await runner.start(input)
    expect(await runner.status('MDP-1', 'conv1', 'm2')).toEqual({ kind: 'running' })
    stop()
    expect(await runner.status('MDP-1', 'conv1', 'm2')).toEqual({ kind: 'failed' })
  })

  it('refuses when Claude is not running or is waiting for an answer', async () => {
    expect(await rig('notRunning').runner.start(input)).toEqual({
      ok: false,
      error: { code: 'claudeNotRunning' },
    })
    expect(await rig('waiting').runner.start(input)).toEqual({
      ok: false,
      error: { code: 'claudeWaiting' },
    })
  })
})
