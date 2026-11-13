import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { docsPath, findWorktrees, worktreePathOf } from './ticketWorktrees.js'

function projects(): string {
  return mkdtempSync(join(tmpdir(), 'workday-tw-'))
}

function worktree(repo: string, key: string): string {
  const path = worktreePathOf(repo, key)
  mkdirSync(path, { recursive: true })
  return path
}

describe('findWorktrees', () => {
  it('lists the dev repo first, then sibling repos by name, skipping repos without one', async () => {
    const root = projects()
    const dev = join(root, 'MDP')
    const backend = worktree(dev, 'MDP-1')
    const portal = worktree(join(root, 'Portal-Angular'), 'MDP-1')
    const admin = worktree(join(root, 'admin-angular'), 'MDP-1')
    mkdirSync(join(root, 'Other-Angular'), { recursive: true })
    worktree(join(root, 'Unrelated'), 'MDP-1')
    const found = await findWorktrees(dev, '*-Angular', 'MDP-1')
    expect(found).toEqual([
      { repository: 'MDP', path: backend },
      { repository: 'admin-angular', path: admin },
      { repository: 'Portal-Angular', path: portal },
    ])
  })

  it('looks only at the dev repo when the glob is null', async () => {
    const root = projects()
    const dev = join(root, 'MDP')
    worktree(join(root, 'Portal-Angular'), 'MDP-1')
    expect(await findWorktrees(dev, null, 'MDP-1')).toEqual([])
    const backend = worktree(dev, 'MDP-1')
    expect(await findWorktrees(dev, null, 'MDP-1')).toEqual([{ repository: 'MDP', path: backend }])
  })

  it('supports a prefix glob and returns nothing when the projects folder is gone', async () => {
    const root = projects()
    const web = worktree(join(root, 'web-app'), 'MDP-1')
    expect(await findWorktrees(join(root, 'MDP'), 'WEB-*', 'MDP-1')).toEqual([
      { repository: 'web-app', path: web },
    ])
    expect(await findWorktrees(join(root, 'gone', 'MDP'), '*-Angular', 'MDP-1')).toEqual([])
  })
})

describe('docsPath', () => {
  it('prefers the dev repo, then the backend worktree, else null', () => {
    const root = projects()
    const dev = join(root, 'MDP')
    expect(docsPath(dev, 'MDP-1')).toBeNull()
    const inWorktree = join(worktree(dev, 'MDP-1'), 'docs', 'MDP-1')
    mkdirSync(inWorktree, { recursive: true })
    expect(docsPath(dev, 'MDP-1')).toBe(inWorktree)
    const inRepo = join(dev, 'docs', 'MDP-1')
    mkdirSync(inRepo, { recursive: true })
    expect(docsPath(dev, 'MDP-1')).toBe(inRepo)
  })
})
