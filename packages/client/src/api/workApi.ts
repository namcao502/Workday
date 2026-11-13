import type { ReadyToTestOutcome, TakeOutcome, WorkView } from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, isPlainCode, send, type RawResponse } from './client.js'

function isWorkView(value: unknown): value is WorkView {
  return isRecord(value) && Array.isArray(value['groups']) && isRecord(value['prs'])
}

export async function getWork(): Promise<WorkView> {
  const raw = await send('GET', '/api/work')
  if (!raw.ok || !isWorkView(raw.body)) {
    throw new ApiError(raw.status, '/api/work')
  }
  return raw.body
}

// A refusal carries `{ ok: false, error: { code } }`; a named code is kept on the ApiError for errorText.
function refusal(raw: RawResponse, path: string): ApiError {
  const error = isRecord(raw.body) ? raw.body['error'] : undefined
  const code = isRecord(error) ? error['code'] : undefined
  return new ApiError(raw.status, path, isPlainCode(code) ? code : null)
}

async function post(path: string): Promise<Record<string, unknown>> {
  const raw = await send('POST', path)
  if (!raw.ok || !isRecord(raw.body)) {
    throw refusal(raw, path)
  }
  return raw.body
}

export async function moveToReadyToTest(key: string): Promise<ReadyToTestOutcome> {
  const path = `/api/work/ready-to-test/${encodeURIComponent(key)}`
  const body = await post(path)
  const { status } = body
  if (status === 'failed' && typeof body['step'] === 'string') {
    return { status, step: body['step'] }
  }
  if (
    status === 'moved' ||
    status === 'alreadyPast' ||
    status === 'notFound' ||
    status === 'busy'
  ) {
    return { status }
  }
  throw new ApiError(200, path)
}

export async function markCommentsSeen(key: string): Promise<void> {
  await post(`/api/work/comments/${encodeURIComponent(key)}/seen`)
}

export async function hideReview(repository: string, pullRequestId: number): Promise<void> {
  await post(`/api/work/reviews/${encodeURIComponent(repository)}/${String(pullRequestId)}/hide`)
}

export async function takeSuggestion(key: string): Promise<TakeOutcome> {
  const path = `/api/work/suggestions/${encodeURIComponent(key)}/take`
  const body = await post(path)
  if (body['ok'] === true) {
    return { ok: true }
  }
  if (typeof body['holder'] === 'string') {
    return { ok: false, holder: body['holder'] }
  }
  throw new ApiError(200, path)
}

export async function hideSuggestion(key: string): Promise<void> {
  await post(`/api/work/suggestions/${encodeURIComponent(key)}/hide`)
}
