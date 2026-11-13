import { describe, expect, it } from 'vitest'
import { tallyTranscript } from './transcriptTally.js'

const HCM = 'Asia/Ho_Chi_Minh'

interface AssistantOptions {
  readonly toolName?: string
  readonly toolId?: string
  readonly isSidechain?: boolean
  readonly toolInput?: unknown
}

function assistant(
  id: string,
  input: number,
  cacheRead: number,
  cacheWrite: number,
  output: number,
  timestamp: string,
  options: AssistantOptions = {},
): string {
  const block =
    options.toolName === undefined
      ? { type: 'text', text: 'hi' }
      : {
          type: 'tool_use',
          id: options.toolId ?? 'toolu_1',
          name: options.toolName,
          input: options.toolInput ?? {},
        }
  return JSON.stringify({
    isSidechain: options.isSidechain ?? false,
    type: 'assistant',
    message: {
      model: 'claude-opus-5-5',
      id,
      role: 'assistant',
      content: [block],
      usage: {
        input_tokens: input,
        cache_creation_input_tokens: cacheWrite,
        cache_read_input_tokens: cacheRead,
        output_tokens: output,
      },
    },
    timestamp,
  })
}

function toolResultError(toolUseId: string, timestamp: string): string {
  return JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: true, content: 'boom' }],
    },
    timestamp,
  })
}

function turnDuration(durationMs: number, timestamp: string): string {
  return JSON.stringify({ type: 'system', subtype: 'turn_duration', durationMs, timestamp })
}

function apiRequest(betas: readonly string[], timestamp: string): string {
  return JSON.stringify({ type: 'api-request', timestamp, params: { betas } })
}

