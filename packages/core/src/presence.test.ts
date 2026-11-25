import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTICE_ROUTING, isAtPc, type DesktopPresence } from './presence.js'

const now = '2026-11-25T09:00:00.000Z'

function report(overrides: Partial<DesktopPresence> = {}): DesktopPresence {
  return { idleSeconds: 10, locked: false, at: '2026-11-25T08:59:40.000Z', ...overrides }
}

describe('isAtPc', () => {
  it('is true for a fresh, unlocked, recently used PC', () => {
    expect(isAtPc(report(), DEFAULT_NOTICE_ROUTING, now)).toBe(true)
  })

  it('is false without a report', () => {
    expect(isAtPc(null, DEFAULT_NOTICE_ROUTING, now)).toBe(false)
  })

  it('is false while Windows is locked', () => {
    expect(isAtPc(report({ locked: true }), DEFAULT_NOTICE_ROUTING, now)).toBe(false)
  })

  it('is false once idle reaches the threshold', () => {
    expect(isAtPc(report({ idleSeconds: 299 }), DEFAULT_NOTICE_ROUTING, now)).toBe(true)
    expect(isAtPc(report({ idleSeconds: 300 }), DEFAULT_NOTICE_ROUTING, now)).toBe(false)
  })

  it('is false when the last report is stale (the app quit)', () => {
    expect(isAtPc(report({ at: '2026-11-25T08:58:00.000Z' }), DEFAULT_NOTICE_ROUTING, now)).toBe(
      false,
    )
  })
})
