import { Button, Input, Modal } from '@heroui/react'
import { Minus, Plus, Xmark } from '@gravity-ui/icons'
import { useState } from 'react'
import { KeyPill } from '../board/KeyPill.js'
import { t } from '../i18n.js'
import { Tip } from '../ui/Tip.js'
import { hoursText, parseHours, type TicketRow } from './TicketRows.js'

const DAY_MINUTES = 8 * 60
const STEP_MINUTES = 30

interface EditHoursDialogProps {
  readonly dayLabel: string
  readonly rows: readonly TicketRow[]
  readonly urlFor: (key: string) => string
  readonly onSave: (minutes: readonly number[]) => void
  readonly onRemove: (key: string) => void
  readonly onClose: () => void
}

// A queued day's hours, edited as a whole: each ticket > 0h and the day at most 8h before Save is allowed.
export function EditHoursDialog({
  dayLabel,
  rows,
  urlFor,
  onSave,
  onRemove,
  onClose,
}: EditHoursDialogProps): React.JSX.Element {
  // Typed text per ticket; a ticket nobody touched shows its queued hours.
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})
  const textOf = (row: TicketRow): string => drafts[row.key] ?? hoursText(row.minutes)
  const minutes = rows.map((row) => parseHours(textOf(row)))
  const total = minutes.reduce((sum, value) => sum + (Number.isNaN(value) ? 0 : value), 0)
  const valid = minutes.every((value) => value > 0) && total <= DAY_MINUTES
  const changed = rows.some((row, index) => minutes[index] !== row.minutes)

  function setText(key: string, text: string): void {
    setDrafts((current) => ({ ...current, [key]: text }))
  }

  function step(row: TicketRow, by: number): void {
    const current = parseHours(textOf(row))
    const base = Number.isNaN(current) ? 0 : current
    setText(row.key, hoursText(Math.max(STEP_MINUTES, base + by)))
  }

  const title = t('timesheet.editHoursFor', { dayLabel })
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <Modal.Container>
        <Modal.Dialog aria-label={title} className="sm:max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {rows.map((row) => (
                <li key={row.key} className="flex items-center gap-2">
                  <KeyPill ticketKey={row.key} url={urlFor(row.key)} />
                  <Tip
                    className="min-w-0 flex-1 truncate text-sm text-muted"
                    content={row.summary}
                    whenTruncated
                  >
                    {row.summary ?? ''}
                  </Tip>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="secondary"
                    aria-label={t('timesheet.halfAnHourLessFor', { key: row.key })}
                    onPress={() => {
                      step(row, -STEP_MINUTES)
                    }}
                  >
                    <Minus />
                  </Button>
                  <Input
                    variant="secondary"
                    className="w-16 text-right"
                    inputMode="decimal"
                    aria-label={t('timesheet.hoursFor', { ticketKey: row.key })}
                    value={textOf(row)}
                    onChange={(event) => {
                      setText(row.key, event.target.value)
                    }}
                  />
                  <Button
                    isIconOnly
                    size="sm"
                    variant="secondary"
                    aria-label={t('timesheet.halfAnHourMoreFor', { key: row.key })}
                    onPress={() => {
                      step(row, STEP_MINUTES)
                    }}
                  >
                    <Plus />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={t('timesheet.remove', { key: row.key })}
                    onPress={() => {
                      onRemove(row.key)
                    }}
                  >
                    <Xmark />
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{t('timesheet.queueOnlyNote')}</p>
          </Modal.Body>
          <Modal.Footer className="items-center">
            <span className={`mr-auto text-sm ${valid ? 'text-muted' : 'text-danger'}`}>
              {`${hoursText(total)}h / 8h`}
            </span>
            <Button variant="secondary" onPress={onClose}>
              {t('ui.cancel')}
            </Button>
            <Button
              isDisabled={!valid || !changed}
              onPress={() => {
                onSave(minutes)
                onClose()
              }}
            >
              {t('timesheet.save')}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
