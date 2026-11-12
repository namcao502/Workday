import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  DEFAULT_DEVICE_RIGHTS,
  parseRights,
  type PushSubscriptionJson,
  type RemoteDevice,
} from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

export const NAME_MAX_LENGTH = 40
const TOKEN_BYTE_COUNT = 32
const LAST_SEEN_INTERVAL_MS = 60_000

export interface StoredDevice extends RemoteDevice {
  readonly tokenHash: string // hex SHA-256 of the cookie token
  readonly pushSubscription: PushSubscriptionJson | null
}

export interface AddedDevice {
  readonly device: StoredDevice
  readonly token: string // the only copy; the store keeps its hash
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

// Trimmed and cut to NAME_MAX_LENGTH; empty when nothing is left.
export function normalizeDeviceName(raw: string): string {
  return raw.trim().slice(0, NAME_MAX_LENGTH).trimEnd()
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parsePushSubscription(raw: unknown): PushSubscriptionJson | null {
  if (!isRecord(raw) || typeof raw['endpoint'] !== 'string' || !isRecord(raw['keys'])) {
    return null
  }
  const { p256dh, auth } = raw['keys']
  if (typeof p256dh !== 'string' || typeof auth !== 'string') {
    return null
  }
  return { endpoint: raw['endpoint'], keys: { p256dh, auth } }
}

function parseDevice(raw: unknown): StoredDevice | null {
  if (
    !isRecord(raw) ||
    typeof raw['id'] !== 'string' ||
    typeof raw['name'] !== 'string' ||
    typeof raw['tokenHash'] !== 'string' ||
    typeof raw['createdAt'] !== 'string'
  ) {
    return null
  }
  const pushSubscription = parsePushSubscription(raw['pushSubscription'])
  return {
    id: raw['id'],
    name: raw['name'],
    email: textOrNull(raw['email']),
    tokenHash: raw['tokenHash'],
    rights: parseRights(raw['rights']),
    pushEnabled: raw['pushEnabled'] === true,
    pushSubscription,
    hasPushSubscription: pushSubscription !== null,
    createdAt: raw['createdAt'],
    lastSeenAt: textOrNull(raw['lastSeenAt']),
  }
}

function parseDevices(raw: unknown): readonly StoredDevice[] | null {
  if (!Array.isArray(raw)) {
    return null
  }
  return raw.map(parseDevice).filter((device): device is StoredDevice => device !== null)
}

// devices.json, from MobileDeviceStore.cs. Mutations run one at a time: save first, then swap memory.
export class DeviceStore {
  private devices: readonly StoredDevice[]
  private writes: Promise<unknown> = Promise.resolve()

  constructor(private readonly path: string) {
    this.devices = readJson(path, parseDevices, [])
  }

  list(): readonly StoredDevice[] {
    return this.devices
  }

  // No early exit: every device is compared so the time does not tell which one matched.
  findByToken(token: string): StoredDevice | null {
    const wanted = Buffer.from(hashToken(token), 'utf8')
    let found: StoredDevice | null = null
    for (const device of this.devices) {
      const stored = Buffer.from(device.tokenHash, 'utf8')
      if (stored.length === wanted.length && timingSafeEqual(stored, wanted)) {
        found = device
      }
    }
    return found
  }

  async add(name: string, now: Date, email: string | null): Promise<AddedDevice> {
    const token = randomBytes(TOKEN_BYTE_COUNT).toString('base64url')
    const device: StoredDevice = {
      id: randomUUID().replaceAll('-', ''),
      name: normalizeDeviceName(name),
      email,
      tokenHash: hashToken(token),
      rights: DEFAULT_DEVICE_RIGHTS,
      pushEnabled: false,
      pushSubscription: null,
      hasPushSubscription: false,
      createdAt: now.toISOString(),
      lastSeenAt: null,
    }
    await this.mutate((devices) => [...devices, device])
    return { device, token }
  }

  // Null when the device is not there (anymore).
  async update(
    id: string,
    change: (device: StoredDevice) => StoredDevice,
  ): Promise<StoredDevice | null> {
    let updated: StoredDevice | null = null
    await this.mutate((devices) =>
      devices.map((device) => {
        if (device.id !== id) {
          return device
        }
        const changed = change(device)
        updated = { ...changed, hasPushSubscription: changed.pushSubscription !== null }
        return updated
      }),
    )
    return updated
  }

  // An empty name changes nothing.
  async rename(id: string, name: string): Promise<void> {
    const newName = normalizeDeviceName(name)
    if (newName !== '') {
      await this.update(id, (device) => ({ ...device, name: newName }))
    }
  }

  async remove(id: string): Promise<boolean> {
    let removed = false
    await this.mutate((devices) => {
      removed = devices.some((device) => device.id === id)
      return devices.filter((device) => device.id !== id)
    })
    return removed
  }

  // Skips the write when the last one is under a minute old, so a request does not cost a file write.
  async touch(id: string, now: Date): Promise<void> {
    const device = this.devices.find((candidate) => candidate.id === id)
    const lastSeen = device?.lastSeenAt == null ? null : Date.parse(device.lastSeenAt)
    if (
      device === undefined ||
      (lastSeen !== null && now.getTime() - lastSeen < LAST_SEEN_INTERVAL_MS)
    ) {
      return
    }
    await this.update(id, (current) => ({ ...current, lastSeenAt: now.toISOString() }))
  }

  private mutate(
    change: (devices: readonly StoredDevice[]) => readonly StoredDevice[],
  ): Promise<void> {
    const run = this.writes.then(async () => {
      const next = change(this.devices)
      await writeJsonAtomic(this.path, next)
      this.devices = next
    })
    this.writes = run.catch(() => undefined)
    return run
  }
}
