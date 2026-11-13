import { jwtClaim, jwtExpiry } from '../tsc/jwt.js'

export interface TeamsSession {
  readonly chatToken: string
  readonly chatUrl: string // ".../api/chatsvc/<region>/v1/users/ME/"
  readonly aggregatorToken: string
  readonly aggregatorUrl: string // ".../api/csa/<region>/"
  readonly clientVersion: string | null
  readonly userAgent: string
  readonly myId: string
  readonly myName: string
  readonly expiresAt: number // epoch milliseconds
}

// What the browser saw on Teams web's own requests.
export interface TeamsCapture {
  chatToken?: string
  chatUrl?: string
  aggregatorToken?: string
  aggregatorUrl?: string
  clientVersion?: string
}

export type TeamsSniffResult =
  | { readonly kind: 'session'; readonly session: TeamsSession }
  | { readonly kind: 'signedOut' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'failed'; readonly detail: string }

export type TeamsSignInResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'failed'; readonly detail: string }

export interface TeamsSniffer {
  sniff(): Promise<TeamsSniffResult>
  signIn(): Promise<TeamsSignInResult>
}

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const CHAT_AUDIENCE = 'ic3.teams.office.com'
const CHAT_URL = /^(https:\/\/[^/]+\/api\/chatsvc\/[^/]+\/v1\/users\/ME\/)/
const AGGREGATOR_URL = /^(https:\/\/[^/]+\/api\/csa\/[^/]+\/)/
const BEARER = /^bearer\s+(.+)$/i
const FALLBACK_LIFETIME_MILLISECONDS = 30 * 60_000

// Keeps the latest chat and aggregator token with the URL they were sent to; other audiences are ignored.
export function recordRequest(
  capture: TeamsCapture,
  url: string,
  headers: Readonly<Record<string, string>>,
): void {
  const clientVersion = headers['x-ms-client-version']
  if (clientVersion !== undefined && clientVersion !== '' && capture.clientVersion === undefined) {
    capture.clientVersion = clientVersion
  }
  const token = BEARER.exec(headers['authorization'] ?? '')?.[1]
  if (token === undefined) {
    return
  }
  if (CHAT_URL.test(url)) {
    if ((jwtClaim(token, 'aud') ?? '').includes(CHAT_AUDIENCE)) {
      capture.chatToken = token
      capture.chatUrl = url
    }
  } else if (AGGREGATOR_URL.test(url)) {
    capture.aggregatorToken = token
    capture.aggregatorUrl = url
  }
}

// Teams web loads chats on a cached token but cannot renew the teams-and-channels one: only a visible sign-in clears it.
export function isSignInAgainNeeded(capture: TeamsCapture): boolean {
  return capture.chatToken !== undefined && capture.aggregatorToken === undefined
}

export function hasBothTokens(capture: TeamsCapture): boolean {
  return capture.chatToken !== undefined && capture.aggregatorToken !== undefined
}

// Null when a part is missing, a URL is not Teams', or the chat token has no user id.
export function sessionFrom(
  capture: TeamsCapture,
  nowMilliseconds: number,
  userAgent: string | null,
): TeamsSession | null {
  const { chatToken, chatUrl, aggregatorToken, aggregatorUrl } = capture
  if (
    chatToken === undefined ||
    chatUrl === undefined ||
    aggregatorToken === undefined ||
    aggregatorUrl === undefined
  ) {
    return null
  }
  const chatBase = CHAT_URL.exec(chatUrl)?.[1]
  const aggregatorBase = AGGREGATOR_URL.exec(aggregatorUrl)?.[1]
  const objectId = jwtClaim(chatToken, 'oid')
  if (
    chatBase === undefined ||
    aggregatorBase === undefined ||
    objectId === null ||
    objectId === ''
  ) {
    return null
  }
  // A token whose exp cannot be read still works, but counts as short-lived.
  const fallback = nowMilliseconds + FALLBACK_LIFETIME_MILLISECONDS
  const expiries = [chatToken, aggregatorToken].map(
    (token) => jwtExpiry(token)?.getTime() ?? fallback,
  )
  return {
    chatToken,
    chatUrl: chatBase,
    aggregatorToken,
    aggregatorUrl: aggregatorBase,
    clientVersion: capture.clientVersion ?? null,
    // A HeadlessChrome user agent is refused by the Teams object store (400).
    userAgent:
      userAgent === null || userAgent.trim() === ''
        ? DEFAULT_USER_AGENT
        : userAgent.replace('HeadlessChrome', 'Chrome'),
    myId: `8:orgid:${objectId}`.toLowerCase(),
    myName: jwtClaim(chatToken, 'name') ?? '',
    expiresAt: Math.min(...expiries),
  }
}

// The result of one headless sniff, from what it captured and where the page ended up.
export function outcomeOf(
  capture: TeamsCapture,
  nowMilliseconds: number,
  userAgent: string | null,
  pageUrl: string,
): TeamsSniffResult {
  const session = sessionFrom(capture, nowMilliseconds, userAgent)
  if (session !== null) {
    return { kind: 'session', session }
  }
  if (hasBothTokens(capture)) {
    return { kind: 'failed', detail: 'Teams token has no user id' }
  }
  if (isSignInAgainNeeded(capture) || /login\.(microsoftonline|live)\.com/.test(pageUrl)) {
    return { kind: 'signedOut' }
  }
  return { kind: 'failed', detail: 'Teams did not send the expected requests in time' }
}
