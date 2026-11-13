import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { TeamsReadView } from '@workday/core'
import { useEffect } from 'react'
import { useWork } from '../../api/useWork.js'
import { getTeams, markTeamsSeen, teamsKey } from '../../api/teamsApi.js'

const POLL_MS = 10_000
const SEARCH_POLL_MS = 5_000

// What the thread draws: ids, edit times and reactions. Equal signatures keep the old data, so no redraw.
function signature(view: TeamsReadView): string {
  if (view.state === 'notPosted') {
    return [view.state, view.channelId, view.posted, view.draft.subject, view.draft.bodyHtml].join(
      '|',
    )
  }
  if (view.state !== 'thread') {
    return view.state
  }
  const messages = view.thread.messages.map((message) =>
    [
      message.id,
      message.editedAt ?? '',
      message.reactions.map((r) => `${r.key}:${r.userMris.join(',')}`).join(';'),
    ].join('|'),
  )
  return [view.conversationId, view.deepLink, view.pending.join(','), ...messages].join('\n')
}

function keepIfSame(old: unknown, next: unknown): unknown {
  const before = old as TeamsReadView | undefined
  const after = next as TeamsReadView
  return before !== undefined && signature(before) === signature(after) ? before : after
}

// Reads the conversation; a changed conversation is a new query, so a late answer for the old one is never shown.
export function useTeamsRead(
  ticket: string,
  conversation: string,
  options: { readonly visible: boolean; readonly writing: boolean },
): UseQueryResult<TeamsReadView> {
  const { visible, writing } = options
  return useQuery({
    queryKey: teamsKey(ticket, conversation),
    queryFn: () => getTeams(ticket, conversation),
    structuralSharing: keepIfSame,
    refetchInterval: (query) => {
      if (!visible || writing) {
        return false
      }
      if (query.state.data?.state === 'searching') {
        return SEARCH_POLL_MS
      }
      return document.hasFocus() ? POLL_MS : false
    },
  })
}

// An open conversation with a waiting message counts as read while the window has focus.
export function useMarkTeamsSeen(
  ticket: string,
  view: TeamsReadView | undefined,
  visible: boolean,
): void {
  const queryClient = useQueryClient()
  const conversationId = view?.state === 'thread' ? view.conversationId : null
  const pending = conversationId !== null && view?.pending.includes(conversationId) === true
  useEffect(() => {
    if (!visible || conversationId === null || !pending) {
      return undefined
    }
    function mark(): void {
      if (conversationId !== null && document.hasFocus()) {
        void markTeamsSeen(ticket, conversationId).then(() =>
          queryClient.invalidateQueries({ queryKey: ['teams', ticket] }),
        )
      }
    }
    mark()
    window.addEventListener('focus', mark)
    return () => {
      window.removeEventListener('focus', mark)
    }
  }, [ticket, conversationId, pending, visible, queryClient])
}

// The tab's dot: the work view lists a teamsMessage to-do per ticket with a message waiting.
export function useTeamsPending(ticket: string): boolean {
  const { data } = useWork()
  return (
    data?.groups.some((group) =>
      group.items.some((item) => item.kind === 'teamsMessage' && item.ticketKey === ticket),
    ) === true
  )
}
