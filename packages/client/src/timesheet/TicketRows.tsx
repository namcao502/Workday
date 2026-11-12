import { describeSlots, slotsFor, type TicketCheck } from '@workday/core'
import { useState } from 'react'
import { KeyPill } from '../board/KeyPill.js'
import { t } from '../i18n.js'

const MINUTES_PER_HOUR = 60

export interface TicketRow {
  readonly key: string
  readonly minutes: number
}

interface TicketRowsProps {
  readonly rows: readonly TicketRow[]
  readonly checks?: Readonly<Record<string, TicketCheck>>
  readonly urlFor: (key: string) => string
  readonly onHours: (key: string, minutes: number) => void
  readonly onRemove?: (key: string) => void
  readonly onUseKey?: (from: string, to: string) => void
}

function hoursText(minutes: number): string {
  return String(Math.round((minutes / MINUTES_PER_HOUR) * 100) / 100)
}

// Decimal hours ("2.5" or "2,5") to whole minutes; NaN when it is not a number.
function parseHours(text: string): number {
  const hours = Number(text.trim().replace(',', '.'))
  return text.trim() === '' ? Number.NaN : Math.round(hours * MINUTES_PER_HOUR)
}

function CheckDot({ check }: { readonly check: TicketCheck | undefined }): React.JSX.Element {
  if (check === undefined) {
    return <span className="check-dot" aria-hidden="true" />
  }
  if (check.isMine === false) {
    return (
      <span className="check-warn" title={t('Not your ticket', 'Không phải ticket của anh')}>
        !
      </span>
    )
  }
  const labels = {
    valid: t('Ticket found', 'Có ticket'),
    notFound: t('Ticket not found', 'Không có ticket'),
    unknown: t('Could not check the ticket', 'Chưa kiểm tra được ticket'),
  } as const
  return <span className={`check-dot check-${check.status}`} title={labels[check.status]} />
}

interface HoursInputProps {
  readonly ticketKey: string
  readonly minutes: number
  readonly tooltip: string
  readonly onHours: (key: string, minutes: number) => void
}

// Saves on blur or Enter, and only when the user typed something.
function HoursInput({ ticketKey, minutes, tooltip, onHours }: HoursInputProps): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)

  function commit(): void {
    if (draft === null) {
      return
    }
    setDraft(null)
    onHours(ticketKey, parseHours(draft))
  }

  return (
    <input
      className="input hours-input"
      inputMode="decimal"
      aria-label={t(`Hours for ${ticketKey}`, `Số giờ cho ${ticketKey}`)}
      title={tooltip}
      value={draft ?? hoursText(minutes)}
      onChange={(event) => {
        setDraft(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
        }
      }}
    />
  )
}

export function TicketRows({
  rows,
  checks,
  urlFor,
  onHours,
  onRemove,
  onUseKey,
}: TicketRowsProps): React.JSX.Element {
  const allMinutes = rows.map((row) => row.minutes)
  return (
    <ul className="ticket-rows">
      {rows.map((row, index) => {
        const check = checks?.[row.key]
        return (
          <li key={row.key} className="ticket-row">
            <div className="ticket-line">
              {checks === undefined ? null : <CheckDot check={check} />}
              <KeyPill ticketKey={row.key} url={urlFor(row.key)} />
              <span className="ticket-summary muted">{check?.summary ?? ''}</span>
              <HoursInput
                ticketKey={row.key}
                minutes={row.minutes}
                tooltip={describeSlots(slotsFor(allMinutes, index))}
                onHours={onHours}
              />
              {onRemove === undefined ? null : (
                <button
                  type="button"
                  className="button ghost row-remove"
                  aria-label={t(`Remove ${row.key}`, `Bỏ ${row.key}`)}
                  onClick={() => {
                    onRemove(row.key)
                  }}
                >
                  X
                </button>
              )}
            </div>
            {check?.isMine === false ? (
              <div className="ticket-warning">
                <span>{t('Not your ticket', 'Không phải ticket của anh')}</span>
                {check.suggestedKey === null || onUseKey === undefined ? null : (
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      if (check.suggestedKey !== null) {
                        onUseKey(row.key, check.suggestedKey)
                      }
                    }}
                  >
                    {t(`Use ${check.suggestedKey}`, `Dùng ${check.suggestedKey}`)}
                  </button>
                )}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
