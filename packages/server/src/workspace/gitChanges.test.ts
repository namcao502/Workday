import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FileChange } from '@workday/core'
import { listChanges, readDiff, type ChangeSet } from './gitChanges.js'

const KEY = 'MDP-1'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

class Repo {
  readonly path: string

  constructor() {
    const root = mkdtempSync(join(tmpdir(), 'workday-chg-'))
    const origin = join(root, 'origin.git')
    this.path = join(root, 'repo')
    git(root, 'init', '--bare', '-b', 'main', origin)
    git(root, 'clone', origin, this.path)
    git(this.path, 'config', 'user.email', 'test@example.com')
    git(this.path, 'config', 'user.name', 'Test')
    git(this.path, 'config', 'commit.gpgsign', 'false')
    git(this.path, 'checkout', '-b', 'main')
    this.write('README.md', 'seed')
    this.commit('seed')
    git(this.path, 'push', '-u', 'origin', 'main')
  }

  write(name: string, text: string | Buffer): void {
    const file = join(this.path, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }

  commit(message: string): void {
    git(this.path, 'add', '-A')
    git(this.path, 'commit', '-m', message)
  }

  git(...args: string[]): string {
    return git(this.path, ...args)
  }

  startTicket(): void {
    git(this.path, 'checkout', '-b', KEY)
  }
}

async function listed(repo: Repo, localOnly: string[] = []): Promise<ChangeSet> {
  const set = await listChanges(repo.path, KEY, localOnly)
  expect(set).not.toBeNull()
  return set as ChangeSet
}

function first(set: ChangeSet): FileChange {
  const file = set.files[0]
  if (file === undefined) {
    throw new Error('no changed file')
  }
  return file
}

describe('listChanges', () => {
  it('on the ticket branch reports committed, edited and untracked files', async () => {
    const repo = new Repo()
    repo.startTicket()
    repo.write('committed.cs', 'c')
    repo.commit('add')
    repo.write('README.md', 'edited')
    repo.write('untracked.cs', 'u')
    const set = await listed(repo)
    expect(set.isWorkingTree).toBe(true)
    expect(set.files).toEqual([
      { path: 'committed.cs', status: 'A' },
      { path: 'README.md', status: 'M' },
      { path: 'untracked.cs', status: 'A' },
    ])
  })

  it('on the -dev branch lists only the ticket commits', async () => {
    const repo = new Repo()
    repo.startTicket()
    repo.write('ticket.cs', 't')
    repo.commit('ticket')
    repo.git('checkout', '-b', `${KEY}-dev`)
    repo.write('development.cs', 'd')
    repo.commit('dev')
    repo.write('untracked.cs', 'u')
    const set = await listed(repo)
    expect(set.isWorkingTree).toBe(false)
    expect(set.tip).toBe(`refs/heads/${KEY}`)
    expect(set.files).toEqual([{ path: 'ticket.cs', status: 'A' }])
  })

  it('reports a deleted file and handles unicode paths', async () => {
    const repo = new Repo()
    repo.startTicket()
    repo.git('rm', 'README.md')
    repo.write('thu muc/tep moi.cs', 'x')
    repo.write('thư mục/tệp.cs', 'x')
    repo.commit('change')
    const set = await listed(repo)
    expect(set.files.map((file) => `${file.status} ${file.path}`)).toEqual([
      'D README.md',
      'A thu muc/tep moi.cs',
      'A thư mục/tệp.cs',
    ])
  })

  it('drops localOnlyPaths', async () => {
    const repo = new Repo()
    repo.write('src/docker-compose.yml', 'original')
    repo.commit('compose')
    repo.git('push', 'origin', 'main')
    repo.startTicket()
    repo.write('src/docker-compose.yml', 'local edit')
    expect((await listed(repo, ['src/docker-compose.yml'])).files).toEqual([])
  })

  it('is null when origin/main is missing', async () => {
    const repo = new Repo()
    repo.startTicket()
    repo.git('remote', 'remove', 'origin')
    expect(await listChanges(repo.path, KEY, [])).toBeNull()
  })

  it('without a ticket branch compares HEAD with the working tree', async () => {
    const repo = new Repo()
    repo.write('untracked.cs', 'u')
    const set = await listed(repo)
    expect(set.tip).toBe('HEAD')
    expect(set.isWorkingTree).toBe(true)
    expect(set.files).toEqual([{ path: 'untracked.cs', status: 'A' }])
  })

  it('with no ticket key (terminal tab) lists unpushed commits and uncommitted files', async () => {
    const repo = new Repo()
    repo.write('pushed-not.cs', 'p')
    repo.commit('unpushed')
    repo.write('README.md', 'edited')
    repo.write('new.cs', 'n')
    const set = await listChanges(repo.path, null, [])
    expect(set?.files).toEqual([
      { path: 'new.cs', status: 'A' },
      { path: 'pushed-not.cs', status: 'A' },
      { path: 'README.md', status: 'M' },
    ])
  })

  it('with no ticket key and no origin/main falls back to HEAD', async () => {
    const repo = new Repo()
    repo.write('old.cs', 'o')
    repo.commit('local')
    repo.git('remote', 'remove', 'origin')
    repo.write('README.md', 'edited')
    const set = await listChanges(repo.path, null, [])
    expect(set?.files).toEqual([{ path: 'README.md', status: 'M' }])
  })

  it('on a bug branch off the parent lists only the bug work', async () => {
    const repo = new Repo()
    repo.startTicket()
    repo.write('parent.cs', 'p')
    repo.commit('parent')
    repo.git('push', 'origin', KEY)
    repo.git('checkout', '-b', 'MDP-2', `origin/${KEY}`)
    repo.write('bug.cs', 'b')
    repo.commit('bug')
    repo.write('parent.cs', 'parent fixed')
    const set = await listed(repo)
    expect(set.bugKey).toBe('MDP-2')
    expect(set.files).toEqual([
      { path: 'bug.cs', status: 'A' },
      { path: 'parent.cs', status: 'M' },
    ])
  })

  it('on a sub-task branch compares with the parent branch', async () => {
    const repo = new Repo()
    repo.git('checkout', '-b', 'MDP-9')
    repo.write('parent.cs', 'p')
    repo.commit('parent')
    repo.git('push', 'origin', 'MDP-9')
    repo.git('checkout', '-b', KEY, 'origin/MDP-9')
    repo.git('config', `branch.${KEY}.parentTicket`, 'MDP-9')
    repo.write('sub.cs', 's')
    expect((await listed(repo)).files).toEqual([{ path: 'sub.cs', status: 'A' }])
  })
})

describe('readDiff', () => {
  it('returns both sides as LF text', async () => {
    const repo = new Repo()
    repo.write('a.txt', 'one\r\ntwo')
    repo.commit('a')
    repo.git('push', 'origin', 'main')
    repo.startTicket()
    repo.write('a.txt', 'one\r\nthree')
    const set = await listed(repo)
    expect(await readDiff(repo.path, set, first(set))).toEqual({
      kind: 'full',
      original: 'one\ntwo',
      modified: 'one\nthree',
    })
  })

  it('shows an excerpt when a blob is over 1 MB', async () => {
    const repo = new Repo()
    const lines = Array.from({ length: 150_000 }, (_, index) => `line ${String(index + 1)}`)
    repo.write('big.txt', `${lines.join('\n')}\n`)
    repo.commit('big')
    repo.git('push', 'origin', 'main')
    repo.startTicket()
    lines[49] = 'changed 50'
    repo.write('big.txt', `${lines.join('\n')}\n`)
    const set = await listed(repo)
    const diff = await readDiff(repo.path, set, first(set))
    expect(diff.kind).toBe('excerpt')
    if (diff.kind === 'excerpt') {
      expect(diff.modified).toContain('changed 50')
      expect(diff.modifiedLines.slice(0, 3)).toEqual([0, 47, 48])
    }
  })

  it('shows an excerpt for an untracked oversized file', async () => {
    const repo = new Repo()
    repo.startTicket()
    repo.write('new.txt', 'x\n'.repeat(600_000))
    const set = await listed(repo)
    const diff = await readDiff(repo.path, set, first(set))
    expect(diff.kind).toBe('excerpt')
  })

  it('is binary for a binary file', async () => {
    const repo = new Repo()
    repo.write('data.bin', Buffer.from([97, 0, 98]))
    repo.commit('bin')
    repo.git('push', 'origin', 'main')
    repo.startTicket()
    repo.write('data.bin', Buffer.from([97, 0, 99]))
    const set = await listed(repo)
    expect(await readDiff(repo.path, set, first(set))).toEqual({ kind: 'binary' })
  })

  it('reads the ticket branch, not the working file, on the -dev branch', async () => {
    const repo = new Repo()
    repo.startTicket()
    repo.write('README.md', 'ticket')
    repo.commit('edit')
    repo.git('checkout', '-b', `${KEY}-dev`)
    repo.write('README.md', 'uncommitted on dev')
    const set = await listed(repo)
    expect(await readDiff(repo.path, set, first(set))).toEqual({
      kind: 'full',
      original: 'seed',
      modified: 'ticket',
    })
  })
})
