import { describe, expect, it } from 'vitest'
import {
  bashRcText,
  buildShellLaunch,
  claudeProjectDirName,
  isClaudeSessionVariable,
  sessionArgument,
  type SessionArgumentInput,
} from './claudeLaunch.js'

const EXE = 'C:\\x\\claude.exe'
const PWSH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'

function win(argument: string | null, extra: { pwsh?: string | null; settings?: string | null; exe?: string } = {}) {
  return buildShellLaunch({
    platform: 'win32',
    powerShell7Path: extra.pwsh ?? null,
    claudeExecutable: extra.exe ?? EXE,
    settingsFile: extra.settings ?? null,
    argument,
    rcFile: null,
  })
}

describe('buildShellLaunch win32', () => {
  it('runs claude in Windows PowerShell, quoting prompts but not flags', () => {
    const prefix = "function global:claude { & 'C:\\x\\claude.exe' @args }; claude"
    expect(win(null)).toEqual({ file: 'powershell.exe', args: ['-NoLogo', '-NoExit', '-Command', prefix] })
    expect(win('').args[3]).toBe(prefix)
    expect(win('--continue').args[3]).toBe(`${prefix} --continue`)
    expect(win('ship MDP-1').args[3]).toBe(`${prefix} 'ship MDP-1'`)
  })

  it('puts the settings file in the claude function', () => {
    expect(win('--continue', { settings: 'C:\\a b\\s.json' }).args[3]).toBe(
      "function global:claude { & 'C:\\x\\claude.exe' --settings 'C:\\a b\\s.json' @args }; claude --continue",
    )
  })

  it('uses pwsh when installed and doubles single quotes', () => {
    const launch = win(null, { pwsh: PWSH, exe: "C:\\o'neil\\claude.exe" })
    expect(launch.file).toBe(PWSH)
    expect(launch.args[3]).toBe("function global:claude { & 'C:\\o''neil\\claude.exe' @args }; claude")
  })

  it('quotes a prompt holding a single quote', () => {
    expect(win("it's done").args[3]).toMatch(/claude 'it''s done'$/)
  })

  it.each(['say "hi"', 'a\nb', 'a\u0007b'])('throws for argument %j', (argument) => {
    expect(() => win(argument)).toThrow()
  })
})

describe('buildShellLaunch other', () => {
  it('starts bash with the rc file', () => {
    const launch = buildShellLaunch({
      platform: 'other',
      powerShell7Path: null,
      claudeExecutable: '/home/u/.local/bin/claude',
      settingsFile: null,
      argument: null,
      rcFile: '/tmp/rc',
    })
    expect(launch).toEqual({ file: 'bash', args: ['--rcfile', '/tmp/rc', '-i'] })
  })

  it('throws without an rc file', () => {
    expect(() =>
      buildShellLaunch({
        platform: 'other',
        powerShell7Path: null,
        claudeExecutable: 'claude',
        settingsFile: null,
        argument: null,
        rcFile: null,
      }),
    ).toThrow()
  })
})

describe('bashRcText', () => {
  it('sources bashrc, defines the claude function and calls it', () => {
    const text = bashRcText('/opt/claude', '/tmp/s.json', '--continue')
    expect(text).toContain('~/.bashrc')
    expect(text).toContain("claude() { command '/opt/claude' --settings '/tmp/s.json' \"$@\"; }")
    expect(text.trimEnd().split('\n').at(-1)).toBe('claude --continue')
  })

  it('quotes single quotes and a prompt', () => {
    const text = bashRcText("/o'neil/claude", null, "it's")
    expect(text).toContain("command '/o'\\''neil/claude'")
    expect(text.trimEnd().split('\n').at(-1)).toBe("claude 'it'\\''s'")
  })

  it('has no --settings without a settings file', () => {
    expect(bashRcText('/opt/claude', null, null)).not.toContain('--settings')
  })
})

describe('claudeProjectDirName', () => {
  it.each([
    ['C:\\Project\\Workday\\', 'C--Project-Workday'],
    ['C:\\Project\\Backend-DotNet\\.claude\\worktrees\\MDP-8961', 'C--Project-Backend-DotNet--claude-worktrees-MDP-8961'],
    ['C:\\', 'C-'],
    ['/home/me/my repo/', '-home-me-my-repo'],
  ])('%s -> %s', (folder, expected) => {
    expect(claudeProjectDirName(folder)).toBe(expected)
  })
})

describe('sessionArgument', () => {
  const GUID = '0b7f3c1e-2d4a-4f60-9a1b-5c6d7e8f9a0b'
  const base: SessionArgumentInput = {
    savedSessionId: GUID,
    transcriptExists: true,
    folderHasTranscripts: true,
    isMain: true,
    startPrompt: null,
  }

  it('prefers the start prompt', () => {
    expect(sessionArgument({ ...base, startPrompt: 'ship it' })).toBe('ship it')
  })

  it('resumes a saved GUID whose transcript exists', () => {
    expect(sessionArgument(base)).toBe(`--resume ${GUID}`)
  })

  it.each(['nope', '', null, '../x', `${GUID} --x`])('drops a bad id %j', (savedSessionId) => {
    expect(sessionArgument({ ...base, savedSessionId, isMain: false })).toBeNull()
  })

  it('continues only the main session when the folder has transcripts', () => {
    const noResume = { ...base, transcriptExists: false }
    expect(sessionArgument(noResume)).toBe('--continue')
    expect(sessionArgument({ ...noResume, isMain: false })).toBeNull()
    expect(sessionArgument({ ...noResume, folderHasTranscripts: false })).toBeNull()
  })

  it('treats an empty start prompt as none', () => {
    expect(sessionArgument({ ...base, startPrompt: '' })).toBe(`--resume ${GUID}`)
  })
})

describe('isClaudeSessionVariable', () => {
  it.each(['CLAUDECODE', 'claude_code_entrypoint', 'ANTHROPIC_API_KEY', 'NO_COLOR', 'ai_agent', 'DISABLE_AUTOUPDATER'])(
    'true for %s',
    (name) => {
      expect(isClaudeSessionVariable(name)).toBe(true)
    },
  )
  it.each(['PATH', 'HOME', 'COLOR'])('false for %s', (name) => {
    expect(isClaudeSessionVariable(name)).toBe(false)
  })
})
