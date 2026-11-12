import { weekTicketTotals, type HrmTask, type QueueEntry } from '@workday/core'
import { KeyPill } from '../board/KeyPill.js'
import { t } from '../i18n.js'
import { formatMinutes } from './timesheetText.js'

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
  const largest = totals[0]?.minutes ?? 0
  if (totals.length === 0) {
    return null
  }
  return (
    <section className="week-totals-block">
      <span className="section-label">{t('This week by ticket', 'Tuần này theo ticket')}</span>
      {totals.map((total) => (
        <div key={total.key} className="total-row">
          <KeyPill ticketKey={total.key} url={urlFor(total.key)} />
          <div className="total-track">
            <div
              className="total-fill"
              style={{ width: `${String((total.minutes / largest) * 100)}%` }}
            />
          </div>
          <span className="muted">{formatMinutes(total.minutes)}</span>
        </div>
      ))}
    </section>
  )
}
