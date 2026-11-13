import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tallyTranscript } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { AgentStatsStore } from './agentStatsStore.js'

function newDir(): string {
  return mkdtempSync(join(tmpdir(), 'workday-stats-'))
}

const LINE = JSON.stringify({
  type: 'assistant',
  timestamp: '2026-10-22T06:00:00Z',
  message: {
    id: 'm1',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
})

describe('AgentStatsStore', () => {
  it('round-trips sessions with their tools and days', async () => {
    const dir = newDir()
    const stats = tallyTranscript([LINE], 'Asia/Ho_Chi_Minh')
    await new AgentStatsStore(dir).save('MDP-1', { s1: stats })

    const reloaded = new AgentStatsStore(dir)

    expect(reloaded.sessions('MDP-1')).toEqual({ s1: stats })
    expect(reloaded.sessions('MDP-1')['s1']?.tools['Read']?.calls).toBe(1)
    expect(Object.keys(reloaded.sessions('MDP-1')['s1']?.days ?? {})).toEqual(['2026-10-22'])
  })

  it('reads an old entry saved without days as null days', () => {
    const dir = newDir()
    const stats = { ...tallyTranscript([LINE], 'UTC'), days: null }
    writeFileSync(join(dir, 'agent-stats.json'), JSON.stringify({ 'MDP-1': { s1: stats } }))

    expect(new AgentStatsStore(dir).sessions('MDP-1')['s1']?.days).toBeNull()
  })

  it('lists the saved ticket keys and nothing for a missing file', async () => {
    const dir = newDir()
    const store = new AgentStatsStore(dir)
    expect(store.keys()).toEqual([])

    await store.save('MDP-1', {})
    await store.save('MDP-2', {})

    expect(new AgentStatsStore(dir).keys()).toEqual(['MDP-1', 'MDP-2'])
  })

  it('keeps a corrupt file as .bad and starts empty', () => {
    const dir = newDir()
    writeFileSync(join(dir, 'agent-stats.json'), '{ not json')

    const store = new AgentStatsStore(dir)

    expect(store.keys()).toEqual([])
    expect(existsSync(join(dir, 'agent-stats.json.bad'))).toBe(true)
    expect(readFileSync(join(dir, 'agent-stats.json.bad'), 'utf8')).toBe('{ not json')
  })
})
