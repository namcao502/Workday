import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PollScheduler } from './pollScheduler.js'

const MINUTE = 60_000

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PollScheduler', () => {
  it('pollScheduler polls at start and every pollMinutes', () => {
    const poll = vi.fn(() => Promise.resolve())
    const scheduler = new PollScheduler(poll)

    scheduler.start(5)
    expect(poll).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5 * MINUTE - 1)
    expect(poll).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(poll).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(5 * MINUTE)
    expect(poll).toHaveBeenCalledTimes(3)

    scheduler.start(10)
    expect(poll).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(5 * MINUTE)
    expect(poll).toHaveBeenCalledTimes(4)

    scheduler.stop()
    vi.advanceTimersByTime(60 * MINUTE)
    expect(poll).toHaveBeenCalledTimes(4)
  })
})
