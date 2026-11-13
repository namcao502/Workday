import type {
  BoardState,
  PrLookup,
  PrRead,
  PullRequests,
  ServerEvent,
  StatusFlow,
  TrackedPr,
} from '@workday/core'
import type { NoticeInput } from '../notices/noticeService.js'
import { boardWith, FakePullRequests, FakeTracker, makeTicket } from './fakes.js'
import { PrService, type PrState } from '../prs/prService.js'
import { EMPTY_PR_STATE } from '../prs/prStore.js'

export const NOW = new Date('2026-11-13T10:00:00Z')
export const PATH = ['PR & Code Review', 'Deployed to Dev', 'Ready to Test']
export const FLOW: StatusFlow = {
  preWorkStatuses: [],
  reworkStatuses: [],
  readyToTestPath: PATH,
  developerStatuses: [],
}

export function pr(
  branch: string,
  status: PrRead['status'],
  overrides: Partial<PrRead> = {},
): PrRead {
  return {
    pullRequestId: 1,
    repository: 'Backend',
    branch,
    status,
    url: `https://ado.example/pr/${branch}`,
    commentCount: 0,
    openThreadCount: null,
    build: 'unknown',
    merge: 'unknown',
    vote: 'unknown',
    mergeCommit: null,
    mergedAt: null,
    targetBranch: null,
    ...overrides,
  }
}

export function tracked(
  status: TrackedPr['status'],
  overrides: Partial<TrackedPr> = {},
): TrackedPr {
  return {
    status,
    repository: 'Backend',
    url: 'https://ado.example/pr',
    commentCount: 0,
    openThreadCount: null,
    build: 'succeeded',
    merge: 'clean',
    vote: 'noVote',
    mergeCommit: null,
    mergedAt: null,
    targetBranch: null,
    ...overrides,
  }
}

export function inProgress(...keys: string[]): BoardState {
  return boardWith({
    inProgress: Object.fromEntries(
      keys.map((key) => [key, makeTicket(key, { status: 'In Progress' })]),
    ),
  })
}

// ticketPrs answers from `lookups` (an Error is thrown); everything the service sends out is recorded.
export class PrHarness {
  readonly ado = new FakePullRequests()
  readonly tracker = new FakeTracker()
  readonly lookups = new Map<string, PrLookup | Error>()
  readonly saved: PrState[] = []
  readonly notices: NoticeInput[] = []
  readonly readPlaces: string[] = []
  readonly events: ServerEvent[] = []
  board: BoardState = boardWith()

  constructor() {
    this.ado.ticketPrs = (key) => {
      this.ado.ticketPrsCalls.push(key)
      const lookup = this.lookups.get(key) ?? { prs: [], complete: true }
      return lookup instanceof Error ? Promise.reject(lookup) : Promise.resolve(lookup)
    }
  }

  createService(initial: Partial<PrState> = {}, client: PullRequests | null = this.ado): PrService {
    return new PrService({
      initialState: { ...EMPTY_PR_STATE, baselineDone: true, reviewBaselineDone: true, ...initial },
      save: (state) => {
        this.saved.push(state)
        return Promise.resolve()
      },
      events: { broadcast: (event) => this.events.push(event) },
      notices: {
        add: (input) => {
          this.notices.push(input)
          return Promise.resolve()
        },
        markReadAt: (place) => {
          this.readPlaces.push(place)
          return Promise.resolve()
        },
      },
      board: { snapshot: () => this.board, refreshTicket: () => Promise.resolve() },
      settings: {
        pullRequests: client,
        tracker: this.tracker,
        flow: FLOW,
        repoLabels: { Backend: 'BE' },
      },
      now: () => NOW,
      logError: () => undefined,
    })
  }
}
