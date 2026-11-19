import { Chip } from '@heroui/react'
import type { ScanOutcome, ScanRun } from '@workday/core'
import { useState } from 'react'
import { t } from '../i18n.js'
import { formatDuration, formatWhen, outcomeText } from './scheduleFormat.js'
import { useScanLog } from './useSchedules.js'

const SHOWN_RUNS = 10

function outcomeColor(outcome: ScanOutcome): 'accent' | 'success' | 'warning' | 'danger' {
  switch (outcome) {
    case 'running':
      return 'accent'
    case 'ok':
      return 'success'
    case 'withProblems':
      return 'warning'
    case 'stopped':
    case 'failed':
      return 'danger'
  }
}

function runSummary(run: ScanRun): string {
  const parts = [
    t('schedules.reachedDone', { found: String(run.found) }),
    t('schedules.mined', { mined: String(run.mined) }),
    t('schedules.mapSRefreshed', { refreshed: String(run.refreshed) }),
  ]
  if (run.problemLines.length !== 0) {
    parts.push(t('schedules.problemS', { length: String(run.problemLines.length) }))
  }
  return parts.join(', ')
}

function runDuration(run: ScanRun): string {
  return run.endedAt === null
    ? ''
    : formatDuration(Date.parse(run.endedAt) - Date.parse(run.startedAt))
}

interface ScanRunsProps {
  readonly runs: readonly ScanRun[] // newest first
  readonly timeZone: string
}

export function ScanRuns({ runs, timeZone }: ScanRunsProps): React.JSX.Element {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const shown = runs.slice(0, SHOWN_RUNS)
  const selected = runs.find((run) => run.id === pickedId) ?? shown[0] ?? null
  const log = useScanLog(selected?.id ?? null, selected?.outcome === 'running')

  if (selected === null) {
    return <p className="text-sm text-muted">{t('schedules.noRunsYet')}</p>
  }
  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4">
      <ul
        className="m-0 max-h-[340px] list-none overflow-y-auto p-0"
        aria-label={t('schedules.recentRuns')}
      >
        {shown.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-sm hover:bg-surface-secondary aria-[current=true]:bg-accent-soft"
              aria-current={run.id === selected.id ? 'true' : undefined}
              onClick={() => {
                setPickedId(run.id)
              }}
            >
              <span>{formatWhen(run.startedAt, timeZone)}</span>
              <span className="min-w-14 text-muted">{runDuration(run)}</span>
              <Chip size="sm" color={outcomeColor(run.outcome)}>
                {outcomeText(run.outcome)}
              </Chip>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-sm text-muted">{runSummary(selected)}</div>
        <pre
          className="m-0 max-h-[340px] min-h-40 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-surface-secondary px-2.5 py-2 font-mono text-sm"
          aria-label={t('schedules.runLog')}
        >
          {log}
        </pre>
      </div>
    </div>
  )
}
