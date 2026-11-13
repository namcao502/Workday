import { describe, expect, it } from 'vitest'
import { isAcceptedPath, parseTranscript, type ChatMessage } from './transcriptChat.js'

// Lines get offsets 0, 1000, 2000, ... so ids are easy to read.
function parse(lines: readonly object[], cwd: string | null = null): readonly ChatMessage[] {
  return parseTranscript(
    lines.map((line) => JSON.stringify(line)),
    lines.map((_, index) => index * 1000),
    cwd,
  )
}

function user(content: unknown, extra: object = {}): object {
  return { type: 'user', message: { content }, ...extra }
}

function assistant(content: unknown, extra: object = {}): object {
  return { type: 'assistant', message: { content }, ...extra }
}

function toolUse(id: string, name: string, input: object): object {
  return assistant([{ type: 'tool_use', id, name, input }])
}

function toolResult(id: string, extra: object = {}): object {
  return user([{ type: 'tool_result', tool_use_id: id, content: 'ok', ...extra }])
}

describe('parseTranscript', () => {
  it('shows a string prompt and an array prompt', () => {
    const rows = parse([user('hello'), user([{ type: 'text', text: 'again' }])])
    expect(rows.map((row) => [row.id, row.role, row.text])).toEqual([
      [0, 'user', 'hello'],
      [100000, 'user', 'again'],
    ])
  })

  it('shows an interrupt marker as a notice, not a prompt', () => {
    const rows = parse([user([{ type: 'text', text: '[Request interrupted by user]' }])])
    expect(rows.map((row) => [row.role, row.text])).toEqual([
      ['notice', '[Request interrupted by user]'],
    ])
  })

  it('turns a command into /cmd args and hides reminders', () => {
    const rows = parse([
      user('<command-name>/review</command-name><command-args> now </command-args>'),
      user('<system-reminder>x</system-reminder>'),
      user('<local-command-stdout>out</local-command-stdout>'),
    ])
    expect(rows.map((row) => row.text)).toEqual(['/review now'])
  })

  it('keeps assistant text with the block index in the id', () => {
    const rows = parse([
      assistant([
        { type: 'text', text: ' ' },
        { type: 'text', text: 'hi' },
      ]),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 1, role: 'assistant', text: 'hi' })
  })

  it('runs a tool until its result, which can be an error', () => {
    const open = parse([toolUse('a', 'Read', { file_path: 'x' })])
    expect(open[0]).toMatchObject({ role: 'tool', toolName: 'Read', status: 'running' })
    const done = parse([toolUse('a', 'Read', {}), toolResult('a')])
    expect(done[0]?.status).toBeNull()
    const failed = parse([toolUse('a', 'Bash', {}), toolResult('a', { is_error: true })])
    expect(failed[0]).toMatchObject({ isError: true, status: null })
  })

  it('keeps a background tool running until its task notification', () => {
    const launched = [toolUse('b', 'Bash', { run_in_background: true }), toolResult('b')]
    expect(parse(launched)[0]?.status).toBe('background')
    const notified = parse([
      ...launched,
      user('<tool-use-id>b</tool-use-id><summary>Build done</summary>', {
        origin: { kind: 'task-notification' },
      }),
    ])
    expect(notified[0]?.status).toBeNull()
    expect(notified[1]).toMatchObject({ role: 'tool', toolName: 'Agent', toolDetail: 'Build done' })
  })

  it('drops sidechain, meta and other-origin lines', () => {
    const rows = parse([
      user('a', { isSidechain: true }),
      user('b', { isMeta: true }),
      user('c', { origin: { kind: 'channel' } }),
      user('d'),
    ])
    expect(rows.map((row) => row.text)).toEqual(['d'])
  })

  it('skips a half written last line', () => {
    const rows = parseTranscript(
      [JSON.stringify(user('ok')), '{"type":"user","mess'],
      [0, 50],
      null,
    )
    expect(rows).toHaveLength(1)
  })

  it('cuts what a rewind removed', () => {
    const rows = parse([
      user('one', { uuid: 'u1' }),
      assistant([{ type: 'text', text: 'reply one' }], { uuid: 'a1' }),
      user('two', { uuid: 'u2', parentUuid: 'a1' }),
      assistant([{ type: 'text', text: 'reply two' }], { uuid: 'a2' }),
      user('redo', { uuid: 'u3', parentUuid: 'a1' }),
    ])
    expect(rows.map((row) => row.text)).toEqual(['one', 'reply one', 'redo'])
  })

  it('makes file_path relative to the cwd and cuts long detail', () => {
    const rows = parse(
      [
        toolUse('a', 'Read', { file_path: 'C:\\repo\\src\\a.ts' }),
        toolUse('b', 'Bash', { command: `echo\n${'x'.repeat(200)}` }),
      ],
      'C:\\repo',
    )
    expect(rows[0]?.toolDetail).toBe('src\\a.ts')
    expect(rows[1]?.toolDetail).toHaveLength(120)
    expect(rows[1]?.toolDetail?.endsWith('...')).toBe(true)
  })

  it('takes a queued command as a user row', () => {
    const rows = parse([
      { type: 'attachment', attachment: { type: 'queued_command', prompt: 'q' } },
    ])
    expect(rows[0]).toMatchObject({ role: 'user', text: 'q' })
  })

  it('shows compaction, system text and API errors as notices', () => {
    const rows = parse([
      {
        type: 'system',
        subtype: 'compact_boundary',
        content: 'Compacted',
        compactMetadata: { preTokens: 150000, postTokens: 20000 },
      },
      { type: 'system', subtype: 'informational', content: '\x1b[1mNote\x1b[0m' },
      { type: 'system', subtype: 'turn_duration', durationMs: 5000 },
      assistant('Rate limited', { isApiErrorMessage: true }),
    ])
    expect(rows.map((row) => [row.role, row.text, row.isError])).toEqual([
      ['notice', 'Compacted (150k -> 20k tokens)', false],
      ['notice', 'Note', false],
      ['notice', 'Rate limited', true],
    ])
  })
})

describe('isAcceptedPath', () => {
  it('accepts a .jsonl under the root, ignoring case and separators on Windows', () => {
    expect(
      isAcceptedPath(
        'c:/Users/me/.claude/projects/p/s.jsonl',
        'C:\\Users\\Me\\.claude\\projects',
        'win32',
      ),
    ).toBe(true)
    expect(
      isAcceptedPath('/home/me/.claude/projects/p/s.jsonl', '/home/me/.claude/projects', 'other'),
    ).toBe(true)
  })

  it('refuses other files, outside paths, relative paths and climbing', () => {
    const root = '/home/me/.claude/projects'
    expect(isAcceptedPath(null, root, 'other')).toBe(false)
    expect(isAcceptedPath('/home/me/.claude/projects/p/s.txt', root, 'other')).toBe(false)
    expect(isAcceptedPath('/etc/s.jsonl', root, 'other')).toBe(false)
    expect(isAcceptedPath('/home/me/.claude/projects-x/s.jsonl', root, 'other')).toBe(false)
    expect(isAcceptedPath('projects/s.jsonl', root, 'other')).toBe(false)
    expect(isAcceptedPath('/home/me/.claude/projects/../s.jsonl', root, 'other')).toBe(false)
  })
})
