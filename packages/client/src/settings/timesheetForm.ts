import type { TimesheetConfig, TscConfig } from '@workday/core'

export interface TimesheetForm {
  readonly logTime: string
  readonly mcpUrl: string
  readonly projectId: string
  readonly shareUrl: string
  readonly worksheetPattern: string
  readonly columns: string
  readonly tokenPages: string
  readonly headerRows: string
  readonly offMarker: string
  readonly offFillColor: string
  readonly driveId: string
  readonly itemId: string
}

// Neutral defaults, the same the server applies to an empty value.
const DEFAULT_HEADER_ROWS = 2
const DEFAULT_OFF_MARKER = 'OFF'
const DEFAULT_OFF_FILL_COLOR = '#FFFF00'

export function formFromTimesheet(timesheet: TimesheetConfig): TimesheetForm {
  const { hrm, tsc } = timesheet
  return {
    logTime: timesheet.logTime,
    mcpUrl: hrm?.mcpUrl ?? '',
    projectId: hrm?.projectId ?? '',
    shareUrl: tsc?.shareUrl ?? '',
    worksheetPattern: tsc?.worksheetPattern ?? '',
    columns: (tsc?.columns ?? []).join(', '),
    tokenPages: (tsc?.tokenPages ?? []).join('\n'),
    headerRows: String(tsc?.headerRows ?? DEFAULT_HEADER_ROWS),
    offMarker: tsc?.offMarker ?? DEFAULT_OFF_MARKER,
    offFillColor: tsc?.offFillColor ?? DEFAULT_OFF_FILL_COLOR,
    driveId: tsc?.driveId ?? '',
    itemId: tsc?.itemId ?? '',
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

function headerRowsFrom(text: string): number {
  const value = Number(text.trim())
  return text.trim() !== '' && Number.isInteger(value) && value >= 0 ? value : DEFAULT_HEADER_ROWS
}

function tscFromForm(form: TimesheetForm): TscConfig | null {
  const columns = form.columns
    .split(',')
    .map((column) => column.trim())
    .filter((column) => column !== '')
  const tokenPages = lines(form.tokenPages)
  const isEmpty =
    form.shareUrl.trim() === '' &&
    form.worksheetPattern.trim() === '' &&
    columns.length === 0 &&
    tokenPages.length === 0
  if (isEmpty) {
    return null
  }
  return {
    shareUrl: form.shareUrl.trim(),
    worksheetPattern: form.worksheetPattern.trim(),
    columns,
    headerRows: headerRowsFrom(form.headerRows),
    offMarker: form.offMarker.trim() === '' ? DEFAULT_OFF_MARKER : form.offMarker.trim(),
    offFillColor:
      form.offFillColor.trim() === '' ? DEFAULT_OFF_FILL_COLOR : form.offFillColor.trim(),
    tokenPages,
    driveId: textOrNull(form.driveId),
    itemId: textOrNull(form.itemId),
  }
}

// A group with every field empty is sent as null (not connected).
export function timesheetFromForm(form: TimesheetForm): TimesheetConfig {
  const hasHrm = form.mcpUrl.trim() !== '' || form.projectId.trim() !== ''
  return {
    logTime: form.logTime.trim(),
    hrm: hasHrm ? { mcpUrl: form.mcpUrl.trim(), projectId: form.projectId.trim() } : null,
    tsc: tscFromForm(form),
  }
}
