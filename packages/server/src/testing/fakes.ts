import type {
  BoardState,
  DeployBuild,
  EpicTicket,
  HoursLog,
  HoursWrite,
  HrmTask,
  PrLookup,
  PrReviewRequest,
  PullRequests,
  PullRequestsValidation,
  SheetError,
  SheetLog,
  SheetRead,
  SheetWrite,
  Ticket,
  TicketTracker,
  TrackerValidation,
} from '@workday/core'

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
  readonly mine = new Set<string>()
  readonly getTicketCalls: string[] = []
  readonly filterMineCalls: (readonly string[])[] = []
  filterMineFails = false
  assignedCalls = 0
  assigned: () => Promise<Readonly<Record<string, Ticket>>> = () => Promise.resolve({})
  readonly transitionCalls: { readonly key: string; readonly status: string }[] = []
  readonly assignCalls: string[] = []
  validation: TrackerValidation = { ok: true, displayName: 'Test User' }
  transitionResult = true
  assignResult: string | null = null
  epicTickets: readonly EpicTicket[] = []
  readonly epicSearches: string[] = []

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

  filterMine(keys: readonly string[]): Promise<ReadonlySet<string>> {
    this.filterMineCalls.push(keys)
    if (this.filterMineFails) {
      return Promise.reject(new Error('Jira search failed'))
    }
    return Promise.resolve(new Set(keys.filter((key) => this.mine.has(key))))
  }

  ticketUrl(key: string): string {
    return `https://jira.example/browse/${key}`
  }

  transition(key: string, status: string): Promise<boolean> {
    this.transitionCalls.push({ key, status })
    return Promise.resolve(this.transitionResult)
  }

  assignToMe(key: string): Promise<string | null> {
    this.assignCalls.push(key)
    return Promise.resolve(this.assignResult)
  }

  searchEpicTickets(jql: string): Promise<readonly EpicTicket[]> {
    this.epicSearches.push(jql)
    return Promise.resolve(this.epicTickets)
  }
}

// Answers from the fields a test sets; ticketPrs may be replaced to fail or to hold the call.
export class FakePullRequests implements PullRequests {
  readonly ticketPrsCalls: string[] = []
  validation: PullRequestsValidation = { ok: true, displayName: 'Test User' }
  lookup: PrLookup = { prs: [], complete: true }
  requests: readonly PrReviewRequest[] = []
  builds: readonly DeployBuild[] = []

  validate(): Promise<PullRequestsValidation> {
    return Promise.resolve(this.validation)
  }

  ticketPrs(ticketKey: string): Promise<PrLookup> {
    this.ticketPrsCalls.push(ticketKey)
    return Promise.resolve(this.lookup)
  }

  reviewRequests(): Promise<readonly PrReviewRequest[]> {
    return Promise.resolve(this.requests)
  }

  devDeployBuilds(): Promise<readonly DeployBuild[]> {
    return Promise.resolve(this.builds)
  }
}

// Records every call; each result can be replaced by a test (e.g. with a deferred to hold the call).
export class FakeSheetLog implements SheetLog {
  readonly writes: { readonly date: string; readonly text: string }[] = []
  readonly offWrites: string[] = []
  readonly reads: { readonly dates: readonly string[]; readonly allowSniff: boolean }[] = []
  signInCalls = 0
  write: (date: string) => Promise<SheetWrite> = () => Promise.resolve({ ok: true })
  read: (dates: readonly string[]) => Promise<SheetRead> = (dates) =>
    Promise.resolve({ kind: 'read', cells: Object.fromEntries(dates.map((date) => [date, null])) })
  session: { readonly signedIn: boolean } | SheetError = { signedIn: true }
  signInResult: SheetWrite = { ok: true }

  writeTickets(date: string, text: string): Promise<SheetWrite> {
    this.writes.push({ date, text })
    return this.write(date)
  }

  writeOff(date: string): Promise<SheetWrite> {
    this.offWrites.push(date)
    return this.write(date)
  }

  readTickets(
    dates: readonly string[],
    options: { readonly allowSniff: boolean },
  ): Promise<SheetRead> {
    this.reads.push({ dates, allowSniff: options.allowSniff })
    return this.read(dates)
  }

  checkSession(): Promise<{ readonly signedIn: boolean } | SheetError> {
    return Promise.resolve(this.session)
  }

  signIn(): Promise<SheetWrite> {
    this.signInCalls += 1
    return Promise.resolve(this.signInResult)
  }
}

export class FakeHoursLog implements HoursLog {
  readonly logs: { readonly date: string; readonly tickets: readonly string[] }[] = []
  readonly offDateCalls: { readonly from: string; readonly to: string }[] = []
  validateCalls = 0
  log: (date: string) => Promise<HoursWrite> = () => Promise.resolve({ ok: true })
  offDays: readonly string[] = []
  hrmTasks: readonly HrmTask[] | null = []
  hours: Readonly<Record<string, number | null>> = {}
  validation:
    { readonly ok: true } | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' } = {
    ok: true,
  }

  validate(): Promise<
    { readonly ok: true } | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' }
  > {
    this.validateCalls += 1
    return Promise.resolve(this.validation)
  }

  logTickets(date: string, tickets: readonly string[]): Promise<HoursWrite> {
    this.logs.push({ date, tickets })
    return this.log(date)
  }

  dayHours(dates: readonly string[]): Promise<Readonly<Record<string, number | null>>> {
    return Promise.resolve(
      Object.fromEntries(dates.map((date) => [date, this.hours[date] ?? null])),
    )
  }

  tasks(): Promise<readonly HrmTask[] | null> {
    return Promise.resolve(this.hrmTasks)
  }

  offDates(from: string, to: string): Promise<readonly string[]> {
    this.offDateCalls.push({ from, to })
    return Promise.resolve(this.offDays.filter((date) => date >= from && date <= to))
  }
}
