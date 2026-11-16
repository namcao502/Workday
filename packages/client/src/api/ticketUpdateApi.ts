import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { TicketContent, TicketField, TicketUpdate } from '@workday/core'
import { isRecord } from '../json.js'
import { ApiError, send } from './client.js'

// The pending fields plus what the user viewed and what Jira shows now.
export type TicketUpdateView = Pick<
  TicketUpdate,
  'viewed' | 'current' | 'changedBy' | 'changedAt'
> & {
  readonly fields: readonly TicketField[]
}

export const ticketUpdateKey = (ticket: string): readonly string[] => ['ticket-update', ticket]

function ticketPath(ticket: string, suffix: string): string {
  return `/api/tickets/${encodeURIComponent(ticket)}/update${suffix}`
}

// null = nothing pending for the ticket.
export async function getTicketUpdate(ticket: string): Promise<TicketUpdateView | null> {
  const path = ticketPath(ticket, '')
  const raw = await send('GET', path)
  if (!raw.ok || !isRecord(raw.body) || !('update' in raw.body)) {
    throw new ApiError(raw.status, path)
  }
  return raw.body['update'] === null ? null : (raw.body['update'] as TicketUpdateView)
}

export async function markTicketUpdateViewed(ticket: string, shown: TicketContent): Promise<void> {
  const path = ticketPath(ticket, '/viewed')
  const raw = await send('POST', path, { shown })
  if (!raw.ok) {
    throw new ApiError(raw.status, path)
  }
}

export function useTicketUpdate(ticket: string): UseQueryResult<TicketUpdateView | null> {
  return useQuery({
    queryKey: ticketUpdateKey(ticket),
    queryFn: () => getTicketUpdate(ticket),
    // The update changes with Jira, so a reopened dialog must not show a stale one.
    gcTime: 0,
  })
}
