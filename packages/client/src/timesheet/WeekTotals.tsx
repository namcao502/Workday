import { WORK_MINUTES, weekTicketTotals, type HrmTask, type QueueEntry } from '@workday/core'
import { Card } from '@heroui/react'
import { KeyPill } from '../board/KeyPill.js'
import { t } from '../i18n.js'
import { formatMinutes } from './timesheetText.js'
import { Tip } from '../ui/Tip.js'

interface WeekTotalsProps {
  readonly hrmTasks: readonly HrmTask[] | null
  readonly queue: readonly QueueEntry[]
  readonly weekdays: readonly string[]
  readonly urlFor: (key: string) => string
}

export function WeekTotals({
  hrmTasks,
  queue,
  weekdays,
  urlFor,
}: WeekTotalsProps): React.JSX.Element | null {
  const totals = weekTicketTotals(hrmTasks, queue, weekdays)
  // Bars measure against the full week, so two 4h tickets read as a small share, not two full bars.
  const logged = totals.reduce((sum, total) => sum + total.minutes, 0)
  const scale = Math.max(logged, weekdays.length * WORK_MINUTES)
  if (totals.length === 0) {
    return null
  }
  return (
    <Card>
      <Card.Header>
        <Card.Title className="text-base font-semibold" render={(props) => <h2 {...props} />}>
          {t('This week by ticket', 'Tuần này theo ticket')}
        </Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-2">
        {totals.map((total) => (
          <div key={total.key} className="flex items-center gap-2">
            <KeyPill ticketKey={total.key} url={urlFor(total.key)} />
            <Tip
              className="block h-2 flex-1 rounded-full bg-surface-secondary"
              content={t(
                `${String(Math.round((total.minutes / scale) * 100))}% of the week`,
                `${String(Math.round((total.minutes / scale) * 100))}% của tuần`,
              )}
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${String((total.minutes / scale) * 100)}%` }}
              />
            </Tip>
            <span className="text-sm text-muted">{formatMinutes(total.minutes)}</span>
          </div>
        ))}
      </Card.Content>
    </Card>
  )
}
