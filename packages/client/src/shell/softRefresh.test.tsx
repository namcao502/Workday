import { act, renderHook, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../testSupport.js'
import { CHECK_VERSION_EVENT, entryScript } from './newVersion.js'
import { isSoftRefreshKey, useSoftRefresh } from './softRefresh.js'
import { UpdateBanner } from './UpdateBanner.js'

function inAppWindow(standalone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query.includes('standalone'),
  }))
}

function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.querySelectorAll('script[data-test-entry]').forEach((script) => {
    script.remove()
  })
})

it('F5 and Ctrl+R are soft refreshes; Ctrl+Shift+R and Ctrl+F5 stay real reloads', () => {
  expect(isSoftRefreshKey(new KeyboardEvent('keydown', { key: 'F5' }))).toBe(true)
  expect(isSoftRefreshKey(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true }))).toBe(true)
  expect(
    isSoftRefreshKey(new KeyboardEvent('keydown', { key: 'R', ctrlKey: true, shiftKey: true })),
  ).toBe(false)
  expect(isSoftRefreshKey(new KeyboardEvent('keydown', { key: 'F5', ctrlKey: true }))).toBe(false)
  expect(isSoftRefreshKey(new KeyboardEvent('keydown', { key: 'r' }))).toBe(false)
})

it('in the app window F5 refetches every query instead of reloading the page', () => {
  inAppWindow(true)
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  renderHook(useSoftRefresh, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })

  const event = press({ key: 'F5' })

  // A page reload is a URL change, which made Edge raise another Edge window.
  expect(event.defaultPrevented).toBe(true)
  expect(invalidate).toHaveBeenCalledTimes(1)
})

it('in a browser tab F5 is left alone', () => {
  inAppWindow(false)
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  renderHook(useSoftRefresh, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })

  const event = press({ key: 'F5' })

  expect(event.defaultPrevented).toBe(false)
  expect(invalidate).not.toHaveBeenCalled()
})

it('reads the entry script of a built index.html', () => {
  const html =
    '<head><script>x</script><script type="module" crossorigin src="/assets/index-AB12.js"></script>'
  expect(entryScript(html)).toBe('/assets/index-AB12.js')
  expect(entryScript('<p>nothing</p>')).toBeNull()
})

it('offers a reload once the server serves a newer build', async () => {
  const running = document.createElement('script')
  running.type = 'module'
  running.src = '/assets/index-OLD.js'
  running.dataset['testEntry'] = ''
  document.head.append(running)
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response('<script type="module" crossorigin src="/assets/index-NEW.js"></script>'),
      ),
    ),
  )
  renderWithQuery(<UpdateBanner />)
  expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument()

  act(() => {
    window.dispatchEvent(new Event(CHECK_VERSION_EVENT))
  })

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})
