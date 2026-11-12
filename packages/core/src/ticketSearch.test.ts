import { describe, expect, it } from 'vitest'
import { matchesTicket } from './ticketSearch.js'
import { makeTicket } from './testing/ticketFixture.js'

const ticket = makeTicket('MDP-8961', { summary: 'Change how Patch bins are configured in MDP' })

describe('matchesTicket', () => {
  it.each([[''], ['   ']])('returns true when the query is blank %j', (query) => {
    expect(matchesTicket(ticket, query)).toBe(true)
  })

  it.each([['8961'], ['mdp-8961'], ['patch BINS'], ['bins patch']])(
    'returns true when every word is in the key or summary: %s',
    (query) => {
      expect(matchesTicket(ticket, query)).toBe(true)
    },
  )

  it.each([['8962'], ['patch order']])('returns false when any word is missing: %s', (query) => {
    expect(matchesTicket(ticket, query)).toBe(false)
  })
})
