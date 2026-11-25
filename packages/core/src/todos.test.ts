import { describe, expect, it } from 'vitest'
import type { DbReviewApproval } from './api.js'
import type { BoardState } from './board.js'
import type { PrTracking, TrackedPr } from './prTracking.js'
import type { StatusFlow } from './statusFlow.js'
import type { TicketContent, TicketUpdate } from './ticket/ticketChanges.js'
import { makeTicket } from './testing/ticketFixture.js'
import type { BugFix } from './bugReply.js'
import { attentionKeys, buildTodos, groupTodos, type TodoInput, type TodoItem } from './todos.js'

const flow: StatusFlow = {
  preWorkStatuses: [],
  reworkStatuses: [],
  readyToTestPath: ['PR & Code Review', 'Deployed to Dev', 'Ready to Test'],
  developerStatuses: ['In Progress', 'To Do'],
}

const emptyBoard: BoardState = { new: {}, inProgress: {}, done: {}, dismissed: {}, seenKeys: [] }

function pr(overrides: Partial<TrackedPr> = {}): TrackedPr {
  return {
    status: 'active',
    repository: 'Backend-DotNet',
    url: 'https://pr',
    commentCount: 0,
    openThreadCount: null,
    build: null,
    merge: null,
    vote: null,
    mergeCommit: null,
    mergedAt: null,
    targetBranch: null,
    ...overrides,
  }
}

function input(overrides: Partial<TodoInput> = {}): TodoInput {
  return {
    board: emptyBoard,
    today: '2026-10-14',
    flow,
    tracking: {},
    repoLabels: {},
    commentAlerts: {},
    reviews: {},
    deploys: {},
    waits: [],
    teams: [],
    dbReviews: [],
    ticketUpdates: {},
    qcBugs: [],
    bugFixes: [],
    ...overrides,
  }
}

const content: TicketContent = {
  summary: 'Title',
  description: '',
  attachments: '',
  dueDate: null,
  eta: null,
  devPriority: null,
}

function update(overrides: Partial<TicketUpdate> = {}): TicketUpdate {
  return {
    viewed: content,
    current: { ...content, summary: 'New title' },
    updated: '2026-10-14T10:00:00.000+0700',
    changedBy: 'An',
    changedAt: '2026-10-14T03:00:00.000Z',
    ...overrides,
  }
}

describe('buildTodos jiraUpdated', () => {
  it('adds an item for a New or In progress ticket with pending fields, newest change first', () => {
    const board = {
      ...emptyBoard,
      new: { 'MDP-1': makeTicket('MDP-1') },
      inProgress: { 'MDP-2': makeTicket('MDP-2', { status: 'In Progress' }) },
    }
    const todos = buildTodos(
      input({
        board,
        ticketUpdates: {
          'MDP-1': update({ changedAt: '2026-10-14T01:00:00.000Z' }),
          'MDP-2': update({ changedBy: null }),
        },
      }),
    )
    expect(todos).toEqual([
      {
        kind: 'jiraUpdated',
        ticketKey: 'MDP-2',
        section: 'inProgress',
        fields: ['summary'],
        changedBy: null,
      },
      {
        kind: 'jiraUpdated',
        ticketKey: 'MDP-1',
        section: 'new',
        fields: ['summary'],
        changedBy: 'An',
      },
    ])
  })

  it('adds none for a ticket without pending fields, a Done ticket or an unknown key', () => {
    const board = {
      ...emptyBoard,
      new: { 'MDP-1': makeTicket('MDP-1') },
      done: { 'MDP-3': makeTicket('MDP-3', { status: 'Done' }) },
    }
    const todos = buildTodos(
      input({
        board,
        ticketUpdates: {
          'MDP-1': update({ current: content }),
          'MDP-3': update(),
          'MDP-9': update(),
        },
      }),
    )
    expect(kinds(todos)).not.toContain('jiraUpdated')
  })
})

function kinds(todos: readonly TodoItem[]): string[] {
  return todos.map((todo) => todo.kind)
}

