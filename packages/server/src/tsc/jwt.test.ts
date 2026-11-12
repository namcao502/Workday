import { describe, expect, it } from 'vitest'
import { hasAllScope, jwtExpiry, jwtScopes, pickBroadestToken } from './jwt.js'

function jwt(payload: object): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(payload)}.sig`
}

describe('jwt', () => {
  it('jwtExpiry reads exp and returns null for an opaque token', () => {
    expect(jwtExpiry(jwt({ exp: 1_800_000_000 }))?.getTime()).toBe(1_800_000_000_000)
    expect(jwtExpiry('opaque-token')).toBeNull()
    expect(jwtExpiry(jwt({ sub: 'x' }))).toBeNull()
  })

  it('jwtScopes reads scp, falls back to roles, and is empty for an opaque token', () => {
    expect(jwtScopes(jwt({ scp: 'Files.Read Sites.ReadWrite.All' }))).toBe(
      'Files.Read Sites.ReadWrite.All',
    )
    expect(jwtScopes(jwt({ roles: ['A', 'B'] }))).toBe('A B')
    expect(jwtScopes('opaque-token')).toBe('')
  })

  it('pickBroadestToken prefers .All, then ReadWrite, then the first token', () => {
    const seen = new Map([
      ['first', 'User.Read'],
      ['rw', 'Files.ReadWrite'],
      ['all', 'Sites.ReadWrite.All'],
    ])
    expect(pickBroadestToken(seen)).toBe('all')
    seen.delete('all')
    expect(pickBroadestToken(seen)).toBe('rw')
    seen.delete('rw')
    expect(pickBroadestToken(seen)).toBe('first')
    expect(pickBroadestToken(new Map())).toBeNull()
    expect(hasAllScope('Files.ReadWrite')).toBe(false)
  })
})
