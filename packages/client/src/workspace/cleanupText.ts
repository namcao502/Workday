import type { CleanupError, CleanupReason, CleanupRow, CleanupVerdict } from '@workday/core'
import { t } from '../i18n.js'
import type { ChipColor } from '../board/todoText.js'

const BYTES_PER_MEGABYTE = 1024 * 1024

export function verdictText(verdict: CleanupVerdict): string {
  switch (verdict) {
    case 'ready':
      return t('workspace.ready')
    case 'check':
      return t('workspace.check')
    case 'keep':
      return t('workspace.keep')
    case 'noWorktree':
      return t('workspace.noWorktree')
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
      return t('workspace.couldNotInspectTheWorktree')
    case 'sessionRunning':
      return t('workspace.aSessionIsRunning')
    case 'broken':
      return t('workspace.theWorktreeIsBroken')
    case 'localConfig':
      return t('workspace.hasLocalOnlyConfigFiles')
    case 'inProgress':
      return t('workspace.theTicketIsStillInProgress')
    case 'abandoned':
      return t('workspace.theTicketWasAbandoned')
    case 'mainMergedPrOpen':
      return t('workspace.mainIsMergedThePrIs')
    case 'notMerged':
      return t('workspace.notMergedYet')
    case 'unpushed':
      return t('workspace.unpushedCommitS', { count: String(reason.count) })
    case 'dirty':
      return t('workspace.changedFileS', { count: String(reason.count) })
    case 'otherBranch':
      return t('workspace.onBranch', { branch: reason.branch })
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
    ? t('workspace.mined')
    : row.isMerged
      ? t('workspace.mergedNotMinedYet')
      : t('workspace.notMergedNothingToMineYet')
  if (row.slimBytes <= 0) {
    return base
  }
  const megabytes = megabytesText(row.slimBytes)
  return `${base}${t('workspace.mbFreeable', { megabytes })}`
}

export function cleanupErrorText(error: CleanupError): string {
  switch (error.code) {
    case 'invalidKey':
      return t('workspace.thatIsNotATicketKey')
    case 'workspaceNotConfigured':
      return t('workspace.setTheDevRepoFolderIn')
    case 'stateChanged':
      return t('workspace.theWorktreeChangedSinceTheList')
    case 'hasWorktree':
      return t('workspace.theTicketStillHasAWorktree')
    case 'ioFailed':
      return t('workspace.deletingTheFilesFailed')
    case 'kept':
      return t('workspace.kept', { reasons: reasonsText(error.reasons) })
    case 'worktreeUnreadable':
      return t('workspace.couldNotReadTheWorktreeIn', { repository: error.repository })
    case 'worktreeFailed':
      return t('workspace.couldNotRemoveTheWorktreeIn', { repository: error.repository })
  }
}
