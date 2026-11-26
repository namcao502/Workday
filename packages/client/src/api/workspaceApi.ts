import type {
  AgentImage,
  AgentRewind,
  ChangeGroupView,
  ChatAnswer,
  ChatView,
  DiffView,
  FileContentView,
  FolderListing,
  FilesGroupView,
  OpenOutcome,
  PastChat,
  StartOutcome,
  WorkspaceView,
} from '@workday/core'
import { isRecord } from '../json.js'
import { allowEditorForeground } from '../shell/desktopHost.js'
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

export function moveTab(id: string, index: number): Promise<void> {
  return expectOk('PUT', `/api/workspace/tabs/${encodeURIComponent(id)}/position`, { index })
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

export async function getFolders(path: string | null): Promise<FolderListing> {
  const query = path === null ? '' : `?path=${encodeURIComponent(path)}`
  const body = await getJson(
    `/api/workspace/folders${query}`,
    (value) => isRecord(value) && Array.isArray(value['folders']),
  )
  return body as FolderListing
}

export async function getFiles(tabId: string): Promise<readonly FilesGroupView[]> {
  const body = await getJson(tabPath(tabId, 'files'), Array.isArray)
  // A server from before groups carried their folder sends none: '' maps no full path, and breaks nothing.
  return (body as readonly FilesGroupView[]).map((group) => ({
    ...group,
    root: typeof (group as { root?: unknown }).root === 'string' ? group.root : '',
  }))
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
  // Grant foreground rights first so a VS Code window that is already open rises to the front.
  allowEditorForeground()
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

export function sendPrompt(
  session: string,
  text: string,
  images: readonly AgentImage[] = [],
): Promise<void> {
  return expectOkWithCode(sessionPath(session, 'prompt'), { text, images })
}

function isPastChat(value: unknown): value is PastChat {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    (value['title'] === null || typeof value['title'] === 'string') &&
    typeof value['modifiedAt'] === 'string' &&
    typeof value['current'] === 'boolean'
  )
}

// The chats of the session's folder, newest first, for /resume.
export async function getPastChats(session: string): Promise<readonly PastChat[]> {
  const body = await getJson(
    sessionPath(session, 'past-chats'),
    (value) => Array.isArray(value) && value.every(isPastChat),
  )
  return body as readonly PastChat[]
}

// The session's next prompt resumes this chat; a working Claude refuses with claudeWorking.
export function resumeChat(session: string, sessionId: string): Promise<void> {
  return expectOkWithCode(sessionPath(session, 'resume'), { sessionId })
}

export function setSessionModel(session: string, model: string): Promise<void> {
  return expectOk('POST', sessionPath(session, 'model'), { model })
}

function isRewind(value: unknown): value is AgentRewind {
  return (
    isRecord(value) &&
    typeof value['canRewind'] === 'boolean' &&
    typeof value['files'] === 'number' &&
    typeof value['insertions'] === 'number' &&
    typeof value['deletions'] === 'number'
  )
}

// A dry run previews what would change; the real call puts the files back.
export async function rewindFiles(
  session: string,
  messageId: string,
  dryRun: boolean,
): Promise<AgentRewind> {
  const path = sessionPath(session, 'rewind')
  const raw = await send('POST', path, { messageId, dryRun })
  if (!raw.ok || !isRewind(raw.body)) {
    throw new ApiError(raw.status, path, null)
  }
  return raw.body
}

export function interruptSession(session: string): Promise<void> {
  return expectOk('POST', sessionPath(session, 'interrupt'))
}

export function answerRequest(session: string, id: string, answer: ChatAnswer): Promise<void> {
  return expectOk('POST', sessionPath(session, `requests/${encodeURIComponent(id)}`), answer)
}
