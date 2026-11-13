import { describe, expect, it } from 'vitest'
import type { TeamsMessage } from './teamsChat.js'
import { emptyChannelIndex, withoutPost, withPosts } from './teamsPostIndex.js'

const MY_ID = 'me'
const NOW = '2026-11-13T00:00:00Z'
const SENT_AT = Date.parse('2026-11-01T00:00:00Z')

function at(minutes: number): string {
  return new Date(SENT_AT + minutes * 60_000).toISOString()
}

function message(
  id: string,
  senderId: string,
  sentAt: string,
  subject: string | null,
): TeamsMessage {
  return {
    id,
    senderId,
    senderName: 'name',
    sentAt,
    content: 'body',
    isPlainText: true,
    subject,
    editedAt: null,
    mentionMris: {},
    hasFiles: false,
    reactions: [],
    rootMessageId: null,
    files: [],
  }
}

describe('withPosts', () => {
  it('gives the same index back when a page changes nothing', () => {
    const page = [message('r1', MY_ID, at(0), 'MDP-1 x'), message('n', 'someone', at(1), 'no key')]
    const once = withPosts(emptyChannelIndex(), page, MY_ID, NOW)

    expect(withPosts(once, page, MY_ID, NOW)).toBe(once)
    expect(withPosts(once, [], MY_ID, NOW)).toBe(once)
  })

  it('prefers an own post, then the newest, and ignores subjects that are not tickets', () => {
    const messages = [
      message('other-newest', 'someone', at(30), 'MDP-1 newest, by someone else'),
      message('own-old', MY_ID, at(0), 'MDP-1 old'),
      message('own-new', MY_ID, at(10), '  mdp-1: newer, lower case'),
      message('other-old', 'someone', at(-5), 'MDP-2 older'),
      message('other-new', 'someone', at(0), 'MDP-2 newer'),
      message('not-at-start', MY_ID, at(0), 'Re MDP-3'),
      message('not-a-ticket', MY_ID, at(0), 'Lunch plans'),
      message('no-subject', MY_ID, at(0), null),
    ]

    const index = withPosts(emptyChannelIndex(), messages, MY_ID, NOW)
    const later = withPosts(index, [message('later', 'someone', at(60), 'MDP-1 later')], MY_ID, NOW)

    expect(Object.keys(index.posts).sort()).toEqual(['MDP-1', 'MDP-2'])
    expect(index.posts['MDP-1']).toEqual({ rootId: 'own-new', sentAt: at(10), mine: true })
    expect(index.posts['MDP-2']).toEqual({ rootId: 'other-new', sentAt: at(0), mine: false })
    expect(later.posts['MDP-1']?.rootId).toBe('own-new')
  })

  it('drops posts older than 200 days and keeps the rest of the index', () => {
    const old = new Date(Date.parse(NOW) - 201 * 86_400_000).toISOString()
    const recent = new Date(Date.parse(NOW) - 199 * 86_400_000).toISOString()
    const base = { ...emptyChannelIndex(), syncedAt: NOW, deepScanPages: 3, deepScanLink: 'link4' }

    const index = withPosts(
      base,
      [message('old', MY_ID, old, 'MDP-1 old'), message('recent', MY_ID, recent, 'MDP-2 recent')],
      MY_ID,
      NOW,
    )

    expect(Object.keys(index.posts)).toEqual(['MDP-2'])
    expect(index).toMatchObject({
      syncedAt: NOW,
      deepScanPages: 3,
      deepScanLink: 'link4',
      deepScanned: false,
    })
  })
})

describe('withoutPost', () => {
  it('removes only that key and leaves the original alone', () => {
    const index = withPosts(
      emptyChannelIndex(),
      [message('a', MY_ID, at(0), 'MDP-1 a'), message('b', MY_ID, at(0), 'MDP-2 b')],
      MY_ID,
      NOW,
    )

    const without = withoutPost(index, 'mdp-1')

    expect(Object.keys(without.posts)).toEqual(['MDP-2'])
    expect(Object.keys(index.posts)).toHaveLength(2)
  })
})
