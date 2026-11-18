import { devPriorityLevel, type DevPriorityLevel } from '@workday/core'

interface PriorityTextProps {
  readonly devPriority: number
  readonly text: string
}

const PRIORITY_COLOR: Readonly<Record<DevPriorityLevel, string>> = {
  top: 'font-medium text-danger',
  high: 'font-medium text-warning',
  normal: '',
  none: '',
}

// The dev priority as the board shows it: P1 red and P2 orange, the levels the to-do list ranks first.
export function PriorityText({ devPriority, text }: PriorityTextProps): React.JSX.Element {
  return <span className={PRIORITY_COLOR[devPriorityLevel(devPriority)]}>{text}</span>
}
