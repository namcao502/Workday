import { Button, Modal } from '@heroui/react'
import type { TicketField } from '@workday/core'
import { useState } from 'react'
import { useSettings } from '../api/useSettings.js'
import { useTicketUpdate, type TicketUpdateView } from '../api/ticketUpdateApi.js'
import { actionErrorText, useWorkActions } from '../api/useWork.js'
import { formatShortDate, getLanguage, t } from '../i18n.js'
import { fieldLabel, fieldValue, isLongField, orderedFields } from './ticketUpdateText.js'

interface TicketUpdateDialogProps {
  readonly ticketKey: string
  readonly canAct: boolean // marking as seen writes, so it needs act access
  readonly onClose: () => void
}

function FieldRow({
  field,
  update,
}: {
  readonly field: TicketField
  readonly update: TicketUpdateView
}): React.JSX.Element {
  const valueClass = isLongField(field) ? 'whitespace-pre-wrap' : ''
  return (
    <li className="flex flex-col gap-1 rounded-2xl bg-surface-secondary px-3 py-2">
      <span className="text-xs font-medium text-muted uppercase">{fieldLabel(field)}</span>
      <div className="grid grid-cols-2 gap-3 text-sm [overflow-wrap:anywhere]">
        <div>
          <span className="text-xs text-muted">{t('Before', 'Trước')}</span>
          <p className={valueClass}>{fieldValue(update.viewed, field)}</p>
        </div>
        <div>
          <span className="text-xs text-muted">{t('After', 'Sau')}</span>
          <p className={valueClass}>{fieldValue(update.current, field)}</p>
        </div>
      </div>
    </li>
  )
}

function changedByText(update: TicketUpdateView, timeZone: string): string {
  const parts: string[] = []
  if (update.changedBy !== null) {
    parts.push(t(`Changed by ${update.changedBy}`, `Người sửa: ${update.changedBy}`))
  }
  if (update.changedAt !== null) {
    parts.push(formatShortDate(new Date(update.changedAt), getLanguage(), timeZone))
  }
  return parts.join(' - ')
}

export function TicketUpdateDialog({
  ticketKey,
  canAct,
  onClose,
}: TicketUpdateDialogProps): React.JSX.Element {
  const query = useTicketUpdate(ticketKey)
  const actions = useWorkActions()
  const timeZone = useSettings().data?.config.timeZone ?? 'UTC'
  const [message, setMessage] = useState<string | null>(null)
  const update = query.data ?? null

  async function markSeen(shown: TicketUpdateView['current']): Promise<void> {
    setMessage(null)
    try {
      await actions.ticketUpdateViewed(ticketKey, shown)
      onClose()
    } catch (error: unknown) {
      setMessage(actionErrorText(error))
    }
  }

  let body: React.JSX.Element
  if (query.isError) {
    body = (
      <p role="alert" className="text-sm text-danger">
        {t('The changes could not be loaded', 'Không tải được thay đổi')}
      </p>
    )
  } else if (query.data === undefined) {
    body = <p className="text-sm text-muted">{t('Loading...', 'Đang tải...')}</p>
  } else if (update === null) {
    body = <p className="text-sm text-muted">{t('Nothing changed', 'Không có thay đổi')}</p>
  } else {
    body = (
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {orderedFields(update.fields).map((field) => (
          <FieldRow key={field} field={field} update={update} />
        ))}
      </ul>
    )
  }

  const title = t(`${ticketKey} changes`, `Thay đổi của ${ticketKey}`)
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
        <Modal.Dialog aria-label={title} className="sm:max-w-3xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
            {update === null ? null : (
              <p className="text-sm text-muted">{changedByText(update, timeZone)}</p>
            )}
          </Modal.Header>
          <Modal.Body>
            {body}
            {message === null ? null : (
              <p role="alert" className="mt-2 text-sm text-danger">
                {message}
              </p>
            )}
          </Modal.Body>
          <Modal.Footer>
            {canAct && update !== null ? (
              <Button
                onPress={() => {
                  void markSeen(update.current)
                }}
              >
                {t('Mark as seen', 'Đánh dấu đã xem')}
              </Button>
            ) : null}
            <Button variant="secondary" onPress={onClose}>
              {t('Close', 'Đóng')}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
