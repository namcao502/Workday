import 'reflect-metadata' // tsyringe, used by @peculiar/x509, needs this polyfill first
import { createHash, randomBytes, webcrypto } from 'node:crypto'
import { join } from 'node:path'
import * as x509 from '@peculiar/x509'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'
import { loadMasterKey, openSecret, sealSecret } from '../security/secretBox.js'

const FILE_NAME = 'lan-tls.json'
const CA_COMMON_NAME = 'Workday Remote CA'
const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const CA_VALID_DAYS = 3650
const CA_BACKDATE_DAYS = 1
const SERVER_VALID_DAYS = 397 // iOS rejects a server cert valid for more than 398 days
const SERVER_BACKDATE_HOURS = 1
const RENEW_BEFORE_DAYS = 30
const SERIAL_BYTES = 16
const OWNER_ONLY_MODE = 0o600
const KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGNING_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' } as const

x509.cryptoProvider.set(webcrypto)

export interface LanTls {
  readonly key: string // server private key, PEM (PKCS#8)
  readonly cert: string // server certificate, PEM
  readonly caDer: Buffer // the CA the phone installs
  readonly caFingerprint: string // SHA-256 of caDer, "AB:CD:..."
  readonly renewed: boolean // true when this call issued a new server cert
}

type CryptoKey = webcrypto.CryptoKey
type CryptoKeyPair = webcrypto.CryptoKeyPair

interface StoredTls {
  readonly caCert: string
  readonly caKey: string // sealed
  readonly serverCert: string
  readonly serverKey: string // sealed
}

interface Ca {
  readonly cert: x509.X509Certificate
  readonly key: CryptoKey
  readonly pem: string
  readonly keyPem: string
}

function parseStored(raw: unknown): StoredTls | null {
  if (
    !isRecord(raw) ||
    typeof raw['caCert'] !== 'string' ||
    typeof raw['caKey'] !== 'string' ||
    typeof raw['serverCert'] !== 'string' ||
    typeof raw['serverKey'] !== 'string'
  ) {
    return null
  }
  return {
    caCert: raw['caCert'],
    caKey: raw['caKey'],
    serverCert: raw['serverCert'],
    serverKey: raw['serverKey'],
  }
}

function fingerprintOf(der: Buffer): string {
  const hex = createHash('sha256').update(der).digest('hex').toUpperCase()
  return hex.match(/.{2}/g)?.join(':') ?? hex
}

function toPem(label: string, der: ArrayBuffer): string {
  const lines =
    Buffer.from(der)
      .toString('base64')
      .match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

function fromPem(pem: string): Buffer {
  return Buffer.from(pem.replace(/-----[A-Z ]+-----/g, '').replaceAll(/\s/g, ''), 'base64')
}

async function exportKeyPem(key: CryptoKey): Promise<string> {
  return toPem('PRIVATE KEY', await webcrypto.subtle.exportKey('pkcs8', key))
}

function importSigningKey(pem: string): Promise<CryptoKey> {
  return webcrypto.subtle.importKey('pkcs8', fromPem(pem), KEY_ALGORITHM, true, ['sign'])
}

// 16 random bytes, high bit 0 so the DER integer stays positive, never all zero.
function randomSerial(): string {
  let bytes = randomBytes(SERIAL_BYTES)
  while (bytes.every((byte) => byte === 0)) {
    bytes = randomBytes(SERIAL_BYTES)
  }
  bytes[0] = (bytes[0] ?? 0) & 0x7f
  return bytes.toString('hex')
}

function generateKeyPair(): Promise<CryptoKeyPair> {
  return webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify'])
}

async function createCa(now: Date): Promise<Ca> {
  const keys = await generateKeyPair()
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomSerial(),
    name: `CN=${CA_COMMON_NAME}`,
    notBefore: new Date(now.getTime() - CA_BACKDATE_DAYS * DAY_MS),
    notAfter: new Date(now.getTime() + CA_VALID_DAYS * DAY_MS),
    signingAlgorithm: SIGNING_ALGORITHM,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true,
      ),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  })
  return {
    cert,
    key: keys.privateKey,
    pem: cert.toString('pem'),
    keyPem: await exportKeyPem(keys.privateKey),
  }
}

