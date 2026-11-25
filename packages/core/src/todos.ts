import type { DbReviewApproval } from './api.js'
import type { BugFix } from './bugReply.js'
import type { BoardState } from './board.js'
import { compareTicketKeys } from './ticket/ticketKey.js'
import type { WaitReason } from './claudeAttention.js'
import type { DevDeploy } from './devDeploys.js'
import {
  isBlocked,
  isDevPrMerged,
  latestPrs,
  type CommentAlert,
  type PrReviewRequest,
  type PrTracking,
  type TicketPr,
} from './prTracking.js'
import { isWithDeveloper, readyToTestSteps } from './readyToTest.js'
import type { StatusFlow } from './statusFlow.js'
import type { TeamsAttentionItem } from './teams/teamsAttention.js'
import { dueUrgency, isStatusDone, type Ticket } from './ticket/ticket.js'
import { pendingFields, type TicketField, type TicketUpdate } from './ticket/ticketChanges.js'

// The order of the union is the order on screen.
export type TodoItem =
  | {
      readonly kind: 'claudeWaiting'
      readonly session: string
      readonly tab: string
      readonly ticketKey: string | null
      readonly wait: WaitReason
    }
  | { readonly kind: 'teamsMessage'; readonly ticketKey: string; readonly item: TeamsAttentionItem }
  | { readonly kind: 'dbReview'; readonly ticketKey: string; readonly approval: DbReviewApproval }
  | {
      readonly kind: 'qcBugReply'
      readonly ticketKey: string
      readonly parentKey: string
      readonly fix: BugFix
    }
  | { readonly kind: 'qcBug'; readonly ticketKey: string; readonly parentKey: string }
  | {
      readonly kind: 'jiraUpdated'
      readonly ticketKey: string
      readonly section: 'new' | 'inProgress'
      readonly fields: readonly TicketField[]
      readonly changedBy: string | null
    }
  | {
      readonly kind: 'readyToTest'
      readonly ticketKey: string
      readonly steps: readonly string[]
      readonly deploy: DevDeploy | null
    }
  | { readonly kind: 'prReview'; readonly review: PrReviewRequest }
  | { readonly kind: 'prBlocked'; readonly ticketKey: string; readonly pr: TicketPr }
  | {
      readonly kind: 'prComments'
      readonly ticketKey: string
      readonly count: number
      readonly url: string
    }
  | { readonly kind: 'jiraDone'; readonly ticketKey: string }
  | { readonly kind: 'overdue'; readonly ticketKey: string; readonly section: 'new' | 'inProgress' }

export type TodoKind = TodoItem['kind']

export interface TodoWait {
  readonly session: string
  readonly tab: string
  readonly ticketKey: string | null
  readonly wait: WaitReason
}

export interface TodoInput {
  readonly board: BoardState
  readonly today: string
  readonly flow: StatusFlow
  readonly tracking: PrTracking
  readonly repoLabels: Readonly<Record<string, string>>
  readonly commentAlerts: Readonly<Record<string, CommentAlert>>
  readonly reviews: Readonly<Record<string, PrReviewRequest>>
  readonly deploys: Readonly<Record<string, DevDeploy>>
  readonly waits: readonly TodoWait[]
  readonly teams: readonly TeamsAttentionItem[]
  readonly dbReviews: readonly DbReviewApproval[]
  readonly ticketUpdates: Readonly<Record<string, TicketUpdate>>
  readonly qcBugs: readonly { readonly bug: Ticket; readonly parentKey: string }[]
  // The fixes still waiting for an answer; the server works out which.
  readonly bugFixes: readonly BugFix[]
}

export interface TodoGroup {
  readonly ticketKey: string | null
  readonly items: readonly TodoItem[]
  readonly neededNow: boolean
}

const KIND_ORDER: readonly TodoKind[] = [
  'claudeWaiting',
  'teamsMessage',
  'dbReview',
  'qcBugReply',
  'qcBug',
  'jiraUpdated',
  'readyToTest',
  'prReview',
  'prBlocked',
  'prComments',
  'jiraDone',
  'overdue',
]

const NEEDED_NOW: ReadonlySet<TodoKind> = new Set([
  'claudeWaiting',
  'qcBugReply',
  'qcBug',
  'prBlocked',
  'overdue',
])

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Earliest due first, undated last, then by key, so the order is stable across reloads.
function byDue(tickets: Readonly<Record<string, Ticket>>): readonly Ticket[] {
  return Object.values(tickets).sort(
    (a, b) =>
      Number(a.dueDate === null) - Number(b.dueDate === null) ||
      compareText(a.dueDate ?? '', b.dueDate ?? '') ||
      compareTicketKeys(a.key, b.key),
  )
}

