import { existsSync, statSync } from 'node:fs'
import { appendFile, mkdir, open, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  judgeRun,
  nextRunAt,
  scanCounts,
  scanProblemLines,
  type KnowledgeScanConfig,
  type ScanLogChunk,
  type ScanRun,
  type StartScanResult,
} from '@workday/core'
import type { EventSink } from '../events.js'
import type { NoticeInput } from '../notices/noticeService.js'
import { WatchedLog } from './watchedLog.js'
import { sessionEnvironment } from '../workspace/launchEnvironment.js'
import type { ScanProcess, SpawnScan } from './scanProcess.js'
import { isRunId, saveScanState, scanLogPath, type ScanState } from './scanStore.js'

export const MAX_SCAN_RUNS = 30
export const MAX_LOG_CHUNK_BYTES = 256 * 1024
const WATCH_INTERVAL_MILLISECONDS = 2000
const MAX_TIMER_MILLISECONDS = 2_147_483_647
const MILLISECONDS_PER_HOUR = 3_600_000
const SCHEDULES_PLACE = 'schedules'

export interface ScanRunnerDeps {
  readonly dataDir: string
  readonly initial: ScanState
  readonly now: () => Date
  readonly spawn: SpawnScan
  readonly events: EventSink
  readonly notices: {
    add(input: NoticeInput): Promise<unknown>
    markReadAt(place: string): Promise<void>
  }
  readonly environment: Readonly<Record<string, string | undefined>>
  readonly logError: (message: string, error: unknown) => void
  readonly save?: (state: ScanState) => Promise<void>
}

// The folder of the first argument that is a file (the script), so the script finds its neighbours.
function scriptFolder(args: readonly string[]): string | undefined {
  const script = args.find((arg) => existsSync(arg) && statSync(arg).isFile())
  return script === undefined ? undefined : dirname(script)
}

function stampOf(date: Date): string {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-')
}

export class ScanRunner {
  private state: ScanState
  private config: KnowledgeScanConfig | null = null
  private timeZone = 'UTC'
  private timer: ReturnType<typeof setTimeout> | null = null
  private current: { readonly id: string; readonly done: Promise<void> } | null = null
  private saves: Promise<void> = Promise.resolve()

  constructor(private readonly deps: ScanRunnerDeps) {
    // A run that was going when the server stopped never reported back.
    const now = deps.now().toISOString()
    const interrupted = deps.initial.runs.some((run) => run.outcome === 'running')
    this.state = {
      ...deps.initial,
      runs: deps.initial.runs.map((run) =>
        run.outcome === 'running' ? { ...run, outcome: 'stopped', endedAt: now } : run,
      ),
    }
    if (interrupted) {
      this.persist()
    }
  }

  get runs(): readonly ScanRun[] {
    return this.state.runs
  }

  get unseenBad(): boolean {
    return this.state.unseenBad
  }

  get running(): boolean {
    return this.current !== null
  }

  nextRunAt(): string | null {
    if (this.config === null) {
      return null
    }
    return nextRunAt(this.config, this.timeZone, this.deps.now())?.toISOString() ?? null
  }

  // A changed config cancels the old timer and books the new one.
  configure(config: KnowledgeScanConfig | null, timeZone: string): void {
    this.config = config
    this.timeZone = timeZone
    this.schedule()
  }

  stop(): void {
    this.clearTimer()
  }

  // Resolves when the run in progress, if any, has been recorded.
  idle(): Promise<void> {
    return this.current === null ? this.saves : this.current.done.then(() => this.saves)
  }

  runNow(): StartScanResult | 'notConfigured' {
    if (this.config === null) {
      return 'notConfigured'
    }
    return this.start(this.config, 'user')
  }

  markSeen(): void {
    if (!this.state.unseenBad) {
      return
    }
    this.state = { ...this.state, unseenBad: false }
    this.persist()
    this.deps.events.broadcast({ type: 'schedules.changed' })
    this.deps.notices.markReadAt(SCHEDULES_PLACE).catch((error: unknown) => {
      this.deps.logError('[scan] Reading the scan notice failed', error)
    })
  }

