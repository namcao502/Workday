import type { PushSubscriptionJson } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

export const LOCAL_PUSH_LIMIT = 5

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

// Null unless the endpoint is an https URL and both keys are text.
export function parsePushSubscription(raw: unknown): PushSubscriptionJson | null {
  if (!isRecord(raw) || !nonEmptyText(raw['endpoint']) || !isRecord(raw['keys'])) {
    return null
  }
  const { p256dh, auth } = raw['keys']
  if (!isHttpsUrl(raw['endpoint']) || !nonEmptyText(p256dh) || !nonEmptyText(auth)) {
    return null
  }
  return { endpoint: raw['endpoint'], keys: { p256dh, auth } }
}

// A subscription plus the page origin that made it: its service worker sees only that origin's tabs.
export interface LocalPushEntry extends PushSubscriptionJson {
  readonly origin: string | null // null for an entry saved before origins were recorded
}

function parseEntry(raw: unknown): LocalPushEntry | null {
  const subscription = parsePushSubscription(raw)
  if (subscription === null || !isRecord(raw)) {
    return null
  }
  const origin = raw['origin']
  return { ...subscription, origin: typeof origin === 'string' && origin !== '' ? origin : null }
}

// One bad entry is dropped, not the whole file.
function parseFile(raw: unknown): readonly LocalPushEntry[] | null {
  if (!Array.isArray(raw)) {
    return null
  }
  const entries: readonly unknown[] = raw
  return entries
    .map(parseEntry)
    .filter((item): item is LocalPushEntry => item !== null)
    .slice(-LOCAL_PUSH_LIMIT)
}

// Browser push subscriptions of this PC (local-push.json); the newest win, one per endpoint.
export class LocalPushStore {
  private subscriptions: readonly LocalPushEntry[]
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly path: string) {
    this.subscriptions = readJson(path, parseFile, [])
  }

  list(): readonly LocalPushEntry[] {
    return this.subscriptions
  }

  add(subscription: PushSubscriptionJson, origin: string | null = null): Promise<void> {
    const entry: LocalPushEntry = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      origin,
    }
    return this.commit((current) =>
      [...current.filter((item) => item.endpoint !== entry.endpoint), entry].slice(
        -LOCAL_PUSH_LIMIT,
      ),
    )
  }

  remove(endpoint: string): Promise<void> {
    return this.commit((current) => {
      const kept = current.filter((item) => item.endpoint !== endpoint)
      return kept.length === current.length ? current : kept
    })
  }

  // Saves first, then swaps, so a failed write leaves memory as the disk has it.
  private commit(
    change: (current: readonly LocalPushEntry[]) => readonly LocalPushEntry[],
  ): Promise<void> {
    const run = this.queue.then(async () => {
      const next = change(this.subscriptions)
      if (next === this.subscriptions) {
        return
      }
      await writeJsonAtomic(this.path, next)
      this.subscriptions = next
    })
    this.queue = run.catch(() => undefined)
    return run
  }
}
