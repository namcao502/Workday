import { join } from 'node:path'
import { allows, type PushSubscriptionJson, type RemoteArea } from '@workday/core'
import { generateVAPIDKeys, sendNotification, WebPushError } from 'web-push'
import { readFileSecrets, saveSecrets } from '../config.js'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'
import type { StoredDevice } from './deviceStore.js'

export interface PushMessage {
  readonly title: string
  readonly body: string
  readonly url: string // "/#/timesheet"
  readonly tag: string // a repeat with the same tag replaces the earlier one
}

export interface VapidDetails {
  readonly subject: string
  readonly publicKey: string
  readonly privateKey: string
}

// The seam the tests fake; the default wraps web-push's sendNotification.
export type SendPush = (
  subscription: PushSubscriptionJson,
  payload: string,
  vapid: VapidDetails,
) => Promise<{ readonly statusCode: number }>

export interface PushDeviceStore {
  list(): readonly StoredDevice[]
  update(id: string, change: (device: StoredDevice) => StoredDevice): Promise<StoredDevice | null>
}

export interface PushServiceDeps {
  readonly dataDir: string
  readonly store: PushDeviceStore
  readonly publicHost: () => string | null
  readonly send?: SendPush
  readonly logError?: (message: string, error: unknown) => void
}

const REMOTE_FILE = 'remote.json'
const GONE_STATUSES: ReadonlySet<number> = new Set([404, 410])
const SUCCESS_STATUS_MIN = 200
const SUCCESS_STATUS_MAX = 299

// A rejection with a status (a push service answering 4xx/5xx) becomes a result, so callers read one shape.
export const sendWithWebPush: SendPush = async (subscription, payload, vapid) => {
  try {
    const result = await sendNotification(subscription, payload, { vapidDetails: vapid })
    return { statusCode: result.statusCode }
  } catch (error: unknown) {
    if (error instanceof WebPushError) {
      return { statusCode: error.statusCode }
    }
    throw error
  }
}

// An object without a key is valid (no keys yet); only a non-object is a bad file.
function parseRemoteFile(raw: unknown): { readonly key: string | null } | null {
  if (!isRecord(raw)) {
    return null
  }
  const key = raw['vapidPublicKey']
  return { key: typeof key === 'string' && key !== '' ? key : null }
}

function isSuccess(statusCode: number): boolean {
  return statusCode >= SUCCESS_STATUS_MIN && statusCode <= SUCCESS_STATUS_MAX
}

// VAPID keys (public in remote.json, private sealed in secrets.json) and Web Push delivery, from MobilePush.cs.
export class PushService {
  private publicKeyValue: string | null
  private keysReady: Promise<string> | null = null
  private readonly send: SendPush

  constructor(private readonly deps: PushServiceDeps) {
    this.publicKeyValue = this.readPublicKey()
    this.send = deps.send ?? sendWithWebPush
  }

  // The key if it already exists; null until the first publicKey() or send.
  peekPublicKey(): string | null {
    return this.hasPrivateKey() ? this.publicKeyValue : null
  }

  // Makes the key pair on first use.
  publicKey(): Promise<string> {
    this.keysReady ??= this.loadOrCreateKeys().catch((error: unknown) => {
      this.keysReady = null
      throw error
    })
    return this.keysReady
  }

  // Never rejects: a failed device is logged and skipped.
  async sendToArea(area: RemoteArea, message: PushMessage): Promise<void> {
    try {
      const vapid = await this.vapidDetails()
      if (vapid === null) {
        return
      }
      const payload = JSON.stringify(message)
      for (const device of this.deps.store.list()) {
        if (
          device.pushEnabled &&
          device.pushSubscription !== null &&
          allows(device.rights, area, 'view')
        ) {
          await this.deliver(device, payload, vapid)
        }
      }
    } catch (error: unknown) {
      this.logError('Sending the push failed', error)
    }
  }

  // The Settings test push: this device only, whatever its rights.
  async sendToDevice(deviceId: string, message: PushMessage): Promise<{ ok: boolean }> {
    try {
      const device = this.deps.store.list().find((candidate) => candidate.id === deviceId)
      const vapid = await this.vapidDetails()
      if (
        device === undefined ||
        vapid === null ||
        !device.pushEnabled ||
        device.pushSubscription === null
      ) {
        return { ok: false }
      }
      return { ok: await this.deliver(device, JSON.stringify(message), vapid) }
    } catch (error: unknown) {
      this.logError('Sending the push failed', error)
      return { ok: false }
    }
  }

  // True when the push service accepted it. 404 / 410 mean the subscription is gone: clear it.
  private async deliver(
    device: StoredDevice,
    payload: string,
    vapid: VapidDetails,
  ): Promise<boolean> {
    const subscription = device.pushSubscription
    if (subscription === null) {
      return false
    }
    try {
      const { statusCode } = await this.send(subscription, payload, vapid)
      if (isSuccess(statusCode)) {
        return true
      }
      if (GONE_STATUSES.has(statusCode)) {
        await this.deps.store.update(device.id, (current) => ({
          ...current,
          pushSubscription: null,
        }))
      }
      this.logError(`Push to ${device.name} failed with status ${String(statusCode)}`, null)
    } catch (error: unknown) {
      this.logError(`Push to ${device.name} failed`, error)
    }
    return false
  }

  // Null while there is no public host: the subject cannot be built.
  private async vapidDetails(): Promise<VapidDetails | null> {
    const host = this.deps.publicHost()
    if (host === null) {
      return null
    }
    const publicKey = await this.publicKey()
    return { subject: `https://${host}`, publicKey, privateKey: this.privateKey() }
  }

  private readPublicKey(): string | null {
    return readJson(join(this.deps.dataDir, REMOTE_FILE), parseRemoteFile, { key: null }).key
  }

  private privateKey(): string {
    return readFileSecrets(this.deps.dataDir).vapidPrivateKey ?? ''
  }

  private hasPrivateKey(): boolean {
    return readFileSecrets(this.deps.dataDir).vapidPrivateKey !== null
  }

  // A public key without its private half (secret lost) is replaced, as MobilePush does.
  private async loadOrCreateKeys(): Promise<string> {
    const publicKey = this.publicKeyValue
    if (publicKey !== null && this.hasPrivateKey()) {
      return publicKey
    }
    const created = generateVAPIDKeys()
    const saved = readFileSecrets(this.deps.dataDir)
    await saveSecrets(this.deps.dataDir, { ...saved, vapidPrivateKey: created.privateKey })
    await writeJsonAtomic(join(this.deps.dataDir, REMOTE_FILE), {
      vapidPublicKey: created.publicKey,
    })
    this.publicKeyValue = created.publicKey
    return created.publicKey
  }

  private logError(message: string, error: unknown): void {
    const logError = this.deps.logError ?? console.error
    logError(message, error)
  }
}
