import type { AppError, ShellLaunch } from '@workday/core'

export interface PtyProcess {
  onData(listener: (data: string) => void): void
  onExit(listener: (exitCode: number) => void): void
  write(data: string): void
  resize(columns: number, rows: number): void
  kill(): void
}

export interface SpawnPtyOptions {
  readonly cwd: string
  readonly columns: number
  readonly rows: number
  readonly env: Readonly<Record<string, string>>
}

export type SpawnPty = (launch: ShellLaunch, options: SpawnPtyOptions) => PtyProcess

export type WorkspaceStartCode = Extract<
  AppError['code'],
  'worktreeMissing' | 'workspaceNotConfigured' | 'sessionNotFound'
>

// A session that cannot start for a reason the user can fix; the terminal socket sends its code.
export class WorkspaceStartError extends Error {
  constructor(readonly code: WorkspaceStartCode) {
    super(code)
    this.name = 'WorkspaceStartError'
  }
}