describe('buildTodos', () => {
  it('orders by kind, Claude questions before finished turns', () => {
    const tracking: PrTracking = { 'MDP-1|dev|5': pr({ status: 'completed' }) }
    const board = {
      ...emptyBoard,
      inProgress: {
        'MDP-1': makeTicket('MDP-1', { status: 'Deployed to Dev' }),
        'MDP-2': makeTicket('MDP-2', { status: 'In Progress', dueDate: '2026-10-01' }),
      },
    }
    const todos = buildTodos(
      input({
        board,
        tracking,
        waits: [
          { session: 'MDP-7', tab: 'MDP-7', ticketKey: 'MDP-7', wait: 'finished' },
          { session: 'claude', tab: 'Terminal x', ticketKey: null, wait: 'permission' },
        ],
      }),
    )
    expect(kinds(todos)).toEqual(['claudeWaiting', 'claudeWaiting', 'readyToTest', 'overdue'])
    expect(todos[0]).toMatchObject({ session: 'claude' })
  })

  it('lists a ready-to-test ticket only when every dev PR merged', () => {
    const board = {
      ...emptyBoard,
      inProgress: { 'MDP-1': makeTicket('MDP-1', { status: 'PR & Code Review' }) },
    }
    const open: PrTracking = { 'MDP-1|dev|5': pr({ status: 'active' }) }
    const merged: PrTracking = { 'MDP-1|dev|5': pr({ status: 'completed' }) }

    expect(buildTodos(input({ board, tracking: open }))).toEqual([])
    expect(buildTodos(input({ board, tracking: merged }))).toEqual([
      {
        kind: 'readyToTest',
        ticketKey: 'MDP-1',
        steps: ['Deployed to Dev', 'Ready to Test'],
        deploy: null,
      },
    ])
  })

  it('lists overdue only for a ticket with the developer, and a new overdue one', () => {
    const board = {
      ...emptyBoard,
      new: { 'MDP-3': makeTicket('MDP-3', { dueDate: '2026-10-01' }) },
      inProgress: {
        'MDP-1': makeTicket('MDP-1', { status: 'In Progress', dueDate: '2026-10-01' }),
        'MDP-2': makeTicket('MDP-2', { status: 'On Hold', dueDate: '2026-10-01' }),
      },
    }
    expect(buildTodos(input({ board }))).toEqual([
      { kind: 'overdue', ticketKey: 'MDP-1', section: 'inProgress' },
      { kind: 'overdue', ticketKey: 'MDP-3', section: 'new' },
    ])
  })

  it('lists jiraDone for an in-progress ticket Jira finished', () => {
    const board = {
      ...emptyBoard,
      inProgress: { 'MDP-1': makeTicket('MDP-1', { statusCategory: 'done' }) },
    }
    expect(buildTodos(input({ board }))).toEqual([{ kind: 'jiraDone', ticketKey: 'MDP-1' }])
  })

  it('lists one blocked row per PR, review requests oldest first, comments newest first', () => {
    const board = {
      ...emptyBoard,
      inProgress: { 'MDP-1': makeTicket('MDP-1', { status: 'In Progress' }) },
      done: { 'MDP-2': makeTicket('MDP-2') },
    }
    const review = (id: number, seen: boolean) => ({
      repository: 'R',
      pullRequestId: id,
      title: 't',
      authorName: 'a',
      ticketKey: null,
      isRequired: false,
      url: 'u',
      seen,
    })
    const todos = buildTodos(
      input({
        board,
        tracking: {
          'MDP-1|main|7': pr({ build: 'failed' }),
          'MDP-2|main|8': pr({ vote: 'approved' }),
        },
        reviews: { a: review(9, false), b: review(3, false), c: review(1, true) },
        commentAlerts: {
          'MDP-1': { count: 1, url: 'u1', at: '2026-10-14T08:00:00Z' },
          'MDP-2': { count: 2, url: 'u2', at: '2026-10-14T09:00:00Z' },
          'MDP-9': { count: 3, url: 'u3', at: '2026-10-14T10:00:00Z' },
        },
      }),
    )
    expect(kinds(todos)).toEqual(['prReview', 'prReview', 'prBlocked', 'prComments', 'prComments'])
    expect(
      todos.filter((todo) => todo.kind === 'prReview').map((todo) => todo.review.pullRequestId),
    ).toEqual([3, 9])
    expect(
      todos.filter((todo) => todo.kind === 'prComments').map((todo) => todo.ticketKey),
    ).toEqual(['MDP-2', 'MDP-1'])
  })
})

