import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { WorkspaceConfig } from '@workday/core'
import { describe, expect, it, vi } from 'vitest'
import { removeWorktrees } from './cleanupRemove.js'
import { slimTargets } from './slimTargets.js'
import { findWorktrees } from './ticketWorktrees.js'
import { WorktreeCleanupService } from './worktreeCleanup.js'

// Real git processes: the first run on a cold machine exceeds the 5 s default.
vi.setConfig({ testTimeout: 30_000 })

const KEY = 'MDP-1'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function write(path: string, text = 'x'): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

// A dev repo with an origin, the way a clone of the real one looks.
function devRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'workday-clean-'))
  const origin = join(root, 'origin.git')
  const path = join(root, 'Backend')
  git(root, 'init', '--bare', '-b', 'main', origin)
  git(root, 'clone', origin, path)
  git(path, 'config', 'user.email', 'test@example.com')
  git(path, 'config', 'user.name', 'Test')
  git(path, 'config', 'commit.gpgsign', 'false')
  git(path, 'checkout', '-b', 'main')
  write(join(path, 'README.md'))
  git(path, 'add', '-A')
  git(path, 'commit', '-m', 'seed')
  git(path, 'push', '-u', 'origin', 'main')
  return path
}

function service(repo: string | null, errors: string[] = []): WorktreeCleanupService {
  const config: WorkspaceConfig = {
    devRepoPath: repo,
    siblingRepoGlob: null,
    localOnlyPaths: [],
  } as unknown as WorkspaceConfig
  return new WorktreeCleanupService({
    config: () => config,
    tracking: () => ({}),
    inProgressKeys: () => new Set(),
    runningKeys: () => new Set(),
    logError: (message) => errors.push(message),
  })
}

function addWorktree(repo: string, key: string): string {
  const path = join(repo, '.claude', 'worktrees', key)
  git(repo, 'worktree', 'add', path, '-b', key, 'origin/main')
  return path
}

describe('WorktreeCleanupService.remove', () => {
  it('remove_refuses_a_key_that_is_not_a_ticket_key', async () => {
    const repo = devRepo()
    write(join(repo, 'keep.txt'))
    const outcome = await service(repo).remove('..', 0)
    expect(outcome).toEqual({ ok: false, error: { code: 'invalidKey' } })
    expect(existsSync(join(repo, 'keep.txt'))).toBe(true)
    expect((await service(repo).remove('MDP-1/../..', 0)).ok).toBe(false)
  })

  it('remove_refuses_when_dirty_count_changed', async () => {
    const repo = devRepo()
    const worktree = addWorktree(repo, KEY)
    write(join(worktree, 'scratch.txt'))
    const outcome = await service(repo).remove(KEY, 0)
    expect(outcome).toEqual({ ok: false, error: { code: 'stateChanged' } })
    expect(existsSync(worktree)).toBe(true)
  })

  it('remove_deletes_the_worktree_when_the_count_matches', async () => {
    const repo = devRepo()
    const worktree = addWorktree(repo, KEY)
    write(join(worktree, 'scratch.txt'))
    write(join(worktree, 'docs', KEY, 'ticket.md'), 'notes')
    const outcome = await service(repo).remove(KEY, 2)
    expect(outcome).toEqual({ ok: true })
    expect(existsSync(worktree)).toBe(false)
    // The ticket docs were copied up to the main checkout first.
    expect(readFileSync(join(repo, 'docs', KEY, 'ticket.md'), 'utf8')).toBe('notes')
  })

  it('remove_refuses_unpushed_commits', async () => {
    const repo = devRepo()
    const worktree = addWorktree(repo, KEY)
    write(join(worktree, 'work.txt'))
    git(worktree, '-c', 'user.email=t@e.com', '-c', 'user.name=T', 'add', '-A')
    git(worktree, '-c', 'user.email=t@e.com', '-c', 'user.name=T', 'commit', '-m', 'work')
    const outcome = await service(repo).remove(KEY, 0)
    expect(outcome).toEqual({
      ok: false,
      error: { code: 'kept', reasons: [{ code: 'unpushed', count: 1 }] },
    })
    expect(existsSync(worktree)).toBe(true)
  })

  it('remove_keeps_the_folder_when_git_cannot_list_worktrees', async () => {
    const notARepo = mkdtempSync(join(tmpdir(), 'workday-norepo-'))
    const folder = join(notARepo, '.claude', 'worktrees', KEY)
    write(join(folder, 'precious.txt'))
    const worktrees = [{ repository: 'Backend', path: folder }]
    const error = await removeWorktrees(notARepo, KEY, worktrees, () => undefined)
    expect(error).toEqual({ code: 'worktreeUnreadable', repository: 'Backend' })
    expect(existsSync(join(folder, 'precious.txt'))).toBe(true)
  })

  it('remove_unlinks_the_node_modules_junction_and_keeps_its_target', async () => {
    const repo = devRepo()
    write(join(repo, '.git', 'info', 'exclude'), 'node_modules\n')
    const worktree = addWorktree(repo, KEY)
    const real = mkdtempSync(join(tmpdir(), 'workday-nm-'))
    write(join(real, 'pkg', 'index.js'))
    symlinkSync(real, join(worktree, 'node_modules'), 'junction')
    expect(await service(repo).remove(KEY, 0)).toEqual({ ok: true })
    expect(existsSync(worktree)).toBe(false)
    expect(existsSync(join(real, 'pkg', 'index.js'))).toBe(true)
  })
})

