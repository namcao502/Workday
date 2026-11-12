import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HrmConfig, JiraConfig } from '@workday/core'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../app.js'
import { loadConfig } from '../config.js'
import { createServices, type Services } from '../services.js'
import { FakeHoursLog, FakeSheetLog, FakeTracker } from './fakes.js'

export const TEST_PORT = 4870
export const LOOPBACK_HEADERS = { host: `127.0.0.1:${String(TEST_PORT)}` }

export interface TrackerCall {
  readonly jira: JiraConfig
  readonly token: string
}

export interface HoursLogCall {
  readonly hrm: HrmConfig
  readonly apiKey: string
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
  readonly logTimes: string[]
  readonly schedulerStarts: number[]
  readonly schedulerStops: { count: number }
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
  const sheet = new FakeSheetLog()
  const hours = new FakeHoursLog()
  const hoursLogCalls: HoursLogCall[] = []
  const logTimes: string[] = []
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
    scheduler: {
      start: (pollMinutes) => {
        schedulerStarts.push(pollMinutes)
      },
      stop: () => {
        schedulerStops.count += 1
      },
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
    logTimes,
    schedulerStarts,
    schedulerStops,
  }
}
