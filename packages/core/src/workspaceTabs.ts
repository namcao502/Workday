import { isTicketKey } from './ticketKey.js'

export type TabKind = 'ticket' | 'terminal'

export interface WorkspaceTab {
  readonly id: string // ticket key, or "claude" / "claude2"
  readonly kind: TabKind
  readonly folder: string | null // terminal tab only; null = dev repo
  readonly sessions: readonly string[] // [id, "id~2", ...]; the first is the main one
}

export interface WorkspaceTabsState {
  readonly tabs: readonly WorkspaceTab[]
}

const TERMINAL_NAME = /^claude\d*$/
const FIRST_TERMINAL = 'claude'

export function isTerminalName(name: string): boolean {
  return TERMINAL_NAME.test(name)
}

// "claude", then the lowest free "claude2", "claude3", ...
export function nextTerminalName(usedNames: readonly string[]): string {
  const used = new Set(usedNames)
  if (!used.has(FIRST_TERMINAL)) {
    return FIRST_TERMINAL
  }
  let number = 2
  while (used.has(FIRST_TERMINAL + String(number))) {
    number++
  }
  return FIRST_TERMINAL + String(number)
}

// "<tab>~N" with the lowest free N from 2, so "Claude 2" comes back once it was closed.
export function nextSessionName(tabId: string, sessions: readonly string[]): string {
  let number = 2
  while (sessions.includes(`${tabId}~${String(number)}`)) {
    number++
  }
  return `${tabId}~${String(number)}`
}

export function openTicket(state: WorkspaceTabsState, key: string): WorkspaceTabsState {
  if (!isTicketKey(key) || state.tabs.some((tab) => tab.id === key)) {
    return state
  }
  return { tabs: [...state.tabs, { id: key, kind: 'ticket', folder: null, sessions: [key] }] }
}

export function addTerminal(state: WorkspaceTabsState, folder: string | null): WorkspaceTabsState {
  const id = nextTerminalName(state.tabs.map((tab) => tab.id))
  return { tabs: [...state.tabs, { id, kind: 'terminal', folder, sessions: [id] }] }
}

export function addSession(state: WorkspaceTabsState, tabId: string): WorkspaceTabsState {
  const tab = state.tabs.find((candidate) => candidate.id === tabId)
  if (tab === undefined) {
    return state
  }
  const sessions = [...tab.sessions, nextSessionName(tab.id, tab.sessions)]
  return { tabs: state.tabs.map((candidate) => (candidate === tab ? { ...tab, sessions } : candidate)) }
}

// The main session closes with its tab, never alone.
export function closeSession(
  state: WorkspaceTabsState,
  tabId: string,
  sessionName: string,
): WorkspaceTabsState {
  const tab = state.tabs.find((candidate) => candidate.id === tabId)
  if (tab === undefined || tab.sessions[0] === sessionName || !tab.sessions.includes(sessionName)) {
    return state
  }
  const sessions = tab.sessions.filter((name) => name !== sessionName)
  return { tabs: state.tabs.map((candidate) => (candidate === tab ? { ...tab, sessions } : candidate)) }
}

export function closeTab(state: WorkspaceTabsState, tabId: string): WorkspaceTabsState {
  if (!state.tabs.some((tab) => tab.id === tabId)) {
    return state
  }
  return { tabs: state.tabs.filter((tab) => tab.id !== tabId) }
}
