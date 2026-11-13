import { formatDateOnly, t } from '../i18n.js'
import type { BoardListProps } from './BoardTable.js'
import { dueClassName } from './boardView.js'
import { KeyPill } from './KeyPill.js'
import { RowMenu } from './RowMenu.js'

export function BoardCards({
  rows,
  view,
  language,
  onAction,
  workspace,
}: BoardListProps): React.JSX.Element {
  return (
    <ul className="board-cards">
      {rows.map((row) => (
        <li key={row.ticket.key} className="board-card">
          <div className="board-card-head">
            <KeyPill ticketKey={row.ticket.key} url={row.url} />
            <RowMenu
              ticketKey={row.ticket.key}
              view={view}
              workspace={workspace}
              onAction={(action) => {
                onAction(row.ticket.key, action)
              }}
            />
          </div>
          <div className="board-summary">{row.ticket.summary}</div>
          <div className="board-card-meta muted">
            {row.ticket.status === null ? null : <span>{row.ticket.status}</span>}
            {row.ticket.dueDate === null ? null : (
              <span className={dueClassName(row)}>
                {t('Due', 'Hạn')} {formatDateOnly(row.ticket.dueDate, language)}
              </span>
            )}
            {row.ticket.eta === null ? null : (
              <span>
                {t('ETA', 'ETA')} {formatDateOnly(row.ticket.eta, language)}
              </span>
            )}
            {row.ticket.devPriority === null ? null : <span>P{row.ticket.devPriority}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}
