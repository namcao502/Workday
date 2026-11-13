import type { NoticesView } from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, send } from './client.js'

function isNoticesView(value: unknown): value is NoticesView {
  return isRecord(value) && Array.isArray(value['notices']) && typeof value['unread'] === 'number'
}

async function noticesCall(method: string, path: string, payload?: unknown): Promise<NoticesView> {
  const raw = await send(method, path, payload)
  if (!raw.ok || !isNoticesView(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body
}

export function getNotices(): Promise<NoticesView> {
  return noticesCall('GET', '/api/notices')
}

export function markNoticeRead(id: number): Promise<NoticesView> {
  return noticesCall('POST', `/api/notices/${String(id)}/read`)
}

export function markAllNoticesRead(): Promise<NoticesView> {
  return noticesCall('POST', '/api/notices/read-all')
}

export function markPlaceRead(place: string): Promise<NoticesView> {
  return noticesCall('POST', '/api/notices/read-place', { place })
}
