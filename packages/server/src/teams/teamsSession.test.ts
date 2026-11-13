import { describe, expect, it } from 'vitest'
import {
  outcomeOf,
  recordRequest,
  sessionFrom,
  type TeamsCapture,
  DEFAULT_USER_AGENT,
} from './teamsSession.js'

const CHAT_URL = 'https://teams.test/api/chatsvc/apac/v1/users/ME/conversations?x=1'
const AGGREGATOR_URL = 'https://teams.test/api/csa/apac/api/v3/teams/users/me'
const NOW = Date.UTC(2026, 10, 1)

export function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`
}

function fullCapture(): TeamsCapture {
  return {
    chatToken: jwt({
      oid: 'ABC-1',
      name: 'Test User',
      aud: 'ic3.teams.office.com',
      exp: NOW / 1000 + 7200,
    }),
    chatUrl: CHAT_URL,
    aggregatorToken: jwt({ exp: NOW / 1000 + 3600 }),
    aggregatorUrl: AGGREGATOR_URL,
  }
}

describe('sessionFrom', () => {
  it('builds the session with a lower-cased id, base urls and the earliest expiry', () => {
    const session = sessionFrom({ ...fullCapture(), clientVersion: '1415/26' }, NOW, null)

    expect(session?.myId).toBe('8:orgid:abc-1')
    expect(session?.myName).toBe('Test User')
    expect(session?.chatUrl).toBe('https://teams.test/api/chatsvc/apac/v1/users/ME/')
    expect(session?.aggregatorUrl).toBe('https://teams.test/api/csa/apac/')
    expect(session?.expiresAt).toBe(NOW + 3_600_000)
    expect(session?.clientVersion).toBe('1415/26')
  })

  it('is null when a part is missing or the chat token has no oid', () => {
    const { aggregatorToken, ...noAggregator } = fullCapture()
    expect(aggregatorToken).toBeDefined()
    expect(sessionFrom(noAggregator, NOW, null)).toBeNull()
    expect(sessionFrom({ ...fullCapture(), chatToken: jwt({ aud: 'x' }) }, NOW, null)).toBeNull()
    expect(
      sessionFrom({ ...fullCapture(), chatUrl: 'https://teams.test/other' }, NOW, null),
    ).toBeNull()
  })

  it('counts a token without exp as short-lived and presents HeadlessChrome as Chrome', () => {
    const capture = { ...fullCapture(), aggregatorToken: 'opaque' }
    expect(sessionFrom(capture, NOW, 'Mozilla HeadlessChrome/130')?.expiresAt).toBe(
      NOW + 30 * 60_000,
    )
    expect(sessionFrom(capture, NOW, 'Mozilla HeadlessChrome/130')?.userAgent).toBe(
      'Mozilla Chrome/130',
    )
    expect(sessionFrom(capture, NOW, '')?.userAgent).toBe(DEFAULT_USER_AGENT)
  })
})

describe('recordRequest', () => {
  it('keeps chat and aggregator tokens with their urls and ignores other audiences', () => {
    const capture: TeamsCapture = {}
    const chatToken = jwt({ aud: 'https://ic3.teams.office.com' })
    recordRequest(capture, CHAT_URL, {
      authorization: `Bearer ${chatToken}`,
      'x-ms-client-version': 'v1',
    })
    recordRequest(capture, AGGREGATOR_URL, { authorization: 'bearer agg' })
    recordRequest(capture, 'https://teams.test/api/chatsvc/apac/v1/users/ME/x', {
      authorization: `Bearer ${jwt({ aud: 'other' })}`,
    })

    expect(capture).toEqual({
      chatToken,
      chatUrl: CHAT_URL,
      aggregatorToken: 'agg',
      aggregatorUrl: AGGREGATOR_URL,
      clientVersion: 'v1',
    })
  })
})

describe('outcomeOf', () => {
  it('a session with a chat token but no aggregator token counts as signed out', () => {
    const chatOnly: TeamsCapture = { chatToken: jwt({ oid: 'a' }), chatUrl: CHAT_URL }

    expect(outcomeOf(chatOnly, NOW, null, 'https://teams.cloud.microsoft/')).toEqual({
      kind: 'signedOut',
    })
  })

  it('is signed out on a login page and failed when nothing was seen elsewhere', () => {
    expect(outcomeOf({}, NOW, null, 'https://login.microsoftonline.com/x').kind).toBe('signedOut')
    expect(outcomeOf({}, NOW, null, 'https://teams.cloud.microsoft/').kind).toBe('failed')
  })

  it('returns the session when both tokens came', () => {
    expect(outcomeOf(fullCapture(), NOW, null, 'https://teams.cloud.microsoft/').kind).toBe(
      'session',
    )
  })
})
