import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { t } from '../i18n.js'
import { ConnectionStatus } from './ConnectionStatus.js'
import { setConnectionStatus } from './connection.js'

beforeEach(() => {
  vi.useFakeTimers()
  act(() => {
    setConnectionStatus('connecting')
  })
})

afterEach(() => {
  vi.useRealTimers()
})

it('connection status stays hidden while connected', () => {
  render(<ConnectionStatus />)
  act(() => {
    setConnectionStatus('connected')
    vi.advanceTimersByTime(20_000)
  })
  expect(screen.queryByRole('status')).toBeNull()
})

it('shows reconnecting after two seconds without the socket', () => {
  render(<ConnectionStatus />)
  act(() => {
    setConnectionStatus('reconnecting')
  })
  act(() => {
    vi.advanceTimersByTime(1900)
  })
  expect(screen.queryByRole('status')).toBeNull()
  act(() => {
    vi.advanceTimersByTime(200)
  })
  expect(screen.getByRole('status').textContent).toContain(t('shell.reconnecting'))
})

it('turns into lost connection after ten seconds', () => {
  render(<ConnectionStatus />)
  act(() => {
    setConnectionStatus('reconnecting')
  })
  act(() => {
    vi.advanceTimersByTime(10_100)
  })
  const pill = screen.getByRole('status')
  expect(pill.textContent).toContain(t('shell.lostConnection'))
  expect(pill.className).toContain('text-danger')
})

it('hides again once the socket reopens', () => {
  render(<ConnectionStatus />)
  act(() => {
    setConnectionStatus('reconnecting')
  })
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  act(() => {
    setConnectionStatus('connected')
  })
  expect(screen.queryByRole('status')).toBeNull()
})
