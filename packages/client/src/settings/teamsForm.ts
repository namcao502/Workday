import type { TeamsConfig } from '@workday/core'

export interface TeamsForm {
  readonly watchedChannels: string // one "Team > Channel" per line, the first is the default post channel
  readonly postLeadName: string
  readonly postGreeting: string
}

export function formFromTeams(teams: TeamsConfig): TeamsForm {
  return {
    watchedChannels: teams.watchedChannels.join('\n'),
    postLeadName: teams.postLeadName ?? '',
    postGreeting: teams.postGreeting ?? '',
  }
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

export function teamsFromForm(form: TeamsForm): TeamsConfig {
  return {
    watchedChannels: form.watchedChannels
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
    postLeadName: textOrNull(form.postLeadName),
    postGreeting: textOrNull(form.postGreeting),
  }
}
