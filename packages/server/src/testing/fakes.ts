import type { BoardState, Ticket, TicketTracker, TrackerValidation } from '@workday/core'

export function makeTicket(key: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    key,
    summary: `Summary of ${key}`,
    dueDate: null,
    eta: null,
    devPriority: null,
    status: 'To Do',
    statusCategory: 'new',
    issueType: 'Task',
    timeSpentSeconds: null,
    updated: null,
    parentKey: null,
    ...overrides,
  }
}

export function boardWith(overrides: Partial<BoardState> = {}): BoardState {
  return { new: {}, inProgress: {}, done: {}, dismissed: {}, seenKeys: [], ...overrides }
}

export interface Deferred<Value> {
  readonly promise: Promise<Value>
  resolve(value: Value): void
  reject(error: unknown): void
}

export function deferred<Value>(): Deferred<Value> {
  let resolvePromise: (value: Value) => void = () => undefined
  let rejectPromise: (error: unknown) => void = () => undefined
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

// Answers from `live`; `assigned` may be replaced by a test to hold or fail the assigned query.
export class FakeTracker implements TicketTracker {
  readonly live = new Map<string, Ticket>()
  readonly failingKeys = new Set<string>()
  readonly getTicketCalls: string[] = []
  assignedCalls = 0
  assigned: () => Promise<Readonly<Record<string, Ticket>>> = () => Promise.resolve({})
  validation: TrackerValidation = { ok: true, displayName: 'Test User' }

  validate(): Promise<TrackerValidation> {
    return Promise.resolve(this.validation)
  }

  getAssignedTickets(): Promise<Readonly<Record<string, Ticket>>> {
    this.assignedCalls += 1
    return this.assigned()
  }

  getTicket(key: string): Promise<Ticket | null> {
    this.getTicketCalls.push(key)
    if (this.failingKeys.has(key)) {
      return Promise.reject(new Error(`Lookup of ${key} failed`))
    }
    return Promise.resolve(this.live.get(key) ?? null)
  }

  ticketUrl(key: string): string {
    return `https://jira.example/browse/${key}`
  }
}
