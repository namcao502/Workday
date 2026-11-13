import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JobRun } from '@workday/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JobRuns, MAX_RUNS_PER_JOB } from './jobRuns.js'

let dataDir = ''
const errors: string[] = []

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'workday-jobs-'))
  errors.length = 0
})
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

function jobRuns(folder = dataDir): JobRuns {
  return new JobRuns(folder, (message) => errors.push(message))
}

function run(summary: string, ok = true): JobRun {
  return { startedAt: '2026-10-14T09:00:00Z', endedAt: '2026-10-14T09:00:03Z', ok, summary }
}

describe('JobRuns', () => {
  it('keeps the newest runs of a job, up to the limit', async () => {
    const runs = jobRuns()
    for (let number = 1; number <= MAX_RUNS_PER_JOB + 2; number++) {
      runs.record('prCheck', run(`run ${String(number)}`))
    }
    await runs.idle()
    const saved = jobRuns().load().prCheck
    expect(saved).toHaveLength(MAX_RUNS_PER_JOB)
    expect(saved[0]?.summary).toBe('run 3')
    expect(saved[saved.length - 1]?.summary).toBe(`run ${String(MAX_RUNS_PER_JOB + 2)}`)
  })

  it('leaves the other jobs alone', async () => {
    const runs = jobRuns()
    runs.record('timesheetRun', run('1 logged, 1 kept for retry', false))
    runs.record('catchUp', run('Nothing due'))
    await runs.idle()
    const saved = jobRuns().load()
    expect(saved.timesheetRun).toHaveLength(1)
    expect(saved.timesheetRun[0]?.ok).toBe(false)
    expect(saved.catchUp[0]?.summary).toBe('Nothing due')
    expect(saved.jiraPoll).toEqual([])
  })

  it('reads as empty when the file is missing', () => {
    expect(jobRuns().load().prCheck).toEqual([])
  })

  it('reads as empty and keeps a bad copy when the file is corrupt', () => {
    writeFileSync(join(dataDir, 'job-runs.json'), '{not json')
    expect(jobRuns().load().jiraPoll).toEqual([])
    expect(existsSync(join(dataDir, 'job-runs.json.bad'))).toBe(true)
  })

  it('logs a failed write and never throws', async () => {
    writeFileSync(join(dataDir, 'blocker'), 'a file where a folder should be')
    const runs = jobRuns(join(dataDir, 'blocker', 'nested'))
    runs.record('jiraPoll', run('x'))
    await runs.idle()
    expect(errors).toHaveLength(1)
    expect(runs.load().jiraPoll).toHaveLength(1)
  })
})
