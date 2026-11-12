import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogScheduler } from './logScheduler.js'

const MINUTE = 60_000
const ZONE = 'Asia/Ho_Chi_Minh'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LogScheduler', () => {
  it('logScheduler fires once at logTime and not again the same day', async () => {
    vi.setSystemTime(new Date('2026-11-11T10:58:00Z')) // 17:58 local
    const fire = vi.fn(() => Promise.resolve())
    const scheduler = new LogScheduler(fire)

    scheduler.start('18:00', ZONE)
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(fire).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(MINUTE)
    expect(fire).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60 * MINUTE)
    expect(fire).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE)
    expect(fire).toHaveBeenCalledTimes(2)

    scheduler.stop()
  })

  it('logScheduler started after logTime waits for tomorrow', async () => {
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z')) // 19:00 local
    const fire = vi.fn(() => Promise.resolve())
    const scheduler = new LogScheduler(fire)

    scheduler.start('18:00', ZONE)
    await vi.advanceTimersByTimeAsync(4 * 60 * MINUTE)
    expect(fire).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(19 * 60 * MINUTE)
    expect(fire).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })

  it("moving logTime later after today's run does not fire again today", async () => {
    vi.setSystemTime(new Date('2026-11-11T10:59:00Z')) // 17:59 local
    const fire = vi.fn(() => Promise.resolve())
    const scheduler = new LogScheduler(fire)

    scheduler.start('18:00', ZONE)
    await vi.advanceTimersByTimeAsync(2 * MINUTE)
    expect(fire).toHaveBeenCalledTimes(1)
    scheduler.setLogTime('19:00', ZONE)
    await vi.advanceTimersByTimeAsync(2 * 60 * MINUTE)
    expect(fire).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })
})
