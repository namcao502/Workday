import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AzureDevOpsConfig, HrmConfig, JiraConfig } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createServices, type Services } from '../services.js'
import type { WorktreeOptions } from '../workspace/worktreeService.js'
import { FakeHoursLog, FakePullRequests, FakeSheetLog, FakeTracker } from './fakes.js'
import type { EditorCommand } from '../workspace/openInEditor.js'
import { FakePtyFactory } from './fakePty.js'

export const TEST_PORT = 4870
export const LOOPBACK_HEADERS = { host: `127.0.0.1:${String(TEST_PORT)}` }
// The fake Access verifier accepts only this JWT.
export const VALID_ACCESS_JWT = 'valid-access-jwt'
export const ACCESS_EMAIL = 'me@example.com'

export interface TrackerCall {
  readonly jira: JiraConfig
  readonly token: string
}

export interface HoursLogCall {
  readonly hrm: HrmConfig
  readonly apiKey: string
}

export interface PullRequestsCall {
  readonly config: AzureDevOpsConfig
  readonly pat: string
}

export interface PushCall {
  readonly endpoint: string
  readonly payload: string
}

export interface TestApp {
  readonly app: FastifyInstance
  readonly services: Services
  readonly dataDir: string
  readonly tracker: FakeTracker
  readonly trackerCalls: TrackerCall[]
  readonly sheet: FakeSheetLog
  readonly hours: FakeHoursLog
  readonly hoursLogCalls: HoursLogCall[]
  readonly pullRequests: FakePullRequests
  readonly pullRequestsCalls: PullRequestsCall[]
  readonly logTimes: string[]
  readonly schedulerStarts: number[]
  readonly schedulerStops: { count: number }
  readonly prSchedulerStarts: number[]
  readonly prSchedulerStops: { count: number }
  readonly pushes: PushCall[]
  readonly ptys: FakePtyFactory
  readonly homeDir: string
  readonly editorCommands: EditorCommand[] // what the fake VS Code spawner was asked to run
  readonly worktrees: WorktreeOptions[] // what Start asked the fake worktree service to create
}

export function newDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'workday-app-'))
}

// Every tracker the app builds is the same FakeTracker; trackerCalls records what it was built with.
export async function buildTestApp(
  options: { dataDir?: string; clientDist?: string } = {},
): Promise<TestApp> {
  const dataDir = options.dataDir ?? newDataDir()
  const tracker = new FakeTracker()
  const trackerCalls: TrackerCall[] = []
  const schedulerStarts: number[] = []
  const schedulerStops = { count: 0 }
  const prSchedulerStarts: number[] = []
  const prSchedulerStops = { count: 0 }
  const sheet = new FakeSheetLog()
  const hours = new FakeHoursLog()
  const hoursLogCalls: HoursLogCall[] = []
  const pullRequests = new FakePullRequests()
  const pullRequestsCalls: PullRequestsCall[] = []
  const logTimes: string[] = []
  const pushes: PushCall[] = []
  const ptys = new FakePtyFactory()
  const worktrees: WorktreeOptions[] = []
  const editorCommands: EditorCommand[] = []
  const homeDir = mkdtempSync(join(tmpdir(), 'workday-home-'))
  const services = createServices({
    dataDir,
    config: loadConfig(dataDir),
    createTracker: (jira, token) => {
      trackerCalls.push({ jira, token })
      return tracker
    },
    createHoursLog: (hrm, apiKey) => {
      hoursLogCalls.push({ hrm, apiKey })
      return hours
    },
    createPullRequests: (config, pat) => {
      pullRequestsCalls.push({ config, pat })
      return pullRequests
    },
    createSheetLog: () => sheet,
    logScheduler: {
      start: (logTime) => {
        logTimes.push(logTime)
      },
      setLogTime: (logTime) => {
        logTimes.push(logTime)
      },
      stop: () => undefined,
    },
    // Recorded only: the PR check runs when a test asks for it.
    prScheduler: {
      start: (minutes) => {
        prSchedulerStarts.push(minutes)
      },
      stop: () => {
        prSchedulerStops.count += 1
      },
    },
    scheduler: {
      start: (pollMinutes) => {
        schedulerStarts.push(pollMinutes)
      },
      stop: () => {
        schedulerStops.count += 1
      },
    },
    createAccessVerifier: () => ({
      verify: (token) =>
        Promise.resolve(token === VALID_ACCESS_JWT ? { email: ACCESS_EMAIL } : null),
    }),
    // Never reaches a real push service or cloudflared.
    sendPush: (subscription, payload) => {
      pushes.push({ endpoint: subscription.endpoint, payload })
      return Promise.resolve({ statusCode: 201 })
    },
    spawnTunnel: () => {
      throw new Error('A test must not start cloudflared')
    },
    spawnPty: ptys.spawn,
    spawnEditor: (command) => {
      editorCommands.push(command)
      return Promise.resolve()
    },
    homeDir,
    createWorktree: (worktree) => {
      worktrees.push(worktree)
      mkdirSync(worktree.worktreePath, { recursive: true })
      return Promise.resolve('created')
    },
    logError: () => undefined,
  })
  services.settings.start()
  const app = await createApp({
    port: TEST_PORT,
    dev: false,
    version: '9.9.9',
    clientDist: options.clientDist,
    ...services,
  })
  await app.ready()
  return {
    app,
    services,
    dataDir,
    tracker,
    trackerCalls,
    sheet,
    hours,
    hoursLogCalls,
    pullRequests,
    pullRequestsCalls,
    logTimes,
    schedulerStarts,
    schedulerStops,
    prSchedulerStarts,
    prSchedulerStops,
    pushes,
    ptys,
    homeDir,
    worktrees,
    editorCommands,
  }
}
