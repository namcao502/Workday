import type {
  AddTicketResult,
  AdoCheckRequest,
  AdoCheckResult,
  AppError,
  BoardAction,
  BoardView,
  EntryOutcome,
  InsightsView,
  JiraCheckRequest,
  JiraCheckResult,
  SettingsUpdate,
  RunSummary,
  SettingsView,
  TicketCheck,
  TimesheetView,
  TscSessionResult,
  TscSignInResult,
} from '@workday/core'
import { isRecord } from '../json.js'

export const queryKeys = {
  board: ['board'],
  insights: ['insights'],
  me: ['me'],
  notices: ['notices'],
  remote: ['remote'],
  schedules: ['schedules'],
  settings: ['settings'],
  timesheet: ['timesheet'],
  timesheetVisited: ['timesheet-visited'],
  work: ['work'],
  workspace: ['workspace'],
  workspaceWarning: ['workspace-warning'],
} as const

const UNAUTHORIZED = 401

export class ApiError extends Error {
  readonly status: number
  readonly code: PlainCode | null // set when the server named the refusal

  constructor(status: number, path: string, code: PlainCode | null = null) {
    super(`Request to ${path} failed with ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export interface RawResponse {
  readonly status: number
  readonly ok: boolean
  readonly body: unknown
}

// A 401 means the device is not (or no longer) paired; it is thrown so one handler can show the pair page.
export async function send(method: string, path: string, payload?: unknown): Promise<RawResponse> {
  const init: RequestInit =
    payload === undefined
      ? { method }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
  const response = await fetch(path, init)
  const body: unknown = await response.json().catch(() => null)
  if (response.status === UNAUTHORIZED) {
    throw new ApiError(UNAUTHORIZED, path, 'notPaired')
  }
  return { status: response.status, ok: response.ok, body }
}

function isBoardView(value: unknown): value is BoardView {
  return isRecord(value) && typeof value['connected'] === 'boolean' && Array.isArray(value['rows'])
}

function isSettingsView(value: unknown): value is SettingsView {
  return isRecord(value) && isRecord(value['config']) && 'jiraTokenSource' in value
}

// Both AddTicketResult and JiraCheckResult are `{ ok: boolean, ... }` bodies.
export function hasOkFlag(
  value: unknown,
): value is Record<string, unknown> & { readonly ok: boolean } {
  return isRecord(value) && typeof value['ok'] === 'boolean'
}

function expectView<T>(raw: RawResponse, path: string, isView: (value: unknown) => value is T): T {
  if (!raw.ok || !isView(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body
}

export async function getBoard(): Promise<BoardView> {
  return expectView(await send('GET', '/api/board'), '/api/board', isBoardView)
}

// Throws ApiError 409 when Jira is not connected.
export async function checkBoard(): Promise<BoardView> {
  return expectView(await send('POST', '/api/board/check'), '/api/board/check', isBoardView)
}

// A 409 body is a valid `{ ok: false, error }` result, so it is returned, not thrown.
export async function addTicket(input: string): Promise<AddTicketResult> {
  const raw = await send('POST', '/api/board/add', { input })
  if (!hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, '/api/board/add')
  }
  return raw.body.ok ? { ok: true } : expectFailure(raw, '/api/board/add')
}

function expectFailure(
  raw: RawResponse,
  path: string,
): Extract<AddTicketResult | JiraCheckResult | AdoCheckResult, { ok: false }> {
  return { ok: false, error: readError(raw, path) }
}

export function readError(raw: RawResponse, path: string): AppError {
  const error = isRecord(raw.body) ? raw.body['error'] : undefined
  if (!isRecord(error) || typeof error['code'] !== 'string') {
    throw new ApiError(raw.status, path)
  }
  return toAppError(error, raw, path)
}

function readDetail(raw: RawResponse): string | null {
  const detail = isRecord(raw.body) ? raw.body['detail'] : null
  return typeof detail === 'string' ? detail : null
}

type KeyedCode = 'notFound' | 'alreadyOnBoard'
export type PlainCode = Exclude<AppError['code'], KeyedCode>

const PLAIN_CODES: ReadonlySet<string> = new Set<PlainCode>([
  'invalidKey',
  'notConnected',
  'jiraRejected',
  'jiraUnreachable',
  'pollFailed',
  'timesheetNotConfigured',
  'invalidTicket',
  'overEightHours',
  'hrmClosedForToday',
  'tscNoToken',
  'tscDateMismatch',
  'tscFailed',
  'chromeMissing',
  'browserBusy',
  'hrmRejected',
  'hrmUnreachable',
  'remoteDisabled',
  'accessRequired',
  'notPaired',
  'forbidden',
  'pairingClosed',
  'wrongCode',
  'workspaceNotConfigured',
  'worktreeMissing',
  'worktreeFailed',
  'parentBranchMissing',
  'mainNotMerged',
  'sessionNotFound',
  'pathOutside',
  'gitFailed',
  'adoRejected',
  'adoUnreachable',
  'adoNotConfigured',
  'teamsSignedOut',
  'teamsBusy',
  'teamsNotConfigured',
  'teamsUncertain',
  'teamsFailed',
  'claudeNotRunning',
  'claudeWaiting',
  'insightsFailed',
])

export function isPlainCode(code: unknown): code is PlainCode {
  return typeof code === 'string' && PLAIN_CODES.has(code)
}

function toAppError(error: Record<string, unknown>, raw: RawResponse, path: string): AppError {
  const { code, key } = error
  if (isPlainCode(code)) {
    return { code }
  }
  if ((code === 'notFound' || code === 'alreadyOnBoard') && typeof key === 'string') {
    return { code, key }
  }
  throw new ApiError(raw.status, path)
}

export async function boardAction(key: string, action: BoardAction): Promise<BoardView> {
  const path = `/api/board/${encodeURIComponent(key)}/${action}`
  return expectView(await send('POST', path), path, isBoardView)
}

export async function getSettings(): Promise<SettingsView> {
  return expectView(await send('GET', '/api/settings'), '/api/settings', isSettingsView)
}

// Throws ApiError 400 on a bad value or a new Jira URL without a token.
export async function saveSettings(update: SettingsUpdate): Promise<SettingsView> {
  return expectView(await send('PUT', '/api/settings', update), '/api/settings', isSettingsView)
}

export async function checkJira(request: JiraCheckRequest): Promise<JiraCheckResult> {
  const path = '/api/settings/jira/check'
  const raw = await send('POST', path, request)
  if (!raw.ok || !hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  if (raw.body.ok) {
    const displayName = raw.body['displayName']
    return { ok: true, displayName: typeof displayName === 'string' ? displayName : '' }
  }
  return expectFailure(raw, path)
}

export async function checkAdo(request: AdoCheckRequest): Promise<AdoCheckResult> {
  const path = '/api/settings/ado/check'
  const raw = await send('POST', path, request)
  if (!raw.ok || !hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  if (raw.body.ok) {
    const displayName = raw.body['displayName']
    return { ok: true, displayName: typeof displayName === 'string' ? displayName : '' }
  }
  return expectFailure(raw, path)
}

export type HrmCheckResult =
  { readonly ok: true } | { readonly ok: false; readonly error: AppError }

export interface HrmCheckRequest {
  readonly mcpUrl: string
  readonly hrmApiKey?: string
}

// Throws ApiError 400 when no key is saved for this MCP URL and none is sent.
export async function checkHrm(request: HrmCheckRequest): Promise<HrmCheckResult> {
  const path = '/api/settings/hrm/check'
  const raw = await send('POST', path, request)
  if (!raw.ok || !hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body.ok ? { ok: true } : expectFailure(raw, path)
}

export async function checkTscSession(): Promise<TscSessionResult> {
  const path = '/api/settings/tsc/session'
  const raw = await send('POST', path)
  if (!raw.ok || !isRecord(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  if (typeof raw.body['signedIn'] === 'boolean') {
    return { signedIn: raw.body['signedIn'] }
  }
  return { error: readError(raw, path), detail: readDetail(raw) }
}

// Can take minutes: the server waits for the user to sign in in the browser window.
export async function signInTsc(): Promise<TscSignInResult> {
  const path = '/api/settings/tsc/sign-in'
  const raw = await send('POST', path)
  if (!raw.ok || !hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body.ok ? { ok: true } : { ...expectFailure(raw, path), detail: readDetail(raw) }
}

export type QueueResult = { readonly ok: true } | { readonly ok: false; readonly error: AppError }
export type LogResult =
  | { readonly ok: true; readonly outcome: EntryOutcome }
  | { readonly ok: false; readonly error: AppError }
export type DrainResult =
  | { readonly ok: true; readonly summary: RunSummary }
  | { readonly ok: false; readonly error: AppError }
export type LogTarget = 'both' | 'tsc' | 'hrm'

export interface DayRequest {
  readonly date: string
  readonly tickets: readonly string[]
  readonly minutes: readonly number[] | null
}

function isTimesheetView(value: unknown): value is TimesheetView {
  return (
    isRecord(value) && typeof value['tscConnected'] === 'boolean' && Array.isArray(value['queue'])
  )
}

function isEntryOutcome(value: unknown): value is EntryOutcome {
  return isRecord(value) && typeof value['date'] === 'string' && isRecord(value['tsc'])
}

function isRunSummary(value: unknown): value is RunSummary {
  return isRecord(value) && typeof value['kind'] === 'string'
}

export async function getTimesheet(): Promise<TimesheetView> {
  return expectView(await send('GET', '/api/timesheet'), '/api/timesheet', isTimesheetView)
}

// Refusals (over 8h, invalid ticket) come back as a 200 `{ ok: false, error }`.
async function queueCall(method: string, path: string, payload: unknown): Promise<QueueResult> {
  const raw = await send(method, path, payload)
  if (!hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body.ok ? { ok: true } : { ok: false, error: readError(raw, path) }
}

export function addToQueue(request: DayRequest): Promise<QueueResult> {
  return queueCall('POST', '/api/timesheet/queue', request)
}

export function setQueueMinutes(request: {
  readonly date: string
  readonly tickets: readonly string[]
  readonly minutes: readonly number[]
}): Promise<QueueResult> {
  const { date, ...body } = request
  return queueCall('PUT', `/api/timesheet/queue/${date}/minutes`, body)
}

export async function removeFromQueue(date: string, key: string): Promise<void> {
  const path = `/api/timesheet/queue/${date}/${encodeURIComponent(key)}`
  const raw = await send('DELETE', path)
  if (!raw.ok) {
    throw new ApiError(raw.status, path)
  }
}

export async function clearQueue(): Promise<void> {
  const raw = await send('DELETE', '/api/timesheet/queue')
  if (!raw.ok) {
    throw new ApiError(raw.status, '/api/timesheet/queue')
  }
}

// A 409 `{ ok: false, error }` is a refusal the page shows, so it is returned, not thrown.
export async function drainQueue(date?: string): Promise<DrainResult> {
  const path = '/api/timesheet/drain'
  const raw = await send('POST', path, date === undefined ? {} : { date })
  if (isRunSummary(raw.body) && raw.ok) {
    return { ok: true, summary: raw.body }
  }
  if (hasOkFlag(raw.body) && !raw.body.ok) {
    return { ok: false, error: readError(raw, path) }
  }
  throw new ApiError(raw.status, path)
}

export async function logNow(
  request: DayRequest & { readonly target: LogTarget },
): Promise<LogResult> {
  const path = '/api/timesheet/log'
  const raw = await send('POST', path, request)
  if (raw.ok && isEntryOutcome(raw.body)) {
    return { ok: true, outcome: raw.body }
  }
  if (hasOkFlag(raw.body) && !raw.body.ok) {
    return { ok: false, error: readError(raw, path) }
  }
  throw new ApiError(raw.status, path)
}

export async function logOff(date: string): Promise<EntryOutcome> {
  const path = '/api/timesheet/off'
  const raw = await send('POST', path, { date })
  if (!raw.ok || !isEntryOutcome(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body
}

// 202: the result arrives as a timesheet.changed event.
export async function readWeek(monday: string, allowSniff: boolean): Promise<void> {
  const path = '/api/timesheet/week'
  const raw = await send('POST', path, { monday, allowSniff })
  if (!raw.ok) {
    throw new ApiError(raw.status, path)
  }
}

function isTicketCheck(value: unknown): value is TicketCheck {
  return isRecord(value) && typeof value['key'] === 'string' && typeof value['status'] === 'string'
}

export async function checkTickets(keys: readonly string[]): Promise<readonly TicketCheck[]> {
  const path = '/api/timesheet/tickets/check'
  const raw = await send('POST', path, { keys })
  if (!raw.ok || !Array.isArray(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body.filter(isTicketCheck)
}

export interface InsightsRequest {
  readonly kind: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom'
  readonly from?: string // custom only
  readonly to?: string // custom only
}

function isInsightsView(value: unknown): value is InsightsView {
  if (!isRecord(value) || typeof value['readAt'] !== 'string') {
    return false
  }
  const report = value['report']
  return isRecord(report) && Array.isArray(report['rows'])
}

// A refusal with a named code (insightsFailed) is thrown as an ApiError carrying it.
export async function getInsights(request: InsightsRequest): Promise<InsightsView> {
  const query = new URLSearchParams({ kind: request.kind })
  if (request.from !== undefined && request.to !== undefined) {
    query.set('from', request.from)
    query.set('to', request.to)
  }
  const path = `/api/insights?${query.toString()}`
  const raw = await send('GET', path)
  if (raw.ok && isInsightsView(raw.body)) {
    return raw.body
  }
  const error = isRecord(raw.body) ? raw.body['error'] : undefined
  const code = isRecord(error) && isPlainCode(error['code']) ? error['code'] : null
  throw new ApiError(raw.status, path, code)
}
