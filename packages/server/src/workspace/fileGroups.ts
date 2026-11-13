import { basename } from 'node:path'
import type { WorkspaceConfig, WorkspaceTab } from '@workday/core'
import { docsPath, findWorktrees } from './ticketWorktrees.js'

export interface FileGroup {
  readonly id: string // "docs", then "wt0", "wt1", ... in order
  readonly label: string
  readonly root: string
  readonly kind: 'docs' | 'worktree'
}

// A ticket tab: its docs folder, then the BE worktree and the FE ones. A terminal tab: its folder.
export async function buildFileGroups(
  tab: WorkspaceTab,
  config: WorkspaceConfig,
): Promise<readonly FileGroup[]> {
  const devRepo = config.devRepoPath
  if (tab.kind === 'terminal') {
    const folder = tab.folder ?? devRepo
    return folder === null
      ? []
      : [{ id: 'wt0', label: basename(folder.replace(/[\\/]+$/, '')), root: folder, kind: 'worktree' }]
  }
  if (devRepo === null) {
    return []
  }
  const docs = docsPath(devRepo, tab.id)
  const groups: FileGroup[] =
    docs === null ? [] : [{ id: 'docs', label: `Docs - ${tab.id}`, root: docs, kind: 'docs' }]
  const devName = basename(devRepo.replace(/[\\/]+$/, ''))
  const worktrees = await findWorktrees(devRepo, config.siblingRepoGlob, tab.id)
  worktrees.forEach((worktree, index) => {
    const side = worktree.repository === devName ? 'BE' : 'FE'
    groups.push({
      id: `wt${String(index)}`,
      label: `${side} - ${worktree.repository}`,
      root: worktree.path,
      kind: 'worktree',
    })
  })
  return groups
}
