import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeProjectDirName } from '@workday/core'
import { afterEach, describe, expect, it } from 'vitest'
import { latestTranscriptId, sessionEnvironment } from './launchEnvironment.js'

describe('sessionEnvironment', () => {
  it('drops Claude session variables and adds TERM', () => {
    const env = sessionEnvironment({
      PATH: '/bin',
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      ANTHROPIC_API_KEY: 'secret',
      NO_COLOR: '1',
      AI_AGENT: 'x',
      DISABLE_AUTOUPDATER: '1',
      EMPTY: undefined,
      TERM: 'dumb',
    })
    expect(env).toEqual({ PATH: '/bin', TERM: 'xterm-256color' })
  })
})

describe('latestTranscriptId', () => {
  const OLD = '11111111-1111-4111-8111-111111111111'
  const NEW = '22222222-2222-4222-8222-222222222222'
  let root = ''

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function transcript(cwd: string, id: string, secondsAgo: number): void {
    const folder = join(root, claudeProjectDirName(cwd))
    mkdirSync(folder, { recursive: true })
    const file = join(folder, `${id}.jsonl`)
    writeFileSync(file, '{}\n')
    const when = new Date(Date.now() - secondsAgo * 1000)
    utimesSync(file, when, when)
  }

  it('returns the most recently written transcript of the folder', () => {
    root = mkdtempSync(join(tmpdir(), 'projects-'))
    transcript('/work/MDP-1', OLD, 600)
    transcript('/work/MDP-1', NEW, 10)
    expect(latestTranscriptId(root, '/work/MDP-1')).toBe(NEW)
  })

  it('is null without a transcript folder', () => {
    root = mkdtempSync(join(tmpdir(), 'projects-'))
    expect(latestTranscriptId(root, '/work/none')).toBeNull()
  })
})
