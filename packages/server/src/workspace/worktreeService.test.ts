import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createWorktree } from './worktreeService.js'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function identify(repo: string): void {
  git(repo, 'config', 'user.email', 'test@example.com')
  git(repo, 'config', 'user.name', 'Test')
  git(repo, 'config', 'commit.gpgsign', 'false')
}

function commitFile(repo: string, name: string, text: string): void {
  writeFileSync(join(repo, name), text)
  git(repo, 'add', name)
  git(repo, 'commit', '-m', `change ${name}`)
}

interface Fixture {
  readonly repo: string
  readonly other: string // a second clone, to move origin ahead
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'workday-wt-'))
  const origin = join(root, 'origin.git')
  const repo = join(root, 'repo')
  const other = join(root, 'other')
  git(root, 'init', '--bare', '-b', 'main', origin)
  git(root, 'clone', origin, repo)
  identify(repo)
  git(repo, 'checkout', '-b', 'main')
  commitFile(repo, 'a.txt', 'one\n')
  git(repo, 'push', '-u', 'origin', 'main')
  git(root, 'clone', origin, other)
  identify(other)
  return { repo, other }
}

function pushFromOther(other: string, name: string, text: string): void {
  commitFile(other, name, text)
  git(other, 'push', 'origin', 'HEAD:main')
}

function options(repo: string, ticketKey: string, parentKey: string | null = null) {
  return {
    ticketKey,
    repoPath: repo,
    worktreePath: join(repo, '.claude', 'worktrees', ticketKey),
    parentKey,
  }
}

describe('createWorktree', () => {
  it('cuts a new branch from the freshly fetched origin/main', async () => {
    const { repo, other } = fixture()
    pushFromOther(other, 'b.txt', 'two\n')
    const result = await createWorktree(options(repo, 'MDP-1'))
    expect(result).toBe('created')
    const worktree = join(repo, '.claude', 'worktrees', 'MDP-1')
    expect(existsSync(join(worktree, 'b.txt'))).toBe(true)
    expect(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('MDP-1')
  })

  it('merges origin/main into a branch that already exists', async () => {
    const { repo, other } = fixture()
    git(repo, 'branch', 'MDP-1')
    pushFromOther(other, 'b.txt', 'two\n')
    expect(await createWorktree(options(repo, 'MDP-1'))).toBe('created')
    expect(existsSync(join(repo, '.claude', 'worktrees', 'MDP-1', 'b.txt'))).toBe(true)
  })

  it('reports a conflicting merge and leaves no MERGE_HEAD behind', async () => {
    const { repo, other } = fixture()
    git(repo, 'checkout', '-b', 'MDP-1')
    commitFile(repo, 'a.txt', 'mine\n')
    git(repo, 'checkout', 'main')
    pushFromOther(other, 'a.txt', 'theirs\n')
    expect(await createWorktree(options(repo, 'MDP-1'))).toBe('mainNotMerged')
    const worktree = join(repo, '.claude', 'worktrees', 'MDP-1')
    expect(existsSync(worktree)).toBe(true)
    expect(() => git(worktree, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')).toThrow()
    expect(git(worktree, 'status', '--porcelain').trim()).toBe('')
  })

  it('refuses a sub-task whose parent branch is not on origin', async () => {
    const { repo } = fixture()
    expect(await createWorktree(options(repo, 'MDP-2', 'MDP-1'))).toBe('parentBranchMissing')
    expect(existsSync(join(repo, '.claude', 'worktrees', 'MDP-2'))).toBe(false)
  })

  it('cuts a sub-task from the parent branch and records parentTicket', async () => {
    const { repo, other } = fixture()
    git(other, 'checkout', '-b', 'MDP-1')
    commitFile(other, 'parent.txt', 'p\n')
    git(other, 'push', 'origin', 'MDP-1')
    expect(await createWorktree(options(repo, 'MDP-2', 'MDP-1'))).toBe('created')
    expect(existsSync(join(repo, '.claude', 'worktrees', 'MDP-2', 'parent.txt'))).toBe(true)
    expect(git(repo, 'config', 'branch.MDP-2.parentTicket').trim()).toBe('MDP-1')
  })

  it('fails when the remote cannot be fetched', async () => {
    const { repo } = fixture()
    git(repo, 'remote', 'set-url', 'origin', join(repo, 'no-such-remote'))
    const errors: string[] = []
    const result = await createWorktree(options(repo, 'MDP-1'), (message) => errors.push(message))
    expect(result).toBe('failed')
    expect(errors).toHaveLength(1)
  })

  it('adds /.claude/worktrees/ to .git/info/exclude once', async () => {
    const { repo } = fixture()
    await createWorktree(options(repo, 'MDP-1'))
    await createWorktree(options(repo, 'MDP-2'))
    const lines = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8').split('\n')
    expect(lines.filter((line) => line.trim() === '/.claude/worktrees/')).toHaveLength(1)
  })

  it('leaves the exclude file alone when /.claude/ is already ignored', async () => {
    const { repo } = fixture()
    writeFileSync(join(repo, '.git', 'info', 'exclude'), '/.claude/')
    await createWorktree(options(repo, 'MDP-1'))
    expect(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8')).toBe('/.claude/')
  })
})
