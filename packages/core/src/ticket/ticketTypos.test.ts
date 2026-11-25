import { describe, expect, it } from 'vitest'
import { typoNeighbors } from './ticketTypos.js'

describe('typoNeighbors', () => {
  it('ranks a swap before a changed digit before a dropped one', () => {
    const result = typoNeighbors('MDP-6798', ['MDP-679', 'MDP-6799', 'MDP-6789', 'MDP-1'])
    expect(result).toEqual(['MDP-6789', 'MDP-6799', 'MDP-679'])
  })

  it('ignores another prefix', () => {
    expect(typoNeighbors('MDP-6798', ['ABC-6789', 'ABC-6799'])).toEqual([])
  })

  it('returns nothing for a key that is no key', () => {
    expect(typoNeighbors('nonsense', ['MDP-1'])).toEqual([])
  })
})
