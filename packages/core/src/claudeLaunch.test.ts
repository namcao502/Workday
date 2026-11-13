import { describe, expect, it } from 'vitest'
import { claudeProjectDirName, isClaudeSessionVariable } from './claudeLaunch.js'

describe('claudeProjectDirName', () => {
  it.each([
    ['C:\\Project\\Workday\\', 'C--Project-Workday'],
    [
      'C:\\Project\\Backend-DotNet\\.claude\\worktrees\\MDP-8961',
      'C--Project-Backend-DotNet--claude-worktrees-MDP-8961',
    ],
    ['C:\\', 'C-'],
    ['/home/me/my repo/', '-home-me-my-repo'],
  ])('%s -> %s', (folder, expected) => {
    expect(claudeProjectDirName(folder)).toBe(expected)
  })
})

describe('isClaudeSessionVariable', () => {
  it.each([
    'CLAUDECODE',
    'claude_code_entrypoint',
    'ANTHROPIC_API_KEY',
    'NO_COLOR',
    'ai_agent',
    'DISABLE_AUTOUPDATER',
  ])('true for %s', (name) => {
    expect(isClaudeSessionVariable(name)).toBe(true)
  })
  it.each(['PATH', 'HOME', 'COLOR'])('false for %s', (name) => {
    expect(isClaudeSessionVariable(name)).toBe(false)
  })
})
