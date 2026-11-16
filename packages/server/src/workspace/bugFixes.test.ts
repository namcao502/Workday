import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { boardWith, makeTicket } from '../testing/fakes.js'
import { loggableKeys, qcBugsOf, readBugFixes } from './bugFixes.js'
import { worktreePathOf } from './ticketWorktrees.js'

const NOW = new Date('2026-11-16T05:00:00.000Z')
const DRAFT = 'Fix title\nFixed the thing.\n\n[BE]\nmain: https://dev.example/pr/1\n'

function repo(): string {
  return mkdtempSync(join(tmpdir(), 'workday-bugfix-'))
}

function writeDraft(
  root: string,
  parent: string,
  bug: string,
  text: string,
  ageDays: number,
): void {
  const folder = join(root, 'docs', parent, 'bugs', bug)
  mkdirSync(folder, { recursive: true })
  const file = join(folder, 'teams-post.md')
  writeFileSync(file, text)
  const at = new Date(NOW.getTime() - ageDays * 24 * 60 * 60 * 1000)
  utimesSync(file, at, at)
}

function bug(key: string, parentKey: string, statusCategory = 'indeterminate') {
  return { bug: makeTicket(key, { issueType: 'Bug', statusCategory }), parentKey }
}

describe('readBugFixes', () => {
  it('bugFixes_picks_the_newer_draft_copy', async () => {
    const dev = repo()
    writeDraft(dev, 'MDP-1', 'MDP-9', 'Old title\nold text\n', 3)
    writeDraft(worktreePathOf(dev, 'MDP-1'), 'MDP-1', 'MDP-9', DRAFT, 1)

    const fixes = await readBugFixes([bug('MDP-9', 'MDP-1')], dev, NOW, () => undefined)

    expect(fixes).toHaveLength(1)
    expect(fixes[0]).toMatchObject({ bugKey: 'MDP-9', parentKey: 'MDP-1', summary: 'Fix title' })
    expect(fixes[0]?.pullRequests).toHaveLength(1)
  })

  it('bugFixes_skips_old_or_unparseable_drafts', async () => {
    const dev = repo()
    writeDraft(dev, 'MDP-1', 'MDP-9', DRAFT, 20)
    writeDraft(dev, 'MDP-1', 'MDP-10', DRAFT, 1)
    writeDraft(dev, 'MDP-1', 'MDP-11', DRAFT, 1)
    // A folder where the draft file should be cannot be read.
    mkdirSync(join(dev, 'docs', 'MDP-1', 'bugs', 'MDP-12', 'teams-post.md'), { recursive: true })
    const errors: string[] = []

    const fixes = await readBugFixes(
      [
        bug('MDP-9', 'MDP-1'),
        bug('MDP-10', 'MDP-1', 'done'),
        bug('MDP-11', 'MDP-1'),
        bug('MDP-12', 'MDP-1'),
        bug('MDP-13', 'MDP-1'),
      ],
      dev,
      NOW,
      (message) => errors.push(message),
    )

    expect(fixes.map((fix) => fix.bugKey)).toEqual(['MDP-11'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('MDP-12')
  })
})

describe('qcBugsOf', () => {
  it('qcBugs_lists_bugs_with_a_parent_in_progress_or_done', () => {
    const parent = makeTicket('MDP-1')
    const board = boardWith({
      inProgress: { 'MDP-1': parent },
      new: {
        'MDP-9': makeTicket('MDP-9', { issueType: 'Defect', linkedKeys: ['MDP-1'] }),
        'MDP-10': makeTicket('MDP-10', { issueType: 'Defect', linkedKeys: ['MDP-77'] }),
        'MDP-11': makeTicket('MDP-11', { issueType: 'Task', linkedKeys: ['MDP-1'] }),
      },
      done: { 'MDP-12': makeTicket('MDP-12', { issueType: 'Bug', linkedKeys: ['MDP-1'] }) },
    })

    expect(qcBugsOf(board).map((item) => [item.bug.key, item.parentKey])).toEqual([
      ['MDP-9', 'MDP-1'],
      ['MDP-12', 'MDP-1'],
    ])
  })

  it('a bug whose only link is itself has no parent', () => {
    const self = makeTicket('MDP-9', { issueType: 'Bug', linkedKeys: ['MDP-9'] })
    expect(qcBugsOf(boardWith({ inProgress: { 'MDP-9': self } }))).toEqual([])
  })
})

describe('loggableKeys', () => {
  it('log_maps_a_bug_key_to_its_parent', () => {
    const parents = new Map([['MDP-9', 'MDP-1']])
    expect(loggableKeys(['MDP-9', 'MDP-1', 'MDP-2'], parents)).toEqual(['MDP-1', 'MDP-2'])
  })
})
