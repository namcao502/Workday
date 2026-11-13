import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KnowledgeScanConfig, ServerEvent } from '@workday/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoticeInput } from '../notices/noticeService.js'
import { FakeScanProcess } from '../testing/fakeScan.js'
import type { ScanSpawnOptions } from './scanProcess.js'
import { ScanRunner } from './scanRunner.js'
import type { ScanState } from './scanStore.js'

const CONFIG: KnowledgeScanConfig = {
  enabled: true,
  command: 'pwsh',
  args: ['-NoProfile'],
  day: 'daily',
  time: '07:00',
  limitHours: 2,
  logFile: null,
}

let dataDir = ''
let processes: FakeScanProcess[] = []
let spawned: { command: string; args: readonly string[]; options: ScanSpawnOptions }[] = []
let notices: NoticeInput[] = []
let events: ServerEvent[] = []

function newRunner(
  initial: ScanState = { runs: [], unseenBad: false },
  config: KnowledgeScanConfig = CONFIG,
): ScanRunner {
  const runner = new ScanRunner({
    dataDir,
    initial,
    now: () => new Date(),
    spawn: (command, args, options) => {
      const process = new FakeScanProcess()
      processes.push(process)
      spawned.push({ command, args, options })
      return process
    },
    events: { broadcast: (event) => events.push(event) },
    notices: {
      add: (input) => {
        notices.push(input)
        return Promise.resolve()
      },
      markReadAt: () => Promise.resolve(),
    },
    environment: { PATH: 'p', CLAUDE_CODE_SSE_PORT: '1', ANTHROPIC_API_KEY: 'k' },
    logError: () => undefined,
  })
  runner.configure(config, 'Asia/Ho_Chi_Minh')
  return runner
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'workday-scan-'))
  processes = []
  spawned = []
  notices = []
  events = []
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('ScanRunner', () => {
  it('a run that exceeds the limit is killed and marked stopped', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const runner = newRunner()
    expect(runner.runNow()).toEqual({ ok: true })
    processes[0]?.say('2026-10-14 07:00:01 Found 1 ticket(s) in the last 60 minute(s): A-1\n')
    await vi.advanceTimersByTimeAsync(2 * 3_600_000)
    await runner.idle()
    expect(processes[0]?.killed).toBe(1)
    expect(runner.runs[0]?.outcome).toBe('stopped')
    expect(runner.running).toBe(false)
  })

  it('a non-zero exit is failed and a problem line is withProblems', async () => {
    const runner = newRunner()
    runner.runNow()
    processes[0]?.say('Mining A-1 ...\n  FAILED (exit 1): boom\n')
    processes[0]?.end(1)
    await runner.idle()
    runner.runNow()
    processes[1]?.say('Mining A-2 ...\nERROR: git fetch origin failed\n')
    processes[1]?.end(0)
    await runner.idle()
    runner.runNow()
    processes[2]?.say('Found 1 ticket(s) in the last 60 minute(s): A-3\n')
    processes[2]?.end(0)
    await runner.idle()
    expect(runner.runs.map((run) => run.outcome)).toEqual(['failed', 'withProblems', 'ok'])
    expect(runner.runs[1]?.problemLines).toEqual(['ERROR: git fetch origin failed'])
    expect(runner.runs[1]?.mined).toBe(1)
    expect(runner.runs[2]?.found).toBe(1)
  })

  it('a bad run adds one knowledge notice and sets unseenBad until seen', async () => {
    const runner = newRunner()
    runner.runNow()
    processes[0]?.end(2)
    await runner.idle()
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({
      topic: 'knowledge',
      event: { type: 'scanBad', outcome: 'failed' },
      target: { kind: 'schedules' },
    })
    expect(runner.unseenBad).toBe(true)
    runner.markSeen()
    expect(runner.unseenBad).toBe(false)
  })

  it('run now while running answers busy', async () => {
    const runner = newRunner()
    expect(runner.runNow()).toEqual({ ok: true })
    expect(runner.runNow()).toEqual({ ok: false, busy: true })
    expect(processes).toHaveLength(1)
    processes[0]?.end(0)
    await runner.idle()
    expect(notices).toHaveLength(0)
  })

  it('spawns without the Claude variables of the server', async () => {
    const runner = newRunner()
    runner.runNow()
    const env = spawned[0]?.options.env ?? {}
    expect(env['PATH']).toBe('p')
    expect(env['CLAUDE_CODE_SSE_PORT']).toBeUndefined()
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined()
    processes[0]?.end(0)
    await runner.idle()
  })

  it('marks a run left running by a restart as stopped', () => {
    const left = {
      id: '2026-10-14T07-00-00-000Z',
      startedAt: '2026-10-14T07:00:00.000Z',
      endedAt: null,
      outcome: 'running' as const,
      exitCode: null,
      found: 0,
      mined: 0,
      refreshed: 0,
      problemLines: [],
      trigger: 'schedule' as const,
    }
    const runner = newRunner({ runs: [left], unseenBad: false })
    expect(runner.runs[0]?.outcome).toBe('stopped')
    expect(runner.runs[0]?.endedAt).not.toBeNull()
  })

  it('reads the log from an offset and refuses an unknown run id', async () => {
    const runner = newRunner()
    runner.runNow()
    processes[0]?.say('one\n')
    processes[0]?.say('two\n')
    processes[0]?.end(0)
    await runner.idle()
    const id = runner.runs[0]?.id ?? ''
    expect(await runner.readLog(id, 0)).toEqual({ text: 'one\ntwo\n', next: 8 })
    expect(await runner.readLog(id, 4)).toEqual({ text: 'two\n', next: 8 })
    expect(await runner.readLog('..-..-x', 0)).toBeNull()
    expect(await runner.readLog('2000-01-01T00-00-00-000Z', 0)).toBeNull()
  })

  it('keeps the newest 30 runs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const runner = newRunner()
    for (let number = 0; number < 32; number++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 14, 0, number)))
      runner.runNow()
      processes[number]?.end(0)
      await runner.idle()
    }
    expect(runner.runs).toHaveLength(30)
    expect(runner.runs[0]?.startedAt).toBe('2026-10-14T00:02:00.000Z')
  })

  it('lines appended to the watched script log join the run log and make it withProblems', async () => {
    const watched = join(dataDir, 'script.log')
    writeFileSync(watched, 'old line from an earlier run\nERROR: old\n')
    const runner = newRunner(undefined, { ...CONFIG, logFile: watched })
    runner.runNow()
    appendFileSync(watched, '2026-10-14 07:00:01 Found 1 ticket(s) in the last 60 minute(s): A-1\n')
    appendFileSync(watched, '2026-10-14 07:00:02 Mining A-1 ...\n')
    appendFileSync(watched, '2026-10-14 07:00:03   FAILED (exit 1): boom')
    processes[0]?.say('captured output\n')
    processes[0]?.end(0)
    await runner.idle()
    const run = runner.runs[0]
    expect(run?.outcome).toBe('withProblems')
    expect(run?.problemLines).toEqual(['FAILED (exit 1): boom'])
    expect(run?.found).toBe(1)
    expect(run?.mined).toBe(1)
    const log = await runner.readLog(run?.id ?? '', 0)
    expect(log?.text).toContain('captured output')
    expect(log?.text).toContain('Mining A-1 ...')
    expect(log?.text).not.toContain('earlier run')
  })

  it('ignores a watched script log that does not exist', async () => {
    const runner = newRunner(undefined, { ...CONFIG, logFile: join(dataDir, 'missing.log') })
    runner.runNow()
    processes[0]?.end(0)
    await runner.idle()
    expect(runner.runs[0]?.outcome).toBe('ok')
  })
})
