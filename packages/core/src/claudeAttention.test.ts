import { describe, expect, it } from 'vitest'
import { clearsWhenSeen } from './claudeAttention.js'

describe('clearsWhenSeen', () => {
  it.each([
    ['finished', true],
    ['permission', false],
    ['question', false],
  ] as const)('clearsWhenSeen(%s) -> %s', (reason, expected) => {
    expect(clearsWhenSeen(reason)).toBe(expected)
  })
})
