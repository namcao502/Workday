import { join } from 'node:path'
import type { AppJobName, JobRun } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

export const MAX_RUNS_PER_JOB = 10
const JOB_RUNS_FILE = 'job-runs.json'
const JOB_NAMES: readonly AppJobName[] = [
  'jiraPoll',
  'prCheck',
  'teamsCheck',
  'timesheetRun',
  'catchUp',
]

export type JobRunsByJob = Readonly<Record<AppJobName, readonly JobRun[]>>
export type RecordJob = (job: AppJobName, run: JobRun) => void

function emptyRuns(): JobRunsByJob {
  return { jiraPoll: [], prCheck: [], teamsCheck: [], timesheetRun: [], catchUp: [] }
}

function parseRun(raw: unknown): JobRun | null {
  if (!isRecord(raw)) {
    return null
  }
  const { startedAt, endedAt, ok, summary } = raw
  if (
    typeof startedAt !== 'string' ||
    typeof endedAt !== 'string' ||
    typeof ok !== 'boolean' ||
    (summary !== null && typeof summary !== 'string')
  ) {
    return null
  }
  return { startedAt, endedAt, ok, summary }
}

function parseFile(raw: unknown): JobRunsByJob | null {
  if (!isRecord(raw)) {
    return null
  }
  const runs: Record<AppJobName, readonly JobRun[]> = { ...emptyRuns() }
  for (const job of JOB_NAMES) {
    const list = raw[job]
    if (Array.isArray(list)) {
      runs[job] = list.map(parseRun).filter((run): run is JobRun => run !== null)
    }
  }
  return runs
}

// The last runs of each app job, oldest first. A failed write is logged, never thrown.
export class JobRuns {
  private runs: JobRunsByJob
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly dataDir: string,
    private readonly logError: (message: string, error: unknown) => void,
  ) {
    this.runs = readJson(join(dataDir, JOB_RUNS_FILE), parseFile, emptyRuns())
  }

  load(): JobRunsByJob {
    return this.runs
  }

  record(job: AppJobName, run: JobRun): void {
    this.runs = { ...this.runs, [job]: [...this.runs[job], run].slice(-MAX_RUNS_PER_JOB) }
    const snapshot = this.runs
    this.queue = this.queue.then(async () => {
      try {
        await writeJsonAtomic(join(this.dataDir, JOB_RUNS_FILE), snapshot)
      } catch (error: unknown) {
        this.logError(`[jobs] Recording a ${job} run failed`, error)
      }
    })
  }

  // Resolves once every write started so far has finished.
  idle(): Promise<void> {
    return this.queue
  }
}
