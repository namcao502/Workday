import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigateTo, navigateToWorkspace } from './pages.js'

describe('navigateTo', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '#/tickets')
    vi.restoreAllMocks()
  })

  it('changes the hash through the history API and still tells the hashchange listeners', () => {
    window.history.replaceState(null, '', '#/tickets')
    const pushState = vi.spyOn(window.history, 'pushState')
    const listener = vi.fn()
    window.addEventListener('hashchange', listener)

    navigateTo('timesheet')
    window.removeEventListener('hashchange', listener)

    // Assigning location.hash is a navigation, which made Edge's app window raise another Edge window.
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#/timesheet')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the page is already shown', () => {
    window.history.replaceState(null, '', '#/workspace')
    const listener = vi.fn()
    const length = window.history.length
    window.addEventListener('hashchange', listener)

    navigateToWorkspace(null)
    window.removeEventListener('hashchange', listener)

    expect(listener).not.toHaveBeenCalled()
    expect(window.history.length).toBe(length)
  })
})
