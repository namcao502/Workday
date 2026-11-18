import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { trackAction } from '../api/pendingActions.js'
import { renderWithQuery } from '../testSupport.js'
import { useGlobalBusy } from './useGlobalBusy.js'

function Probe(): React.JSX.Element | null {
  return useGlobalBusy() ? <span>Working...</span> : null
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('shows after a short delay while an action runs and stays a moment after it ends', async () => {
  renderWithQuery(<Probe />)
  let finish: () => void = () => undefined
  const action = trackAction(
    '/api/board/check',
    () => new Promise<void>((resolve) => (finish = resolve)),
  )
  await act(() => vi.advanceTimersByTimeAsync(50))
  expect(screen.queryByText('Working...')).not.toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(150))
  expect(screen.getByText('Working...')).toBeInTheDocument()
  finish()
  await act(() => action)
  await act(() => vi.advanceTimersByTimeAsync(100))
  expect(screen.getByText('Working...')).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(600))
  expect(screen.queryByText('Working...')).not.toBeInTheDocument()
})

it('a fast action never shows the icon', async () => {
  renderWithQuery(<Probe />)
  await act(() => trackAction('/api/board/check', () => Promise.resolve()))
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(screen.queryByText('Working...')).not.toBeInTheDocument()
})
