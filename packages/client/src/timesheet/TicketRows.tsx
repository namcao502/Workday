import { describeSlots, slotsFor, type TicketCheck } from '@workday/core'
import { Button, Input } from '@heroui/react'
import { Xmark } from '@gravity-ui/icons'
import { useState } from 'react'
import { KeyPill } from '../board/KeyPill.js'
import { t } from '../i18n.js'
import { formatMinutes } from './timesheetText.js'
import { Tip } from '../ui/Tip.js'

const MINUTES_PER_HOUR = 60

export interface TicketRow {
  readonly key: string
  readonly minutes: number
  readonly summary?: string | null // shown beside the key; otherwise the check's summary
}

interface TicketRowsProps {
  readonly rows: readonly TicketRow[]
  readonly checks?: Readonly<Record<string, TicketCheck>>
  readonly urlFor: (key: string) => string
  readonly onHours?: ((key: string, minutes: number) => void) | undefined // absent = read only
  readonly onRemove?: ((key: string) => void) | undefined
  readonly onUseKey?: (from: string, to: string) => void
}

export function hoursText(minutes: number): string {
  return String(Math.round((minutes / MINUTES_PER_HOUR) * 100) / 100)
}

// Decimal hours ("2.5" or "2,5") to whole minutes; NaN when it is not a number.
export function parseHours(text: string): number {
  const hours = Number(text.trim().replace(',', '.'))
  return text.trim() === '' ? Number.NaN : Math.round(hours * MINUTES_PER_HOUR)
}

function CheckDot({ check }: { readonly check: TicketCheck | undefined }): React.JSX.Element {
  if (check === undefined) {
    return <span className="size-2 flex-none rounded-full" aria-hidden="true" />
  }
  if (check.isMine === false) {
    return (
      <Tip
        className="w-2 flex-none text-center font-bold text-warning"
        content={t('timesheet.notYourTicket')}
      >
        !
      </Tip>
    )
  }
  const labels = {
    valid: t('timesheet.ticketFound'),
    notFound: t('timesheet.ticketNotFound'),
    unknown: t('timesheet.couldNotCheckTheTicket'),
  } as const
  const dot = { valid: 'bg-success', notFound: 'bg-danger', unknown: 'bg-warning' } as const
  return (
    <Tip
      className={`size-2 flex-none rounded-full ${dot[check.status]}`}
      content={labels[check.status]}
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
    <Tip content={tooltip}>
      <Input
        variant="secondary"
        className="w-16 text-right"
        inputMode="decimal"
        aria-label={t('timesheet.hoursFor', { ticketKey })}
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
    </Tip>
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
        const summary = row.summary ?? check?.summary ?? ''
        return (
          <li key={row.key}>
            <div className="flex items-center gap-2">
              {checks === undefined ? null : <CheckDot check={check} />}
              <KeyPill ticketKey={row.key} url={urlFor(row.key)} />
              {/* A long summary ends in "...", the tooltip holds the whole of it. */}
              <Tip className="min-w-0 flex-1 truncate text-sm text-muted" content={summary}>
                {summary}
              </Tip>
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
                  variant="secondary"
                  size="sm"
                  aria-label={t('timesheet.remove', { key: row.key })}
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
                <span>{t('timesheet.notYourTicket')}</span>
                {check.suggestedKey === null || onUseKey === undefined ? null : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      if (check.suggestedKey !== null) {
                        onUseKey(row.key, check.suggestedKey)
                      }
                    }}
                  >
                    {t('timesheet.use', { suggestedKey: check.suggestedKey })}
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
