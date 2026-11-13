import { TeamsBusy, TeamsSignedOut, TeamsUncertain, type TeamsMessageBody } from '@workday/core'
import { describe, expect, it, vi } from 'vitest'
import { TeamsChatClient } from './teamsChatClient.js'
import type { TeamsSession, TeamsSniffer, TeamsSniffResult } from './teamsSession.js'

const CHAT_BASE = 'https://teams.test/api/chatsvc/apac/v1/users/ME/'
const IMAGE_URL = 'https://as-api.asm.skype.com/v1/objects/0-jhb-d4-abc/views/imgo'
const NOW = Date.UTC(2026, 10, 1)
const BODY: TeamsMessageBody = { html: '<p>hi</p>', mentionsJson: null }

function session(expiresAt = NOW + 3_600_000): TeamsSession {
  return {
    chatToken: 'chat-token',
    chatUrl: CHAT_BASE,
    aggregatorToken: 'aggregator-token',
    aggregatorUrl: 'https://teams.test/api/csa/apac/',
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

function bodyOf(fetchMock: FetchMock, index = 0): Record<string, unknown> {
  const body = fetchMock.mock.calls[index]?.[1]?.body
  return JSON.parse(typeof body === 'string' ? body : '{}') as Record<string, unknown>
}

describe('writes', () => {
  it('posts a reply with the spike body and returns the arrival time as id', async () => {
    const fetchMock = fakeFetch(() => json(201, { OriginalArrivalTime: 1792048362201 }))

    const id = await clientWith(fetchMock).postReply('19:abc@thread.tacv2', '100', BODY)

    expect(id).toBe('1792048362201')
    expect(urlOf(fetchMock)).toBe(
      `${CHAT_BASE}conversations/19%3Aabc%40thread.tacv2%3Bmessageid%3D100/messages`,
    )
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    const body = bodyOf(fetchMock)
    expect(body).toMatchObject({
      content: '<p>hi</p>',
      messagetype: 'RichText/Html',
      contenttype: 'text',
      imdisplayname: 'Test User',
      amsreferences: [],
      properties: { importance: '', subject: null, formatVariant: 'TEAMS' },
    })
    expect(body['clientmessageid']).toMatch(/^\d{19}$/)
  })

  it('posts a message with its subject and a chat message without a root', async () => {
    const fetchMock = fakeFetch(() => json(201, { OriginalArrivalTime: 42 }))
    const client = clientWith(fetchMock)

    expect(await client.postMessage('19:abc', 'MDP-1 subject', BODY)).toBe('42')
    expect(await client.postChatMessage('19:aaa@thread.v2', BODY)).toBe('42')

    expect(bodyOf(fetchMock)).toMatchObject({ properties: { subject: 'MDP-1 subject' } })
    expect(urlOf(fetchMock, 1)).toBe(`${CHAT_BASE}conversations/19%3Aaaa%40thread.v2/messages`)
  })

  it('a write that times out throws TeamsUncertain and is not retried', async () => {
    const timeout = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'))

    await expect(clientWith(timeout).postReply('c', 'r', BODY)).rejects.toBeInstanceOf(
      TeamsUncertain,
    )

    expect(timeout).toHaveBeenCalledTimes(1)
  })

  it('treats a 5xx, a lost connection and an answer without an id as uncertain, a 4xx as plain', async () => {
    const serverError = fakeFetch(() => json(502, {}))
    await expect(clientWith(serverError).postMessage('c', 's', BODY)).rejects.toBeInstanceOf(
      TeamsUncertain,
    )
    expect(serverError).toHaveBeenCalledTimes(1)

    const lost = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('connection reset'))
    await expect(clientWith(lost).deleteMessage('c', 'm')).rejects.toBeInstanceOf(TeamsUncertain)
    expect(lost).toHaveBeenCalledTimes(1)

    const noId = clientWith(fakeFetch(() => json(201, {})))
    await expect(noId.postReply('c', 'r', BODY)).rejects.toBeInstanceOf(TeamsUncertain)

    const forbidden = clientWith(fakeFetch(() => json(403, {})))
    await expect(forbidden.deleteMessage('c', 'm')).rejects.toMatchObject({ status: 403 })
  })

  it('re-sniffs once on a 401 and then sends', async () => {
    const source = sniffer()
    const fetchMock = fakeFetch((call) =>
      call === 1 ? json(401, {}) : json(201, { OriginalArrivalTime: 5 }),
    )

    expect(await clientWith(fetchMock, source).postReply('c', 'r', BODY)).toBe('5')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(source.sniffs).toBe(2)
  })

  it('is signed out after a second 401, and busy or signed out as the sniff says', async () => {
    const twice = fakeFetch(() => json(401, {}))
    await expect(clientWith(twice).listChats()).rejects.toBeInstanceOf(TeamsSignedOut)
    expect(twice).toHaveBeenCalledTimes(2)

    const signedOut = clientWith(
      fakeFetch(() => json(200, {})),
      sniffer({ kind: 'signedOut' }),
    )
    await expect(signedOut.listChannels()).rejects.toBeInstanceOf(TeamsSignedOut)
    const busy = clientWith(
      fakeFetch(() => json(200, {})),
      sniffer({ kind: 'busy' }),
    )
    await expect(busy.myId()).rejects.toBeInstanceOf(TeamsBusy)
  })

  it('edits with the subject, soft-deletes, and reacts with a time only when adding', async () => {
    const fetchMock = fakeFetch(() => new Response(null, { status: 200 }))
    const client = clientWith(fetchMock)

    await client.editMessage('19:abc', '100', 'subj', BODY)
    await client.deleteMessage('19:abc', '100')
    await client.setReaction('19:abc', '100', 'like', true)
    await client.setReaction('19:abc', '100', 'like', false)

    const messageUrl = `${CHAT_BASE}conversations/19%3Aabc/messages/100`
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      'PUT',
      'DELETE',
      'PUT',
      'DELETE',
    ])
    expect(urlOf(fetchMock, 0)).toBe(messageUrl)
    expect(bodyOf(fetchMock, 0)).toMatchObject({ properties: { subject: 'subj' } })
    expect(urlOf(fetchMock, 1)).toBe(`${messageUrl}?behavior=softDelete`)
    expect(urlOf(fetchMock, 2)).toBe(`${messageUrl}/properties?name=emotions`)
    expect(bodyOf(fetchMock, 2)).toEqual({
      emotions: { key: 'like', value: expect.any(Number) as number },
    })
    expect(bodyOf(fetchMock, 3)).toEqual({ emotions: { key: 'like' } })
  })
})

