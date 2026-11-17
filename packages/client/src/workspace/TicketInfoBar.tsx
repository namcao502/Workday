import { Button } from '@heroui/react'
import { useQuery } from '@tanstack/react-query'
import type { BoardRow } from '@workday/core'
import { getBoard, queryKeys } from '../api/client.js'
import { openInVsCode } from '../api/workspaceApi.js'
import { useRepoLabels, useWork } from '../api/useWork.js'
import { KeyPill } from '../board/KeyPill.js'
import { PrPills } from '../board/PrPills.js'
import { useReadyToTest } from '../board/useReadyToTest.js'
import { formatDateOnly, getLanguage, t } from '../i18n.js'

const SECONDS_PER_HOUR = 3600

// "Due Nov 13", "ETA Nov 13", "Logged 2.5h": a lone date could be either, so each names its column (WPF HeaderFacts).
export function ticketFacts(row: BoardRow): readonly string[] {
  const language = getLanguage()
  const { ticket } = row
  const facts: string[] = []
  if (ticket.status !== null) {
    facts.push(ticket.status)
  }
  if (ticket.dueDate !== null) {
    facts.push(`${t('Due', 'Hạn')} ${formatDateOnly(ticket.dueDate, language)}`)
  }
  if (ticket.eta !== null) {
    facts.push(`ETA ${formatDateOnly(ticket.eta, language)}`)
  }
  if (ticket.timeSpentSeconds !== null && ticket.timeSpentSeconds !== 0) {
    const hours = Math.round((ticket.timeSpentSeconds / SECONDS_PER_HOUR) * 10) / 10
    facts.push(`${t('Logged', 'Đã log')} ${String(hours)}h`)
  }
  return facts
}

// The row under the header of a ticket tab: key, summary, facts, PR pills and the ticket's buttons.
export function TicketInfoBar({ ticketKey }: { readonly ticketKey: string }): React.JSX.Element {
  const board = useQuery({ queryKey: queryKeys.board, queryFn: getBoard })
  const work = useWork().data
  const repoLabels = useRepoLabels()
  const readyToTest = useReadyToTest()
  const row = board.data?.rows.find((candidate) => candidate.ticket.key === ticketKey)
  const steps = work?.readyToTest[ticketKey]
  const facts = row === undefined ? [] : ticketFacts(row)
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface px-3 py-2 shadow-surface"
      data-testid="ticket-info"
    >
      {row === undefined ? (
        <span className="text-sm font-medium">{ticketKey}</span>
      ) : (
        <KeyPill ticketKey={ticketKey} url={row.url} />
      )}
      {row === undefined ? null : (
        <span className="min-w-0 flex-1 truncate text-base" title={row.ticket.summary}>
          {row.ticket.summary}
        </span>
      )}
      {facts.length === 0 ? null : <span className="text-sm text-muted">{facts.join(' · ')}</span>}
      <PrPills prs={work?.prs[ticketKey] ?? []} repoLabels={repoLabels} />
      <span className="ml-auto flex items-center gap-1">
        {steps === undefined ? null : (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              readyToTest.ask(ticketKey, steps)
            }}
          >
            Ready to Test
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            void openInVsCode(ticketKey)
          }}
        >
          VS Code
        </Button>
      </span>
      {readyToTest.dialog}
      {readyToTest.message === null ? null : (
        <p className="w-full text-sm text-muted" role="status">
          {readyToTest.message}
        </p>
      )}
    </div>
  )
}
