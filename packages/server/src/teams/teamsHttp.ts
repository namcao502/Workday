import { TeamsBusy, TeamsSignedOut } from '@workday/core'
import type { TeamsSession, TeamsSignInResult, TeamsSniffer } from './teamsSession.js'

const REQUEST_TIMEOUT_MILLISECONDS = 20_000
const EXPIRY_MARGIN_MILLISECONDS = 2 * 60_000
const ORIGIN = 'https://teams.cloud.microsoft'

// A non-2xx answer. Never carries the body: it may hold message content.
export class TeamsHttpError extends Error {
  constructor(readonly status: number) {
    super(`Teams answered ${String(status)}`)
  }
}

// fetch gave no response (network error or timeout); the request may or may not have arrived.
export class TeamsNoResponse extends Error {}

export interface TeamsRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly url: string
  readonly token: 'chat' | 'aggregator'
  readonly json?: unknown
  readonly asBrowser?: boolean // the object store wants the browser's own headers
}

export interface SendOptions {
  readonly timeoutMilliseconds?: number
  readonly followRedirects?: boolean
}

// The cached Teams session and the one place that sends requests: Bearer tokens, a timeout, one re-sniff on a 401.
export class TeamsHttp {
  private cached: TeamsSession | null = null
  private pending: Promise<TeamsSession> | null = null

  constructor(
    private readonly sniffer: TeamsSniffer,
    private readonly fetchFunction: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(): void {
    this.cached = null
  }

  session(): Promise<TeamsSession> {
    const cached = this.cached
    if (cached !== null && this.now() < cached.expiresAt - EXPIRY_MARGIN_MILLISECONDS) {
      return Promise.resolve(cached)
    }
    // One sniff at a time: concurrent callers share it.
    this.pending ??= this.sniff().finally(() => {
      this.pending = null
    })
    return this.pending
  }

  async signIn(): Promise<void> {
    let result: TeamsSignInResult
    try {
      result = await this.sniffer.signIn()
    } finally {
      this.invalidate()
    }
    if (result.kind === 'busy') {
      throw new TeamsBusy('Teams sign-in or read already running')
    }
    if (result.kind === 'failed') {
      throw new Error(result.detail)
    }
  }

  // A 401 means Teams did not act on the request, so re-sending a write once cannot duplicate it.
  async send(
    build: (session: TeamsSession) => TeamsRequest,
    options: SendOptions = {},
  ): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const session = await this.session()
      const request = build(session)
      let response: Response
      try {
        response = await this.fetchFunction(request.url, {
          method: request.method,
          headers: headersFor(request, session),
          body: request.json === undefined ? null : JSON.stringify(request.json),
          redirect: options.followRedirects === false ? 'manual' : 'follow',
          signal: AbortSignal.timeout(options.timeoutMilliseconds ?? REQUEST_TIMEOUT_MILLISECONDS),
        })
      } catch (error: unknown) {
        throw new TeamsNoResponse('Teams gave no response', { cause: error })
      }
      if (response.status !== 401) {
        return response
      }
      await response.body?.cancel().catch(() => undefined)
      this.invalidate()
    }
    throw new TeamsSignedOut('Teams is signed out')
  }

  private async sniff(): Promise<TeamsSession> {
    const result = await this.sniffer.sniff()
    switch (result.kind) {
      case 'session':
        this.cached = result.session
        return result.session
      case 'signedOut':
        throw new TeamsSignedOut('Teams is signed out')
      case 'busy':
        throw new TeamsBusy('Teams sign-in or read already running')
      case 'failed':
        throw new Error(result.detail)
    }
  }
}

function headersFor(request: TeamsRequest, session: TeamsSession): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${request.token === 'chat' ? session.chatToken : session.aggregatorToken}`,
  }
  if (request.json !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (request.asBrowser === true) {
    headers['User-Agent'] = session.userAgent
    headers['x-ms-client-type'] = 'web'
    if (session.clientVersion !== null) {
      headers['x-ms-client-version'] = session.clientVersion
    }
    headers['Origin'] = ORIGIN
    headers['Referer'] = `${ORIGIN}/`
  }
  return headers
}
