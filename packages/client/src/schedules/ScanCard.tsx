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
    return t('A scan is already running', 'Đang có một lần quét chạy')
  }
  return t('Could not start the knowledge scan', 'Không khởi động được quét knowledge')
}

export function ScanCard({ scan, timeZone, onRefresh }: ScanCardProps): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')
  const running = scan.runs.some((run) => run.outcome === 'running')

  async function start(): Promise<void> {
    setAsking(false)
    try {
      await runScanNow()
      setMessage(t('Scan started', 'Đã bắt đầu quét'))
    } catch (error: unknown) {
      setMessage(startErrorText(error))
    }
    onRefresh()
  }

  const nextText =
    scan.nextRunAt === null
      ? t('No next run', 'Không có lần chạy tới')
      : t(
          `Next run ${formatWhen(scan.nextRunAt, timeZone)}`,
          `Lần tới ${formatWhen(scan.nextRunAt, timeZone)}`,
        )

  return (
    <Section
      title={t('Knowledge scan', 'Quét knowledge base')}
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
            {t('Run now', 'Chạy ngay')}
          </Button>
          <Button variant="secondary" size="sm" onPress={onRefresh}>
            {t('Refresh', 'Làm mới')}
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
          message={t(
            'Run the knowledge scan now? It mines every ticket that reached Done since the last complete run and refreshes the codebase maps, with claude running headless. It can take an hour or more.',
            'Chạy quét knowledge ngay? Việc này mine mọi ticket đã lên Done kể từ lần chạy trọn vẹn gần nhất và làm mới các map của codebase, với claude chạy ngầm. Có thể mất một giờ hoặc hơn.',
          )}
          confirmLabel={t('Run now', 'Chạy ngay')}
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
