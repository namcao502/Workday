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

// One bad entry is dropped, not the whole file.
function parseFile(raw: unknown): readonly PushSubscriptionJson[] | null {
  if (!Array.isArray(raw)) {
    return null
  }
  const entries: readonly unknown[] = raw
  return entries
    .map(parsePushSubscription)
    .filter((item): item is PushSubscriptionJson => item !== null)
    .slice(-LOCAL_PUSH_LIMIT)
}

// Browser push subscriptions of this PC (local-push.json); the newest win, one per endpoint.
export class LocalPushStore {
  private subscriptions: readonly PushSubscriptionJson[]
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly path: string) {
    this.subscriptions = readJson(path, parseFile, [])
  }

  list(): readonly PushSubscriptionJson[] {
    return this.subscriptions
  }

  add(subscription: PushSubscriptionJson): Promise<void> {
    return this.commit((current) =>
      [...current.filter((item) => item.endpoint !== subscription.endpoint), subscription].slice(
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
    change: (current: readonly PushSubscriptionJson[]) => readonly PushSubscriptionJson[],
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
