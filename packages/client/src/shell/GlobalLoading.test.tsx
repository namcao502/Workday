import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { trackAction } from '../api/pendingActions.js'
import { renderWithQuery } from '../testSupport.js'
import { GlobalLoading } from './GlobalLoading.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('shows after a short delay while an action runs and stays a moment after it ends', async () => {
  renderWithQuery(<GlobalLoading />)
  let finish: () => void = () => undefined
  const action = trackAction(() => new Promise<void>((resolve) => (finish = resolve)))
  await act(() => vi.advanceTimersByTimeAsync(50))
  expect(screen.queryByLabelText('Working...')).not.toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(150))
  expect(screen.getByLabelText('Working...')).toBeInTheDocument()
  finish()
  await act(() => action)
  await act(() => vi.advanceTimersByTimeAsync(100))
  expect(screen.getByLabelText('Working...')).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(600))
  expect(screen.queryByLabelText('Working...')).not.toBeInTheDocument()
})

it('a fast action never shows the icon', async () => {
  renderWithQuery(<GlobalLoading />)
  await act(() => trackAction(() => Promise.resolve()))
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(screen.queryByLabelText('Working...')).not.toBeInTheDocument()
})
