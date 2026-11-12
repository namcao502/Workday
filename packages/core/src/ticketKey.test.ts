import { describe, expect, it } from 'vitest'
import { parseTicketKey } from './ticketKey.js'

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
