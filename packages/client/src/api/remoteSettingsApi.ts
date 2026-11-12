import type { DeviceRights, RemoteStatusView } from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, send } from './client.js'

export interface DeviceChanges {
  readonly name?: string
  readonly rights?: DeviceRights
  readonly pushEnabled?: boolean
}

function isRemoteStatus(value: unknown): value is RemoteStatusView {
  return isRecord(value) && Array.isArray(value['devices']) && isRecord(value['pairing'])
}

async function statusCall(
  method: string,
  path: string,
  payload?: unknown,
): Promise<RemoteStatusView> {
  const raw = await send(method, path, payload)
  if (!raw.ok || !isRemoteStatus(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body
}

export function getRemote(): Promise<RemoteStatusView> {
  return statusCall('GET', '/api/remote')
}

// Opens the pairing window; the new code reaches the page through the status refetch.
export async function openPairing(): Promise<void> {
  const raw = await send('POST', '/api/remote/pairing')
  if (!raw.ok) {
    throw new ApiError(raw.status, '/api/remote/pairing')
  }
}

// Throws ApiError 409 when no request is waiting any more.
export function decidePairing(decision: 'approve' | 'reject'): Promise<RemoteStatusView> {
  return statusCall('POST', `/api/remote/pairing/${decision}`)
}

export function updateDevice(id: string, changes: DeviceChanges): Promise<RemoteStatusView> {
  return statusCall('PUT', `/api/remote/devices/${encodeURIComponent(id)}`, changes)
}

export function revokeDevice(id: string): Promise<RemoteStatusView> {
  return statusCall('DELETE', `/api/remote/devices/${encodeURIComponent(id)}`)
}

export async function sendDeviceTestPush(id: string): Promise<boolean> {
  const raw = await send('POST', `/api/remote/devices/${encodeURIComponent(id)}/test-push`)
  return raw.ok && isRecord(raw.body) && raw.body['ok'] === true
}
