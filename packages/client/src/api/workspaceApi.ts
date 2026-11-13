import type {
  AgentMode,
  ChangeGroupView,
  ChatAnswer,
  ChatView,
  DiffView,
  FileContentView,
  FilesGroupView,
  OpenOutcome,
  StartOutcome,
  WorkspaceView,
} from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, hasOkFlag, isPlainCode, readError, send, type RawResponse } from './client.js'

function isWorkspaceView(value: unknown): value is WorkspaceView {
  return (
    isRecord(value) &&
    typeof value['configured'] === 'boolean' &&
    Array.isArray(value['tabs']) &&
    Array.isArray(value['sessions'])
  )
}

export async function getWorkspace(): Promise<WorkspaceView> {
  const raw = await send('GET', '/api/workspace')
  if (!raw.ok || !isWorkspaceView(raw.body)) {
    throw new ApiError(raw.status, '/api/workspace')
  }
  return raw.body
}

async function expectOk(method: string, path: string, payload?: unknown): Promise<void> {
  const raw = await send(method, path, payload)
  if (!raw.ok) {
    throw new ApiError(raw.status, path)
  }
}

export function addTerminal(folder: string | null): Promise<void> {
  return expectOk('POST', '/api/workspace/terminals', { folder })
}

export function closeTab(id: string): Promise<void> {
  return expectOk('DELETE', `/api/workspace/tabs/${encodeURIComponent(id)}`)
}

export function addSession(tabId: string): Promise<void> {
  return expectOk('POST', `/api/workspace/tabs/${encodeURIComponent(tabId)}/sessions`)
}

export function closeSession(name: string): Promise<void> {
  return expectOk('DELETE', `/api/workspace/sessions/${encodeURIComponent(name)}`)
}

export function markSeen(name: string): Promise<void> {
  return expectOk('POST', `/api/workspace/sessions/${encodeURIComponent(name)}/seen`)
}

function readOutcome(raw: RawResponse, path: string): OpenOutcome {
  if (!hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  if (!raw.body.ok) {
    if (raw.body['confirmRecreate'] === true) {
      return { ok: false, confirmRecreate: true }
    }
    return { ok: false, error: readError(raw, path) }
  }
  const warning = raw.body['warning']
  if (!isRecord(warning)) {
    return { ok: true, warning: null }
  }
  return { ok: true, warning: readError({ ...raw, body: { error: warning } }, path) }
}

export async function startTicket(key: string): Promise<StartOutcome> {
  const path = `/api/workspace/start/${encodeURIComponent(key)}`
  const outcome = readOutcome(await send('POST', path), path)
  if (!outcome.ok && 'confirmRecreate' in outcome) {
    throw new ApiError(409, path)
  }
  return outcome
}

export async function openTicket(key: string, recreate: boolean): Promise<OpenOutcome> {
  const path = `/api/workspace/open/${encodeURIComponent(key)}`
  return readOutcome(await send('POST', path, recreate ? { recreate: true } : {}), path)
}

function tabPath(tabId: string, suffix: string): string {
  return `/api/workspace/tabs/${encodeURIComponent(tabId)}/${suffix}`
}

function fileQuery(group: string, path: string): string {
  return `group=${encodeURIComponent(group)}&path=${encodeURIComponent(path)}`
}

// The URL of an image the server streams; used by <img> directly.
export function rawFileUrl(tabId: string, group: string, path: string): string {
  return `${tabPath(tabId, 'files/raw')}?${fileQuery(group, path)}`
}

async function getJson(path: string, isValid: (body: unknown) => boolean): Promise<unknown> {
  const raw = await send('GET', path)
  if (!raw.ok || !isValid(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body
}

export async function getChanges(tabId: string): Promise<readonly ChangeGroupView[]> {
  const body = await getJson(tabPath(tabId, 'changes'), Array.isArray)
  return body as readonly ChangeGroupView[]
}

export async function getDiff(tabId: string, group: string, path: string): Promise<DiffView> {
  const body = await getJson(
    `${tabPath(tabId, 'changes/diff')}?${fileQuery(group, path)}`,
    (value) => isRecord(value) && typeof value['kind'] === 'string',
  )
  return body as DiffView
}

export async function getFiles(tabId: string): Promise<readonly FilesGroupView[]> {
  const body = await getJson(tabPath(tabId, 'files'), Array.isArray)
  return body as readonly FilesGroupView[]
}

export async function getFileContent(
  tabId: string,
  group: string,
  path: string,
): Promise<FileContentView> {
  const body = await getJson(
    `${tabPath(tabId, 'files/content')}?${fileQuery(group, path)}`,
    (value) => isRecord(value) && typeof value['kind'] === 'string',
  )
  return body as FileContentView
}

export function openInVsCode(tabId: string, group?: string, path?: string): Promise<void> {
  return expectOk('POST', '/api/workspace/vscode', { tabId, group, path })
}

export async function getChat(session: string): Promise<ChatView> {
  const body = await getJson(
    `/api/workspace/sessions/${encodeURIComponent(session)}/chat`,
    (value) => isRecord(value) && Array.isArray(value['messages']),
  )
  return body as ChatView
}

// A refusal names itself in `error.code`; it rides on the ApiError so the composer can show its text.
async function expectOkWithCode(path: string, payload: unknown): Promise<void> {
  const raw = await send('POST', path, payload)
  if (raw.ok) {
    return
  }
  const error = isRecord(raw.body) ? raw.body['error'] : undefined
  const code = isRecord(error) && isPlainCode(error['code']) ? error['code'] : null
  throw new ApiError(raw.status, path, code)
}

function sessionPath(session: string, suffix: string): string {
  return `/api/workspace/sessions/${encodeURIComponent(session)}/${suffix}`
}

export function sendPrompt(session: string, text: string): Promise<void> {
  return expectOkWithCode(sessionPath(session, 'prompt'), { text })
}

export function interruptSession(session: string): Promise<void> {
  return expectOk('POST', sessionPath(session, 'interrupt'))
}

export function setSessionMode(session: string, mode: AgentMode): Promise<void> {
  return expectOk('POST', sessionPath(session, 'mode'), { mode })
}

export function answerRequest(session: string, id: string, answer: ChatAnswer): Promise<void> {
  return expectOk('POST', sessionPath(session, `requests/${encodeURIComponent(id)}`), answer)
}
