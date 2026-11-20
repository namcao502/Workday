import { Button, Chip } from '@heroui/react'
import type { Suggestion, WorkView } from '@workday/core'
import { useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import { actionErrorText, useWorkActions } from '../api/useWork.js'
import { formatDateOnly, t, type Language } from '../i18n.js'
import { ConfirmDialog } from '../ui/ConfirmDialog.js'
import { Section } from '../ui/Section.js'
import { KeyPill } from './KeyPill.js'
import { TodoIcon } from './TodoRow.js'

const SHOW_MORE_STEP = 10
const SEPARATOR = ' · '

type SuggestionsView = NonNullable<WorkView['suggestions']>

interface SuggestionsCardProps {
  readonly suggestions: SuggestionsView
  readonly today: string // "YYYY-MM-DD", from the board view
  readonly language: Language
}

function isHighPriority(priority: string | null): boolean {
  const lower = priority?.toLowerCase()
  return lower === 'high' || lower === 'highest'
}

// Type, due or overdue, high priority, P<n>, the preferred status and the similar ticket.
export function suggestionDetail(
  suggestion: Suggestion,
  today: string,
  language: Language,
  selectedStatus: string | null,
): string {
  const { ticket, similarKey } = suggestion
  const parts: string[] = []
  if (ticket.issueType !== null && ticket.issueType !== '') {
    parts.push(ticket.issueType)
  }
  if (ticket.dueDate !== null) {
    const due = formatDateOnly(ticket.dueDate, language)
    parts.push(ticket.dueDate < today ? t('board.overdue', { due }) : t('board.due2', { due }))
  }
  if (ticket.priority !== null && isHighPriority(ticket.priority)) {
    parts.push(ticket.priority)
  }
  if (ticket.devPriority !== null) {
    parts.push(`P${String(ticket.devPriority)}`)
  }
  if (
    selectedStatus !== null &&
    ticket.status !== null &&
    ticket.status.toLowerCase() === selectedStatus.toLowerCase()
  ) {
    parts.push(ticket.status)
  }
  if (similarKey !== null) {
    parts.push(t('board.like', { similarKey }))
  }
  return parts.join(SEPARATOR)
}

// The best tickets of the month's epic nobody has taken, each with Take and Hide.
export function SuggestionsCard({
  suggestions,
  today,
  language,
}: SuggestionsCardProps): React.JSX.Element | null {
  const canAct = useAccess().canAct('board')
  const settings = useSettings().data
  const actions = useWorkActions()
  const [shown, setShown] = useState(SHOW_MORE_STEP)
  const [taking, setTaking] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const jira = settings?.config.jira
  const selectedStatus = jira?.suggestions?.selectedStatus ?? null
  const { items } = suggestions
  if (items.length === 0) {
    return null
  }
  const left = items.length - shown
  const urlFor = (key: string): string | null =>
    jira === undefined || jira === null ? null : `${jira.baseUrl}/browse/${key}`
  const epicKey = suggestions.epicKey
  const epicUrl = epicKey === null ? null : urlFor(epicKey)

  async function take(key: string): Promise<void> {
    setMessage(null)
    try {
      const outcome = await actions.take(key)
      if (!outcome.ok) {
        setMessage(t('board.alreadyTook', { holder: outcome.holder, key }))
      }
    } catch (error: unknown) {
      setMessage(actionErrorText(error))
    }
  }

  async function hide(key: string): Promise<void> {
    setMessage(null)
    try {
      await actions.hideSuggestion(key)
    } catch (error: unknown) {
      setMessage(actionErrorText(error))
    }
  }

  return (
    <Section
      title={t('board.availableToTake')}
      actions={
        epicKey === null ? null : (
          <span className="flex items-center gap-2">
            <span className="text-sm text-muted">{t('board.epic')}</span>
            {epicUrl === null ? (
              <Chip size="lg" className="px-3 text-sm font-medium">
                {epicKey}
              </Chip>
            ) : (
              <KeyPill ticketKey={epicKey} url={epicUrl} />
            )}
          </span>
        )
      }
    >
      {message === null ? null : (
        <p className="text-sm text-muted" role="status">
          {message}
        </p>
      )}
      {taking === null ? null : (
        <ConfirmDialog
          message={t('board.take', { taking })}
          confirmLabel={t('board.take2')}
          onConfirm={() => {
            const key = taking
            setTaking(null)
            void take(key)
          }}
          onCancel={() => {
            setTaking(null)
          }}
        />
      )}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.slice(0, shown).map((suggestion) => {
          const { ticket } = suggestion
          const href = urlFor(ticket.key)
          return (
            <li key={ticket.key} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <TodoIcon
                tone={suggestion.urgent ? 'warning' : 'accent'}
                icon={suggestion.urgent ? '!' : '+'}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  {href === null ? (
                    <Chip size="lg" color="accent" className="flex-none px-3 text-sm font-medium">
                      {ticket.key}
                    </Chip>
                  ) : (
                    <KeyPill ticketKey={ticket.key} url={href} />
                  )}
                  <span className="min-w-0 [overflow-wrap:anywhere]">{ticket.summary}</span>
                </div>
                <div className="text-sm text-muted [overflow-wrap:anywhere]">
                  {suggestionDetail(suggestion, today, language, selectedStatus)}
                </div>
              </div>
              {canAct ? (
                <div className="flex flex-none gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      setTaking(ticket.key)
                    }}
                  >
                    {t('board.take2')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      void hide(ticket.key)
                    }}
                  >
                    {t('board.hide')}
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {left <= 0 ? null : (
        <div>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setShown(shown + SHOW_MORE_STEP)
            }}
          >
            {t('board.showMoreLeft', {
              min: String(Math.min(SHOW_MORE_STEP, left)),
              left: String(left),
            })}
          </Button>
        </div>
      )}
    </Section>
  )
}
