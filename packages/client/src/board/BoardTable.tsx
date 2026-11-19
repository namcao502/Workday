import { Card } from '@heroui/react'
import type { BoardAction, BoardRow, TicketPr } from '@workday/core'
import { formatDateOnly, t, type Language } from '../i18n.js'
import { dueUrgencyOf, etaUrgencyOf, type RowViewId } from './boardView.js'
import { DueDate } from './DueDate.js'
import { KeyPill } from './KeyPill.js'
import { PriorityText } from './PriorityText.js'
import { PrPills } from './PrPills.js'
import { RowMenu, type RowWorkspace } from './RowMenu.js'
import { StatusText } from './StatusText.js'
import { Tip } from '../ui/Tip.js'

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
  const td = 'px-3 py-2'
  // A column of its own so the PR buttons line up; left out when no row has one.
  const hasPrs = rows.some((row) => prsOf(work, view, row.ticket.key).length !== 0)
  return (
    <Card className="animate-fade-in overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>{t('board.key')}</th>
            <th className={th}>{t('board.summary')}</th>
            {hasPrs ? <th className={th.replace('text-left', 'text-center')}>PR</th> : null}
            <th className={th}>{t('board.status')}</th>
            <th className={th}>{t('board.due')}</th>
            <th className={th}>{t('board.eta')}</th>
            <th className={th}>
              <Tip content={t('board.devPriority')}>{t('board.priority')}</Tip>
            </th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ticket.key} data-ticket-key={row.ticket.key}>
              <td className={`${td} whitespace-nowrap`}>
                <KeyPill ticketKey={row.ticket.key} url={row.url} />
              </td>
              {/* max-w-0 lets the cell shrink, so a long summary cuts to one line instead of growing the row. */}
              <td className={`${td} w-full max-w-0`}>
                <Tip className="block truncate" content={row.ticket.summary}>
                  {row.ticket.summary}
                </Tip>
              </td>
              {hasPrs ? (
                <td className={`${td} whitespace-nowrap text-center`}>
                  <PrPills
                    prs={prsOf(work, view, row.ticket.key)}
                    repoLabels={work?.repoLabels ?? {}}
                    className=""
                    showState
                  />
                </td>
              ) : null}
              <td className={`${td} whitespace-nowrap`}>
                {row.ticket.status === null ? null : (
                  <StatusText
                    status={row.ticket.status}
                    statusCategory={row.ticket.statusCategory}
                  />
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {row.ticket.dueDate === null ? null : (
                  <DueDate
                    urgency={dueUrgencyOf(row)}
                    text={formatDateOnly(row.ticket.dueDate, language)}
                  />
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {row.ticket.eta === null ? null : (
                  <DueDate
                    urgency={etaUrgencyOf(row)}
                    text={formatDateOnly(row.ticket.eta, language)}
                  />
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {row.ticket.devPriority === null ? null : (
                  <PriorityText
                    devPriority={row.ticket.devPriority}
                    text={`P${String(row.ticket.devPriority)}`}
                  />
                )}
              </td>
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
