import type { NoticeTarget } from '@workday/core'
import { navigateTo, navigateToWorkspace } from '../shell/pages.js'

const SCROLL_DELAY_MS = 100

// Scrolls to the board row of a ticket when it is on the page; a missing row is not an error.
function scrollToTicket(key: string): void {
  window.setTimeout(() => {
    for (const element of document.querySelectorAll('[data-ticket-key]')) {
      if (element.getAttribute('data-ticket-key') === key) {
        element.scrollIntoView({ block: 'center' })
        return
      }
    }
  }, SCROLL_DELAY_MS)
}

// A remote device has no Workspace page, so a workspace or Teams notice opens the board there.
export function openNoticeTarget(target: NoticeTarget | null, remote: boolean): void {
  if (target === null) {
    return
  }
  if (target.kind === 'url') {
    window.open(target.url, '_blank', 'noopener')
  } else if (target.kind === 'schedules' && !remote) {
    navigateTo('schedules')
  } else if (target.kind === 'workspace' && !remote) {
    navigateToWorkspace(target.tab, target.session)
  } else if (target.kind === 'teams' && !remote) {
    navigateToWorkspace(target.key, null, target.conversationId)
  } else {
    navigateTo('tickets')
    if (target.kind === 'board' && target.key !== null) {
      scrollToTicket(target.key)
    }
  }
}
