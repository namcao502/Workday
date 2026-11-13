import type { BoardAction, BoardRow, TicketPr } from '@workday/core'
import { formatDateOnly, t, type Language } from '../i18n.js'
import { dueClassName, type RowViewId } from './boardView.js'
import { KeyPill } from './KeyPill.js'
import { PrPills } from './PrPills.js'
import { RowMenu, type RowWorkspace } from './RowMenu.js'

// What /api/work adds to a row: its PR pills and the Ready to Test menu item.
export interface RowWork {
  readonly prs: Readonly<Record<string, readonly TicketPr[]>>
  readonly repoLabels: Readonly<Record<string, string>>
  readonly readyToTest: Readonly<Record<string, readonly string[]>>
  readonly onReadyToTest: (ticketKey: string, steps: readonly string[]) => void
}

// The menu's Ready to Test callback for a row, or undefined without steps left.
export function readyToTestFor(work: RowWork | undefined, key: string): (() => void) | undefined {
  const steps = work?.readyToTest[key]
  return work === undefined || steps === undefined
    ? undefined
    : () => {
        work.onReadyToTest(key, steps)
      }
}

export interface BoardListProps {
  readonly rows: readonly BoardRow[]
  readonly view: RowViewId
  readonly language: Language
  readonly onAction: (ticketKey: string, action: BoardAction) => void
  readonly workspace?: RowWorkspace | undefined
  readonly work?: RowWork | undefined
}

// Pills show on Working and Done rows only.
export function prsOf(
  work: RowWork | undefined,
  view: RowViewId,
  key: string,
): readonly TicketPr[] {
  return view === 'dismissed' ? [] : (work?.prs[key] ?? [])
}

export function BoardTable({
  rows,
  view,
  language,
  onAction,
  workspace,
  work,
}: BoardListProps): React.JSX.Element {
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
          <tr key={row.ticket.key} data-ticket-key={row.ticket.key}>
            <td>
              <KeyPill ticketKey={row.ticket.key} url={row.url} />
            </td>
            <td className="board-summary">
              {row.ticket.summary}
              <PrPills
                prs={prsOf(work, view, row.ticket.key)}
                repoLabels={work?.repoLabels ?? {}}
              />
            </td>
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
                workspace={workspace}
                onReadyToTest={readyToTestFor(work, row.ticket.key)}
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
