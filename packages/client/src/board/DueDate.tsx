import type { DueUrgency } from '@workday/core'

interface DueDateProps {
  readonly urgency: DueUrgency
  readonly text: string
}

// A date with no urgency still reads as a value inside a muted line (the phone card, the info bar).
export function urgencyColor(urgency: DueUrgency): string {
  switch (urgency) {
    case 'overdue':
      return 'text-danger'
    case 'dueSoon':
      return 'text-warning'
    case 'none':
      return 'text-foreground'
  }
}

// A due date or an ETA, red once passed and orange when near.
export function DueDate({ urgency, text }: DueDateProps): React.JSX.Element {
  return (
    <span
      className={urgencyColor(urgency)}
      data-overdue={urgency === 'overdue' ? 'true' : undefined}
    >
      {text}
    </span>
  )
}
