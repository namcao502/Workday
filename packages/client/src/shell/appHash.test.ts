import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentHash, replaceHash, setHash, startAppHash } from './appHash.js'

function inAppWindow(standalone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query.includes('standalone'),
  }))
}

function navigationType(type: string): void {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type } as unknown as PerformanceEntry,
  ])
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '#/tickets')
  startAppHash()
})

describe('in the installed app window', () => {
  it('changes the page in memory, never the URL, and still tells the hashchange listeners', () => {
    window.history.replaceState(null, '', '#/tickets')
    inAppWindow(true)
    navigationType('navigate')
    startAppHash()
    const pushState = vi.spyOn(window.history, 'pushState')
    const listener = vi.fn()
    window.addEventListener('hashchange', listener)

    setHash('#/timesheet')
    window.removeEventListener('hashchange', listener)

    // Any URL change there (pushState, even F5) made Edge raise another Edge window.
    expect(pushState).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/tickets')
    expect(currentHash()).toBe('#/timesheet')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('a reload comes back to the page that was open', () => {
    inAppWindow(true)
    navigationType('navigate')
    startAppHash()
    setHash('#/settings/work')

    navigationType('reload')
    startAppHash()

    expect(currentHash()).toBe('#/settings/work')
  })

  it('a fresh launch follows the URL it was opened with (a shortcut or a notice)', () => {
    inAppWindow(true)
    window.sessionStorage.setItem('workday.hash', '#/settings')
    window.history.replaceState(null, '', '#/workspace')
    navigationType('navigate')
    startAppHash()

    expect(currentHash()).toBe('#/workspace')
  })

  it('replaceHash drops a query without an event', () => {
    inAppWindow(true)
    navigationType('navigate')
    startAppHash()
    setHash('#/tickets?update=MDP-1')
    const listener = vi.fn()
    window.addEventListener('hashchange', listener)

    replaceHash('#/tickets')
    window.removeEventListener('hashchange', listener)

    expect(currentHash()).toBe('#/tickets')
    expect(listener).not.toHaveBeenCalled()
  })
})

it('in a browser tab the page stays in the URL hash', () => {
  inAppWindow(false)
  startAppHash()

  setHash('#/insights')

  expect(window.location.hash).toBe('#/insights')
  expect(currentHash()).toBe('#/insights')
})
