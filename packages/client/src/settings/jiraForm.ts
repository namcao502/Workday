import type { JiraConfig, SuggestionsConfig } from '@workday/core'

export interface JiraForm {
  readonly baseUrl: string
  readonly email: string
  readonly projectKey: string
  readonly etaFieldId: string
  readonly devPriorityFieldId: string
  readonly assignedJql: string
  readonly mineJql: string
  readonly preWorkStatuses: string
  readonly reworkStatuses: string
  readonly readyToTestPath: string
  readonly developerStatuses: string
  readonly suggestionsEpicJql: string
  readonly suggestionsEpicTitlePrefix: string
  readonly suggestionsCandidatesJql: string
  readonly suggestionsMineJql: string
  readonly suggestionsSelectedStatus: string
}

const DEFAULT_MAX_RESULTS = 50

export function formFromConfig(jira: JiraConfig | null): JiraForm {
  return {
    baseUrl: jira?.baseUrl ?? '',
    email: jira?.email ?? '',
    projectKey: jira?.projectKey ?? '',
    etaFieldId: jira?.etaFieldId ?? '',
    devPriorityFieldId: jira?.devPriorityFieldId ?? '',
    assignedJql: jira?.assignedJql ?? '',
    mineJql: jira?.mineJql ?? '',
    preWorkStatuses: (jira?.statusFlow.preWorkStatuses ?? []).join('\n'),
    reworkStatuses: (jira?.statusFlow.reworkStatuses ?? []).join('\n'),
    readyToTestPath: (jira?.statusFlow.readyToTestPath ?? []).join('\n'),
    developerStatuses: (jira?.statusFlow.developerStatuses ?? []).join('\n'),
    suggestionsEpicJql: jira?.suggestions?.epicJql ?? '',
    suggestionsEpicTitlePrefix: jira?.suggestions?.epicTitlePrefix ?? '',
    suggestionsCandidatesJql: jira?.suggestions?.candidatesJql ?? '',
    suggestionsMineJql: jira?.suggestions?.mineJql ?? '',
    suggestionsSelectedStatus: jira?.suggestions?.selectedStatus ?? '',
  }
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

// Empty JQL is sent as '' so the server applies its default.
export function configFromForm(form: JiraForm, saved: JiraConfig | null): JiraConfig {
  return {
    baseUrl: form.baseUrl.trim(),
    email: form.email.trim(),
    projectKey: form.projectKey.trim(),
    assignedJql: form.assignedJql.trim(),
    mineJql: form.mineJql.trim(),
    maxResults: saved?.maxResults ?? DEFAULT_MAX_RESULTS,
    etaFieldId: textOrNull(form.etaFieldId),
    devPriorityFieldId: textOrNull(form.devPriorityFieldId),
    statusFlow: {
      preWorkStatuses: lines(form.preWorkStatuses),
      reworkStatuses: lines(form.reworkStatuses),
      readyToTestPath: lines(form.readyToTestPath),
      developerStatuses: lines(form.developerStatuses),
    },
    suggestions: suggestionsFromForm(form),
  }
}

// All four queries empty = the feature is off (null).
function suggestionsFromForm(form: JiraForm): SuggestionsConfig | null {
  const epicJql = form.suggestionsEpicJql.trim()
  const candidatesJql = form.suggestionsCandidatesJql.trim()
  const mineJql = form.suggestionsMineJql.trim()
  if (epicJql === '' && candidatesJql === '' && mineJql === '') {
    return null
  }
  return {
    epicJql,
    epicTitlePrefix: form.suggestionsEpicTitlePrefix.trim(),
    candidatesJql,
    mineJql,
    selectedStatus: textOrNull(form.suggestionsSelectedStatus),
  }
}

export function hasRequiredFields(form: JiraForm): boolean {
  return form.baseUrl.trim() !== '' && form.email.trim() !== '' && form.projectKey.trim() !== ''
}