function readyToTestTodos(
  input: TodoInput,
  section: 'inProgress' | 'done',
  tickets: readonly Ticket[],
): readonly TodoItem[] {
  const todos: TodoItem[] = []
  for (const ticket of tickets) {
    const devPrMerged = isDevPrMerged(input.tracking, ticket.key)
    const steps = readyToTestSteps(section, ticket.status, devPrMerged, input.flow.readyToTestPath)
    if (steps !== null) {
      todos.push({
        kind: 'readyToTest',
        ticketKey: ticket.key,
        steps,
        deploy: input.deploys[ticket.key] ?? null,
      })
    }
  }
  return todos
}

// One row per PR even when a PR is tracked under two tickets: the first ticket's.
function blockedPrTodos(input: TodoInput, tickets: readonly Ticket[]): readonly TodoItem[] {
  const todos: TodoItem[] = []
  const seen = new Set<string>()
  for (const ticket of tickets) {
    for (const pr of latestPrs(ticket.key, input.tracking, input.repoLabels)) {
      const prId = `${pr.pr.repository}|${String(pr.pullRequestId)}`
      if (isBlocked(pr.pr) && !seen.has(prId)) {
        seen.add(prId)
        todos.push({ kind: 'prBlocked', ticketKey: ticket.key, pr })
      }
    }
  }
  return todos
}

function commentTodos(input: TodoInput): readonly TodoItem[] {
  const onBoard = (key: string): boolean =>
    Object.hasOwn(input.board.new, key) ||
    Object.hasOwn(input.board.inProgress, key) ||
    Object.hasOwn(input.board.done, key)
  return Object.entries(input.commentAlerts)
    .filter(([key]) => onBoard(key))
    .sort(([, a], [, b]) => compareText(b.at, a.at))
    .map(([key, alert]): TodoItem => ({
      kind: 'prComments',
      ticketKey: key,
      count: alert.count,
      url: alert.url,
    }))
}

// Only New and In progress tickets are watched; the newest change first, one without a time last.
function updatedTodos(input: TodoInput): readonly TodoItem[] {
  const todos: { readonly at: string; readonly item: TodoItem }[] = []
  for (const [key, update] of Object.entries(input.ticketUpdates)) {
    const fields = pendingFields(update)
    const section = Object.hasOwn(input.board.inProgress, key)
      ? 'inProgress'
      : Object.hasOwn(input.board.new, key)
        ? 'new'
        : null
    if (fields.length !== 0 && section !== null) {
      const item: TodoItem = {
        kind: 'jiraUpdated',
        ticketKey: key,
        section,
        fields,
        changedBy: update.changedBy,
      }
      todos.push({ at: update.changedAt ?? '', item })
    }
  }
  return todos
    .sort(
      (a, b) =>
        compareText(b.at, a.at) ||
        compareTicketKeys(ticketKeyOf(a.item) ?? '', ticketKeyOf(b.item) ?? ''),
    )
    .map((todo) => todo.item)
}

// Claude blocked on a permission or a question first; a finished turn can wait a little.
function claudeTodos(waits: readonly TodoWait[]): readonly TodoItem[] {
  return [...waits]
    .sort(
      (a, b) =>
        Number(a.wait === 'finished') - Number(b.wait === 'finished') ||
        compareText(a.session, b.session),
    )
    .map((wait): TodoItem => ({ kind: 'claudeWaiting', ...wait }))
}

