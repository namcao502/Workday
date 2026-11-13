import { Card } from '@heroui/react'
import { formatDateOnly, t } from '../i18n.js'
import { prsOf, readyToTestFor, type BoardListProps } from './BoardTable.js'
import { DueDate } from './DueDate.js'
import { KeyPill } from './KeyPill.js'
import { PrPills } from './PrPills.js'
import { RowMenu } from './RowMenu.js'

export function BoardCards({
  rows,
  view,
  language,
  onAction,
  workspace,
  work,
}: BoardListProps): React.JSX.Element {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <li key={row.ticket.key} data-ticket-key={row.ticket.key}>
          <Card className="gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <KeyPill ticketKey={row.ticket.key} url={row.url} />
              <RowMenu
                ticketKey={row.ticket.key}
                view={view}
                workspace={workspace}
                onReadyToTest={readyToTestFor(work, row.ticket.key)}
                onAction={(action) => {
                  onAction(row.ticket.key, action)
                }}
              />
            </div>
            <div className="[overflow-wrap:anywhere]">{row.ticket.summary}</div>
            <PrPills prs={prsOf(work, view, row.ticket.key)} repoLabels={work?.repoLabels ?? {}} />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {row.ticket.status === null ? null : <span>{row.ticket.status}</span>}
              {row.ticket.dueDate === null ? null : (
                <DueDate
                  row={row}
                  text={`${t('Due', 'Hạn')} ${formatDateOnly(row.ticket.dueDate, language)}`}
                />
              )}
              {row.ticket.eta === null ? null : (
                <span>
                  {t('ETA', 'ETA')} {formatDateOnly(row.ticket.eta, language)}
                </span>
              )}
              {row.ticket.devPriority === null ? null : <span>P{row.ticket.devPriority}</span>}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}
