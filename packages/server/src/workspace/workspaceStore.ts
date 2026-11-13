import { join } from 'node:path'
import { isTerminalName, isTicketKey, MAX_RECENT_FOLDERS, type WorkspaceTab } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'
import { isGuid } from './launchEnvironment.js'

export interface WorkspaceState {
  readonly tabs: readonly WorkspaceTab[]
  readonly sessionIds: Readonly<Record<string, string>> // "<session>|<cwd>" -> claude session id
  readonly recentFolders: readonly string[]
}

export const EMPTY_WORKSPACE: WorkspaceState = { tabs: [], sessionIds: {}, recentFolders: [] }
export { MAX_RECENT_FOLDERS }
const WORKSPACE_FILE = 'workspace.json'
const EXTRA_SESSION_SUFFIX = /^~\d+$/

function isSessionOf(tabId: string, name: string): boolean {
  return (
    name === tabId ||
    (name.startsWith(tabId) && EXTRA_SESSION_SUFFIX.test(name.slice(tabId.length)))
  )
}

// A tab id names files and URLs, so anything but a ticket key or "claudeN" is dropped.
function parseTab(raw: unknown): WorkspaceTab | null {
  if (!isRecord(raw) || typeof raw['id'] !== 'string' || !Array.isArray(raw['sessions'])) {
    return null
  }
  const id = raw['id']
  const kind = isTicketKey(id) ? 'ticket' : isTerminalName(id) ? 'terminal' : null
  const folder = raw['folder'] ?? null
  if (kind === null || (folder !== null && typeof folder !== 'string')) {
    return null
  }
  const extras = raw['sessions'].filter(
    (name: unknown): name is string =>
      typeof name === 'string' && name !== id && isSessionOf(id, name),
  )
  return {
    id,
    kind,
    folder: kind === 'ticket' ? null : folder,
    sessions: [id, ...new Set(extras)],
  }
}

export function parseWorkspaceFile(raw: unknown): WorkspaceState | null {
  if (!isRecord(raw)) {
    return null
  }
  const rawTabs = Array.isArray(raw['tabs']) ? raw['tabs'] : []
  const tabs = rawTabs
    .map(parseTab)
    .filter((tab): tab is WorkspaceTab => tab !== null)
    .filter((tab, index, all) => all.findIndex((other) => other.id === tab.id) === index)
  const rawIds = isRecord(raw['sessionIds']) ? raw['sessionIds'] : {}
  const sessionIds = Object.fromEntries(
    Object.entries(rawIds).filter(
      (entry): entry is [string, string] =>
        entry[0].includes('|') && typeof entry[1] === 'string' && isGuid(entry[1]),
    ),
  )
  const rawRecent = Array.isArray(raw['recentFolders']) ? raw['recentFolders'] : []
  const recentFolders = rawRecent
    .filter((folder: unknown): folder is string => typeof folder === 'string' && folder !== '')
    .slice(0, MAX_RECENT_FOLDERS)
  return { tabs, sessionIds, recentFolders }
}

export function loadWorkspace(dataDir: string): WorkspaceState {
  return readJson(join(dataDir, WORKSPACE_FILE), parseWorkspaceFile, EMPTY_WORKSPACE)
}

export async function saveWorkspace(dataDir: string, state: WorkspaceState): Promise<void> {
  await writeJsonAtomic(join(dataDir, WORKSPACE_FILE), state)
}
