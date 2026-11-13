import { describeSlots, slotsFor, type TicketCheck } from '@workday/core'
import { Button, Input } from '@heroui/react'
import { Xmark } from '@gravity-ui/icons'
import { useState } from 'react'
import { KeyPill } from '../board/KeyPill.js'
import { t } from '../i18n.js'
import { formatMinutes } from './timesheetText.js'

const MINUTES_PER_HOUR = 60

export interface TicketRow {
  readonly key: string
  readonly minutes: number
}

interface TicketRowsProps {
  readonly rows: readonly TicketRow[]
  readonly checks?: Readonly<Record<string, TicketCheck>>
  readonly urlFor: (key: string) => string
  readonly onHours?: ((key: string, minutes: number) => void) | undefined // absent = read only
  readonly onRemove?: ((key: string) => void) | undefined
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
    return <span className="size-2 flex-none rounded-full" aria-hidden="true" />
  }
  if (check.isMine === false) {
    return (
      <span
        className="w-2 flex-none text-center font-bold text-warning"
        title={t('Not your ticket', 'Không phải ticket của anh')}
      >
        !
      </span>
    )
  }
  const labels = {
    valid: t('Ticket found', 'Có ticket'),
    notFound: t('Ticket not found', 'Không có ticket'),
    unknown: t('Could not check the ticket', 'Chưa kiểm tra được ticket'),
  } as const
  const dot = { valid: 'bg-success', notFound: 'bg-danger', unknown: 'bg-warning' } as const
  return (
    <span
      className={`size-2 flex-none rounded-full ${dot[check.status]}`}
      title={labels[check.status]}
    />
  )
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
    <Input
      variant="secondary"
      className="w-16 text-right"
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
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {rows.map((row, index) => {
        const check = checks?.[row.key]
        return (
          <li key={row.key}>
            <div className="flex items-center gap-2">
              {checks === undefined ? null : <CheckDot check={check} />}
              <KeyPill ticketKey={row.key} url={urlFor(row.key)} />
              <span className="min-w-0 flex-1 truncate text-sm text-muted">
                {check?.summary ?? ''}
              </span>
              {onHours === undefined ? (
                <span className="text-sm">{formatMinutes(row.minutes)}</span>
              ) : (
                <HoursInput
                  ticketKey={row.key}
                  minutes={row.minutes}
                  tooltip={describeSlots(slotsFor(allMinutes, index))}
                  onHours={onHours}
                />
              )}
              {onRemove === undefined ? null : (
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label={t(`Remove ${row.key}`, `Bỏ ${row.key}`)}
                  onPress={() => {
                    onRemove(row.key)
                  }}
                >
                  <Xmark />
                </Button>
              )}
            </div>
            {check?.isMine === false ? (
              <div className="flex items-center gap-2 pl-4 text-sm text-warning">
                <span>{t('Not your ticket', 'Không phải ticket của anh')}</span>
                {check.suggestedKey === null || onUseKey === undefined ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      if (check.suggestedKey !== null) {
                        onUseKey(row.key, check.suggestedKey)
                      }
                    }}
                  >
                    {t(`Use ${check.suggestedKey}`, `Dùng ${check.suggestedKey}`)}
                  </Button>
                )}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
