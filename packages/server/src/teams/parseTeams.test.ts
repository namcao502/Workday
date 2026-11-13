import { describe, expect, it } from 'vitest'
import { isChatListLink, parseArrivalTime } from './parseTeams.js'

const CHAT_BASE = 'https://teams.test/api/chatsvc/apac/v1/users/ME/'

describe('parseArrivalTime', () => {
  it('reads a number or text id and nothing else', () => {
    expect(parseArrivalTime({ OriginalArrivalTime: 1792048362201 })).toBe('1792048362201')
    expect(parseArrivalTime({ OriginalArrivalTime: '2026-11-01T00:00:00Z' })).toBe(
      '2026-11-01T00:00:00Z',
    )
    expect(parseArrivalTime({})).toBeNull()
    expect(parseArrivalTime({ OriginalArrivalTime: '' })).toBeNull()
    expect(parseArrivalTime([])).toBeNull()
  })
})

describe('isChatListLink', () => {
  it('accepts the chat host, also with the user id in place of ME', () => {
    expect(isChatListLink(`${CHAT_BASE}conversations?s=1`, CHAT_BASE)).toBe(true)
    expect(
      isChatListLink(
        'https://teams.test/api/chatsvc/apac/v1/users/8:orgid:abc/conversations?s=1',
        CHAT_BASE,
      ),
    ).toBe(true)
  })

  it('refuses another host, scheme or path', () => {
    expect(isChatListLink('https://evil.test/conversations', CHAT_BASE)).toBe(false)
    expect(isChatListLink('http://teams.test/api/chatsvc/apac/v1/users/ME/c', CHAT_BASE)).toBe(
      false,
    )
    expect(isChatListLink('https://teams.test/other', CHAT_BASE)).toBe(false)
    expect(isChatListLink('not a url', CHAT_BASE)).toBe(false)
  })
})
