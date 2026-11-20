import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Shell } from './Shell.js'
import { badgeText } from './Sidebar.js'
import { connectedSettings, queued, timesheetView } from '../timesheet/timesheetTestSupport.js'
import {
  jsonResponse,
  renderRemote,
  renderWithQuery,
  stubFetch,
  stubMatchMedia,
} from '../testSupport.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('the sidebar shows the six pages and marks the current one', () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="timesheet" />)
  const sidebar = screen.getByRole('navigation', { name: 'Pages' })
  const names = within(sidebar)
    .getAllByRole('button')
    .map((button) => button.textContent)
  expect(names).toEqual(['Tickets', 'Workspace', 'Timesheet', 'Insights', 'Settings'])
  expect(within(sidebar).getByRole('button', { name: 'Timesheet' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(within(sidebar).getByRole('button', { name: 'Tickets' })).not.toHaveAttribute(
    'aria-current',
  )
})

it('the sidebar indicator sits on the active page', () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  // jsdom has no layout: the nav sits at 10px, the active item 44px below it.
  let activeTop = 54
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top =
      this.tagName === 'NAV' ? 10 : this.getAttribute('aria-current') === 'page' ? activeTop : 0
    return new DOMRect(0, top, 100, 40)
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Shell page="timesheet" />
    </QueryClientProvider>,
  )
  const indicator = screen.getByTestId('nav-indicator')
  expect(indicator.style.top).toBe('44px')
  expect(indicator.style.height).toBe('40px')
  expect(indicator.style.opacity).toBe('1')
  activeTop = 98
  view.rerender(
    <QueryClientProvider client={queryClient}>
      <Shell page="insights" />
    </QueryClientProvider>,
  )
  expect(screen.getByTestId('nav-indicator').style.top).toBe('88px')
  vi.restoreAllMocks()
})

it('the menu button folds the sidebar to icons and remembers it', () => {
  localStorage.clear()
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="timesheet" />)
  fireEvent.click(screen.getByRole('button', { name: 'Collapse or expand the menu' }))
  const sidebar = screen.getByRole('navigation', { name: 'Pages' })
  expect(within(sidebar).getByRole('button', { name: 'Timesheet' }).textContent).toBe('')
  expect(localStorage.getItem('workday.sidebarCollapsed')).toBe('1')
  fireEvent.click(screen.getByRole('button', { name: 'Collapse or expand the menu' }))
  expect(within(sidebar).getByRole('button', { name: 'Timesheet' }).textContent).toBe('Timesheet')
  localStorage.clear()
})

it('below 720px the tab bar replaces the sidebar', () => {
  stubMatchMedia(true)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="tickets" />)
  expect(screen.getByRole('navigation', { name: 'Tabs' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
})

it('the Timesheet item shows a dot when a queued day is past its run', async () => {
  stubMatchMedia(false)
  const view = timesheetView({ queue: [queued('2026-11-11')] })
  stubFetch((url) => jsonResponse(url === '/api/timesheet' ? view : connectedSettings()))
  renderWithQuery(<Shell page="insights" />)
  const item = screen.getByRole('button', { name: 'Timesheet' })
  await waitFor(() => {
    expect(item.querySelector('[data-testid="nav-dot"]')).not.toBeNull()
  })
})

it('remote mode shows every page', () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  renderRemote(<Shell page="tickets" />)
  const sidebar = screen.getByRole('navigation', { name: 'Pages' })
  expect(within(sidebar).getAllByRole('button')).toHaveLength(5)
})

it('remotely the tab bar shows every page too', () => {
  stubMatchMedia(true)
  stubFetch(() => jsonResponse({}, 500))
  renderRemote(<Shell page="settings" />)
  const tabs = screen.getByRole('navigation', { name: 'Tabs' })
  expect(within(tabs).getAllByRole('button')).toHaveLength(5)
})

it('locally every page and action stays available', async () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="tickets" />)
  expect(
    within(screen.getByRole('navigation', { name: 'Pages' })).getAllByRole('button'),
  ).toHaveLength(5)
  expect(await screen.findByRole('button', { name: /Check now/ })).toBeInTheDocument()
})

it('the settings page is not wrapped in .legacy-page', async () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="settings" />)
  const heading = await screen.findByRole('heading', { level: 1 })
  expect(heading.closest('.legacy-page')).toBeNull()
})

it('the Workspace item shows how many sessions are waiting', async () => {
  stubMatchMedia(false)
  const sessions = [
    { name: 'MDP-1', running: true, wait: 'finished', working: false },
    { name: 'MDP-2', running: true, wait: null, working: true },
    { name: 'MDP-3', running: true, wait: 'permission', working: false },
  ]
  const workspace = { configured: true, tabs: [], sessions, starting: [], recentFolders: [] }
  stubFetch((url) => jsonResponse(url === '/api/workspace' ? workspace : {}))
  renderWithQuery(<Shell page="insights" />)
  const item = screen.getByRole('button', { name: /Workspace/ })
  await waitFor(() => {
    expect(within(item).getByTestId('nav-badge')).toHaveTextContent('2')
  })
})

it('sidebar shows the attention count on Board', async () => {
  stubMatchMedia(false)
  const work = {
    adoConnected: true,
    lastPrCheck: null,
    groups: [],
    attention: 3,
    prs: {},
    readyToTest: {},
    suggestions: null,
  }
  stubFetch((url) => jsonResponse(url === '/api/work' ? work : {}))
  renderWithQuery(<Shell page="insights" />)
  const item = screen.getByRole('button', { name: /Tickets/ })
  await waitFor(() => {
    expect(within(item).getByTestId('nav-badge')).toHaveTextContent('3')
  })
})

it('the selected sidebar item has aria-current and an accent text', () => {
  stubMatchMedia(false)
  stubFetch(() => jsonResponse({}, 500))
  renderWithQuery(<Shell page="timesheet" />)
  const item = within(screen.getByRole('navigation', { name: 'Pages' })).getByRole('button', {
    name: 'Timesheet',
  })
  expect(item).toHaveAttribute('aria-current', 'page')
  expect(item).toHaveClass('text-accent')
})

it('the badge text caps at 99+', () => {
  expect(badgeText(7)).toBe('7')
  expect(badgeText(99)).toBe('99')
  expect(badgeText(100)).toBe('99+')
})
