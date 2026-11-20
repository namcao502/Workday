import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, stubFetch } from '../testSupport.js'
import { getBoard } from './client.js'
import { useEvents, type EventSocket } from './useEvents.js'

afterEach(() => {
  vi.unstubAllGlobals()
  delete window.__workdayDesktop
})

it('fetch sends the client header', async () => {
  const fetchMock = stubFetch(() => jsonResponse({ connected: true, rows: [] }))
  await getBoard()
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-Workday-Client')).toBe('web')
  window.__workdayDesktop = true
  await getBoard()
  expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('X-Workday-Client')).toBe('app')
})

it('socket url carries the client kind', () => {
  const urls: string[] = []
  const factory = (url: string): EventSocket => {
    urls.push(url)
    return { onopen: null, onmessage: null, onclose: null, close: vi.fn() }
  }
  const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  )
  renderHook(
    () => {
      useEvents(factory)
    },
    { wrapper },
  ).unmount()
  window.__workdayDesktop = true
  renderHook(
    () => {
      useEvents(factory)
    },
    { wrapper },
  ).unmount()
  expect(urls).toEqual(['/api/events?client=web', '/api/events?client=app'])
})
