import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runGit } from './git.js'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'workday-git-'))
}

describe('runGit', () => {
  it('returns stdout on success', async () => {
    const result = await runGit(tempDir(), ['--version'], 10_000)
    expect(result.ok).toBe(true)
    expect(result.stdout).toContain('git version')
  })

  it('keeps stderr and the exit code on a failure', async () => {
    const result = await runGit(tempDir(), ['rev-parse', '--verify', 'refs/heads/nope'], 10_000)
    expect(result.ok).toBe(false)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.length).toBeGreaterThan(0)
  })

  it('kills a process that outlives the timeout', async () => {
    const started = Date.now()
    const result = await runGit(
      tempDir(),
      ['-e', 'setTimeout(() => undefined, 30000)'],
      200,
      process.execPath,
    )
    expect(result.ok).toBe(false)
    expect(result.timedOut).toBe(true)
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('does not run in a missing folder', async () => {
    const result = await runGit(join(tempDir(), 'missing'), ['--version'], 10_000)
    expect(result.ok).toBe(false)
  })
})
