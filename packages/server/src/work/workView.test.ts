import type { JiraConfig, PrTracking, TrackedPr } from '@workday/core'
import { describe, expect, it } from 'vitest'
import { EMPTY_PR_STATE } from '../prs/prStore.js'
import { boardWith, makeTicket } from '../testing/fakes.js'
import { buildWorkView, type WorkViewInput } from './workView.js'

const JIRA: JiraConfig = {
  baseUrl: 'https://jira.example',
  email: 'me@example.com',
  projectKey: 'MDP',
  assignedJql: 'a',
  mineJql: 'm',
  maxResults: 50,
  etaFieldId: null,
  devPriorityFieldId: null,
  statusFlow: {
    preWorkStatuses: [],
    reworkStatuses: [],
    readyToTestPath: [],
    developerStatuses: [],
  },
  suggestions: null,
}

const PR: TrackedPr = {
  status: 'active',
  repository: 'api',
  url: 'https://ado.example/pr/7',
  commentCount: 0,
  openThreadCount: 0,
  build: 'failed',
  merge: 'clean',
  vote: 'noVote',
  mergeCommit: null,
  mergedAt: null,
  targetBranch: 'main',
}

function input(overrides: Partial<WorkViewInput> = {}): WorkViewInput {
  return {
    board: boardWith(),
    today: '2026-11-13',
    jira: JIRA,
    ado: null,
    adoConnected: false,
    prs: EMPTY_PR_STATE,
    lastPrCheck: null,
    sessions: [],
    tabs: [],
    suggestions: null,
    teams: [],
    ...overrides,
  }
}

describe('buildWorkView', () => {
  it('counts needed-now rows and lists PRs only for board tickets', () => {
    const tracking: PrTracking = { 'MDP-1|feature|7': PR, 'MDP-2|feature|8': PR }
    const view = buildWorkView(
      input({
        board: boardWith({
          inProgress: { 'MDP-1': makeTicket('MDP-1', { dueDate: '2026-11-01' }) },
        }),
        ado: { organization: 'o', project: 'p', repoLabels: {}, devPipelineFolder: null },
        adoConnected: true,
        prs: { ...EMPTY_PR_STATE, tracking },
        sessions: [{ name: 'MDP-1', running: true, wait: 'finished', working: false }],
        tabs: [{ id: 'MDP-1', kind: 'ticket', folder: null, sessions: ['MDP-1'] }],
      }),
    )

    expect(Object.keys(view.prs)).toEqual(['MDP-1'])
    expect(view.adoConnected).toBe(true)
    // MDP-1: Claude waiting, overdue and a blocked PR, each a needed-now row.
    expect(view.attention).toBe(3)
    expect(view.groups[0]?.ticketKey).toBe('MDP-1')
  })

  it('has null suggestions when they are not configured', () => {
    const items = { epicKey: 'MDP-1', items: [] }
    const off = buildWorkView(input({ suggestions: items }))
    const on = buildWorkView(
      input({
        jira: { ...JIRA, suggestions: { epicJql: 'e', epicTitlePrefix: 'p', candidatesJql: 'c', mineJql: 'm', selectedStatus: null } },
        suggestions: items,
      }),
    )

    expect(off.suggestions).toBeNull()
    expect(on.suggestions).toEqual(items)
  })
})
