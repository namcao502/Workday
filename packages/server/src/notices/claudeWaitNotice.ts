import type { WaitReason, WorkspaceTab } from '@workday/core'
import type { NoticeInput } from './noticeService.js'

function folderName(folder: string | null): string {
  if (folder === null) {
    return 'Dev repo'
  }
  const parts = folder.split(/[\\/]/).filter((part) => part !== '')
  return parts[parts.length - 1] ?? folder
}

// Same subject as the Workspace's own desktop notice: the ticket key, else the terminal's folder.
export function claudeWaitNotice(session: string, tab: WorkspaceTab, wait: WaitReason): NoticeInput {
  const subject = tab.kind === 'ticket' ? tab.id : `Terminal ${folderName(tab.folder)}`
  return {
    topic: 'claude',
    tone: 'info',
    event: { type: 'claudeWait', subject, wait },
    target: { kind: 'workspace', tab: tab.id, session },
    place: `session:${session}`,
  }
}
