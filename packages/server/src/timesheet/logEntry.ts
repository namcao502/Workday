import {
  entryMinutes,
  type AppError,
  type EntryOutcome,
  type HoursLog,
  type QueueEntry,
  type SheetError,
  type SheetFailure,
  type SheetLog,
  type SheetWrite,
  type StepOutcome,
} from '@workday/core'

export type LogTarget = 'both' | 'tsc' | 'hrm'

type SheetErrorCode =
  'tscNoToken' | 'tscDateMismatch' | 'chromeMissing' | 'browserBusy' | 'tscFailed'

const SHEET_ERROR_CODES: Readonly<Record<SheetFailure, SheetErrorCode>> = {
  noToken: 'tscNoToken',
  dateMismatch: 'tscDateMismatch',
  chromeMissing: 'chromeMissing',
  browserBusy: 'browserBusy',
  failed: 'tscFailed',
}

const SKIPPED: StepOutcome = { status: 'skipped' }
const NOT_CONFIGURED: StepOutcome = {
  status: 'failed',
  error: { code: 'timesheetNotConfigured' },
  detail: null,
}

export function sheetAppError(error: SheetError): AppError {
  return { code: SHEET_ERROR_CODES[error.failure] }
}

export function sheetStep(write: SheetWrite): StepOutcome {
  if (write.ok) {
    return { status: 'ok' }
  }
  return { status: 'failed', error: sheetAppError(write), detail: write.detail }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function tscStep(sheet: SheetLog | null, entry: QueueEntry): Promise<StepOutcome> {
  if (sheet === null) {
    return NOT_CONFIGURED
  }
  try {
    return sheetStep(await sheet.writeTickets(entry.date, entry.tickets.join(', ')))
  } catch (error: unknown) {
    return { status: 'failed', error: { code: 'tscFailed' }, detail: messageOf(error) }
  }
}

async function hrmStep(hours: HoursLog | null, entry: QueueEntry): Promise<StepOutcome> {
  if (hours === null) {
    return NOT_CONFIGURED
  }
  try {
    const write = await hours.logTickets(entry.date, entry.tickets, entryMinutes(entry))
    return write.ok
      ? { status: 'ok' }
      : { status: 'failed', error: { code: 'hrmRejected' }, detail: write.detail }
  } catch (error: unknown) {
    return { status: 'failed', error: { code: 'hrmRejected' }, detail: messageOf(error) }
  }
}

// TSC and HRM in parallel: HRM uses no browser, so it cannot contend with a TSC sniff.
export async function logEntry(
  sheet: SheetLog | null,
  hours: HoursLog | null,
  entry: QueueEntry,
  target: LogTarget,
): Promise<EntryOutcome> {
  const [tsc, hrm] = await Promise.all([
    target === 'hrm' ? SKIPPED : tscStep(sheet, entry),
    target === 'tsc' ? SKIPPED : hrmStep(hours, entry),
  ])
  return { date: entry.date, tsc, hrm }
}

export function isFullySuccessful(outcome: EntryOutcome): boolean {
  return outcome.tsc.status === 'ok' && outcome.hrm.status === 'ok'
}
