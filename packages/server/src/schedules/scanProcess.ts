import { spawn } from 'node:child_process'

export interface ScanProcess {
  onOutput(listener: (chunk: string) => void): void
  onExit(listener: (code: number | null) => void): void
  onError(listener: (error: Error) => void): void
  // Ends the whole process tree, not just the first process.
  kill(): void
}

export interface ScanSpawnOptions {
  readonly cwd: string | undefined
  readonly env: Readonly<Record<string, string>>
}

export type SpawnScan = (
  command: string,
  args: readonly string[],
  options: ScanSpawnOptions,
) => ScanProcess

// Never through a shell: the command and its arguments are exactly what the config holds.
export const spawnScan: SpawnScan = (command, args, options) => {
  const isWindows = process.platform === 'win32'
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: { ...options.env },
    shell: false,
    windowsHide: true,
    detached: !isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  return {
    onOutput: (listener) => {
      child.stdout.on('data', listener)
      child.stderr.on('data', listener)
    },
    onExit: (listener) => {
      child.once('close', listener)
    },
    onError: (listener) => {
      child.once('error', listener)
    },
    kill: () => {
      const pid = child.pid
      if (pid === undefined) {
        return
      }
      if (isWindows) {
        spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
          windowsHide: true,
          stdio: 'ignore',
        }).once('error', () => undefined)
        return
      }
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        // The group is already gone.
      }
    },
  }
}
