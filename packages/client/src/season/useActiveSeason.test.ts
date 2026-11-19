import { shuffledSeason } from '@workday/core'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useActiveSeason } from './useActiveSeason.js'

const HOUR_MS = 60 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it('on shuffle the season turns over exactly on the hour', () => {
  const start = new Date('2026-11-19T03:59:30Z')
  vi.setSystemTime(start)
  const hour = Math.floor(start.getTime() / HOUR_MS)
  const { result } = renderHook(() => useActiveSeason('shuffle', 'Asia/Ho_Chi_Minh'))
  expect(result.current).toBe(shuffledSeason(hour))
  act(() => {
    vi.advanceTimersByTime(29_000)
  })
  expect(result.current).toBe(shuffledSeason(hour))
  act(() => {
    vi.advanceTimersByTime(2_000)
  })
  expect(result.current).toBe(shuffledSeason(hour + 1))
  act(() => {
    vi.advanceTimersByTime(HOUR_MS)
  })
  expect(result.current).toBe(shuffledSeason(hour + 2))
})

it('auto still follows the date', () => {
  vi.setSystemTime(new Date('2026-12-24T03:00:00Z'))
  const { result } = renderHook(() => useActiveSeason('auto', 'Asia/Ho_Chi_Minh'))
  expect(result.current).toBe('christmas')
})
