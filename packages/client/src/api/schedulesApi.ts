import type { SchedulesView } from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, send } from './client.js'

export interface LogChunk {
  readonly text: string
  readonly next: number // the offset to read on from
}

function isSchedulesView(value: unknown): value is SchedulesView {
  return isRecord(value) && isRecord(value['scan']) && isRecord(value['jobs'])
}

function isLogChunk(value: unknown): value is LogChunk {
  return isRecord(value) && typeof value['text'] === 'string' && typeof value['next'] === 'number'
}

export async function getSchedules(): Promise<SchedulesView> {
  const raw = await send('GET', '/api/schedules')
  if (!raw.ok || !isSchedulesView(raw.body)) {
    throw new ApiError(raw.status, '/api/schedules')
  }
  return raw.body
}

// Throws ApiError 409 when a scan is already running and 400 when no command is set up.
export async function runScanNow(): Promise<void> {
  const path = '/api/schedules/scan/run'
  const raw = await send('POST', path)
  if (!raw.ok) {
    throw new ApiError(raw.status, path)
  }
}

export async function markScansSeen(): Promise<void> {
  const path = '/api/schedules/scan/seen'
  const raw = await send('POST', path)
  if (!raw.ok) {
    throw new ApiError(raw.status, path)
  }
}

export async function getScanLog(runId: string, from: number): Promise<LogChunk> {
  const path = `/api/schedules/scan/runs/${encodeURIComponent(runId)}/log?from=${String(from)}`
  const raw = await send('GET', path)
  if (!raw.ok || !isLogChunk(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body
}
