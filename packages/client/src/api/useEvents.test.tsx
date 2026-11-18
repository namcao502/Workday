import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useEvents, type EventSocket } from './useEvents.js'

afterEach(() => {
  vi.useRealTimers()
})

function setup(): {
  readonly sockets: EventSocket[]
  readonly invalidate: ReturnType<typeof vi.fn>
} {
  const queryClient = new QueryClient()
  const invalidate = vi.fn(() => Promise.resolve())
  queryClient.invalidateQueries = invalidate
  const sockets: EventSocket[] = []
  const factory = (): EventSocket => {
    const socket: EventSocket = { onopen: null, onmessage: null, onclose: null, close: vi.fn() }
    sockets.push(socket)
    return socket
  }
  const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  renderHook(
    () => {
      useEvents(factory)
    },
    { wrapper },
  )
  return { sockets, invalidate }
}

it('the first connection refetches nothing', () => {
  const { sockets, invalidate } = setup()
  sockets[0]?.onopen?.(new Event('open'))
  expect(invalidate).not.toHaveBeenCalled()
})

it('a reconnect refetches everything, since events were missed while it was down', () => {
  vi.useFakeTimers()
  const { sockets, invalidate } = setup()
  sockets[0]?.onopen?.(new Event('open'))
  sockets[0]?.onclose?.(new CloseEvent('close'))
  vi.advanceTimersByTime(2000)
  expect(sockets).toHaveLength(2)
  expect(invalidate).not.toHaveBeenCalled()
  sockets[1]?.onopen?.(new Event('open'))
  expect(invalidate).toHaveBeenCalledWith()
})
