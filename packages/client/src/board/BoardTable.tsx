import { Card } from '@heroui/react'
import type { BoardAction, BoardRow, TicketPr } from '@workday/core'
import { formatDateOnly, t, type Language } from '../i18n.js'
import type { RowViewId } from './boardView.js'
import { DueDate } from './DueDate.js'
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
  const th = 'px-3 py-2 text-left text-xs font-normal text-muted'
  const td = 'border-t border-separator px-3 py-2'
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={th}>{t('Key', 'Mã')}</th>
            <th className={th}>{t('Summary', 'Tóm tắt')}</th>
            <th className={th}>{t('Status', 'Trạng thái')}</th>
            <th className={th}>{t('Due', 'Hạn')}</th>
            <th className={th}>{t('ETA', 'ETA')}</th>
            <th className={th}>{t('P', 'P')}</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.ticket.key}
              data-ticket-key={row.ticket.key}
              className="hover:bg-surface-secondary"
            >
              <td className={`${td} whitespace-nowrap`}>
                <KeyPill ticketKey={row.ticket.key} url={row.url} />
              </td>
              <td className={`${td} [overflow-wrap:anywhere]`}>
                {row.ticket.summary}
                <PrPills
                  prs={prsOf(work, view, row.ticket.key)}
                  repoLabels={work?.repoLabels ?? {}}
                />
              </td>
              <td className={`${td} whitespace-nowrap`}>{row.ticket.status}</td>
              <td className={`${td} whitespace-nowrap`}>
                {row.ticket.dueDate === null ? null : (
                  <DueDate row={row} text={formatDateOnly(row.ticket.dueDate, language)} />
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {row.ticket.eta === null ? null : formatDateOnly(row.ticket.eta, language)}
              </td>
              <td className={td}>{row.ticket.devPriority}</td>
              <td className={td}>
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
    </Card>
  )
}
