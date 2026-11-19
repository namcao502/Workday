import type { FilesGroupView } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { parseFileLink, resolveFileLink } from './fileLinks.js'

const GROUPS: readonly FilesGroupView[] = [
  {
    id: 'docs',
    label: 'Docs - MDP-1',
    root: 'C:\\Project\\Backend\\.claude\\worktrees\\MDP-1\\docs\\MDP-1',
    paths: ['plan.md'],
    error: null,
  },
  {
    id: 'wt0',
    label: 'BE - Backend',
    root: 'C:\\Project\\Backend\\.claude\\worktrees\\MDP-1',
    paths: ['docs/MDP-1/plan.md', 'src/Api/OrderController.cs', 'src/Web/app.ts'],
    error: null,
  },
  {
    id: 'wt1',
    label: 'FE - Portal',
    root: 'C:/Project/Portal/.claude/worktrees/MDP-1',
    paths: ['src/app/app.ts'],
    error: null,
  },
]

describe('parseFileLink', () => {
  it('reads a path with an optional line, in the forms Claude writes', () => {
    expect(parseFileLink('src/Web/app.ts')).toEqual({ path: 'src/Web/app.ts', line: null })
    expect(parseFileLink('src/Web/app.ts:42')).toEqual({ path: 'src/Web/app.ts', line: 42 })
    expect(parseFileLink('src/Web/app.ts:42:7')).toEqual({ path: 'src/Web/app.ts', line: 42 })
    expect(parseFileLink('src/Web/app.ts#L42')).toEqual({ path: 'src/Web/app.ts', line: 42 })
    expect(parseFileLink('C:\\Project\\x.cs:3')).toEqual({ path: 'C:/Project/x.cs', line: 3 })
    expect(parseFileLink('file:///C:/Project/x.cs')).toEqual({
      path: 'C:/Project/x.cs',
      line: null,
    })
  })

  it('leaves web links, plain words and sentences alone', () => {
    expect(parseFileLink('https://example.com/a.ts')).toBeNull()
    expect(parseFileLink('mailto:a@b.c')).toBeNull()
    expect(parseFileLink('npm')).toBeNull()
    expect(parseFileLink('see the plan.md file')).toBeNull()
    expect(parseFileLink('#section')).toBeNull()
  })
})

describe('resolveFileLink', () => {
  it('maps a full path to the group whose folder holds it, the deepest folder first', () => {
    expect(
      resolveFileLink(
        'C:\\Project\\Backend\\.claude\\worktrees\\MDP-1\\src\\Api\\OrderController.cs:12',
        GROUPS,
      ),
    ).toEqual({ group: 'wt0', path: 'src/Api/OrderController.cs', line: 12 })
    // The docs folder sits inside the worktree: the docs group is the closer one.
    expect(
      resolveFileLink('c:/project/backend/.claude/worktrees/MDP-1/docs/MDP-1/plan.md', GROUPS),
    ).toEqual({ group: 'docs', path: 'plan.md', line: null })
  })

  it('maps a relative path to the group listing it, else to a unique file ending with it', () => {
    expect(resolveFileLink('src/app/app.ts:5', GROUPS)).toEqual({
      group: 'wt1',
      path: 'src/app/app.ts',
      line: 5,
    })
    expect(resolveFileLink('./Api/OrderController.cs', GROUPS)).toEqual({
      group: 'wt0',
      path: 'src/Api/OrderController.cs',
      line: null,
    })
    // app.ts ends two paths: no guess.
    expect(resolveFileLink('app.ts', GROUPS)).toBeNull()
  })

  it('is null for a file no group has', () => {
    expect(resolveFileLink('src/missing.ts', GROUPS)).toBeNull()
    expect(resolveFileLink('D:/elsewhere/x.ts', GROUPS)).toBeNull()
  })
})

it('a group with no folder (an older server) maps no full path and does not throw', () => {
  const groups: readonly FilesGroupView[] = [
    { id: 'wt0', label: 'BE', root: '', paths: ['src/x.ts'], error: null },
  ]
  expect(resolveFileLink('C:/anything/src/x.ts', groups)).toBeNull()
  expect(resolveFileLink('src/x.ts', groups)).toEqual({
    group: 'wt0',
    path: 'src/x.ts',
    line: null,
  })
})
