import type { ShellLaunch } from '@workday/core'
import type { PtyProcess, SpawnPty, SpawnPtyOptions } from '../workspace/pty.js'

export class FakePty implements PtyProcess {
  readonly writes: string[] = []
  readonly resizes: { readonly columns: number; readonly rows: number }[] = []
  killed = false
  private readonly dataListeners: ((data: string) => void)[] = []
  private readonly exitListeners: ((exitCode: number) => void)[] = []

  constructor(
    readonly launch: ShellLaunch,
    readonly options: SpawnPtyOptions,
  ) {}

  onData(listener: (data: string) => void): void {
    this.dataListeners.push(listener)
  }

  onExit(listener: (exitCode: number) => void): void {
    this.exitListeners.push(listener)
  }

  write(data: string): void {
    this.writes.push(data)
  }

  resize(columns: number, rows: number): void {
    this.resizes.push({ columns, rows })
  }

  kill(): void {
    this.killed = true
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data)
    }
  }

  emitExit(exitCode = 0): void {
    for (const listener of this.exitListeners) {
      listener(exitCode)
    }
  }
}

// Records every PTY it spawns; nothing real is ever started.
export class FakePtyFactory {
  readonly spawned: FakePty[] = []

  readonly spawn: SpawnPty = (launch, options) => {
    const pty = new FakePty(launch, options)
    this.spawned.push(pty)
    return pty
  }

  last(): FakePty {
    const pty = this.spawned.at(-1)
    if (pty === undefined) {
      throw new Error('No PTY was spawned')
    }
    return pty
  }
}
