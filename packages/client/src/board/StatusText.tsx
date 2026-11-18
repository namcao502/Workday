import type { StatusFlow } from '@workday/core'
import { useSettings } from '../api/useSettings.js'

interface StatusTextProps {
  readonly status: string
  readonly statusCategory: string | null
}

function has(statuses: readonly string[], status: string): boolean {
  const lower = status.toLowerCase()
  return statuses.some((candidate) => candidate.toLowerCase() === lower)
}

// The configured status flow splits Jira's one "in progress" category: Ready to Test (the tester's turn) in green,
// the steps before it (review, deploy) neutral, a send-back (QA Failed) in orange. Names come from config only.
export function statusColor(
  status: string | null,
  statusCategory: string | null,
  flow: StatusFlow | undefined,
): string {
  const category = statusCategory?.toLowerCase()
  if (category === 'done') {
    return 'text-success'
  }
  if (status !== null && flow !== undefined) {
    const readyToTest = flow.readyToTestPath.at(-1)
    if (readyToTest !== undefined && readyToTest.toLowerCase() === status.toLowerCase()) {
      return 'text-success'
    }
    if (has(flow.readyToTestPath, status)) {
      return 'text-foreground'
    }
    if (has(flow.reworkStatuses, status) && !has(flow.preWorkStatuses, status)) {
      return 'text-warning'
    }
  }
  switch (category) {
    case 'new':
      return 'text-muted'
    case 'indeterminate':
      return 'text-accent'
    default:
      return ''
  }
}

export function useStatusFlow(): StatusFlow | undefined {
  return useSettings().data?.config.jira?.statusFlow
}

export function StatusText({ status, statusCategory }: StatusTextProps): React.JSX.Element {
  const flow = useStatusFlow()
  return <span className={statusColor(status, statusCategory, flow)}>{status}</span>
}
