import { randomBytes, X509Certificate } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadOrCreateLanTls, readCaFingerprint } from './lanCertificates.js'

const DAY_MS = 86_400_000
const NOW = new Date('2026-11-18T08:00:00Z')

function newDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'workday-lan-tls-'))
}

describe('lanCertificates', () => {
  beforeEach(() => {
    vi.stubEnv('WORKDAY_MASTER_KEY', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('issues a server cert for the IP signed by the CA', async () => {
    const dataDir = newDataDir()
    expect(readCaFingerprint(dataDir)).toBeNull()
    const tls = await loadOrCreateLanTls(dataDir, '192.168.1.5', NOW)
    const server = new X509Certificate(tls.cert)
    const ca = new X509Certificate(tls.caDer)
    expect(server.subjectAltName).toBe('IP Address:192.168.1.5')
    expect(server.checkIssued(ca)).toBe(true)
    expect(server.verify(ca.publicKey)).toBe(true)
    expect(server.ca).toBe(false)
    expect(ca.ca).toBe(true)
    const lifetimeDays = (Date.parse(server.validTo) - Date.parse(server.validFrom)) / DAY_MS
    expect(lifetimeDays).toBeLessThanOrEqual(398)
    expect(tls.renewed).toBe(true)
    expect(tls.caFingerprint).toBe(ca.fingerprint256)
    expect(readCaFingerprint(dataDir)).toBe(tls.caFingerprint)
    expect(tls.key).toContain('BEGIN PRIVATE KEY')
  })

  it('reuses a current cert', async () => {
    const dataDir = newDataDir()
    const first = await loadOrCreateLanTls(dataDir, '192.168.1.5', NOW)
    const again = await loadOrCreateLanTls(dataDir, '192.168.1.5', new Date(NOW.getTime() + DAY_MS))
    expect(again.renewed).toBe(false)
    expect(again.cert).toBe(first.cert)
    expect(again.key).toBe(first.key)
  })

  it('renews for a new address and keeps the CA', async () => {
    const dataDir = newDataDir()
    const first = await loadOrCreateLanTls(dataDir, '192.168.1.5', NOW)
    const second = await loadOrCreateLanTls(dataDir, '10.0.0.7', NOW)
    expect(second.renewed).toBe(true)
    expect(new X509Certificate(second.cert).subjectAltName).toBe('IP Address:10.0.0.7')
    expect(second.caDer.equals(first.caDer)).toBe(true)
    expect(new X509Certificate(second.cert).checkIssued(new X509Certificate(second.caDer))).toBe(
      true,
    )
  })

  it('renews 30 days before expiry', async () => {
    const dataDir = newDataDir()
    const first = await loadOrCreateLanTls(dataDir, '192.168.1.5', NOW)
    const stillFine = await loadOrCreateLanTls(
      dataDir,
      '192.168.1.5',
      new Date(NOW.getTime() + 360 * DAY_MS),
    )
    expect(stillFine.renewed).toBe(false)
    const late = await loadOrCreateLanTls(
      dataDir,
      '192.168.1.5',
      new Date(NOW.getTime() + 368 * DAY_MS),
    )
    expect(late.renewed).toBe(true)
    expect(late.cert).not.toBe(first.cert)
    expect(late.caDer.equals(first.caDer)).toBe(true)
  })

  it('keys are sealed in the file', async () => {
    const dataDir = newDataDir()
    await loadOrCreateLanTls(dataDir, '192.168.1.5', NOW)
    const raw = readFileSync(join(dataDir, 'lan-tls.json'), 'utf8')
    const file = JSON.parse(raw) as Record<string, string>
    expect(raw).not.toContain('PRIVATE KEY')
    expect(file['caKey']).toMatch(/^enc:v1:/)
    expect(file['serverKey']).toMatch(/^enc:v1:/)
    expect(file['caCert']).toContain('BEGIN CERTIFICATE')
    expect(file['serverCert']).toContain('BEGIN CERTIFICATE')
  })

  it('a file sealed with another master key creates a new CA', async () => {
    const dataDir = newDataDir()
    const first = await loadOrCreateLanTls(dataDir, '192.168.1.5', NOW)
    writeFileSync(join(dataDir, 'master.key'), randomBytes(32))
    const second = await loadOrCreateLanTls(dataDir, '192.168.1.5', NOW)
    expect(second.caFingerprint).not.toBe(first.caFingerprint)
    expect(second.renewed).toBe(true)
  })
})
