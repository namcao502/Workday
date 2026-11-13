import type { SessionView, WaitReason, WorkspaceTab } from '@workday/core'
import { useEffect, useRef } from 'react'
import { useWorkspace } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import { workspaceSelectionFromHash } from '../shell/pages.js'
import { resolveSelection } from './selection.js'
import { folderName } from './WorkspaceTabs.js'

// Sessions whose wait is new compared with the previous snapshot.
export function newWaits(
  previous: readonly SessionView[],
  next: readonly SessionView[],
): readonly SessionView[] {
  const before = new Map(previous.map((session) => [session.name, session.wait]))
  return next.filter(
    (session) => session.wait !== null && before.get(session.name) !== session.wait,
  )
}

function waitText(wait: WaitReason): string {
  switch (wait) {
    case 'finished':
      return t('Claude is done - your turn.', 'Claude đã xong - đến lượt bạn.')
    case 'permission':
      return t('Claude needs your permission.', 'Claude cần bạn cho phép.')
    case 'question':
      return t('Claude is asking you something.', 'Claude đang hỏi bạn.')
  }
}

function subject(tab: WorkspaceTab | undefined, session: SessionView): string {
  if (tab === undefined) {
    return session.name
  }
  return tab.kind === 'ticket' ? tab.id : `Terminal ${folderName(tab.folder)}`
}

export function requestNoticePermission(): void {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

// App-wide (mounted in Shell): a notice fires even while another page is open.
export function useClaudeNotices(): void {
  const view = useWorkspace().data
  const previous = useRef<readonly SessionView[] | null>(null)

  useEffect(() => {
    if (view === undefined) {
      return
    }
    const before = previous.current
    previous.current = view.sessions
    if (before === null || typeof Notification === 'undefined') {
      return
    }
    if (Notification.permission !== 'granted') {
      return
    }
    const onWorkspace = window.location.hash.startsWith('#/workspace')
    const viewing = resolveSelection(view.tabs, workspaceSelectionFromHash(window.location.hash))
    for (const session of newWaits(before, view.sessions)) {
      const watching = document.hasFocus() && onWorkspace && viewing.session === session.name
      if (!watching && session.wait !== null) {
        const tab = view.tabs.find((candidate) => candidate.sessions.includes(session.name))
        new Notification(`${subject(tab, session)}: ${waitText(session.wait)}`)
      }
    }
  }, [view])
}
