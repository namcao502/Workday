import { Button, buttonVariants } from '@heroui/react'
import type { TodoTone } from './todoText.js'

const TONE_CLASS: Readonly<Record<TodoTone, string>> = {
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  ready: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  orange: 'bg-warning-soft text-warning',
  muted: 'bg-default text-muted',
}

// The tinted square that leads a to-do row.
export function TodoIcon({
  tone,
  icon,
}: {
  readonly tone: TodoTone
  readonly icon: string
}): React.JSX.Element {
  return (
    <span
      className={`inline-flex size-7 flex-none items-center justify-center rounded-lg font-semibold ${TONE_CLASS[tone]}`}
      aria-hidden="true"
    >
      {icon}
    </span>
  )
}

export type TodoButton =
  | {
      readonly id: string
      readonly label: string
      readonly href: string // opens in a new tab; onClick runs too (e.g. mark seen)
      readonly onClick?: () => void
    }
  | {
      readonly id: string
      readonly label: string
      readonly disabled?: boolean
      readonly onClick: () => void
    }

interface TodoRowProps {
  readonly icon: string
  readonly tone: TodoTone
  readonly title: string
  readonly detail: string
  readonly buttons: readonly TodoButton[]
}

// One to-do: a tinted icon, a title over a gray detail line, and the buttons at the right edge.
export function TodoRow({ icon, tone, title, detail, buttons }: TodoRowProps): React.JSX.Element {
  return (
    <li className="flex items-center gap-3 border-b border-separator py-2 last:border-b-0">
      <TodoIcon tone={tone} icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold [overflow-wrap:anywhere]">{title}</div>
        {detail === '' ? null : (
          <div className="text-sm text-muted [overflow-wrap:anywhere]">{detail}</div>
        )}
      </div>
      <div className="flex flex-none gap-1.5">
        {buttons.map((button) =>
          'href' in button ? (
            <a
              key={button.id}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              href={button.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={button.onClick}
            >
              {button.label}
            </a>
          ) : (
            <Button
              key={button.id}
              variant="secondary"
              size="sm"
              isDisabled={button.disabled === true}
              onPress={button.onClick}
            >
              {button.label}
            </Button>
          ),
        )}
      </div>
    </li>
  )
}
