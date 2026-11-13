import type { TodoTone } from './todoText.js'

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
    <li className="todo-row">
      <span className={`todo-icon todo-tone-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div className="todo-text">
        <div className="todo-title">{title}</div>
        {detail === '' ? null : <div className="todo-detail muted">{detail}</div>}
      </div>
      <div className="todo-buttons">
        {buttons.map((button) =>
          'href' in button ? (
            <a
              key={button.id}
              className="button secondary"
              href={button.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={button.onClick}
            >
              {button.label}
            </a>
          ) : (
            <button
              key={button.id}
              type="button"
              className="button secondary"
              disabled={button.disabled === true}
              onClick={button.onClick}
            >
              {button.label}
            </button>
          ),
        )}
      </div>
    </li>
  )
}
