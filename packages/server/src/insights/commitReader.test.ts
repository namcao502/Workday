import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GitResult } from '../workspace/git.js'
import { readCommits } from './commitReader.js'

function result(ok: boolean, stdout: string): GitResult {
  return { ok, stdout, stderr: '', exitCode: ok ? 0 : 128, timedOut: false }
}

const RS = '\u001e'

describe('readCommits', () => {
  it('commitReader sums the repos and skips a repo whose git fails', async () => {
    const base = mkdtempSync(join(tmpdir(), 'workday-commits-'))
    const dev = join(base, 'Backend')
    const web = join(base, 'Web-Angular')
    const broken = join(base, 'Old-Angular')
    for (const repo of [dev, web, broken]) {
      mkdirSync(join(repo, '.git'), { recursive: true })
    }
    const failures: string[] = []
    const calls: string[][] = []
    const logs: Record<string, GitResult> = {
      [dev]: result(true, `${RS}h1\tMDP-1\t100\n1\t2\ta.cs\n`),
      [web]: result(true, `${RS}h2\tMDP-1\t200\n10\t0\tb.ts\n`),
      [broken]: result(false, ''),
    }

    const stats = await readCommits(
      {
        devRepoPath: dev,
        siblingRepoGlob: '*-Angular',
        branchPrefix: 'MDP-',
        from: '2026-10-19',
        to: '2026-10-25',
        timeZone: 'Asia/Ho_Chi_Minh',
        onFailure: (message) => failures.push(message),
      },
      (cwd, args) => {
        if (args[0] === 'config') {
          return Promise.resolve(result(true, 'me@example.com\n'))
        }
        calls.push([...args])
        return Promise.resolve(logs[cwd] ?? result(false, ''))
      },
    )

    expect(stats).toEqual({ 'MDP-1': { commits: 2, files: 2, added: 11, deleted: 2 } })
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('Old-Angular')
    expect(calls[0]).toContain('--since=2026-10-19T00:00:00+07:00')
    expect(calls[0]).toContain('--until=2026-10-26T00:00:00+07:00')
    expect(calls[0]).toContain('--author=me@example.com')
    expect(calls[0]).toContain('--branches=MDP-*')
  })
})
