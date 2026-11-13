import { describe, expect, it, vi } from 'vitest'
import { TeamsChatClient } from './teamsChatClient.js'
import { TeamsHttpError } from './teamsHttp.js'
import type { TeamsSession, TeamsSniffer, TeamsSniffResult } from './teamsSession.js'

const CHAT_BASE = 'https://teams.test/api/chatsvc/apac/v1/users/ME/'
const AGGREGATOR_BASE = 'https://teams.test/api/csa/apac/'
const NOW = Date.UTC(2026, 10, 1)

function session(expiresAt = NOW + 3_600_000): TeamsSession {
  return {
    chatToken: 'chat-token',
    chatUrl: CHAT_BASE,
    aggregatorToken: 'aggregator-token',
    aggregatorUrl: AGGREGATOR_BASE,
    clientVersion: '1415/26',
    userAgent: 'Mozilla/5.0 Chrome/130',
    myId: '8:orgid:abc',
    myName: 'Test User',
    expiresAt,
  }
}

function sniffer(
  result: TeamsSniffResult = { kind: 'session', session: session() },
): TeamsSniffer & { sniffs: number } {
  const fake = {
    sniffs: 0,
    sniff: () => {
      fake.sniffs += 1
      return Promise.resolve(result)
    },
    signIn: () => Promise.resolve({ kind: 'ok' } as const),
  }
  return fake
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function fakeFetch(answer: (call: number) => Response): FetchMock {
  let call = 0
  return vi.fn<typeof fetch>(() => {
    call += 1
    return Promise.resolve(answer(call))
  })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function clientWith(fetchMock: FetchMock, source = sniffer()): TeamsChatClient {
  return new TeamsChatClient(source, fetchMock, () => NOW)
}

function urlOf(fetchMock: FetchMock, index = 0): string {
  const input = fetchMock.mock.calls[index]?.[0]
  return typeof input === 'string' ? input : ''
}

function headersOf(fetchMock: FetchMock, index = 0): Headers {
  return new Headers(fetchMock.mock.calls[index]?.[1]?.headers)
}

function message(id: string, root: string, time: string): Record<string, unknown> {
  return {
    id,
    rootMessageId: root,
    messagetype: 'Text',
    content: id,
    from: 'x/8:orgid:b',
    composetime: time,
  }
}

describe('reads', () => {
  it('lists channels with the aggregator token', async () => {
    const fetchMock = fakeFetch(() =>
      json(200, {
        teams: [{ displayName: 'T', channels: [{ id: '19:c@thread.tacv2', displayName: 'C' }] }],
      }),
    )

    const channels = await clientWith(fetchMock).listChannels()

    expect(channels).toEqual([{ id: '19:c@thread.tacv2', teamName: 'T', channelName: 'C' }])
    expect(urlOf(fetchMock)).toBe(
      `${AGGREGATOR_BASE}api/v3/teams/users/me?isPrefetch=false&enableMembershipSummary=true`,
    )
    expect(headersOf(fetchMock).get('Authorization')).toBe('Bearer aggregator-token')
  })

  it('escapes the channel and root id and sends the chat token', async () => {
    const fetchMock = fakeFetch(() => json(200, { messages: [] }))

    const thread = await clientWith(fetchMock).thread('19:abc@thread.tacv2', '1792048362201')

    expect(thread).toMatchObject({
      conversationId: '19:abc@thread.tacv2',
      rootId: '1792048362201',
      isChat: false,
    })
    expect(urlOf(fetchMock)).toBe(
      `${CHAT_BASE}conversations/19%3Aabc%40thread.tacv2%3Bmessageid%3D1792048362201/messages?view=msnp24Equivalent&pageSize=200`,
    )
    expect(headersOf(fetchMock).get('Authorization')).toBe('Bearer chat-token')
  })

  it('adds the replies from the channel page when the thread read gives only the root', async () => {
    const rootOnly = { messages: [message('100', '100', '2026-10-16T04:00:00Z')] }
    const channelPage = {
      messages: [
        message('103', '999', '2026-10-16T06:00:00Z'),
        message('102', '100', '2026-10-16T05:30:00Z'),
        message('101', '100', '2026-10-16T05:00:00Z'),
        message('100', '100', '2026-10-16T04:00:00Z'),
      ],
    }
    const fetchMock = fakeFetch((call) => json(200, call === 1 ? rootOnly : channelPage))

    const thread = await clientWith(fetchMock).thread('19:abc', '100')

    expect(thread.messages.map((m) => m.id)).toEqual(['100', '101', '102'])
    expect(urlOf(fetchMock, 1)).toBe(
      `${CHAT_BASE}conversations/19%3Aabc/messages?view=msnp24Equivalent&pageSize=200`,
    )
  })

  it('follows a backward link only on the chat host', async () => {
    const fetchMock = fakeFetch(() => json(200, { messages: [] }))
    const client = clientWith(fetchMock)
    const link = `${CHAT_BASE}conversations/19%3Aabc/messages?startTime=1&pageSize=200`

    await client.channelPage('19:abc', link)
    await expect(client.channelPage('19:abc', 'https://evil.test/steal')).rejects.toThrow(
      'unexpected host',
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchMock)).toBe(link)
  })

  it('reads a chat oldest first as a chat thread', async () => {
    const fetchMock = fakeFetch(() =>
      json(200, {
        messages: [
          message('2', '', '2026-10-14T09:00:00Z'),
          message('1', '', '2026-10-14T08:00:00Z'),
        ],
      }),
    )

    const thread = await clientWith(fetchMock).chat('19:aaa@thread.v2')

    expect(thread).toMatchObject({ isChat: true, rootId: '', conversationId: '19:aaa@thread.v2' })
    expect(thread.messages.map((m) => m.id)).toEqual(['1', '2'])
  })

  it('retries a GET that got no response, but not a 500', async () => {
    const flaky = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue(json(200, { teams: [] }))
    expect(await clientWith(flaky).listChannels()).toEqual([])
    expect(flaky).toHaveBeenCalledTimes(2)

    const broken = fakeFetch(() => json(500, {}))
    await expect(clientWith(broken).listChannels()).rejects.toBeInstanceOf(TeamsHttpError)
    expect(broken).toHaveBeenCalledTimes(1)
  })
})

function chatPage(id: string, backwardLink: string | null): Response {
  const metadata = backwardLink === null ? {} : { _metadata: { backwardLink } }
  return json(200, {
    conversations: [{ id, threadProperties: { topic: `MDP-1 ${id}` } }],
    ...metadata,
  })
}

describe('chat list', () => {
  it('follows the backward link up to three pages', async () => {
    const fetchMock = fakeFetch((call) =>
      chatPage(
        `19:p${String(call)}@thread.v2`,
        `${CHAT_BASE}conversations?syncState=${String(call)}`,
      ),
    )

    const chats = await clientWith(fetchMock).listChats()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(chats.map((c) => c.id)).toEqual([
      '19:p1@thread.v2',
      '19:p2@thread.v2',
      '19:p3@thread.v2',
    ])
    expect(urlOf(fetchMock)).toContain(
      `${CHAT_BASE}conversations?view=msnp24Equivalent&pageSize=100&targetType=`,
    )
    expect(urlOf(fetchMock)).toMatch(/&startTime=0$/)
    expect(urlOf(fetchMock, 1)).toBe(`${CHAT_BASE}conversations?syncState=1`)
  })

  it('keeps the first page and stops when the link points to another host', async () => {
    const fetchMock = fakeFetch(() =>
      chatPage('19:p@thread.v2', 'https://evil.test/conversations?syncState=1'),
    )

    const chats = await clientWith(fetchMock).listChats()

    expect(chats.map((c) => c.id)).toEqual(['19:p@thread.v2'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('follows a link that names the user instead of ME', async () => {
    const userLink =
      'https://teams.test/api/chatsvc/apac/v1/users/8:orgid:abc/conversations?syncState=1'
    const fetchMock = fakeFetch((call) =>
      chatPage(`19:p${String(call)}@thread.v2`, call === 1 ? userLink : null),
    )

    expect(await clientWith(fetchMock).listChats()).toHaveLength(2)
    expect(urlOf(fetchMock, 1)).toBe(userLink)
  })
})