const overdue: TodoItem = { kind: 'overdue', ticketKey: 'MDP-1', section: 'inProgress' }
const comments: TodoItem = { kind: 'prComments', ticketKey: 'MDP-1', count: 2, url: 'u' }
const otherComments: TodoItem = { kind: 'prComments', ticketKey: 'MDP-2', count: 1, url: 'u' }

describe('dbReview todos', () => {
  const approval = (ticketKey: string, approvedAt: string): DbReviewApproval => ({
    ticketKey,
    conversationKey: `${ticketKey}|c`,
    channelId: 'db',
    approverName: 'Lead',
    approvedAt,
    sql: 'SQL',
  })

  it('adds a dbReview item after the teams rows and groups it by ticket', () => {
    const todos = buildTodos(
      input({
        dbReviews: [
          approval('MDP-2', '2026-10-14T02:00:00.000Z'),
          approval('MDP-1', '2026-10-14T01:00:00.000Z'),
        ],
        commentAlerts: {},
      }),
    )
    expect(
      todos.map((todo) => [todo.kind, todo.kind === 'dbReview' ? todo.ticketKey : '']),
    ).toEqual([
      ['dbReview', 'MDP-1'],
      ['dbReview', 'MDP-2'],
    ])
    const groups = groupTodos([...todos, comments])
    expect(groups[0]?.items.map((item) => item.kind)).toEqual(['dbReview', 'prComments'])
    expect(groups[0]?.neededNow).toBe(false)
  })
})

describe('groupTodos', () => {
  it('puts a group first when any of its rows is needed now', () => {
    const groups = groupTodos([otherComments, comments, overdue])
    expect(groups.map((group) => group.ticketKey)).toEqual(['MDP-1', 'MDP-2'])
    expect(groups[0]).toMatchObject({ items: [comments, overdue], neededNow: true })
    expect(groups[1]?.neededNow).toBe(false)
  })

  it('keeps a row of no ticket in its own group', () => {
    const waiting: TodoItem = {
      kind: 'claudeWaiting',
      session: 'claude2',
      tab: 'Terminal',
      ticketKey: null,
      wait: 'question',
    }
    const groups = groupTodos([waiting, waiting])
    expect(groups).toHaveLength(2)
    expect(groups[0]?.ticketKey).toBeNull()
  })
})

describe('attentionKeys', () => {
  it('lists one key per needed-now row under the group key', () => {
    const readyToTest: TodoItem = {
      kind: 'readyToTest',
      ticketKey: 'MDP-1',
      steps: [],
      deploy: null,
    }
    const waiting: TodoItem = {
      kind: 'claudeWaiting',
      session: 'claude2',
      tab: 'Terminal',
      ticketKey: null,
      wait: 'question',
    }
    const groups = groupTodos([overdue, readyToTest, waiting, overdue])
    expect(attentionKeys(groups)).toEqual(['MDP-1|overdue', 'claude2|claudeWaiting'])
  })
})

describe('qc bug todos', () => {
  const fix: BugFix = {
    bugKey: 'MDP-9330',
    parentKey: 'MDP-9310',
    summary: 'MDP-9330 x',
    description: 'fixed',
    pullRequests: [],
    draftWrittenAt: '2026-10-14T01:00:00.000Z',
  }
  const bug = makeTicket('MDP-9323', { issueType: 'Defect', dueDate: '2026-10-01' })
  const startedBug = makeTicket('MDP-9331', { issueType: 'Defect' })

  it('adds a qcBugReply then a qcBug item, both needed now, for a bug still New', () => {
    const todos = buildTodos(
      input({
        board: {
          ...emptyBoard,
          new: { [bug.key]: bug },
          inProgress: { [startedBug.key]: startedBug },
        },
        qcBugs: [
          { bug, parentKey: 'MDP-9310' },
          { bug: startedBug, parentKey: 'MDP-9310' },
        ],
        bugFixes: [fix],
      }),
    )
    // The overdue row of the new bug is dropped: the qcBug row already asks for it.
    expect(todos).toEqual([
      { kind: 'qcBugReply', ticketKey: 'MDP-9330', parentKey: 'MDP-9310', fix },
      { kind: 'qcBug', ticketKey: 'MDP-9323', parentKey: 'MDP-9310' },
    ])
    expect(groupTodos(todos).map((group) => group.neededNow)).toEqual([true, true])
  })
})
