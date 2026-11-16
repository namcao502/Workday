import type { CleanupError, CleanupReason, CleanupRow, CleanupVerdict } from '@workday/core'
import { t } from '../i18n.js'
import type { ChipColor } from '../board/todoText.js'

const BYTES_PER_MEGABYTE = 1024 * 1024

export function verdictText(verdict: CleanupVerdict): string {
  switch (verdict) {
    case 'ready':
      return t('Ready', 'Sẵn sàng')
    case 'check':
      return t('Check', 'Kiểm tra')
    case 'keep':
      return t('Keep', 'Giữ lại')
    case 'noWorktree':
      return t('No worktree', 'Không có worktree')
  }
}

// Green and amber as in the WPF dialog; keep and no worktree are gray.
export function verdictColor(verdict: CleanupVerdict): ChipColor {
  switch (verdict) {
    case 'ready':
      return 'success'
    case 'check':
      return 'warning'
    case 'keep':
    case 'noWorktree':
      return 'default'
  }
}

export function reasonText(reason: CleanupReason): string {
  switch (reason.code) {
    case 'inspectFailed':
      return t('could not inspect the worktree', 'không kiểm tra được worktree')
    case 'sessionRunning':
      return t('a session is running', 'có phiên đang chạy')
    case 'broken':
      return t('the worktree is broken', 'worktree bị hỏng')
    case 'localConfig':
      return t('has local-only config files', 'có tệp cấu hình chỉ có trên máy')
    case 'inProgress':
      return t('the ticket is still in progress', 'ticket vẫn đang làm')
    case 'abandoned':
      return t('the ticket was abandoned', 'ticket đã bị bỏ')
    case 'mainMergedPrOpen':
      return t('main is merged, the PR is still open', 'đã merge main, PR vẫn đang mở')
    case 'notMerged':
      return t('not merged yet', 'chưa merge')
    case 'unpushed':
      return t(
        `${String(reason.count)} unpushed commit(s)`,
        `${String(reason.count)} commit chưa push`,
      )
    case 'dirty':
      return t(`${String(reason.count)} changed file(s)`, `${String(reason.count)} tệp thay đổi`)
    case 'otherBranch':
      return t(`on branch ${reason.branch}`, `đang ở nhánh ${reason.branch}`)
  }
}

export function reasonsText(reasons: readonly CleanupReason[]): string {
  return reasons.map(reasonText).join('; ')
}

export function megabytesText(bytes: number): string {
  return (Math.round((bytes / BYTES_PER_MEGABYTE) * 10) / 10).toString()
}

export function docsText(row: CleanupRow): string {
  const base = row.isMined
    ? t('mined', 'đã mine')
    : row.isMerged
      ? t('merged, not mined yet', 'đã merge, chưa mine')
      : t('not merged, nothing to mine yet', 'chưa merge, chưa cần mine')
  if (row.slimBytes <= 0) {
    return base
  }
  const megabytes = megabytesText(row.slimBytes)
  return `${base}${t(`, ${megabytes} MB freeable`, `, giải phóng được ${megabytes} MB`)}`
}

export function cleanupErrorText(error: CleanupError): string {
  switch (error.code) {
    case 'invalidKey':
      return t('That is not a ticket key', 'Đó không phải mã ticket')
    case 'workspaceNotConfigured':
      return t(
        'Set the dev repo folder in Settings first',
        'Hãy đặt thư mục dev repo trong Cài đặt trước',
      )
    case 'stateChanged':
      return t(
        'The worktree changed since the list was loaded. Reload and check again.',
        'Worktree đã thay đổi từ lúc tải danh sách. Hãy tải lại và kiểm tra lại.',
      )
    case 'hasWorktree':
      return t('The ticket still has a worktree', 'Ticket vẫn còn worktree')
    case 'ioFailed':
      return t('Deleting the files failed', 'Xóa tệp thất bại')
    case 'kept':
      return t(`Kept: ${reasonsText(error.reasons)}`, `Giữ lại: ${reasonsText(error.reasons)}`)
    case 'worktreeUnreadable':
      return t(
        `Could not read the worktree in ${error.repository}`,
        `Không đọc được worktree trong ${error.repository}`,
      )
    case 'worktreeFailed':
      return t(
        `Could not remove the worktree in ${error.repository}`,
        `Không xóa được worktree trong ${error.repository}`,
      )
  }
}
