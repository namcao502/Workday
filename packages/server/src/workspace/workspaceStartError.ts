import type { AppError } from '@workday/core'

export type WorkspaceStartCode = Extract<
  AppError['code'],
  'worktreeMissing' | 'workspaceNotConfigured' | 'sessionNotFound'
>

// A session that cannot start for a reason the user can fix; the prompt route answers its code.
export class WorkspaceStartError extends Error {
  constructor(readonly code: WorkspaceStartCode) {
    super(code)
    this.name = 'WorkspaceStartError'
  }
}
