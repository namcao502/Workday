import { Button, Card, Input } from '@heroui/react'
import { Plus } from '@gravity-ui/icons'
import type { TicketCheck } from '@workday/core'
import { t } from '../i18n.js'
import { ActionMenu } from './ActionMenu.js'
import { TicketRows, type TicketRow } from './TicketRows.js'

export type LogAction = 'add' | 'now' | 'tsc' | 'hrm' | 'off' | 'clear'

interface LogInputProps {
  readonly date: string
  readonly text: string
  readonly typed: readonly TicketRow[]
  readonly checks: Readonly<Record<string, TicketCheck>>
  readonly problem: string | null
  readonly working: LogAction | null
  readonly hrmClosed: boolean
  readonly tscConnected: boolean
  readonly hrmConnected: boolean
  readonly queueEmpty: boolean
  readonly urlFor: (key: string) => string
  readonly onDate: (date: string) => void
  readonly onText: (text: string) => void
  readonly onTypedHours: (key: string, minutes: number) => void
  readonly onUseKey: (from: string, to: string) => void
  readonly onAction: (action: LogAction) => void
}

export function LogInput(props: LogInputProps): React.JSX.Element {
  const { typed, problem, working, hrmClosed, tscConnected, hrmConnected } = props
  const busy = working !== null
  const hasTickets = typed.length !== 0
  const ready = hasTickets && problem === null && !busy
  const closedNote = hrmClosed ? ` ${t('(after 6 PM)', '(sau 6 PM)')}` : ''
  const label = (action: LogAction, idle: string): string =>
    working === action ? t('Working...', 'Đang chạy...') : idle

  return (
    <Card>
      <Card.Content className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            variant="secondary"
            className="w-40"
            aria-label={t('Date', 'Ngày')}
            value={props.date}
            onChange={(event) => {
              if (event.target.value !== '') {
                props.onDate(event.target.value)
              }
            }}
          />
          <Input
            variant="secondary"
            className="min-w-48 flex-1"
            aria-label={t('Tickets', 'Ticket')}
            placeholder={t('MDP-123, 456 ...', 'MDP-123, 456 ...')}
            value={props.text}
            onChange={(event) => {
              props.onText(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ready) {
                props.onAction('add')
              } else if (event.key === 'Escape') {
                props.onText('')
              }
            }}
          />
          <Button
            isIconOnly
            variant="primary"
            aria-label={t('Add to queue', 'Thêm vào hàng đợi')}
            isDisabled={!ready}
            onPress={() => {
              props.onAction('add')
            }}
          >
            <Plus />
          </Button>
          <Button
            variant="secondary"
            isDisabled={!ready || hrmClosed || !tscConnected || !hrmConnected}
            onPress={() => {
              props.onAction('now')
            }}
          >
            {label('now', `${t('Log now', 'Log ngay')}${closedNote}`)}
          </Button>
          <ActionMenu
            actions={[
              {
                label: t('Log OFF...', 'Log nghỉ...'),
                disabled: busy || !tscConnected,
                onSelect: () => {
                  props.onAction('off')
                },
              },
              {
                label: t('Log now: TSC only', 'Log ngay: chỉ TSC'),
                disabled: !ready || !tscConnected,
                onSelect: () => {
                  props.onAction('tsc')
                },
              },
              {
                label: `${t('Log now: HRM only', 'Log ngay: chỉ HRM')}${closedNote}`,
                disabled: !ready || hrmClosed || !hrmConnected,
                onSelect: () => {
                  props.onAction('hrm')
                },
              },
              {
                label: t('Clear queue...', 'Xóa hàng đợi...'),
                disabled: busy || props.queueEmpty,
                onSelect: () => {
                  props.onAction('clear')
                },
              },
            ]}
          />
        </div>
        {problem === null ? null : <p className="text-sm text-danger">{problem}</p>}
        {hasTickets ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-muted">
              {t('not added yet', 'chưa thêm')}
            </span>
            <TicketRows
              rows={typed}
              checks={props.checks}
              urlFor={props.urlFor}
              onHours={props.onTypedHours}
              onUseKey={props.onUseKey}
            />
          </div>
        ) : null}
      </Card.Content>
    </Card>
  )
}
