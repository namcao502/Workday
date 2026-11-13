import type { WorkspaceConfig } from '@workday/core'

export interface WorkspaceForm {
  readonly devRepoPath: string
  readonly siblingRepoGlob: string
  readonly startPrompt: string
  readonly claudeExecutable: string
  readonly localOnlyPaths: string // one path per line
  readonly chatView: boolean
}

export function formFromWorkspace(workspace: WorkspaceConfig): WorkspaceForm {
  return {
    devRepoPath: workspace.devRepoPath ?? '',
    siblingRepoGlob: workspace.siblingRepoGlob ?? '',
    startPrompt: workspace.startPrompt ?? '',
    claudeExecutable: workspace.claudeExecutable ?? '',
    localOnlyPaths: workspace.localOnlyPaths.join('\n'),
    chatView: workspace.chatView,
  }
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

export function workspaceFromForm(form: WorkspaceForm): WorkspaceConfig {
  return {
    devRepoPath: textOrNull(form.devRepoPath),
    siblingRepoGlob: textOrNull(form.siblingRepoGlob),
    startPrompt: textOrNull(form.startPrompt),
    claudeExecutable: textOrNull(form.claudeExecutable),
    localOnlyPaths: form.localOnlyPaths
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
    chatView: form.chatView,
  }
}
