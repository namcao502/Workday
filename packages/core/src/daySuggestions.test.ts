import { describe, expect, it } from 'vitest'
import { activeMinutes, selectDaySuggestions, splitByActivity } from './daySuggestions.js'

const MINUTE = 60_000

describe('activeMinutes', () => {
  it('counts a five-minute slot once however many times it is touched', () => {
    const times = [2, 4, 7, 30].map((minute) => minute * MINUTE)
    expect(activeMinutes(times, 0, 60 * MINUTE)).toBe(15)
  })

  it('ignores times outside the day', () => {
    expect(activeMinutes([-MINUTE, 60 * MINUTE], 0, 60 * MINUTE)).toBe(0)
  })
})

describe('splitByActivity', () => {
  it('gives every ticket a half hour and the rest by activity, summing to the day', () => {
    const split = splitByActivity([90, 30])
    expect(split).toEqual([360, 120])
    expect(split?.reduce((a, b) => a + b, 0)).toBe(480)
  })

  it('is null with nothing to go by', () => {
    expect(splitByActivity([])).toBeNull()
    expect(splitByActivity([0, 0])).toBeNull()
  })
})

describe('selectDaySuggestions', () => {
  const started = [
    { key: 'MDP-1', summary: 'One' },
    { key: 'MDP-2', summary: 'Two' },
    { key: 'MDP-3', summary: 'Three' },
  ]
  const activity = {
    'MDP-1': { ticketKey: 'MDP-1', commits: 1, claudeLast: null, activeMinutes: 10 },
    'MDP-2': { ticketKey: 'MDP-2', commits: 0, claudeLast: '2026-11-17T03:00:00Z', activeMinutes: 60 },
    'MDP-3': { ticketKey: 'MDP-3', commits: 0, claudeLast: null, activeMinutes: 0 },
  }

  it('lists tickets with work, busiest first, and skips the ones the day holds', () => {
    const all = selectDaySuggestions(started, activity, new Set())
    expect(all.map((item) => item.ticketKey)).toEqual(['MDP-2', 'MDP-1'])
    expect(all[0]).toMatchObject({ claude: true, commits: 0 })
    const rest = selectDaySuggestions(started, activity, new Set(['mdp-2']))
    expect(rest.map((item) => item.ticketKey)).toEqual(['MDP-1'])
    expect(rest[0]?.shareMinutes).toBe(480)
  })
})
