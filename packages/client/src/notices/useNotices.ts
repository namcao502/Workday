import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { noticeChannels, noticeText, type Notice, type NoticesView } from '@workday/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { queryKeys } from '../api/client.js'
import { getNotices, markAllNoticesRead, markNoticeRead, markPlaceRead } from '../api/noticeApi.js'
import { useAccess } from '../api/useMe.js'
import { getLanguage } from '../i18n.js'
import type { PageId } from '../shell/pages.js'
import { openNoticeTarget } from './noticeTarget.js'

export const MAX_TOASTS = 3
const BOARD_PLACE = 'board'

// Refetched on notices.changed (useEvents). A remote device sees them with the board right.
export function useNoticesView(): UseQueryResult<NoticesView> {
  const canSee = useAccess().canSee('board')
  return useQuery({ queryKey: queryKeys.notices, queryFn: getNotices, enabled: canSee })
}

export interface NoticeActions {
  readonly read: (id: number) => Promise<void>
  readonly readAll: () => Promise<void>
  readonly readPlace: (place: string) => Promise<void>
}

// Each call puts the returned view in the cache, so the count drops before the event arrives.
export function useNoticeActions(): NoticeActions {
  const queryClient = useQueryClient()
  return useMemo(() => {
    async function put(call: Promise<NoticesView>): Promise<void> {
      queryClient.setQueryData(queryKeys.notices, await call)
    }
    return {
      read: (id) => put(markNoticeRead(id)),
      readAll: () => put(markAllNoticesRead()),
      readPlace: (place) => put(markPlaceRead(place)),
    }
  }, [queryClient])
}

function desktopAllowed(): boolean {
  return (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    (document.hidden || !document.hasFocus())
  )
}

export interface NoticeAlerts {
  readonly toasts: readonly Notice[]
  readonly dismiss: (notice: Notice) => void // closes the toast and reads the notice
  readonly expire: (id: number) => void // closes the toast only
  readonly open: (notice: Notice) => void
}

// App-wide (mounted in Shell): raises a toast / desktop notice for each notice newer than any seen before.
export function useNotices(page: PageId): NoticeAlerts {
  const view = useNoticesView().data
  const actions = useNoticeActions()
  const remote = useAccess().mode === 'remote'
  const [toasts, setToasts] = useState<readonly Notice[]>([])
  const highestSeen = useRef<number | null>(null)
  const highestBoardRead = useRef(0)

  function open(notice: Notice): void {
    openNoticeTarget(notice.target, remote)
    void actions.read(notice.id)
    setToasts((current) => current.filter((toast) => toast.id !== notice.id))
  }

  useEffect(() => {
    if (view === undefined) {
      return
    }
    const seen = highestSeen.current
    highestSeen.current = view.notices.reduce(
      (most, notice) => Math.max(most, notice.id),
      seen ?? 0,
    )
    if (seen === null) {
      return
    }
    const fresh = view.notices.filter((notice) => notice.id > seen)
    const forToast = fresh.filter((notice) => noticeChannels(notice.topic, view.prefs).toast)
    if (forToast.length !== 0) {
      setToasts((current) => [...current, ...forToast].slice(-MAX_TOASTS))
    }
    for (const notice of fresh) {
      if (noticeChannels(notice.topic, view.prefs).desktop && desktopAllowed()) {
        const desktop = new Notification(noticeText(notice.event, getLanguage()))
        desktop.onclick = () => {
          window.focus()
          open(notice)
        }
      }
    }
  }, [view])

  useEffect(() => {
    if (view === undefined || page !== 'tickets') {
      return
    }
    const unread = view.notices.filter((notice) => !notice.read && notice.place === BOARD_PLACE)
    const newest = unread.reduce((most, notice) => Math.max(most, notice.id), 0)
    if (newest > highestBoardRead.current) {
      highestBoardRead.current = newest
      void actions.readPlace(BOARD_PLACE)
    }
  }, [view, page, actions])

  return {
    toasts,
    dismiss: (notice) => {
      setToasts((current) => current.filter((toast) => toast.id !== notice.id))
      void actions.read(notice.id)
    },
    expire: (id) => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    },
    open,
  }
}
