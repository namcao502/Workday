import { describe, expect, it } from 'vitest'
import {
  addSession,
  addTerminal,
  closeSession,
  closeTab,
  nextSessionName,
  nextTerminalName,
  openTicket,
  type WorkspaceTabsState,
} from './workspaceTabs.js'

describe('nextTerminalName', () => {
  it('starts at claude, then fills the lowest gap', () => {
    expect(nextTerminalName([])).toBe('claude')
    expect(nextTerminalName(['claude'])).toBe('claude2')
    expect(nextTerminalName(['claude', 'claude3'])).toBe('claude2')
    expect(nextTerminalName(['claude2'])).toBe('claude')
  })
})

describe('nextSessionName', () => {
  it('takes the lowest free number from 2', () => {
    expect(nextSessionName('MDP-1', ['MDP-1'])).toBe('MDP-1~2')
    expect(nextSessionName('MDP-1', ['MDP-1', 'MDP-1~2', 'MDP-1~4'])).toBe('MDP-1~3')
    expect(nextSessionName('claude2', ['claude2', 'claude2~2'])).toBe('claude2~3')
  })
})

describe('workspace tab reducers', () => {
  const empty: WorkspaceTabsState = { tabs: [] }

  it('opens a ticket tab once and ignores a non-key', () => {
    const opened = openTicket(empty, 'MDP-1')
    expect(opened.tabs).toEqual([{ id: 'MDP-1', kind: 'ticket', folder: null, sessions: ['MDP-1'] }])
    expect(openTicket(opened, 'MDP-1')).toBe(opened)
    expect(openTicket(empty, 'claude')).toBe(empty)
  })

  it('adds terminals with the next free name and a folder', () => {
    const one = addTerminal(empty, 'C:\\repo')
    const two = addTerminal(one, null)
    expect(two.tabs.map((tab) => tab.id)).toEqual(['claude', 'claude2'])
    expect(two.tabs[0]).toEqual({ id: 'claude', kind: 'terminal', folder: 'C:\\repo', sessions: ['claude'] })
  })

  it('adds and closes extra sessions, never the main one', () => {
    const base = openTicket(empty, 'MDP-1')
    const added = addSession(addSession(base, 'MDP-1'), 'MDP-1')
    expect(added.tabs[0]?.sessions).toEqual(['MDP-1', 'MDP-1~2', 'MDP-1~3'])
    const closed = closeSession(added, 'MDP-1', 'MDP-1~2')
    expect(closed.tabs[0]?.sessions).toEqual(['MDP-1', 'MDP-1~3'])
    expect(addSession(closed, 'MDP-1').tabs[0]?.sessions).toEqual(['MDP-1', 'MDP-1~3', 'MDP-1~2'])
    expect(closeSession(closed, 'MDP-1', 'MDP-1')).toBe(closed)
    expect(closeSession(closed, 'MDP-1', 'MDP-1~9')).toBe(closed)
    expect(closeSession(closed, 'nope', 'x')).toBe(closed)
    expect(addSession(closed, 'nope')).toBe(closed)
  })

  it('closes a tab, or returns the same state when it is unknown', () => {
    const state = addTerminal(openTicket(empty, 'MDP-1'), null)
    expect(closeTab(state, 'MDP-1').tabs.map((tab) => tab.id)).toEqual(['claude'])
    expect(closeTab(state, 'nope')).toBe(state)
  })
})