  // Reads the run's log from a byte offset; the id must be one of the kept runs.
  async readLog(id: string, from: number): Promise<ScanLogChunk | null> {
    if (!isRunId(id) || !this.state.runs.some((run) => run.id === id)) {
      return null
    }
    let handle
    try {
      handle = await open(scanLogPath(this.deps.dataDir, id), 'r')
    } catch {
      return { text: '', next: from }
    }
    try {
      const buffer = Buffer.alloc(MAX_LOG_CHUNK_BYTES)
      const { bytesRead } = await handle.read(buffer, 0, MAX_LOG_CHUNK_BYTES, from)
      let used = bytesRead
      // A full chunk may end inside a character; cut it back to the last whole line.
      if (bytesRead === MAX_LOG_CHUNK_BYTES) {
        const lastNewline = buffer.lastIndexOf(0x0a, bytesRead - 1)
        used = lastNewline < 0 ? bytesRead : lastNewline + 1
      }
      return { text: buffer.toString('utf8', 0, used), next: from + used }
    } finally {
      await handle.close()
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private schedule(): void {
    this.clearTimer()
    const config = this.config
    const next = config === null ? null : nextRunAt(config, this.timeZone, this.deps.now())
    if (config === null || next === null) {
      return
    }
    const wait = Math.min(next.getTime() - this.deps.now().getTime(), MAX_TIMER_MILLISECONDS)
    this.timer = setTimeout(() => {
      this.timer = null
      // A run still going from Run now skips this slot.
      if (this.config === config && wait < MAX_TIMER_MILLISECONDS) {
        this.start(config, 'schedule')
      }
      this.schedule()
    }, wait)
  }

  private start(config: KnowledgeScanConfig, trigger: ScanRun['trigger']): StartScanResult {
    if (this.current !== null) {
      return { ok: false, busy: true }
    }
    const startedAt = this.deps.now()
    const id = stampOf(startedAt)
    const run: ScanRun = {
      id,
      startedAt: startedAt.toISOString(),
      endedAt: null,
      outcome: 'running',
      exitCode: null,
      found: 0,
      mined: 0,
      refreshed: 0,
      problemLines: [],
      trigger,
    }
    this.commit({ ...this.state, runs: [...this.state.runs, run] })
    const done = this.execute(config, run)
    this.current = { id, done }
    return { ok: true }
  }

  private async execute(config: KnowledgeScanConfig, run: ScanRun): Promise<void> {
    const logPath = scanLogPath(this.deps.dataDir, run.id)
    let logQueue: Promise<void> = mkdir(dirname(logPath), { recursive: true }).then(() => undefined)
    const write = (text: string): void => {
      logQueue = logQueue
        .then(() => appendFile(logPath, text))
        .catch((error: unknown) => {
          this.deps.logError('[scan] Writing the scan log failed', error)
        })
    }
    const lines: string[] = []
    let partial = ''
    // The script's own log: its new lines join the run log and are judged with the output.
    const watched = config.logFile === null ? null : new WatchedLog(config.logFile)
    watched?.begin()
    const pollWatched = (final: boolean): void => {
      if (watched === null) {
        return
      }
      logQueue = logQueue
        .then(async () => {
          const text = await watched.readNew(final)
          if (text !== '') {
            await appendFile(logPath, text)
            lines.push(...text.split(/\r?\n/).filter((line) => line !== ''))
          }
        })
        .catch((error: unknown) => {
          this.deps.logError('[scan] Reading the script log failed', error)
        })
    }
    const pollTimer = setInterval(() => {
      pollWatched(false)
    }, WATCH_INTERVAL_MILLISECONDS)
    let killedForLimit = false
    let child: ScanProcess | null = null
    const limitTimers: ReturnType<typeof setTimeout>[] = []
    const exit = await new Promise<number | null>((resolve) => {
      try {
        child = this.deps.spawn(config.command, config.args, {
          cwd: scriptFolder(config.args),
          env: sessionEnvironment(this.deps.environment),
        })
      } catch (error: unknown) {
        write(`Could not start: ${String(error)}\n`)
        resolve(null)
        return
      }
      child.onOutput((chunk) => {
        write(chunk)
        const parts = (partial + chunk).split(/\r?\n/)
        partial = parts.pop() ?? ''
        lines.push(...parts)
      })
      child.onError((error) => {
        write(`Could not run: ${error.message}\n`)
        resolve(null)
      })
      child.onExit(resolve)
      const limitTimer = setTimeout(() => {
        killedForLimit = true
        write(`Stopped: over the ${String(config.limitHours)} hour limit.\n`)
        child?.kill()
      }, config.limitHours * MILLISECONDS_PER_HOUR)
      limitTimers.push(limitTimer)
    })
    limitTimers.forEach((timer) => {
      clearTimeout(timer)
    })
    clearInterval(pollTimer)
    pollWatched(true)
    if (partial !== '') {
      lines.push(partial)
    }
    await logQueue
    this.finish(run, exit, killedForLimit, lines)
  }

  private finish(
    run: ScanRun,
    exitCode: number | null,
    killedForLimit: boolean,
    lines: readonly string[],
  ): void {
    const problemLines = scanProblemLines(lines)
    const outcome = judgeRun(exitCode, killedForLimit, problemLines)
    const finished: ScanRun = {
      ...run,
      endedAt: this.deps.now().toISOString(),
      outcome,
      exitCode,
      ...scanCounts(lines),
      problemLines,
    }
    const isBad = outcome !== 'ok'
    const kept = [...this.state.runs.map((item) => (item.id === run.id ? finished : item))]
    const dropped = kept.slice(0, Math.max(0, kept.length - MAX_SCAN_RUNS))
    this.commit({
      runs: kept.slice(dropped.length),
      unseenBad: this.state.unseenBad || isBad,
    })
    this.current = null
    for (const old of dropped) {
      rm(scanLogPath(this.deps.dataDir, old.id), { force: true }).catch((error: unknown) => {
        this.deps.logError('[scan] Removing an old scan log failed', error)
      })
    }
    if (isBad) {
      this.deps.notices
        .add({
          topic: 'knowledge',
          tone: outcome === 'withProblems' ? 'info' : 'error',
          event: { type: 'scanBad', outcome },
          target: { kind: 'schedules' },
          place: SCHEDULES_PLACE,
        })
        .catch((error: unknown) => {
          this.deps.logError('[scan] Adding the scan notice failed', error)
        })
    }
  }

  private commit(state: ScanState): void {
    this.state = state
    this.persist()
    this.deps.events.broadcast({ type: 'schedules.changed' })
  }

  private persist(): void {
    const snapshot = this.state
    const save = this.deps.save ?? ((state: ScanState) => saveScanState(this.deps.dataDir, state))
    this.saves = this.saves.then(async () => {
      try {
        await save(snapshot)
      } catch (error: unknown) {
        this.deps.logError('[scan] Saving the scan runs failed', error)
      }
    })
  }
}
