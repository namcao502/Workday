import { describe, expect, it } from 'vitest'
import { parseTeamsState } from './teamsStore.js'

describe('parseTeamsState', () => {
  it('reads an old file without the DB review marks', () => {
    const old = { seenAt: {}, notifiedAt: {}, postedAt: {}, people: [], baselineDone: true }

    expect(parseTeamsState(old)).toEqual({
      ...old,
      dbReviewNotifiedAt: {},
      dbReviewDoneAt: {},
    })
  })

  it('reads the DB review marks and rejects a bad one', () => {
    const base = { seenAt: {}, notifiedAt: {}, postedAt: {}, people: [] }

    expect(
      parseTeamsState({ ...base, dbReviewDoneAt: { k: '2026-11-10T00:00:00.000Z' } })
        ?.dbReviewDoneAt,
    ).toEqual({
      k: '2026-11-10T00:00:00.000Z',
    })
    expect(parseTeamsState({ ...base, dbReviewDoneAt: { k: 5 } })).toBeNull()
  })
})
