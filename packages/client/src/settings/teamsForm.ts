import type { TeamsConfig } from '@workday/core'

export interface TeamsForm {
  readonly watchedChannels: string // one "Team > Channel" per line, the first is the default post channel
  readonly postLeadName: string
  readonly postGreeting: string
  readonly dbReviewTeam: string
  readonly dbReviewChannel: string
}

export function formFromTeams(teams: TeamsConfig): TeamsForm {
  return {
    watchedChannels: teams.watchedChannels.join('\n'),
    postLeadName: teams.postLeadName ?? '',
    postGreeting: teams.postGreeting ?? '',
    dbReviewTeam: teams.dbReviewChannel?.teamName ?? '',
    dbReviewChannel: teams.dbReviewChannel?.channelName ?? '',
  }
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

// True when exactly one of the two Database Review names is filled.
export function dbReviewIncomplete(form: TeamsForm): boolean {
  return (form.dbReviewTeam.trim() === '') !== (form.dbReviewChannel.trim() === '')
}

function dbReviewFromForm(form: TeamsForm): TeamsConfig['dbReviewChannel'] {
  const teamName = textOrNull(form.dbReviewTeam)
  const channelName = textOrNull(form.dbReviewChannel)
  return teamName === null || channelName === null ? null : { teamName, channelName }
}

export function teamsFromForm(form: TeamsForm): TeamsConfig {
  return {
    watchedChannels: form.watchedChannels
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
    postLeadName: textOrNull(form.postLeadName),
    postGreeting: textOrNull(form.postGreeting),
    dbReviewChannel: dbReviewFromForm(form),
  }
}
