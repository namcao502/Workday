// Status names come from config: a tracker's board decides what counts as pre-work or rework.
export interface StatusFlow {
  readonly preWorkStatuses: readonly string[]
  readonly reworkStatuses: readonly string[]
  // ["PR & Code Review", "Deployed to Dev", "Ready to Test"]; the last is Ready to Test. Empty = feature off.
  readonly readyToTestPath: readonly string[]
  // Statuses whose next move is the developer's (overdue to-do). Empty = every status counts.
  readonly developerStatuses: readonly string[]
}

function hasStatus(statuses: readonly string[], status: string | null): boolean {
  if (status === null) {
    return false
  }
  const lowerStatus = status.toLowerCase()
  return statuses.some((candidate) => candidate.toLowerCase() === lowerStatus)
}

// A done ticket was sent back when its status moved from past pre-work into a rework status.
export function isSentBack(
  storedStatus: string | null,
  liveStatus: string | null,
  flow: StatusFlow,
): boolean {
  if (storedStatus === null || storedStatus === '') {
    return false
  }
  if (liveStatus !== null && storedStatus.toLowerCase() === liveStatus.toLowerCase()) {
    return false
  }
  return (
    hasStatus(flow.reworkStatuses, liveStatus) && !hasStatus(flow.preWorkStatuses, storedStatus)
  )
}
