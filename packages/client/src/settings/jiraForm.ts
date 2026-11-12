import type { JiraConfig } from '@workday/core'

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
    },
  }
}

export function hasRequiredFields(form: JiraForm): boolean {
  return form.baseUrl.trim() !== '' && form.email.trim() !== '' && form.projectKey.trim() !== ''
}
