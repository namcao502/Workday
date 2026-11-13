import type { AppError, TeamsDraft, TeamsReadView, TeamsStatusView } from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, hasOkFlag, isPlainCode, send } from './client.js'

export type TeamsWrite = { readonly ok: true } | { readonly ok: false; readonly error: AppError }

export const teamsKey = (ticket: string, conversation: string): readonly string[] => [
  'teams',
  ticket,
  conversation,
]

export async function getTeams(ticket: string, conversation: string): Promise<TeamsReadView> {
  const path = `/api/teams/${encodeURIComponent(ticket)}?conversation=${encodeURIComponent(conversation)}`
  const raw = await send('GET', path)
  if (!raw.ok || !isRecord(raw.body) || typeof raw.body['state'] !== 'string') {
    throw new ApiError(raw.status, path)
  }
  return raw.body as unknown as TeamsReadView
}

// A write answers `{ ok, error? }` even on a 4xx/5xx; a body without the flag is a transport failure.
async function write(path: string, payload?: unknown): Promise<TeamsWrite> {
  const raw = await send('POST', path, payload)
  if (!hasOkFlag(raw.body)) {
    throw new ApiError(raw.status, path)
  }
  if (raw.body.ok) {
    return { ok: true }
  }
  const code = isRecord(raw.body['error']) ? raw.body['error']['code'] : undefined
  return { ok: false, error: { code: isPlainCode(code) ? code : 'teamsFailed' } }
}

export function teamsSignIn(): Promise<TeamsWrite> {
  return write('/api/teams/signin')
}

function ticketPath(ticket: string, action: string): string {
  return `/api/teams/${encodeURIComponent(ticket)}/${action}`
}

export function reactToMessage(
  ticket: string,
  conversationId: string,
  messageId: string,
  key: string,
): Promise<TeamsWrite> {
  return write(ticketPath(ticket, 'react'), { conversationId, messageId, key })
}

export function deleteMessage(
  ticket: string,
  conversationId: string,
  messageId: string,
): Promise<TeamsWrite> {
  return write(ticketPath(ticket, 'delete'), { conversationId, messageId })
}

export function handOffMessage(
  ticket: string,
  conversationId: string,
  messageId: string,
  session: string,
): Promise<TeamsWrite> {
  return write(ticketPath(ticket, 'handoff'), { conversationId, messageId, session })
}

export function markTeamsSeen(ticket: string, conversationId: string): Promise<TeamsWrite> {
  return write(ticketPath(ticket, 'seen'), { conversationId })
}

// Teams images need the signed-in session, so the browser loads them through the server.
export function teamsImageSrc(url: string): string {
  return `/api/teams/image?url=${encodeURIComponent(url)}`
}

// confirm: the user saw "may have been sent" and sends again anyway.
export function replyToThread(
  ticket: string,
  body: {
    readonly conversationId: string
    readonly rootId: string | null
    readonly draft: TeamsDraft
    readonly confirm: boolean
  },
): Promise<TeamsWrite> {
  return write(ticketPath(ticket, 'reply'), body)
}

export function postToChannel(
  ticket: string,
  body: {
    readonly channelId: string
    readonly subject: string
    readonly draft: TeamsDraft
    readonly confirm: boolean
  },
): Promise<TeamsWrite> {
  return write(ticketPath(ticket, 'post'), body)
}

export function editMessage(
  ticket: string,
  body: {
    readonly conversationId: string
    readonly messageId: string
    readonly subject: string | null
    readonly draft: TeamsDraft
  },
): Promise<TeamsWrite> {
  return write(ticketPath(ticket, 'edit'), body)
}

export async function getTeamsStatus(): Promise<TeamsStatusView> {
  const path = '/api/teams/status'
  const raw = await send('GET', path)
  if (!raw.ok || !isRecord(raw.body) || typeof raw.body['configured'] !== 'boolean') {
    throw new ApiError(raw.status, path)
  }
  return raw.body as unknown as TeamsStatusView
}
