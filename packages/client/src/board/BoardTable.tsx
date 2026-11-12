import type { BoardAction, BoardRow } from '@workday/core'
import { formatDateOnly, t, type Language } from '../i18n.js'
import { dueClassName, type BoardViewId } from './boardView.js'
import { KeyPill } from './KeyPill.js'
import { RowMenu } from './RowMenu.js'

export interface BoardListProps {
  readonly rows: readonly BoardRow[]
  readonly view: BoardViewId
  readonly language: Language
  readonly onAction: (ticketKey: string, action: BoardAction) => void
}

export function BoardTable({ rows, view, language, onAction }: BoardListProps): React.JSX.Element {
  return (
    <table className="board-table">
      <thead>
        <tr>
          <th>{t('Key', 'Mã')}</th>
          <th>{t('Summary', 'Tóm tắt')}</th>
          <th>{t('Status', 'Trạng thái')}</th>
          <th>{t('Due', 'Hạn')}</th>
          <th>{t('ETA', 'ETA')}</th>
          <th>{t('P', 'P')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.ticket.key}>
            <td>
              <KeyPill ticketKey={row.ticket.key} url={row.url} />
            </td>
            <td className="board-summary">{row.ticket.summary}</td>
            <td>{row.ticket.status}</td>
            <td>
              {row.ticket.dueDate === null ? null : (
                <span className={dueClassName(row)}>
                  {formatDateOnly(row.ticket.dueDate, language)}
                </span>
              )}
            </td>
            <td>{row.ticket.eta === null ? null : formatDateOnly(row.ticket.eta, language)}</td>
            <td>{row.ticket.devPriority}</td>
            <td>
              <RowMenu
                ticketKey={row.ticket.key}
                view={view}
                onAction={(action) => {
                  onAction(row.ticket.key, action)
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
