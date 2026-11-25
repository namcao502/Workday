import { describe, expect, it } from 'vitest'
import { pendingMessage, prunedMarks, sameMarks, shouldNotify } from './teamsAttention.js'
import type { TeamsAttentionItem } from './teamsAttention.js'
import type { TeamsMessage, TeamsThread } from './teamsChat.js'

const ME = '8:orgid:me'
const NOON = Date.parse('2026-10-16T12:00:00Z')
const at = (minutes: number): string => new Date(NOON + minutes * 60_000).toISOString()

function message(
  id: string,
  senderId: string,
  minutes: number,
  mentionMris: Record<string, string> = {},
): TeamsMessage {
  return {
    id,
    senderId,
    senderName: `Sender ${senderId}`,
    sentAt: at(minutes),
    content: 'body',
    isPlainText: true,
    subject: null,
    editedAt: null,
    mentionMris,
    hasFiles: false,
    reactions: [],
    rootMessageId: null,
    files: [],
  }
}

function chat(...messages: TeamsMessage[]): TeamsThread {
  return { conversationId: '19:chat@thread.v2', rootId: '', messages, isChat: true }
}

const pending = (thread: TeamsThread, seenAt: string | null = null): TeamsAttentionItem | null =>
  pendingMessage(thread, 'MDP-1', 'MDP-1 chat', '19:chat@thread.v2', ME, seenAt)

function item(minutes: number): TeamsAttentionItem {
  return {
    ticketKey: 'MDP-1',
    conversationKey: 'k',
    chatId: '19:chat@thread.v2',
    title: 't',
    senderName: 'Bob',
    sentAt: at(minutes),
    mentionsMe: false,
    conversationId: '19:chat@thread.v2',
  }
}

describe('pendingMessage', () => {
  it('opens the post channel for a post and the chat for a chat', () => {
    const post: TeamsThread = {
      conversationId: '19:general@thread.tacv2',
      rootId: 'r1',
      isChat: false,
      messages: [message('r1', '8:orgid:customer', 1)],
    }
    const postItem = pendingMessage(post, 'MDP-1', 'TSC Miami > General', null, ME, null)
    expect(postItem?.conversationId).toBe('19:general@thread.tacv2')
    expect(postItem?.conversationKey).toContain('19:general@thread.tacv2;messageid=r1')
    expect(pending(chat(message('1', 'bob', 1)))?.conversationId).toBe('19:chat@thread.v2')
  })

  it('returns the newest message of others after my last one', () => {
    const found = pending(
      chat(
        message('a', 'bob', 0),
        message('b', ME, 1),
        message('c', 'bob', 2),
        message('d', 'amy', 3),
      ),
    )
    expect(found?.senderName).toBe('Sender amy')
    expect(found?.sentAt).toBe(at(3))
  })

  it('is null when my message is last or nothing is newer than seenAt', () => {
    expect(pending(chat(message('a', 'bob', 0), message('b', ME, 1)))).toBeNull()
    const thread = chat(message('a', 'bob', 0), message('b', 'bob', 5))
    expect(pending(thread, at(5))).toBeNull()
    expect(pending(thread, at(4))).not.toBeNull()
  })

  it('sets mentionsMe when any pending message tags me, in any case', () => {
    const upper = { '0': ME.toUpperCase() }
    expect(pending(chat(message('a', 'bob', 0, upper), message('b', 'amy', 1)))?.mentionsMe).toBe(
      true,
    )
    expect(pending(chat(message('a', 'bob', 0), message('b', 'amy', 1)))?.mentionsMe).toBe(false)
  })

  it('counts every message of others when I have not written', () => {
    const found = pending(
      chat(message('a', 'bob', 0, { '0': ME }), message('b', 'amy', 1), message('c', 'bob', 2)),
    )
    expect(found?.sentAt).toBe(at(2))
    expect(found?.mentionsMe).toBe(true)
  })
})

describe('shouldNotify', () => {
  it('waits for the baseline, and a post seen first is never news', () => {
    expect(shouldNotify(item(5), null, false, false)).toBe(false)
    expect(shouldNotify(item(5), null, true, false)).toBe(true)
    expect(shouldNotify(item(5), null, true, true)).toBe(false)
  })

  it.each([false, true])('needs a message newer than notifiedAt (isPost %s)', (isPost) => {
    expect(shouldNotify(item(5), at(5), true, isPost)).toBe(false)
    expect(shouldNotify(item(6), at(5), true, isPost)).toBe(true)
  })
})

describe('marks', () => {
  it('sameMarks compares content and instants', () => {
    const marks = { c1: '2026-10-16T02:00:00Z', c2: '2026-10-16T02:01:00Z' }
    expect(sameMarks(marks, { ...marks, c1: '2026-10-16T09:00:00+07:00' })).toBe(true)
    expect(sameMarks({}, {})).toBe(true)
    expect(sameMarks(marks, { ...marks, c2: '2026-10-16T02:02:00Z' })).toBe(false)
    expect(sameMarks(marks, { c1: marks.c1, c3: marks.c2 })).toBe(false)
    expect(sameMarks(marks, { c1: marks.c1 })).toBe(false)
  })

  it('prunedMarks keeps an old mark whose conversation is still read', () => {
    const old = '2026-07-18T00:00:00Z'
    const marks = { 'still-read': old, gone: old, recent: '2026-10-15T00:00:00Z' }
    const pruned = prunedMarks(marks, '2026-10-16T00:00:00Z', new Set(['still-read']))
    expect(Object.keys(pruned).sort()).toEqual(['recent', 'still-read'])
  })

  it('prunedMarks drops marks older than sixty days and does not mutate', () => {
    const marks = { old: at(-61 * 1440), edge: at(-60 * 1440), fresh: at(-1440) }
    expect(Object.keys(prunedMarks(marks, at(0), new Set()))).toEqual(['edge', 'fresh'])
    expect(Object.keys(marks)).toHaveLength(3)
  })
})
