import type { BoardSection } from './board.js'
import type { DeployState } from './devDeploys.js'

// The configured path is walked forward only: the steps after the current status, never backward.
export function stepsToReadyToTest(status: string | null, path: readonly string[]): readonly string[] {
  if (status === null) {
    return []
  }
  const lowerStatus = status.toLowerCase()
  const index = path.findIndex((step) => step.toLowerCase() === lowerStatus)
  if (index < 0 || index >= path.length - 1) {
    return []
  }
  return path.slice(index + 1)
}

// A merge alone means Deployed to Dev; Ready to Test (the last step) waits for the dev pipelines to finish.
export function autoSteps(
  status: string | null,
  path: readonly string[],
  deploy: DeployState,
): readonly string[] {
  const steps = stepsToReadyToTest(status, path)
  return deploy === 'deployed' ? steps : steps.slice(0, -1)
}

export function readyToTestSteps(
  section: BoardSection,
  status: string | null,
  devPrMerged: boolean,
  path: readonly string[],
): readonly string[] | null {
  if (section !== 'inProgress' && section !== 'done') {
    return null
  }
  if (!devPrMerged) {
    return null
  }
  const steps = stepsToReadyToTest(status, path)
  return steps.length === 0 ? null : steps
}

// An unknown or empty status counts, so a ticket is never left out of the overdue to-dos.
export function isWithDeveloper(
  status: string | null,
  developerStatuses: readonly string[],
): boolean {
  if (status === null || status === '' || developerStatuses.length === 0) {
    return true
  }
  const lowerStatus = status.toLowerCase()
  return developerStatuses.some((candidate) => candidate.toLowerCase() === lowerStatus)
}
