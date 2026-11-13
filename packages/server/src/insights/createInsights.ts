import { join } from 'node:path'
import type { BoardState, HrmTask } from '@workday/core'
import { findWorktrees } from '../workspace/ticketWorktrees.js'
import { AgentStatsReader } from './agentStatsReader.js'
import { AgentStatsStore } from './agentStatsStore.js'
import { readCommits } from './commitReader.js'
import { ReportReader, type AppConfig } from './reportReader.js'

export interface InsightsOptions {
  readonly dataDir: string
  readonly homeDir: string // ~/.claude/projects lives under it
  readonly config: () => AppConfig
  readonly board: () => BoardState
  readonly hrmTasks: (from: string, to: string) => Promise<readonly HrmTask[] | null>
  readonly logError: (message: string, error: unknown) => void
}

export function createInsights(options: InsightsOptions): ReportReader {
  const { config } = options
  const agent = new AgentStatsReader({
    projectsRoot: join(options.homeDir, '.claude', 'projects'),
    store: new AgentStatsStore(options.dataDir),
    worktreePaths: async (ticketKey) => {
      const { devRepoPath, siblingRepoGlob } = config().workspace
      if (devRepoPath === null) {
        return []
      }
      const found = await findWorktrees(devRepoPath, siblingRepoGlob, ticketKey)
      return found.map((worktree) => worktree.path)
    },
    timeZone: () => config().timeZone,
  })
  return new ReportReader({
    board: options.board,
    config,
    hrmTasks: options.hrmTasks,
    agent,
    commits: async (range, current) => {
      const { devRepoPath, siblingRepoGlob } = current.workspace
      // Without a repo or a project key there is no branch to look for.
      if (devRepoPath === null || current.jira === null) {
        return {}
      }
      return readCommits({
        devRepoPath,
        siblingRepoGlob,
        branchPrefix: `${current.jira.projectKey}-`,
        from: range.from,
        to: range.to,
        timeZone: current.timeZone,
        onFailure: (message) => {
          options.logError(message, null)
        },
      })
    },
    now: () => new Date(),
    logError: options.logError,
  })
}
