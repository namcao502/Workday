import { describe, expect, it } from 'vitest'
import { parseChats } from './teamsParse.js'

describe('parseChats', () => {
  it('keeps group chats with a topic, drops meetings, other ids and topic-less chats', () => {
    const page = parseChats({
      conversations: [
        { id: '19:a@thread.v2', threadProperties: { topic: ' MDP-1 review ' } },
        { id: '19:meeting_x@thread.v2', threadProperties: { topic: 'Standup' } },
        { id: '19:b@thread.tacv2', threadProperties: { topic: 'A channel' } },
        { id: '19:c@thread.v2', threadProperties: { topic: '  ' } },
        { id: '19:d@thread.v2' },
      ],
      _metadata: { backwardLink: 'https://example.com/next' },
    })

    expect(page.chats).toEqual([{ id: '19:a@thread.v2', topic: 'MDP-1 review' }])
    expect(page.backwardLink).toBe('https://example.com/next')
  })

  it('returns an empty page for anything that is not an object', () => {
    expect(parseChats(null)).toEqual({ chats: [], backwardLink: null })
  })
})
