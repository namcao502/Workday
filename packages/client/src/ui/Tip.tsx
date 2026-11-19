import { Tooltip } from '@heroui/react'

type TipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface TipProps {
  // Nothing to show (undefined, null or empty) shows no tooltip.
  readonly content: React.ReactNode
  readonly children?: React.ReactNode
  // Classes for the wrapping span, which takes the place of the element that held the title.
  readonly className?: string | undefined
  readonly placement?: TipPlacement
}

// Native `title` waits ~0.5s; HeroUI's theme default (1.5s) feels slow for hints.
const OPEN_DELAY_MS = 500

// The app's hover hint: a HeroUI tooltip on a span, used instead of the browser's `title`.
export function Tip({
  content,
  children,
  className,
  placement = 'top',
}: TipProps): React.JSX.Element {
  // Disabled rather than left out, so the children keep their DOM when the hint text comes and goes.
  const empty = content === undefined || content === null || content === ''
  return (
    <Tooltip delay={OPEN_DELAY_MS} closeDelay={0} isDisabled={empty}>
      <Tooltip.Trigger
        className={className ?? ''}
        // HeroUI makes the trigger a focusable "button"; ours wraps text or a real control, so it stays a plain span.
        render={(props) => <span {...props} role={undefined} tabIndex={undefined} />}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Content
        placement={placement}
        className="whitespace-pre-line break-words [word-break:normal]"
      >
        {content}
      </Tooltip.Content>
    </Tooltip>
  )
}
