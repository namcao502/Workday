import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from '../App.js'
import type { EventSocket } from '../api/useEvents.js'
import { jsonResponse, settingsView, stubFetch, stubMatchMedia } from '../testSupport.js'
import { setSession } from './session.js'

afterEach(() => {
  setSession('ok')
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup(): EventSocket[] {
  stubMatchMedia(false)
  stubFetch((url) =>
    url.startsWith('/api/me') ? jsonResponse({ mode: 'local' }) : jsonResponse(settingsView()),
  )
  const sockets: EventSocket[] = []
  const factory = (): EventSocket => {
    const socket: EventSocket = { onopen: null, onmessage: null, onclose: null, close: vi.fn() }
    sockets.push(socket)
    return socket
  }
  render(<App socketFactory={factory} />)
  return sockets
}

function send(socket: EventSocket | undefined, type: string): void {
  act(() => {
    socket?.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type }) }))
  })
}

it('takenByApp shows the overlay and stops reconnecting', async () => {
  const sockets = setup()
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  vi.useFakeTimers()
  send(sockets[0], 'session.takenByApp')
  act(() => {
    sockets[0]?.onclose?.(new CloseEvent('close'))
    vi.advanceTimersByTime(10_000)
  })
  expect(screen.getByText('Workday is open in the desktop app.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Tickets' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(sockets).toHaveLength(1)
})

it('takenByTab offers use here and reconnects on click', async () => {
  const sockets = setup()
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  send(sockets[0], 'session.takenByTab')
  expect(screen.getByText('Workday is open in another tab.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Use here' }))
  expect(await screen.findByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
  expect(sockets).toHaveLength(2)
})
