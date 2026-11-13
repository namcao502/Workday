import { statSync } from 'node:fs'
import type { ShellLaunch } from '@workday/core'
import { WorkspaceStartError, type PtyProcess, type SpawnPty } from './pty.js'

export const REPLAY_LIMIT = 1 << 20

export interface SessionDirectory {
  readonly path: string
  readonly fallback: string | null // null: a missing path is an error (a ticket's worktree)
}

export interface SessionHostDeps {
  readonly name: string
  readonly spawn: SpawnPty
  // May throw WorkspaceStartError (e.g. no dev repo configured).
  readonly directory: () => SessionDirectory
  readonly launch: (cwd: string) => ShellLaunch
  readonly env: () => Readonly<Record<string, string>>
  readonly onStarted?: () => void
  readonly onEnded?: () => void
}

export interface Attachment {
  readonly replay: string
  readonly detach: () => void
}

interface Viewer {
  readonly onOutput: (data: string) => void
  readonly onExited: () => void
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// One terminal that outlives its views; recent output is kept so a new view can replay the screen.
export class SessionHost {
  readonly name: string
  private pty: PtyProcess | null = null
  private replayChunks: string[] = []
  private replayLength = 0
  private viewers: readonly Viewer[] = []
  private columns = 0
  private rows = 0
  private directory: string | null = null
  private disposed = false

  constructor(private readonly deps: SessionHostDeps) {
    this.name = deps.name
  }

  get running(): boolean {
    return this.pty !== null
  }

  // The folder the running (or last) PTY started in.
  get currentDirectory(): string | null {
    return this.directory
  }

  // Replay and subscription in one synchronous step, so no chunk is lost or shown twice.
  attach(onOutput: (data: string) => void, onExited: () => void = () => undefined): Attachment {
    const viewer: Viewer = { onOutput, onExited }
    this.viewers = [...this.viewers, viewer]
    return {
      replay: this.replayChunks.join(''),
      detach: () => {
        this.viewers = this.viewers.filter((candidate) => candidate !== viewer)
      },
    }
  }

  // Throws sessionNotFound once disposed, so a socket left open on a closed tab cannot spawn an orphan.
  start(columns: number, rows: number): void {
    if (this.disposed) {
      throw new WorkspaceStartError('sessionNotFound')
    }
    const { path, fallback } = this.deps.directory()
    let cwd = path
    if (!isDirectory(path)) {
      if (fallback === null) {
        throw new WorkspaceStartError('worktreeMissing')
      }
      cwd = fallback
    }
    const launch = this.deps.launch(cwd)
    const env = this.deps.env()
    this.stop()
    const pty = this.deps.spawn(launch, { cwd, columns, rows, env })
    this.pty = pty
    this.replayChunks = []
    this.replayLength = 0
    this.columns = columns
    this.rows = rows
    this.directory = cwd
    pty.onData((data) => {
      this.onData(pty, data)
    })
    pty.onExit(() => {
      this.onExit(pty)
    })
    this.deps.onStarted?.()
  }

  write(data: string): void {
    this.pty?.write(data)
  }

  // Its tab closed: views are told exited and the host never starts again.
  dispose(): void {
    this.disposed = true
    this.stop()
    const viewers = this.viewers
    this.viewers = []
    for (const viewer of viewers) {
      viewer.onExited()
    }
  }

  resize(columns: number, rows: number): void {
    if (this.pty === null || (columns === this.columns && rows === this.rows)) {
      return
    }
    this.columns = columns
    this.rows = rows
    this.pty.resize(columns, rows)
  }

  // The caller already knows, so only onEnded fires.
  stop(): void {
    const pty = this.pty
    if (pty === null) {
      return
    }
    this.pty = null
    pty.kill()
    this.deps.onEnded?.()
  }

  private onData(pty: PtyProcess, data: string): void {
    if (pty !== this.pty) {
      return
    }
    // A private buffer, mutated in place: copying it per chunk would cost O(n) on every write.
    this.replayChunks.push(data)
    this.replayLength += data.length
    while (this.replayLength > REPLAY_LIMIT) {
      this.replayLength -= this.replayChunks.shift()?.length ?? this.replayLength
    }
    for (const viewer of this.viewers) {
      viewer.onOutput(data)
    }
  }

  private onExit(pty: PtyProcess): void {
    if (pty !== this.pty) {
      return
    }
    this.pty = null
    for (const viewer of this.viewers) {
      viewer.onExited()
    }
    this.deps.onEnded?.()
  }
}
