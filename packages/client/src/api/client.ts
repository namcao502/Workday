import type {
  AddTicketResult,
  BoardAction,
  BoardView,
  JiraCheckRequest,
  JiraCheckResult,
  SettingsUpdate,
  SettingsView,
} from '@workday/core'
import { isRecord } from '../json.js'

export const queryKeys = {
  board: ['board'],
  settings: ['settings'],
} as const

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, path: string) {
    super(`Request to ${path} failed with ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RawResponse {
  readonly status: number
  readonly ok: boolean
  readonly body: unknown
}

async function send(method: string, path: string, payload?: unknown): Promise<RawResponse> {
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
  return { status: response.status, ok: response.ok, body }
}

function isBoardView(value: unknown): value is BoardView {
  return isRecord(value) && typeof value['connected'] === 'boolean' && Array.isArray(value['rows'])
}

function isSettingsView(value: unknown): value is SettingsView {
  return isRecord(value) && isRecord(value['config']) && 'jiraTokenSource' in value
}

// Both AddTicketResult and JiraCheckResult are `{ ok: boolean, ... }` bodies.
function hasOkFlag(value: unknown): value is Record<string, unknown> & { readonly ok: boolean } {
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
): Extract<AddTicketResult | JiraCheckResult, { ok: false }> {
  const error = isRecord(raw.body) ? raw.body['error'] : undefined
  if (!isRecord(error) || typeof error['code'] !== 'string') {
    throw new ApiError(raw.status, path)
  }
  return { ok: false, error: toAppError(error, raw, path) }
}

function toAppError(
  error: Record<string, unknown>,
  raw: RawResponse,
  path: string,
): Extract<AddTicketResult, { ok: false }>['error'] {
  const { code, key } = error
  switch (code) {
    case 'invalidKey':
    case 'notConnected':
    case 'jiraRejected':
    case 'jiraUnreachable':
    case 'pollFailed':
      return { code }
    case 'notFound':
    case 'alreadyOnBoard':
      if (typeof key === 'string') {
        return { code, key }
      }
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
