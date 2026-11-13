import type { AzureDevOpsConfig } from '@workday/core'

export interface AdoForm {
  readonly organization: string
  readonly project: string
  readonly repoLabels: string // one "Repo=Label" per line, in display order
  readonly devPipelineFolder: string
}

export function formFromAdo(ado: AzureDevOpsConfig | null): AdoForm {
  return {
    organization: ado?.organization ?? '',
    project: ado?.project ?? '',
    repoLabels: Object.entries(ado?.repoLabels ?? {})
      .map(([repo, label]) => `${repo}=${label}`)
      .join('\n'),
    devPipelineFolder: ado?.devPipelineFolder ?? '',
  }
}

// A line without "=" labels the repo with its own name.
function parseRepoLabels(text: string): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const [repo = '', ...rest] = line.split('=')
    const name = repo.trim()
    if (name !== '') {
      labels[name] = rest.join('=').trim() || name
    }
  }
  return labels
}

// Both organization and project empty disconnects Azure DevOps.
export function adoFromForm(form: AdoForm): AzureDevOpsConfig | null {
  const organization = form.organization.trim()
  const project = form.project.trim()
  if (organization === '' && project === '') {
    return null
  }
  const folder = form.devPipelineFolder.trim()
  return {
    organization,
    project,
    repoLabels: parseRepoLabels(form.repoLabels),
    devPipelineFolder: folder === '' ? null : folder,
  }
}

export function hasAdoTarget(form: AdoForm): boolean {
  return form.organization.trim() !== '' && form.project.trim() !== ''
}
