import { generateKeyPairSync, sign, type JsonWebKey, type KeyObject } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AccessVerifier } from './accessJwt.js'

const TEAM = 'myteam.cloudflareaccess.com'
const AUD = 'aud-123'
const NOW_SECONDS = 1_800_000_000
const CERTS_URL = `https://${TEAM}/cdn-cgi/access/certs`

interface TestKey {
  readonly kid: string
  readonly privateKey: KeyObject
  readonly jwk: JsonWebKey
}

function newKey(kid: string): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' } }
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function tokenFor(key: TestKey, claims: Record<string, unknown> = {}): string {
  const header = encode({ alg: 'RS256', kid: key.kid, typ: 'JWT' })
  const payload = encode({
    aud: [AUD],
    iss: `https://${TEAM}`,
    exp: NOW_SECONDS + 600,
    iat: NOW_SECONDS - 10,
    email: 'me@example.com',
    ...claims,
  })
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), key.privateKey)
  return `${header}.${payload}.${signature.toString('base64url')}`
}

function verifierWith(
  certs: () => readonly TestKey[],
  clock = { seconds: NOW_SECONDS },
): {
  verifier: AccessVerifier
  urls: string[]
} {
  const urls: string[] = []
  const verifier = new AccessVerifier({
    teamDomain: TEAM,
    aud: AUD,
    now: () => clock.seconds * 1000,
    fetchJson: (url) => {
      urls.push(url)
      return Promise.resolve({ keys: certs().map((key) => key.jwk) })
    },
  })
  return { verifier, urls }
}

describe('AccessVerifier', () => {
  it('accepts a token signed by the team key with the right aud', async () => {
    const key = newKey('k1')
    const { verifier, urls } = verifierWith(() => [key])

    expect(await verifier.verify(tokenFor(key))).toEqual({ email: 'me@example.com' })
    expect(await verifier.verify(tokenFor(key, { aud: AUD, email: undefined }))).toEqual({
      email: null,
    })
    expect(urls).toEqual([CERTS_URL])
  })

  it('rejects a wrong aud, a wrong iss, an expired token and a bad signature', async () => {
    const key = newKey('k1')
    const stranger = { ...newKey('k1'), jwk: key.jwk }
    const { verifier } = verifierWith(() => [key])

    expect(await verifier.verify(tokenFor(key, { aud: ['other'] }))).toBeNull()
    expect(
      await verifier.verify(tokenFor(key, { iss: 'https://evil.cloudflareaccess.com' })),
    ).toBeNull()
    expect(await verifier.verify(tokenFor(key, { exp: NOW_SECONDS - 61 }))).toBeNull()
    expect(await verifier.verify(tokenFor(key, { nbf: NOW_SECONDS + 120 }))).toBeNull()
    expect(await verifier.verify(tokenFor(stranger))).toBeNull()
    expect(await verifier.verify('not.a.jwt')).toBeNull()
    const [header = '', payload = ''] = tokenFor(key).split('.')
    const none = `${encode({ alg: 'none', kid: 'k1' })}.${payload}.`
    expect(await verifier.verify(none)).toBeNull()
    expect(await verifier.verify(`${header}.${encode({ aud: AUD })}.x`)).toBeNull()
  })

  it('refetches the certs once for an unknown kid', async () => {
    const first = newKey('k1')
    const second = newKey('k2')
    let published = [first]
    const clock = { seconds: NOW_SECONDS }
    const { verifier, urls } = verifierWith(() => published, clock)

    expect(await verifier.verify(tokenFor(first))).not.toBeNull()
    published = [second]
    clock.seconds += 61
    expect(await verifier.verify(tokenFor(second))).not.toBeNull()
    expect(urls).toHaveLength(2)
    expect(await verifier.verify(tokenFor(first))).toBeNull()
    expect(urls).toHaveLength(2)
  })

  it('an unknown kid refetches the certs at most once a minute', async () => {
    const first = newKey('k1')
    const second = newKey('k2')
    let published = [first]
    const clock = { seconds: NOW_SECONDS }
    const { verifier, urls } = verifierWith(() => published, clock)

    expect(await verifier.verify(tokenFor(first))).not.toBeNull()
    published = [first, second]
    clock.seconds += 10
    expect(await verifier.verify(tokenFor(second))).toBeNull()
    expect(await verifier.verify(tokenFor(newKey('k9')))).toBeNull()
    expect(urls).toHaveLength(1)
    clock.seconds += 51
    expect(await verifier.verify(tokenFor(second))).not.toBeNull()
    expect(urls).toHaveLength(2)
  })

  it('rejects when the certs cannot be fetched', async () => {
    const key = newKey('k1')
    const verifier = new AccessVerifier({
      teamDomain: TEAM,
      aud: AUD,
      now: () => NOW_SECONDS * 1000,
      fetchJson: () => Promise.reject(new Error('offline')),
    })

    expect(await verifier.verify(tokenFor(key))).toBeNull()
  })
})