describe('image', () => {
  it('returns the bytes and type with the browser headers, without following redirects', async () => {
    const fetchMock = fakeFetch(
      () => new Response(Buffer.from([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } }),
    )

    const image = await clientWith(fetchMock).image(IMAGE_URL)

    expect([...image.bytes]).toEqual([1, 2, 3])
    expect(image.contentType).toBe('image/png')
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('Origin')).toBe('https://teams.cloud.microsoft')
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })

  it('image refuses a non-AMS url and a non-image content type', async () => {
    const html = fakeFetch(
      () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    )
    const client = clientWith(html)

    await expect(client.image('https://evil.test/v1/objects/abc/views/imgo')).rejects.toThrow(
      'unexpected host',
    )
    await expect(
      client.image('https://asm.skype.com.evil.com/v1/objects/abc/views/imgo'),
    ).rejects.toThrow()
    expect(html).not.toHaveBeenCalled()
    await expect(client.image(IMAGE_URL)).rejects.toThrow('not an image')
  })

  it('refuses an image over 10 MB and treats a redirect as an error', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    const oversize = fakeFetch(
      () => new Response(big, { headers: { 'Content-Type': 'image/png' } }),
    )
    await expect(clientWith(oversize).image(IMAGE_URL)).rejects.toThrow('too large')

    const redirect = fakeFetch(
      () => new Response(null, { status: 302, headers: { Location: 'https://evil.test/' } }),
    )
    await expect(clientWith(redirect).image(IMAGE_URL)).rejects.toMatchObject({ status: 302 })
    expect(redirect).toHaveBeenCalledTimes(1)
  })
})

describe('session', () => {
  it('is reused until near expiry and shared by concurrent calls', async () => {
    const source = sniffer()
    const fetchMock = fakeFetch(() => json(200, { teams: [] }))
    const client = clientWith(fetchMock, source)

    await Promise.all([client.listChannels(), client.listChannels(), client.myId()])
    await client.listChannels()
    expect(source.sniffs).toBe(1)

    client.invalidateSession()
    expect(await client.myId()).toBe('8:orgid:abc')
    expect(source.sniffs).toBe(2)

    const nearExpiry = sniffer({ kind: 'session', session: session(NOW + 60_000) })
    const other = clientWith(fetchMock, nearExpiry)
    await other.myId()
    await other.myId()
    expect(nearExpiry.sniffs).toBe(2)
  })
})
