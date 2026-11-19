import { Button } from '@heroui/react'
import type { SchedulesView } from '@workday/core'
import { useState } from 'react'
import { ApiError } from '../api/client.js'
import { runScanNow } from '../api/schedulesApi.js'
import { t } from '../i18n.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Section } from '../ui/Section.js'
import { ScanForm } from './ScanForm.js'
import { ScanRuns } from './ScanRuns.js'
import { formatWhen } from './scheduleFormat.js'

interface ScanCardProps {
  readonly scan: SchedulesView['scan']
  readonly timeZone: string
  readonly onRefresh: () => void
}

function startErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return t('schedules.aScanIsAlreadyRunning')
  }
  return t('schedules.couldNotStartTheKnowledgeScan')
}

export function ScanCard({ scan, timeZone, onRefresh }: ScanCardProps): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')
  const running = scan.runs.some((run) => run.outcome === 'running')

  async function start(): Promise<void> {
    setAsking(false)
    try {
      await runScanNow()
      setMessage(t('schedules.scanStarted'))
    } catch (error: unknown) {
      setMessage(startErrorText(error))
    }
    onRefresh()
  }

  const nextText =
    scan.nextRunAt === null
      ? t('schedules.noNextRun')
      : t('schedules.nextRun', { formatWhen: formatWhen(scan.nextRunAt, timeZone) })

  return (
    <Section
      title={t('schedules.knowledgeScan')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            isDisabled={scan.config === null || running}
            onPress={() => {
              setAsking(true)
            }}
          >
            {t('schedules.runNow')}
          </Button>
          <Button variant="secondary" size="sm" onPress={onRefresh}>
            {t('schedules.refresh')}
          </Button>
        </div>
      }
    >
      <div className="text-sm text-muted" aria-live="polite">
        {message === '' ? nextText : message}
      </div>
      <ScanForm config={scan.config} />
      <ScanRuns runs={scan.runs} timeZone={timeZone} />
      {asking ? (
        <ConfirmDialog
          message={t('schedules.runTheKnowledgeScanNowIt')}
          confirmLabel={t('schedules.runNow')}
          onConfirm={() => {
            void start()
          }}
          onCancel={() => {
            setAsking(false)
          }}
        />
      ) : null}
    </Section>
  )
}
