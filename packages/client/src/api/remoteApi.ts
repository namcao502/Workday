import type { AppError, MeView } from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, hasOkFlag, isPlainCode, send, type PlainCode } from './client.js'

export type PairingStatus = 'waiting' | 'rejected' | 'approved'
export type PairResult =
  | { readonly ok: true; readonly requestId: string }
  | { readonly ok: false; readonly error: AppError }

function isMeView(value: unknown): value is MeView {
  if (!isRecord(value)) {
    return false
  }
  const mode = value['mode']
  return mode === 'local' || mode === 'unpaired' || (mode === 'remote' && isRecord(value['device']))
}

function errorCodeOf(body: unknown): PlainCode | null {
  const error = isRecord(body) ? body['error'] : undefined
  const code = isRecord(error) ? error['code'] : undefined
  return isPlainCode(code) ? code : null
}

// Throws ApiError carrying the code (accessRequired, remoteDisabled) when the server refuses.
export async function getMe(): Promise<MeView> {
  const path = '/api/me'
  const raw = await send('GET', path)
  if (!raw.ok || !isMeView(raw.body)) {
    throw new ApiError(raw.status, path, errorCodeOf(raw.body))
  }
  return raw.body
}

// A 409 is a refusal the page shows (wrongCode, pairingClosed), so it is returned, not thrown.
export async function submitPairing(code: string, name: string): Promise<PairResult> {
  const path = '/api/pair'
  const raw = await send('POST', path, { code, name })
  if (raw.ok && isRecord(raw.body) && typeof raw.body['requestId'] === 'string') {
    return { ok: true, requestId: raw.body['requestId'] }
  }
  const error = errorCodeOf(raw.body)
  if (hasOkFlag(raw.body) && !raw.body.ok && error !== null) {
    return { ok: false, error: { code: error } }
  }
  throw new ApiError(raw.status, path, error)
}

export async function getPairingStatus(requestId: string): Promise<PairingStatus> {
  const path = `/api/pair/status?id=${encodeURIComponent(requestId)}`
  const raw = await send('GET', path)
  const status = isRecord(raw.body) ? raw.body['status'] : undefined
  if (raw.ok && (status === 'waiting' || status === 'rejected' || status === 'approved')) {
    return status
  }
  throw new ApiError(raw.status, path)
}

export async function getPushKey(): Promise<string> {
  const path = '/api/push/key'
  const raw = await send('GET', path)
  const key = isRecord(raw.body) ? raw.body['publicKey'] : undefined
  if (!raw.ok || typeof key !== 'string') {
    throw new ApiError(raw.status, path)
  }
  return key
}

export async function putPush(subscription: PushSubscriptionJSON): Promise<void> {
  const raw = await send('PUT', '/api/push', { subscription })
  if (!raw.ok) {
    throw new ApiError(raw.status, '/api/push')
  }
}

export async function deletePush(): Promise<void> {
  const raw = await send('DELETE', '/api/push')
  if (!raw.ok) {
    throw new ApiError(raw.status, '/api/push')
  }
}

export async function sendTestPush(): Promise<boolean> {
  const raw = await send('POST', '/api/push/test')
  return raw.ok && isRecord(raw.body) && raw.body['ok'] === true
}
