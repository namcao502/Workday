import { join } from 'node:path'
import type { ScanOutcome, ScanRun } from '@workday/core'
import { isRecord, readJson, writeJsonAtomic } from '../jsonFile.js'

const SCAN_STATE_FILE = 'scan-runs.json'
export const SCAN_LOG_FOLDER = 'scan-runs'
const OUTCOMES: ReadonlySet<string> = new Set([
  'running',
  'ok',
  'withProblems',
  'stopped',
  'failed',
])
// A run id is a stamp the runner made; this pattern also keeps a log path inside its folder.
const RUN_ID = /^[0-9A-Za-z-]+$/

export interface ScanState {
  readonly runs: readonly ScanRun[] // oldest first
  readonly unseenBad: boolean
}

const EMPTY_STATE: ScanState = { runs: [], unseenBad: false }

export function isRunId(value: string): boolean {
  return RUN_ID.test(value)
}

export function scanLogPath(dataDir: string, id: string): string {
  return join(dataDir, SCAN_LOG_FOLDER, `${id}.log`)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function parseRun(raw: unknown): ScanRun | null {
  if (!isRecord(raw)) {
    return null
  }
  const { id, startedAt, endedAt, outcome, exitCode, found, mined, refreshed } = raw
  const { problemLines, trigger } = raw
  if (
    typeof id !== 'string' ||
    !isRunId(id) ||
    typeof startedAt !== 'string' ||
    (endedAt !== null && typeof endedAt !== 'string') ||
    typeof outcome !== 'string' ||
    !OUTCOMES.has(outcome) ||
    (exitCode !== null && typeof exitCode !== 'number') ||
    !isCount(found) ||
    !isCount(mined) ||
    !isCount(refreshed) ||
    !Array.isArray(problemLines) ||
    (trigger !== 'schedule' && trigger !== 'user')
  ) {
    return null
  }
  return {
    id,
    startedAt,
    endedAt,
    outcome: outcome as ScanOutcome,
    exitCode,
    found,
    mined,
    refreshed,
    problemLines: problemLines.filter((line): line is string => typeof line === 'string'),
    trigger,
  }
}

function parseState(raw: unknown): ScanState | null {
  if (!isRecord(raw) || !Array.isArray(raw['runs'])) {
    return null
  }
  return {
    runs: raw['runs'].map(parseRun).filter((run): run is ScanRun => run !== null),
    unseenBad: raw['unseenBad'] === true,
  }
}

export function loadScanState(dataDir: string): ScanState {
  return readJson(join(dataDir, SCAN_STATE_FILE), parseState, EMPTY_STATE)
}

export async function saveScanState(dataDir: string, state: ScanState): Promise<void> {
  await writeJsonAtomic(join(dataDir, SCAN_STATE_FILE), state)
}
