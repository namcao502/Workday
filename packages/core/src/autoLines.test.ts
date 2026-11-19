import { describe, expect, it } from 'vitest'
import {
  addAutoLine,
  dropAutoLines,
  nextAutoLine,
  prChangeLines,
  removeAutoLine,
  type AutoLines,
} from './autoLines.js'

const EMPTY: AutoLines = {}

describe('auto lines', () => {
  it('gives the oldest line of each session', () => {
    let lines = addAutoLine(EMPTY, 'MDP-1', 'pr-comments MDP-1')
    lines = addAutoLine(lines, 'MDP-1', 'pr-refresh MDP-1')
    lines = addAutoLine(lines, 'MDP-2', 'pr-refresh MDP-2')

    expect(nextAutoLine(lines, 'MDP-1')).toBe('pr-comments MDP-1')
    expect(nextAutoLine(lines, 'MDP-2')).toBe('pr-refresh MDP-2')
  })

  it('ignores a line already waiting, and forgets a session with no lines left', () => {
    const once = addAutoLine(EMPTY, 'MDP-1', 'pr-comments MDP-1')
    expect(addAutoLine(once, 'MDP-1', 'pr-comments MDP-1')).toBe(once)

    expect(removeAutoLine(once, 'MDP-1', 'pr-comments MDP-1')).toEqual({})
    expect(nextAutoLine(EMPTY, 'MDP-1')).toBeNull()
  })

  it('leaves the next line waiting after the first went out', () => {
    let lines = addAutoLine(EMPTY, 'MDP-1', 'pr-comments MDP-1')
    lines = addAutoLine(lines, 'MDP-1', 'pr-refresh MDP-1')

    expect(nextAutoLine(removeAutoLine(lines, 'MDP-1', 'pr-comments MDP-1'), 'MDP-1')).toBe(
      'pr-refresh MDP-1',
    )
  })

  it('drops every line of a session', () => {
    const lines = addAutoLine(EMPTY, 'MDP-1', 'pr-comments MDP-1')
    expect(dropAutoLines(lines, 'MDP-1')).toEqual({})
  })

  it('a PR change asks for pr-comments on new comments and pr-refresh on a new conflict', () => {
    expect(prChangeLines('MDP-1', { newComments: 2, conflicted: false })).toEqual([
      'pr-comments MDP-1',
    ])
    expect(prChangeLines('MDP-1', { newComments: 0, conflicted: true })).toEqual([
      'pr-refresh MDP-1',
    ])
    expect(prChangeLines('MDP-1', { newComments: 1, conflicted: true })).toEqual([
      'pr-comments MDP-1',
      'pr-refresh MDP-1',
    ])
    expect(prChangeLines('MDP-1', { newComments: 0, conflicted: false })).toEqual([])
  })
})
