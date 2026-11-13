import type { ScanRun } from '@workday/core'
import { useState } from 'react'
import { t } from '../i18n.js'
import { formatDuration, formatWhen, outcomeText } from './scheduleFormat.js'
import { useScanLog } from './useSchedules.js'

const SHOWN_RUNS = 10

function runSummary(run: ScanRun): string {
  const parts = [
    t(`${String(run.found)} reached Done`, `${String(run.found)} ticket lên Done`),
    t(`${String(run.mined)} mined`, `mine ${String(run.mined)}`),
    t(`${String(run.refreshed)} map(s) refreshed`, `làm mới ${String(run.refreshed)} map`),
  ]
  if (run.problemLines.length !== 0) {
    parts.push(
      t(`${String(run.problemLines.length)} problem(s)`, `${String(run.problemLines.length)} lỗi`),
    )
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
    return <p className="muted">{t('No runs yet', 'Chưa chạy lần nào')}</p>
  }
  return (
    <div className="scan-body">
      <ul className="run-list" aria-label={t('Recent runs', 'Các lần chạy gần đây')}>
        {shown.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              className="run-row"
              aria-current={run.id === selected.id ? 'true' : undefined}
              onClick={() => {
                setPickedId(run.id)
              }}
            >
              <span>{formatWhen(run.startedAt, timeZone)}</span>
              <span className="muted">{runDuration(run)}</span>
              <span className={`run-dot run-${run.outcome}`} aria-hidden="true" />
              <span>{outcomeText(run.outcome)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="run-log">
        <div className="muted">{runSummary(selected)}</div>
        <pre className="log-box" aria-label={t('Run log', 'Log của lần chạy')}>
          {log}
        </pre>
      </div>
    </div>
  )
}
