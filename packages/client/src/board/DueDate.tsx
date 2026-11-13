import type { BoardRow } from '@workday/core'
import { dueUrgencyOf } from './boardView.js'

interface DueDateProps {
  readonly row: BoardRow
  readonly text: string
}

export function DueDate({ row, text }: DueDateProps): React.JSX.Element {
  const urgency = dueUrgencyOf(row)
  const color = urgency === 'overdue' ? 'text-danger' : urgency === 'dueSoon' ? 'text-warning' : ''
  return (
    <span className={color} data-overdue={urgency === 'overdue' ? 'true' : undefined}>
      {text}
    </span>
  )
}