async function issueServerCert(
  ca: Ca,
  address: string,
  now: Date,
): Promise<{ cert: string; keyPem: string }> {
  const keys = await generateKeyPair()
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: randomSerial(),
    subject: `CN=${address}`,
    issuer: ca.cert.subject,
    notBefore: new Date(now.getTime() - SERVER_BACKDATE_HOURS * HOUR_MS),
    notAfter: new Date(now.getTime() + SERVER_VALID_DAYS * DAY_MS),
    signingAlgorithm: SIGNING_ALGORITHM,
    publicKey: keys.publicKey,
    signingKey: ca.key,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([{ type: 'ip', value: address }]),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(ca.cert.publicKey),
    ],
  })
  return { cert: cert.toString('pem'), keyPem: await exportKeyPem(keys.privateKey) }
}

// True when the SAN holds exactly the address and the cert has at least RENEW_BEFORE_DAYS left.
function isServerCertCurrent(certPem: string, address: string, now: Date): boolean {
  const cert = new x509.X509Certificate(certPem)
  const san = cert.getExtension(x509.SubjectAlternativeNameExtension)
  if (san === null) {
    return false
  }
  const names = san.names.items
  const holdsOnlyAddress =
    names.length === 1 && names[0]?.type === 'ip' && names[0].value === address
  return holdsOnlyAddress && cert.notAfter.getTime() - now.getTime() >= RENEW_BEFORE_DAYS * DAY_MS
}

async function openCa(stored: StoredTls, masterKey: Buffer): Promise<Ca | null> {
  const keyPem = openSecret(masterKey, stored.caKey)
  if (keyPem === null) {
    return null
  }
  try {
    const cert = new x509.X509Certificate(stored.caCert)
    return { cert, key: await importSigningKey(keyPem), pem: stored.caCert, keyPem }
  } catch {
    return null
  }
}

function toResult(ca: Ca, cert: string, key: string, renewed: boolean): LanTls {
  const caDer = Buffer.from(ca.cert.rawData)
  return { key, cert, caDer, caFingerprint: fingerprintOf(caDer), renewed }
}

export async function loadOrCreateLanTls(
  dataDir: string,
  address: string,
  now: Date,
): Promise<LanTls> {
  const path = join(dataDir, FILE_NAME)
  const masterKey = loadMasterKey(dataDir)
  const stored = readJson(path, parseStored, null)
  const existingCa = stored === null ? null : await openCa(stored, masterKey)
  const serverKey = stored === null ? null : openSecret(masterKey, stored.serverKey)
  if (stored !== null && existingCa !== null && serverKey !== null) {
    if (isServerCertCurrentSafe(stored.serverCert, address, now)) {
      return toResult(existingCa, stored.serverCert, serverKey, false)
    }
  }
  const ca = existingCa ?? (await createCa(now))
  const server = await issueServerCert(ca, address, now)
  const next: StoredTls = {
    caCert: ca.pem,
    caKey: sealSecret(masterKey, ca.keyPem),
    serverCert: server.cert,
    serverKey: sealSecret(masterKey, server.keyPem),
  }
  await writeJsonAtomic(path, next, process.platform === 'win32' ? undefined : OWNER_ONLY_MODE)
  return toResult(ca, server.cert, server.keyPem, true)
}

function isServerCertCurrentSafe(certPem: string, address: string, now: Date): boolean {
  try {
    return isServerCertCurrent(certPem, address, now)
  } catch {
    return false
  }
}

// The CA fingerprint from the stored file, or null before the CA exists.
export function readCaFingerprint(dataDir: string): string | null {
  const stored = readJson(join(dataDir, FILE_NAME), parseStored, null)
  if (stored === null) {
    return null
  }
  try {
    return fingerprintOf(Buffer.from(new x509.X509Certificate(stored.caCert).rawData))
  } catch {
    return null
  }
}
