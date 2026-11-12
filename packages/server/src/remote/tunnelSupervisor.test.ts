import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TunnelSupervisor, type SpawnTunnel, type TunnelProcess } from './tunnelSupervisor.js'

const PATH = 'C:\\tools\\cloudflared.exe'
const TOKEN = 'tunnel-token-secret'

class FakeProcess implements TunnelProcess {
  killed = false
  private readonly outputs: ((line: string) => void)[] = []
  private readonly exits: (() => void)[] = []
  private readonly errors: ((error: Error) => void)[] = []

  onOutput(listener: (line: string) => void): void {
    this.outputs.push(listener)
  }
  onExit(listener: () => void): void {
    this.exits.push(listener)
  }
  onError(listener: (error: Error) => void): void {
    this.errors.push(listener)
  }
  kill(): void {
    this.killed = true
  }

  emit(line: string): void {
    this.outputs.forEach((listener) => {
      listener(line)
    })
  }
  exit(): void {
    this.exits.forEach((listener) => {
      listener()
    })
  }
  fail(error: Error): void {
    this.errors.forEach((listener) => {
      listener(error)
    })
  }
}

interface SpawnCall {
  readonly path: string
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
}

function setup() {
  const calls: SpawnCall[] = []
  const processes: FakeProcess[] = []
  const spawn: SpawnTunnel = (path, args, env) => {
    calls.push({ path, args, env })
    const process = new FakeProcess()
    processes.push(process)
    return process
  }
  const changes = { count: 0 }
  const supervisor = new TunnelSupervisor({
    spawn,
    onChange: () => {
      changes.count += 1
    },
  })
  return { calls, processes, changes, supervisor }
}

describe('TunnelSupervisor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes the token in TUNNEL_TOKEN, never in the arguments', () => {
    const { calls, supervisor } = setup()

    supervisor.start(PATH, TOKEN)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.path).toBe(PATH)
    expect(calls[0]?.args).toEqual(['tunnel', '--no-autoupdate', 'run'])
    expect(calls[0]?.env['TUNNEL_TOKEN']).toBe(TOKEN)
    expect(JSON.stringify(calls[0]?.args)).not.toContain(TOKEN)
    expect(supervisor.status()).toEqual({ state: 'starting', detail: null })
  })

  it('turns running on the registered-connection line', () => {
    const { processes, changes, supervisor } = setup()
    supervisor.start(PATH, TOKEN)

    processes[0]?.emit('INF Starting tunnel')
    expect(supervisor.status().state).toBe('starting')
    processes[0]?.emit('INF Registered tunnel connection connIndex=0')

    expect(supervisor.status()).toEqual({ state: 'running', detail: null })
    expect(changes.count).toBeGreaterThanOrEqual(2)
  })

  it('restarts after 5s, 15s then 60s when the process keeps exiting', () => {
    const { calls, processes, supervisor } = setup()
    supervisor.start(PATH, TOKEN)

    for (const [delay, expectedCalls] of [
      [5_000, 2],
      [15_000, 3],
      [60_000, 4],
      [60_000, 5],
    ] as const) {
      processes.at(-1)?.exit()
      expect(supervisor.status().state).toBe('failed')
      vi.advanceTimersByTime(delay - 1)
      expect(calls).toHaveLength(expectedCalls - 1)
      vi.advanceTimersByTime(1)
      expect(calls).toHaveLength(expectedCalls)
    }
  })

  it('goes back to the 5s delay after five stable minutes', () => {
    const { calls, processes, supervisor } = setup()
    supervisor.start(PATH, TOKEN)
    processes[0]?.exit()
    vi.advanceTimersByTime(5_000)
    processes[1]?.exit()
    vi.advanceTimersByTime(15_000)
    expect(calls).toHaveLength(3)

    vi.advanceTimersByTime(5 * 60_000)
    processes[2]?.exit()
    vi.advanceTimersByTime(5_000)

    expect(calls).toHaveLength(4)
  })

  it('shows the last line without the token as the failure detail, cut to 300 characters', () => {
    const { processes, supervisor } = setup()
    supervisor.start(PATH, TOKEN)

    processes[0]?.emit(`ERR bad token ${TOKEN} ${'x'.repeat(400)}`)
    processes[0]?.exit()

    const { detail } = supervisor.status()
    expect(detail).not.toContain(TOKEN)
    expect(detail).toHaveLength(300)
  })

  it('a missing binary fails without retrying', () => {
    const { calls, processes, supervisor } = setup()
    supervisor.start(PATH, TOKEN)

    processes[0]?.fail(new Error('spawn ENOENT'))
    processes[0]?.exit()
    vi.advanceTimersByTime(10 * 60_000)

    expect(supervisor.status()).toEqual({
      state: 'failed',
      detail: `cloudflared not found at ${PATH}`,
    })
    expect(calls).toHaveLength(1)
  })

  it('stop kills the process and does not restart it', async () => {
    const { calls, processes, supervisor } = setup()
    supervisor.start(PATH, TOKEN)

    const stopped = supervisor.stop()
    expect(processes[0]?.killed).toBe(true)
    processes[0]?.exit()
    await stopped
    vi.advanceTimersByTime(10 * 60_000)

    expect(supervisor.status().state).toBe('off')
    expect(calls).toHaveLength(1)
  })

  it('stop gives up waiting after 5s', async () => {
    const { processes, supervisor } = setup()
    supervisor.start(PATH, TOKEN)

    const stopped = supervisor.stop()
    await vi.advanceTimersByTimeAsync(5_000)
    await stopped

    expect(processes[0]?.killed).toBe(true)
    expect(supervisor.status().state).toBe('off')
  })

  it('start replaces a running tunnel', () => {
    const { calls, processes, supervisor } = setup()
    supervisor.start(PATH, TOKEN)

    supervisor.start(PATH, 'another-token')
    processes[0]?.exit()
    vi.advanceTimersByTime(60_000)

    expect(processes[0]?.killed).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1]?.env['TUNNEL_TOKEN']).toBe('another-token')
  })
})
