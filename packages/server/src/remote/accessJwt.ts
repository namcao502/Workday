import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { isRecord } from '../jsonFile.js'

const CERTS_TTL_MS = 60 * 60_000
const MIN_REFETCH_INTERVAL_MS = 60_000
const CLOCK_SKEW_SECONDS = 60
const FETCH_TIMEOUT_MS = 10_000

export interface AccessIdentity {
  readonly email: string | null
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<AccessIdentity | null>
}

export interface AccessVerifierOptions {
  readonly teamDomain: string
  readonly aud: string
  readonly fetchJson?: (url: string) => Promise<unknown>
  readonly now?: () => number
}

interface DecodedToken {
  readonly kid: string
  readonly signedPart: string
  readonly signature: Buffer
  readonly claims: Readonly<Record<string, unknown>>
}

interface CachedCerts {
  readonly keys: ReadonlyMap<string, KeyObject>
  readonly fetchedAt: number
}

async function fetchJsonOverHttps(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed with ${String(response.status)}`)
  }
  return response.json()
}

function decodePart(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
}

function decode(token: string): DecodedToken | null {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }
  const [header = '', payload = '', signature = ''] = parts
  try {
    const decodedHeader = decodePart(header)
    const claims = decodePart(payload)
    if (
      !isRecord(decodedHeader) ||
      decodedHeader['alg'] !== 'RS256' ||
      typeof decodedHeader['kid'] !== 'string' ||
      !isRecord(claims)
    ) {
      return null
    }
    return {
      kid: decodedHeader['kid'],
      signedPart: `${header}.${payload}`,
      signature: Buffer.from(signature, 'base64url'),
      claims,
    }
  } catch {
    return null
  }
}

function parseKeys(raw: unknown): ReadonlyMap<string, KeyObject> {
  const keys = new Map<string, KeyObject>()
  const list = isRecord(raw) && Array.isArray(raw['keys']) ? (raw['keys'] as unknown[]) : []
  for (const jwk of list) {
    if (
      !isRecord(jwk) ||
      jwk['kty'] !== 'RSA' ||
      typeof jwk['kid'] !== 'string' ||
      typeof jwk['n'] !== 'string' ||
      typeof jwk['e'] !== 'string'
    ) {
      continue
    }
    try {
      keys.set(
        jwk['kid'],
        createPublicKey({ key: { kty: 'RSA', n: jwk['n'], e: jwk['e'] }, format: 'jwk' }),
      )
    } catch {
      // A key Node cannot read is skipped; tokens signed by it are refused.
    }
  }
  return keys
}

// Checks a Cloudflare Access JWT (RS256) against the team's published certs; any failure refuses.
export class AccessVerifier implements AccessTokenVerifier {
  private readonly fetchJson: (url: string) => Promise<unknown>
  private readonly now: () => number
  private cached: CachedCerts | null = null
  private inFlight: Promise<CachedCerts | null> | null = null
  private lastFetchFinishedAt: number | null = null

  constructor(private readonly options: AccessVerifierOptions) {
    this.fetchJson = options.fetchJson ?? fetchJsonOverHttps
    this.now = options.now ?? Date.now
  }

  async verify(token: string): Promise<AccessIdentity | null> {
    const decoded = decode(token)
    if (decoded === null) {
      return null
    }
    let certs = await this.certs(false)
    if (certs !== null && !certs.keys.has(decoded.kid) && this.mayRefetch()) {
      certs = await this.certs(true)
    }
    const key = certs?.keys.get(decoded.kid)
    if (key === undefined || !this.signatureMatches(decoded, key)) {
      return null
    }
    if (!this.claimsAreValid(decoded.claims)) {
      return null
    }
    const email = decoded.claims['email']
    return { email: typeof email === 'string' ? email : null }
  }

  private signatureMatches(decoded: DecodedToken, key: KeyObject): boolean {
    try {
      return verify('RSA-SHA256', Buffer.from(decoded.signedPart), key, decoded.signature)
    } catch {
      return false
    }
  }

  private claimsAreValid(claims: Readonly<Record<string, unknown>>): boolean {
    const { aud, iss, exp, nbf } = claims
    const nowSeconds = this.now() / 1000
    const audiences = Array.isArray(aud) ? aud : [aud]
    return (
      audiences.includes(this.options.aud) &&
      iss === `https://${this.options.teamDomain}` &&
      typeof exp === 'number' &&
      exp + CLOCK_SKEW_SECONDS > nowSeconds &&
      (nbf === undefined || (typeof nbf === 'number' && nbf - CLOCK_SKEW_SECONDS <= nowSeconds))
    )
  }

  // An unknown kid refetches at most once a minute, so random kids cannot make us hammer Cloudflare.
  private mayRefetch(): boolean {
    const last = this.lastFetchFinishedAt
    return last === null || this.now() - last >= MIN_REFETCH_INTERVAL_MS
  }

  // Null when the certs cannot be fetched: the caller refuses the token.
  private async certs(forceRefresh: boolean): Promise<CachedCerts | null> {
    const { cached } = this
    if (!forceRefresh && cached !== null && this.now() - cached.fetchedAt < CERTS_TTL_MS) {
      return cached
    }
    this.inFlight ??= this.loadCerts().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async loadCerts(): Promise<CachedCerts | null> {
    try {
      const raw = await this.fetchJson(`https://${this.options.teamDomain}/cdn-cgi/access/certs`)
      this.cached = { keys: parseKeys(raw), fetchedAt: this.now() }
      return this.cached
    } catch {
      return null
    } finally {
      this.lastFetchFinishedAt = this.now()
    }
  }
}
