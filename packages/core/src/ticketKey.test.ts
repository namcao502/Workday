import { describe, expect, it } from 'vitest'
import { isTicketKey, parseTicketKey, parseTicketKeys } from './ticketKey.js'

describe('parseTicketKey', () => {
  it.each([
    ['MDP-1234', 'MDP-1234'],
    ['mdp-1234', 'MDP-1234'],
    ['Mdp-1234', 'MDP-1234'],
    ['  mdp-1234 ', 'MDP-1234'],
    ['1234', 'MDP-1234'],
    ['https://example.atlassian.net/browse/MDP-1234?focusedCommentId=1', 'MDP-1234'],
  ])('returns the uppercase key for %s', (input, expected) => {
    expect(parseTicketKey(input, 'MDP')).toBe(expected)
  })

  it.each([[''], ['   '], ['MDP-'], ['hello']])('returns null for %j', (input) => {
    expect(parseTicketKey(input, 'MDP')).toBeNull()
  })

  it('parses a key for another project key', () => {
    expect(parseTicketKey('abc-77', 'ABC')).toBe('ABC-77')
    expect(parseTicketKey('MDP-77', 'ABC')).toBeNull()
  })

  it('escapes regex characters in the project key', () => {
    expect(parseTicketKey('AXB-1', 'A.B')).toBeNull()
    expect(parseTicketKey('A.B-1', 'A.B')).toBe('A.B-1')
  })
})

describe('isTicketKey', () => {
  it.each([['MDP-1'], ['AB1-22'], ['A1-5']])('accepts %s', (value) => {
    expect(isTicketKey(value)).toBe(true)
  })

  it.each([['mdp-1'], ['MDP-'], ['1234'], ['A-1'], ['MDP-1 '], ['nope']])('rejects %j', (value) => {
    expect(isTicketKey(value)).toBe(false)
  })
})

describe('parseTicketKeys', () => {
  it('prefixes shorthand digits', () => {
    expect(parseTicketKeys('1234', 'MDP')).toEqual({ tickets: ['MDP-1234'], invalid: [] })
  })

  it('accepts full keys in any case, split on commas, spaces and semicolons', () => {
    expect(parseTicketKeys('1234, mdp-5678 MDP-9999;42', 'MDP')).toEqual({
      tickets: ['MDP-1234', 'MDP-5678', 'MDP-9999', 'MDP-42'],
      invalid: [],
    })
  })

  it('accepts a pasted Jira link', () => {
    expect(
      parseTicketKeys('https://example.atlassian.net/browse/MDP-7?x=1', 'MDP').tickets,
    ).toEqual(['MDP-7'])
  })

  it('dedupes preserving order', () => {
    expect(parseTicketKeys('1234, MDP-1234, 1234', 'MDP').tickets).toEqual(['MDP-1234'])
  })

  it('collects invalid tokens', () => {
    expect(parseTicketKeys('1234, nope, ABC-1', 'MDP')).toEqual({
      tickets: ['MDP-1234'],
      invalid: ['nope', 'ABC-1'],
    })
  })

  it.each([[null], [''], ['   ']])('yields nothing for %j', (raw) => {
    expect(parseTicketKeys(raw, 'MDP')).toEqual({ tickets: [], invalid: [] })
  })

  it('marks bare digits invalid without a project key', () => {
    expect(parseTicketKeys('1234 abc-5', null)).toEqual({ tickets: ['ABC-5'], invalid: ['1234'] })
  })
})
