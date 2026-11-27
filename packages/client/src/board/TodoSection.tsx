import { ChevronDown } from '@gravity-ui/icons'
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n.js'

// At this many groups the section opens itself, so a growing pile of work is not missed.
const AUTO_OPEN_AT = 2

// To do above every board view: one line when folded or empty, and always there.
export function TodoSection({
  count,
  children,
}: {
  readonly count: number
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(count >= AUTO_OPEN_AT)
  const lastCount = useRef(count)
  useEffect(() => {
    if (count >= AUTO_OPEN_AT && lastCount.current < AUTO_OPEN_AT) {
      setOpen(true)
    }
    lastCount.current = count
  }, [count])
  const title = t('board.toDo', { count: String(count) })
  return (
    <section
      aria-label={title}
      className="flex max-h-[40vh] min-h-0 flex-none flex-col rounded-2xl bg-surface-secondary px-3 py-1.5"
      data-testid="board-todo"
    >
      {count === 0 ? (
        // Nothing to fold: the line itself says there is nothing to do.
        <p className="m-0 flex items-center gap-2 py-0.5 text-sm">
          <span className="font-semibold">{title}</span>
          <span className="text-muted">{t('board.nothingToDo')}</span>
        </p>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          className="press-flat flex w-full cursor-pointer items-center gap-2 py-0.5 text-left text-sm font-semibold"
          onClick={() => {
            setOpen(!open)
          }}
        >
          <span className="min-w-0 flex-1">{title}</span>
          {/* One icon that turns, and never the click target: the bar takes every click. */}
          <ChevronDown
            aria-hidden="true"
            className={`pointer-events-none flex-none transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      )}
      {open && count !== 0 ? (
        <div className="min-h-0 overflow-y-auto pt-1 pb-1.5">{children}</div>
      ) : null}
    </section>
  )
}
