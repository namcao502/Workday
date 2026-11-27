import { Tooltip } from '@heroui/react'
import { useRef, useState } from 'react'

type TipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface TipProps {
  // Nothing to show (undefined, null or empty) shows no tooltip.
  readonly content: React.ReactNode
  readonly children?: React.ReactNode
  // Classes for the wrapping span, which takes the place of the element that held the title.
  readonly className?: string | undefined
  readonly placement?: TipPlacement
  // Only when the span's own text is cut (a truncated name): a name shown in full needs no hint.
  readonly whenTruncated?: boolean
}

function isCut(element: HTMLElement | null): boolean {
  // Wider than its box (truncate) or taller (line-clamp).
  return (
    element !== null &&
    (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight)
  )
}

// Native `title` waits ~0.5s; HeroUI's theme default (1.5s) feels slow for hints.
const OPEN_DELAY_MS = 500

// The app's hover hint: a HeroUI tooltip on a span, used instead of the browser's `title`.
export function Tip({
  content,
  children,
  className,
  placement = 'top',
  whenTruncated = false,
}: TipProps): React.JSX.Element {
  // Disabled rather than left out, so the children keep their DOM when the hint text comes and goes.
  const empty = content === undefined || content === null || content === ''
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLSpanElement | null>(null)
  return (
    <Tooltip
      delay={OPEN_DELAY_MS}
      closeDelay={0}
      isDisabled={empty}
      isOpen={open}
      onOpenChange={(next) => {
        // Measured as it opens, so a resized pane is judged by the width it has now.
        setOpen(next && (!whenTruncated || isCut(trigger.current)))
      }}
    >
      <Tooltip.Trigger<'span'>
        className={className ?? ''}
        // HeroUI makes the trigger a focusable "button"; ours wraps text or a real control, so it stays a plain span.
        // It also keeps the hovered span, for whenTruncated to measure as the hint opens.
        render={(props) => (
          <span
            {...props}
            role={undefined}
            tabIndex={undefined}
            onPointerEnter={(event) => {
              trigger.current = event.currentTarget
              props.onPointerEnter?.(event)
            }}
          />
        )}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content
        placement={placement}
        // A hint never takes a click: the row it covers stays clickable through it.
        className="pointer-events-none whitespace-pre-line break-words [word-break:normal]"
      >
        {content}
      </Tooltip.Content>
    </Tooltip>
  )
}
