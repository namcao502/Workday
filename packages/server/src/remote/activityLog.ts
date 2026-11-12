import type { ActivityEntry } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

export const MAX_ACTIVITY_ENTRIES = 300

function parseEntry(raw: unknown): ActivityEntry | null {
  if (
    !isRecord(raw) ||
    typeof raw['at'] !== 'string' ||
    typeof raw['deviceId'] !== 'string' ||
    typeof raw['deviceName'] !== 'string' ||
    typeof raw['method'] !== 'string' ||
    typeof raw['route'] !== 'string' ||
    typeof raw['status'] !== 'number'
  ) {
    return null
  }
  return {
    at: raw['at'],
    deviceId: raw['deviceId'],
    deviceName: raw['deviceName'],
    method: raw['method'],
    route: raw['route'],
    status: raw['status'],
  }
}

function parseEntries(raw: unknown): readonly ActivityEntry[] | null {
  if (!Array.isArray(raw)) {
    return null
  }
  return raw.map(parseEntry).filter((entry): entry is ActivityEntry => entry !== null)
}

// remote-activity.json, from MobileActivityLog.cs: what the devices did, newest first, 300 kept.
export class ActivityLog {
  private entries: readonly ActivityEntry[]
  private writes: Promise<unknown> = Promise.resolve()

  constructor(private readonly path: string) {
    this.entries = readJson(path, parseEntries, [])
  }

  latest(count: number): readonly ActivityEntry[] {
    return this.entries.slice(0, count)
  }

  add(entry: ActivityEntry): Promise<void> {
    const run = this.writes.then(async () => {
      const next = [entry, ...this.entries].slice(0, MAX_ACTIVITY_ENTRIES)
      await writeJsonAtomic(this.path, next)
      this.entries = next
    })
    this.writes = run.catch(() => undefined)
    return run
  }
}
