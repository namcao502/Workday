import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export type TunnelState = 'off' | 'starting' | 'running' | 'failed'

export interface TunnelStatus {
  readonly state: TunnelState
  readonly detail: string | null
}

export interface TunnelProcess {
  onOutput(listener: (line: string) => void): void // stdout and stderr lines
  onExit(listener: () => void): void
  onError(listener: (error: Error) => void): void // the binary could not be started
  kill(): void
}

// The seam the tests fake; the default is child_process.spawn.
export type SpawnTunnel = (
  path: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => TunnelProcess

export interface TunnelSupervisorDeps {
  readonly spawn?: SpawnTunnel
  readonly onChange?: () => void
}

const TUNNEL_ARGS = ['tunnel', '--no-autoupdate', 'run'] as const
const REGISTERED_LINE = 'Registered tunnel connection'
const RESTART_DELAYS_MS: readonly number[] = [5_000, 15_000, 60_000]
const STABLE_AFTER_MS = 5 * 60_000
const STOP_WAIT_MS = 5_000
const DETAIL_MAX_LENGTH = 300

function spawnCloudflared(
  path: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): TunnelProcess {
  const child = spawn(path, [...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  return {
    onOutput: (listener) => {
      for (const stream of [child.stdout, child.stderr]) {
        createInterface({ input: stream }).on('line', listener)
      }
    },
    onExit: (listener) => {
      child.on('exit', listener)
    },
    onError: (listener) => {
      child.on('error', listener)
    },
    kill: () => {
      child.kill()
    },
  }
}

// Runs `cloudflared tunnel run` while remote access is on and restarts it when it exits.
export class TunnelSupervisor {
  private state: TunnelState = 'off'
  private detail: string | null = null
  private current: TunnelProcess | null = null
  // Bumped on every start and stop; events of an older process are ignored.
  private generation = 0
  private attempt = 0
  private lastLine: string | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private stableTimer: NodeJS.Timeout | null = null
  private readonly spawnProcess: SpawnTunnel

  constructor(private readonly deps: TunnelSupervisorDeps = {}) {
    this.spawnProcess = deps.spawn ?? spawnCloudflared
  }

  status(): TunnelStatus {
    return { state: this.state, detail: this.detail }
  }

  start(path: string, token: string): void {
    this.halt()
    this.attempt = 0
    this.launch(path, token, this.generation)
  }

  // Resolves when the process has exited, or after 5s.
  async stop(): Promise<void> {
    const stopping = this.current
    this.halt()
    this.setStatus('off', null)
    if (stopping === null) {
      return
    }
    await new Promise<void>((resolve) => {
      const giveUp = setTimeout(resolve, STOP_WAIT_MS)
      stopping.onExit(() => {
        clearTimeout(giveUp)
        resolve()
      })
    })
  }

  // Kills the process and cancels the timers; nothing of the old run may act afterwards.
  private halt(): void {
    this.generation += 1
    this.clearTimers()
    const old = this.current
    this.current = null
    old?.kill()
  }

  private clearTimers(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    if (this.stableTimer !== null) {
      clearTimeout(this.stableTimer)
      this.stableTimer = null
    }
  }

  private launch(path: string, token: string, generation: number): void {
    this.lastLine = null
    this.setStatus('starting', null)
    const child = this.spawnProcess(path, TUNNEL_ARGS, { ...process.env, TUNNEL_TOKEN: token })
    this.current = child
    this.stableTimer = setTimeout(() => {
      this.attempt = 0
    }, STABLE_AFTER_MS)
    child.onOutput((line) => {
      if (generation === this.generation) {
        this.handleLine(line, token)
      }
    })
    child.onError(() => {
      if (generation === this.generation) {
        this.clearTimers()
        this.current = null
        this.setStatus('failed', `cloudflared not found at ${path}`)
      }
    })
    child.onExit(() => {
      if (generation === this.generation && this.current === child) {
        this.handleExit(path, token, generation)
      }
    })
  }

  private handleLine(line: string, token: string): void {
    const text = line.split(token).join('').trim()
    if (text === '') {
      return
    }
    this.lastLine = text.slice(0, DETAIL_MAX_LENGTH)
    if (text.includes(REGISTERED_LINE) && this.state !== 'running') {
      this.setStatus('running', null)
    }
  }

  private handleExit(path: string, token: string, generation: number): void {
    this.clearTimers()
    this.current = null
    this.setStatus('failed', this.lastLine ?? 'cloudflared exited')
    const delay = RESTART_DELAYS_MS[Math.min(this.attempt, RESTART_DELAYS_MS.length - 1)] ?? 0
    this.attempt += 1
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (generation === this.generation) {
        this.launch(path, token, generation)
      }
    }, delay)
  }

  private setStatus(state: TunnelState, detail: string | null): void {
    if (this.state !== state || this.detail !== detail) {
      this.state = state
      this.detail = detail
      this.deps.onChange?.()
    }
  }
}