function totalTokens(usage: {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

describe('tallyTranscript', () => {
  it('splits tokens and turns by day in the time zone', () => {
    const stats = tallyTranscript(
      [
        assistant('m1', 1, 10, 100, 1000, '2026-10-22T16:59:00Z'),
        turnDuration(5_000, '2026-10-22T16:59:30Z'),
        assistant('m2', 2, 20, 200, 2000, '2026-10-22T17:01:00Z'),
        turnDuration(7_000, '2026-10-22T17:01:30Z'),
      ],
      HCM,
    )

    const first = stats.days?.['2026-10-22']
    const second = stats.days?.['2026-10-23']
    expect(Object.keys(stats.days ?? {})).toHaveLength(2)
    expect(first && totalTokens(first)).toBe(1111)
    expect(first?.turns).toBe(1)
    expect(first?.turnSeconds).toBe(5)
    expect(second && totalTokens(second)).toBe(2222)
    expect(second?.turnSeconds).toBe(7)
    expect(stats.turns).toBe(2)
  })

  it("counts a message id's tokens once across its streamed lines", () => {
    const stats = tallyTranscript(
      [
        assistant('msg_01', 2, 100, 10, 50, '2026-10-22T06:00:00.000Z'),
        assistant('msg_01', 2, 100, 10, 50, '2026-10-22T06:00:01.000Z', { toolName: 'Bash' }),
        assistant('msg_02', 3, 200, 20, 70, '2026-10-22T06:00:02.000Z'),
      ],
      HCM,
    )

    expect(stats.inputTokens).toBe(5)
    expect(stats.cacheReadTokens).toBe(300)
    expect(stats.cacheWriteTokens).toBe(30)
    expect(stats.outputTokens).toBe(120)
    expect(Object.keys(stats.days ?? {})).toEqual(['2026-10-22'])
  })

  it('puts a turn on the day of its line in the configured time zone', () => {
    const lines = [turnDuration(1_000, '2026-10-22T20:00:00Z')]

    expect(Object.keys(tallyTranscript(lines, 'UTC').days ?? {})).toEqual(['2026-10-22'])
    expect(Object.keys(tallyTranscript(lines, HCM).days ?? {})).toEqual(['2026-10-23'])
  })

  it('counts tool calls and errors by tool use id', () => {
    const stats = tallyTranscript(
      [
        assistant('m1', 1, 1, 1, 1, '2026-10-22T06:00:00Z', {
          toolName: 'Bash',
          toolId: 'toolu_1',
        }),
        assistant('m2', 1, 1, 1, 1, '2026-10-22T06:00:01Z', {
          toolName: 'Read',
          toolId: 'toolu_2',
        }),
        assistant('m3', 1, 1, 1, 1, '2026-10-22T06:00:02Z', {
          toolName: 'Bash',
          toolId: 'toolu_3',
        }),
        toolResultError('toolu_1', '2026-10-22T06:00:03Z'),
        toolResultError('toolu_gone', '2026-10-22T06:00:04Z'),
      ],
      HCM,
    )

    expect(stats.tools['Bash']).toEqual({ calls: 2, errors: 1 })
    expect(stats.tools['Read']).toEqual({ calls: 1, errors: 0 })
    expect(stats.tools['?']).toEqual({ calls: 0, errors: 1 })
  })

  it('records a skill run from a Skill tool use', () => {
    const stats = tallyTranscript(
      [
        assistant('m1', 1, 1, 1, 1, '2026-10-22T06:00:00Z', {
          toolName: 'Skill',
          toolInput: { skill: 'plan-write', args: 'MDP-1' },
        }),
      ],
      HCM,
    )

    expect(stats.skills).toEqual([
      { at: '2026-10-22T06:00:00.000Z', skill: 'plan-write', args: 'MDP-1' },
    ])
  })

  it('records a compact and sets the context to its post tokens', () => {
    const stats = tallyTranscript(
      [
        assistant('m1', 1, 900_000, 0, 1, '2026-10-22T06:00:00Z'),
        JSON.stringify({
          type: 'system',
          subtype: 'compact_boundary',
          compactMetadata: {
            trigger: 'auto',
            preTokens: 999112,
            postTokens: 16677,
            durationMs: 85992,
          },
          timestamp: '2026-10-22T06:01:00Z',
        }),
      ],
      HCM,
    )

    expect(stats.compacts).toEqual([
      {
        at: '2026-10-22T06:01:00.000Z',
        isAuto: true,
        preTokens: 999112,
        postTokens: 16677,
        durationMs: 85992,
      },
    ])
    expect(stats.contextTokens).toBe(16677)
  })

  it('takes the context from the last main-thread message, ignoring sidechains', () => {
    const stats = tallyTranscript(
      [
        assistant('m1', 10, 1000, 0, 1, '2026-10-22T06:00:00Z'),
        assistant('m2', 5, 9000, 0, 1, '2026-10-22T06:00:01Z', { isSidechain: true }),
      ],
      HCM,
    )

    expect(stats.contextTokens).toBe(1010)
    expect(stats.model).toBe('claude-opus-5-5')
  })

  it('detects the one million window from betas, using the latest request', () => {
    const withBeta = tallyTranscript(
      [apiRequest(['claude-code-20250219', 'context-1m-2025-08-07'], '2026-10-22T06:00:00Z')],
      HCM,
    )
    const withoutBeta = tallyTranscript(
      [
        apiRequest(['context-1m-2025-08-07'], '2026-10-22T06:00:00Z'),
        apiRequest(['claude-code-20250219'], '2026-10-22T06:00:01Z'),
      ],
      HCM,
    )

    expect(withBeta.contextWindow).toBe(1_000_000)
    expect(withoutBeta.contextWindow).toBe(200_000)
  })

  it('records an API error without counting usage', () => {
    const stats = tallyTranscript(
      [
        '{"type":"assistant","isApiErrorMessage":true,"apiErrorStatus":426,"message":{"model":"<synthetic>","id":"m","content":[{"type":"text","text":"API Error 426"}],"usage":{"input_tokens":7,"output_tokens":7}},"timestamp":"2026-10-22T06:00:00Z"}',
      ],
      HCM,
    )

    expect(stats.apiErrors).toEqual([
      { at: '2026-10-22T06:00:00.000Z', status: 426, text: 'API Error 426' },
    ])
    expect(stats.inputTokens).toBe(0)
    expect(stats.outputTokens).toBe(0)
    expect(stats.contextTokens).toBeNull()
  })

  it('ignores malformed and synthetic lines', () => {
    const stats = tallyTranscript(
      [
        '{"type":"assistant","message":{"model":"<synthetic>","id":"m","content":[],"usage":{"input_tokens":9,"output_tokens":9}}}',
        '{"type":"assistant","message":',
        'not json at all',
        '',
        '{"type":"queue-operation","content":"no needed marker"}',
      ],
      HCM,
    )

    expect(stats.inputTokens).toBe(0)
    expect(stats.outputTokens).toBe(0)
    expect(stats.tools).toEqual({})
    expect(stats.contextTokens).toBeNull()
  })
})
