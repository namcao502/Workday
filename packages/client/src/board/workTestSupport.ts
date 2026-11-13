import type {
  BoardRow,
  BoardView,
  EpicTicket,
  Suggestion,
  TicketPr,
  TrackedPr,
  WorkView,
} from '@workday/core'

export function workView(overrides: Partial<WorkView> = {}): WorkView {
  return {
    adoConnected: true,
    lastPrCheck: null,
    groups: [],
    attention: 0,
    prs: {},
    readyToTest: {},
    suggestions: null,
    ...overrides,
  }
}

export function boardRow(
  key: string,
  summary: string,
  section: BoardRow['section'] = 'inProgress',
  status = 'In Progress',
): BoardRow {
  return {
    ticket: {
      key,
      summary,
      dueDate: null,
      eta: null,
      devPriority: null,
      status,
      statusCategory: null,
      issueType: null,
      timeSpentSeconds: null,
      updated: null,
      parentKey: null,
    },
    section,
    dueUrgency: 'none',
    url: `https://example.atlassian.net/browse/${key}`,
  }
}

export function boardOf(rows: readonly BoardRow[]): BoardView {
  return { connected: true, lastPoll: null, today: '2026-11-12', rows }
}

export function ticketPr(branch: string, overrides: Partial<TrackedPr> = {}): TicketPr {
  return {
    key: `MDP-1|${branch}|7`,
    branch,
    pullRequestId: 7,
    pr: {
      status: 'active',
      repository: 'Portal',
      url: 'https://dev.azure.com/o/p/_git/Portal/pullrequest/7',
      commentCount: 0,
      openThreadCount: null,
      build: 'succeeded',
      merge: 'clean',
      vote: 'noVote',
      mergeCommit: null,
      mergedAt: null,
      targetBranch: null,
      ...overrides,
    },
  }
}

export function suggestion(key: string, overrides: Partial<EpicTicket> = {}): Suggestion {
  return {
    ticket: {
      key,
      summary: `Summary of ${key}`,
      status: 'To Do',
      issueType: 'Task',
      priority: null,
      devPriority: null,
      dueDate: null,
      ...overrides,
    },
    score: 0,
    similarKey: null,
    urgent: false,
  }
}