// Port of DashboardDataBuilder.Build (to-do part) and DashboardTodos.Build, with the QC bugs.
export function buildTodos(input: TodoInput): readonly TodoItem[] {
  const started = byDue(input.board.inProgress)
  const done = byDue(input.board.done)
  const pending = byDue(input.board.new)
  const todos: TodoItem[] = [...claudeTodos(input.waits)]
  todos.push(...readyToTestTodos(input, 'inProgress', started))
  todos.push(...readyToTestTodos(input, 'done', done))
  for (const ticket of started.filter(isStatusDone)) {
    todos.push({ kind: 'jiraDone', ticketKey: ticket.key })
  }
  // Overdue asks the user to act, so not for a ticket on Hold or waiting in review.
  const overdue = (section: 'new' | 'inProgress', tickets: readonly Ticket[]): void => {
    for (const ticket of tickets) {
      if (
        dueUrgency(ticket, input.today) === 'overdue' &&
        (section === 'new' || isWithDeveloper(ticket.status, input.flow.developerStatuses))
      ) {
        todos.push({ kind: 'overdue', ticketKey: ticket.key, section })
      }
    }
  }
  // A bug still New is one to fix, read against this board; its overdue row would only repeat it.
  const bugsToFix = [...input.qcBugs]
    .filter((qcBug) => Object.hasOwn(input.board.new, qcBug.bug.key))
    .sort((a, b) => compareTicketKeys(a.bug.key, b.bug.key))
  const bugKeys = new Set(bugsToFix.map((qcBug) => qcBug.bug.key))
  overdue('inProgress', started)
  overdue(
    'new',
    pending.filter((ticket) => !bugKeys.has(ticket.key)),
  )
  todos.push(...blockedPrTodos(input, [...started, ...done]))
  // Oldest first: the teammate has waited longest on it.
  const unseen = Object.values(input.reviews)
    .filter((review) => !review.seen)
    .sort((a, b) => a.pullRequestId - b.pullRequestId)
  for (const review of unseen) {
    todos.push({ kind: 'prReview', review })
  }
  todos.push(...commentTodos(input))
  todos.push(...updatedTodos(input))
  // Oldest first, like reviews: that message has waited longest.
  for (const item of [...input.teams].sort((a, b) => compareText(a.sentAt, b.sentAt))) {
    todos.push({ kind: 'teamsMessage', ticketKey: item.ticketKey, item })
  }
  // The approved schema change blocks the ticket's code until its SQL runs on dev; oldest first.
  for (const approval of [...input.dbReviews].sort((a, b) =>
    compareText(a.approvedAt, b.approvedAt),
  )) {
    todos.push({ kind: 'dbReview', ticketKey: approval.ticketKey, approval })
  }
  for (const qcBug of bugsToFix) {
    todos.push({ kind: 'qcBug', ticketKey: qcBug.bug.key, parentKey: qcBug.parentKey })
  }
  for (const fix of [...input.bugFixes].sort((a, b) => compareTicketKeys(a.bugKey, b.bugKey))) {
    todos.push({ kind: 'qcBugReply', ticketKey: fix.bugKey, parentKey: fix.parentKey, fix })
  }
  return todos.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
}

function ticketKeyOf(item: TodoItem): string | null {
  return item.kind === 'prReview' ? null : item.ticketKey
}

function isNeededNow(item: TodoItem): boolean {
  if (item.kind === 'teamsMessage') {
    return item.item.mentionsMe
  }
  return NEEDED_NOW.has(item.kind)
}

// A ticket's rows together under its first (most urgent) one; rows of no ticket keep their place.
function groupByTicket(todos: readonly TodoItem[]): readonly (readonly TodoItem[])[] {
  const groups: TodoItem[][] = []
  const byTicket = new Map<string, TodoItem[]>()
  for (const item of todos) {
    const key = ticketKeyOf(item)
    const existing = key === null ? undefined : byTicket.get(key)
    if (existing !== undefined) {
      existing.push(item)
      continue
    }
    const group = [item]
    groups.push(group)
    if (key !== null) {
      byTicket.set(key, group)
    }
  }
  return groups
}

// A group goes first when any of its rows is needed now; both halves keep the input order.
export function groupTodos(todos: readonly TodoItem[]): readonly TodoGroup[] {
  const groups = groupByTicket(todos).map((items): TodoGroup => ({
    ticketKey: items[0] === undefined ? null : ticketKeyOf(items[0]),
    items,
    neededNow: items.some(isNeededNow),
  }))
  return [
    ...groups.filter((group) => group.neededNow),
    ...groups.filter((group) => !group.neededNow),
  ]
}

// "<ticket or session>|<kind>" per needed-now row; a group's key is its ticket, else its Claude session.
export function attentionKeys(groups: readonly TodoGroup[]): readonly string[] {
  const keys: string[] = []
  for (const group of groups) {
    const first = group.items[0]
    if (first === undefined) {
      continue
    }
    const session = first.kind === 'claudeWaiting' ? first.session : null
    const groupKey = group.ticketKey ?? session ?? first.kind
    for (const item of group.items) {
      if (isNeededNow(item)) {
        keys.push(`${groupKey}|${item.kind}`)
      }
    }
  }
  return [...new Set(keys)]
}
