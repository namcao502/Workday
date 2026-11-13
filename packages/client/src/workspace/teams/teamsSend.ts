import type { TeamsWrite } from '../../api/teamsApi.js'
import { errorText } from '../../errors.js'
import type { ComposeOutcome } from './TeamsComposer.js'

// teamsUncertain: the write may have reached Teams, so the composer asks before it sends again.
export function outcomeOf(result: TeamsWrite): ComposeOutcome {
  if (result.ok) {
    return { ok: true }
  }
  return {
    ok: false,
    message: errorText(result.error),
    uncertain: result.error.code === 'teamsUncertain',
  }
}

export type SendAction = (action: () => Promise<TeamsWrite>) => Promise<ComposeOutcome>