describe('slim', () => {
  function docsFixture(): { repo: string; docs: string } {
    const repo = devRepo()
    const docs = join(repo, 'docs', KEY)
    for (const file of [
      'plan.md',
      'ticket.md',
      'ticket.2026-10-19.bak.md',
      'Plan-Review.md',
      'migrate.sql',
      'Translation.sql',
      'revert.sql',
      'sql/prod-check.sql',
      'sql/Data.CSV',
      'attachments/a.png',
      'sandbox/mock.json',
      'local-test/drop.sql',
      'local-test/audit.json',
      'bugs/MDP-2/extra.sql',
      'bugs/MDP-2/test-plan.md',
      'bugs/MDP-2/Schema_Migrate.sql',
      'bugs/loose.sql',
    ]) {
      write(join(docs, file))
    }
    return { repo, docs }
  }

  it('slim_keeps_migration_sql_and_local_test', async () => {
    const { repo, docs } = docsFixture()
    expect(await service(repo).slim(KEY)).toEqual({ ok: true })
    for (const kept of [
      'plan.md',
      'ticket.md',
      'migrate.sql',
      'Translation.sql',
      'revert.sql',
      'local-test/drop.sql',
      'local-test/audit.json',
      'bugs/MDP-2/Schema_Migrate.sql',
      'bugs/loose.sql',
    ]) {
      expect(existsSync(join(docs, kept)), kept).toBe(true)
    }
    for (const gone of [
      'ticket.2026-10-19.bak.md',
      'Plan-Review.md',
      'sql/prod-check.sql',
      'sql/Data.CSV',
      'attachments',
      'sandbox',
      'bugs/MDP-2/extra.sql',
      'bugs/MDP-2/test-plan.md',
    ]) {
      expect(existsSync(join(docs, gone)), gone).toBe(false)
    }
  })

  it('slimTargets lists nothing for a missing folder', () => {
    expect(slimTargets(join(tmpdir(), 'workday-missing-docs'))).toEqual([])
  })

  it('slim refuses while the ticket still has a worktree', async () => {
    const { repo } = docsFixture()
    addWorktree(repo, KEY)
    expect(await service(repo).slim(KEY)).toEqual({ ok: false, error: { code: 'hasWorktree' } })
  })
})

describe('rows', () => {
  it('is empty until the dev repo is set', async () => {
    expect(await service(null).rows()).toEqual([])
  })

  it('reads a clean worktree as check (not merged) and a docs-only ticket as noWorktree', async () => {
    const repo = devRepo()
    addWorktree(repo, KEY)
    write(join(repo, 'docs', 'MDP-2', 'attachments', 'a.bin'), 'abcd')
    const rows = await service(repo).rows()
    expect(rows.map((row) => [row.ticketKey, row.verdict])).toEqual([
      [KEY, 'check'],
      ['MDP-2', 'noWorktree'],
    ])
    expect(rows[0]?.reasons).toEqual([{ code: 'notMerged' }])
    expect(rows[1]?.slimBytes).toBe(4)
    expect((await findWorktrees(repo, null, KEY)).length).toBe(1)
  })
})
