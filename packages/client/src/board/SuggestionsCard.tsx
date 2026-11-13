import type { Suggestion, WorkView } from '@workday/core'
import { useState } from 'react'
import { useAccess } from '../api/useMe.js'
import { useSettings } from '../api/useSettings.js'
import { actionErrorText, useWorkActions } from '../api/useWork.js'
import { formatDateOnly, t, type Language } from '../i18n.js'
import { ConfirmDialog } from '../timesheet/ConfirmDialog.js'

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
    parts.push(
      ticket.dueDate < today
        ? t(`Overdue (${due})`, `Trễ hạn (${due})`)
        : t(`Due ${due}`, `Hạn ${due}`),
    )
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
    parts.push(t(`like ${similarKey}`, `giống ${similarKey}`))
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

  async function take(key: string): Promise<void> {
    setMessage(null)
    try {
      const outcome = await actions.take(key)
      if (!outcome.ok) {
        setMessage(
          t(`${outcome.holder} already took ${key}`, `Đã có ${outcome.holder} nhận ${key}`),
        )
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
    <section className="suggestions-card" aria-label={t('Available to take', 'Có thể nhận')}>
      <h2 className="suggestions-title">
        {t('Available to take', 'Có thể nhận')}
        {suggestions.epicKey === null ? null : (
          <span className="pill">{`Epic ${suggestions.epicKey}`}</span>
        )}
      </h2>
      {message === null ? null : (
        <p className="status" role="status">
          {message}
        </p>
      )}
      {taking === null ? null : (
        <ConfirmDialog
          message={t(`Take ${taking}?`, `Nhận ${taking}?`)}
          confirmLabel={t('Take', 'Nhận')}
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
      <ul className="todo-list">
        {items.slice(0, shown).map((suggestion) => {
          const { ticket } = suggestion
          const href =
            jira === undefined || jira === null ? null : `${jira.baseUrl}/browse/${ticket.key}`
          return (
            <li key={ticket.key} className="todo-row">
              <span
                className={`todo-icon ${suggestion.urgent ? 'todo-tone-warning' : 'todo-tone-accent'}`}
                aria-hidden="true"
              >
                {suggestion.urgent ? '!' : '+'}
              </span>
              <div className="todo-text">
                <div className="todo-title">
                  {href === null ? (
                    <span className="pill key-pill">{ticket.key}</span>
                  ) : (
                    <a
                      className="pill key-pill"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {ticket.key}
                    </a>
                  )}{' '}
                  {ticket.summary}
                </div>
                <div className="todo-detail muted">
                  {suggestionDetail(suggestion, today, language, selectedStatus)}
                </div>
              </div>
              {canAct ? (
                <div className="todo-buttons">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setTaking(ticket.key)
                    }}
                  >
                    {t('Take', 'Nhận')}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      void hide(ticket.key)
                    }}
                  >
                    {t('Hide', 'Ẩn')}
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {left <= 0 ? null : (
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setShown(shown + SHOW_MORE_STEP)
          }}
        >
          {t(
            `Show ${String(Math.min(SHOW_MORE_STEP, left))} more (${String(left)} left)`,
            `Xem thêm ${String(Math.min(SHOW_MORE_STEP, left))} (${String(left)} còn lại)`,
          )}
        </button>
      )}
    </section>
  )
}
