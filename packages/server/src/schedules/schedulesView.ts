import { nextRunAt, type KnowledgeScanConfig, type SchedulesView } from '@workday/core'
import type { JobRuns } from './jobRuns.js'
import type { ScanRunner } from './scanRunner.js'

export interface SchedulesSource {
  readonly runner: ScanRunner
  readonly jobRuns: JobRuns
  readonly settings: {
    readonly timeZone: string
    readonly knowledgeScan: KnowledgeScanConfig | null
    readonly logTime: string
  }
  readonly now: () => Date
}

// Only the 18:00 run has a clock time; the polls and checks run on an interval.
export function schedulesView(source: SchedulesSource): SchedulesView {
  const { runner, jobRuns, settings } = source
  const runs = jobRuns.load()
  const logAt = nextRunAt(
    {
      enabled: true,
      command: '',
      args: [],
      day: 'daily',
      time: settings.logTime,
      limitHours: 1,
      logFile: null,
    },
    settings.timeZone,
    source.now(),
  )
  return {
    scan: {
      config: settings.knowledgeScan,
      nextRunAt: runner.nextRunAt(),
      runs: [...runner.runs].reverse(),
      unseenBad: runner.unseenBad,
    },
    jobs: {
      jiraPoll: { runs: runs.jiraPoll, nextRunAt: null },
      prCheck: { runs: runs.prCheck, nextRunAt: null },
      teamsCheck: { runs: runs.teamsCheck, nextRunAt: null },
      timesheetRun: { runs: runs.timesheetRun, nextRunAt: logAt?.toISOString() ?? null },
      catchUp: { runs: runs.catchUp, nextRunAt: null },
    },
  }
}
