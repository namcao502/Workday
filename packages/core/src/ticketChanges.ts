// Pure rules of the "ticket updated in Jira" notice: what changed since the user last viewed a ticket, and who changed it.

export interface TicketContent {
  readonly summary: string
  readonly description: string
  readonly attachments: string // file names joined by \n
  readonly dueDate: string | null
  readonly eta: string | null
  readonly devPriority: number | null
}

export type TicketField =
  'summary' | 'description' | 'attachments' | 'dueDate' | 'eta' | 'devPriority'

export interface TicketUpdate {
  readonly viewed: TicketContent
  readonly current: TicketContent
  readonly updated: string
  readonly changedBy: string | null
  readonly changedAt: string | null // ISO
}

export interface ChangeHistory {
  readonly created: string
  readonly authorAccountId: string | null
  readonly authorName: string | null
  readonly fieldIds: readonly string[]
}

// The configured Jira ids of the two custom fields; null when the field is not configured.
export interface TicketFieldIds {
  readonly eta: string | null
  readonly devPriority: string | null
}

const ALL_FIELDS: readonly TicketField[] = [
  'summary',
  'description',
  'attachments',
  'dueDate',
  'eta',
  'devPriority',
]

const OFFSET_WITHOUT_COLON = /([+-]\d{2})(\d{2})$/

// Jira writes "2026-10-19T10:15:30.123+0700", an offset without the colon; null when unreadable.
export function parseJiraTime(value: string | null): number | null {
  if (value === null || value === '') {
    return null
  }
  const milliseconds = Date.parse(value.replace(OFFSET_WITHOUT_COLON, '$1:$2'))
  return Number.isNaN(milliseconds) ? null : milliseconds
}

function sameValue(before: TicketContent, after: TicketContent, field: TicketField): boolean {
  switch (field) {
    case 'summary':
      return before.summary === after.summary
    case 'description':
      return before.description === after.description
    case 'attachments':
      return before.attachments === after.attachments
    case 'dueDate':
      return (before.dueDate ?? '') === (after.dueDate ?? '')
    case 'eta':
      return (before.eta ?? '') === (after.eta ?? '')
    case 'devPriority':
      return before.devPriority === after.devPriority
  }
}

// viewed with one field taken from current.
function withField(
  viewed: TicketContent,
  current: TicketContent,
  field: TicketField,
): TicketContent {
  switch (field) {
    case 'summary':
      return { ...viewed, summary: current.summary }
    case 'description':
      return { ...viewed, description: current.description }
    case 'attachments':
      return { ...viewed, attachments: current.attachments }
    case 'dueDate':
      return { ...viewed, dueDate: current.dueDate }
    case 'eta':
      return { ...viewed, eta: current.eta }
    case 'devPriority':
      return { ...viewed, devPriority: current.devPriority }
  }
}

export function changedFields(before: TicketContent, after: TicketContent): readonly TicketField[] {
  return ALL_FIELDS.filter((field) => !sameValue(before, after, field))
}

// The fields still waiting for the user to look at them.
export function pendingFields(update: TicketUpdate): readonly TicketField[] {
  return changedFields(update.viewed, update.current)
}

export function fieldOfId(fieldId: string, fieldIds: TicketFieldIds): TicketField | null {
  if (fieldId === 'summary') {
    return 'summary'
  }
  if (fieldId === 'description') {
    return 'description'
  }
  if (fieldId === 'attachment') {
    return 'attachments'
  }
  if (fieldId === 'duedate') {
    return 'dueDate'
  }
  if (fieldIds.eta !== null && fieldId === fieldIds.eta) {
    return 'eta'
  }
  if (fieldIds.devPriority !== null && fieldId === fieldIds.devPriority) {
    return 'devPriority'
  }
  return null
}

function touches(history: ChangeHistory, field: TicketField, fieldIds: TicketFieldIds): boolean {
  return history.fieldIds.some((fieldId) => fieldOfId(fieldId, fieldIds) === field)
}

function instantOf(history: ChangeHistory): number {
  return Date.parse(history.created)
}

// The histories newer than the last read; none when the changelog or the stored time is unreadable.
function historiesSince(
  histories: readonly ChangeHistory[] | null,
  storedUpdated: string,
): readonly ChangeHistory[] {
  const lastReadAt = histories === null ? null : parseJiraTime(storedUpdated)
  if (histories === null || lastReadAt === null) {
    return []
  }
  return histories.filter((history) => instantOf(history) > lastReadAt)
}

export function markViewed(update: TicketUpdate, shown: TicketContent): TicketUpdate {
  const viewed: TicketUpdate = { ...update, viewed: shown }
  return pendingFields(viewed).length === 0
    ? { ...viewed, changedBy: null, changedAt: null }
    : viewed
}

export function keepOnly(
  updates: Readonly<Record<string, TicketUpdate>>,
  boardKeys: ReadonlySet<string>,
): Record<string, TicketUpdate> {
  return Object.fromEntries(Object.entries(updates).filter(([key]) => boardKeys.has(key)))
}

export interface ReadResult {
  readonly update: TicketUpdate
  readonly isNewChange: boolean
}

// A field changed only by me is swallowed unless it already waited; null histories or myAccountId count as others.
export function applyRead(
  stored: TicketUpdate | null,
  current: TicketContent,
  updated: string,
  histories: readonly ChangeHistory[] | null,
  myAccountId: string | null,
  fieldIds: TicketFieldIds,
): ReadResult {
  if (stored === null) {
    const baseline = { viewed: current, current, updated, changedBy: null, changedAt: null }
    return { update: baseline, isNewChange: false }
  }
  const window = historiesSince(histories, stored.updated)
  const pendingBefore = pendingFields(stored)
  let viewed = stored.viewed
  const changedByOthers: TicketField[] = []
  for (const field of changedFields(stored.current, current)) {
    const fieldHistories = window.filter((history) => touches(history, field, fieldIds))
    const isOnlyMine =
      histories !== null &&
      myAccountId !== null &&
      fieldHistories.length !== 0 &&
      fieldHistories.every((history) => history.authorAccountId === myAccountId)
    if (!isOnlyMine) {
      changedByOthers.push(field)
    } else if (!pendingBefore.includes(field)) {
      viewed = withField(viewed, current, field)
    }
  }

  const pending = changedFields(viewed, current)
  if (pending.length === 0) {
    return {
      update: { viewed, current, updated, changedBy: null, changedAt: null },
      isNewChange: false,
    }
  }
  const otherHistories = window.filter(
    (history) =>
      (history.authorAccountId !== myAccountId || myAccountId === null) &&
      pending.some((field) => touches(history, field, fieldIds)),
  )
  const wasPending = pendingBefore.length !== 0
  const oldNames = wasPending && stored.changedBy !== null ? stored.changedBy.split(', ') : []
  const newNames = otherHistories.flatMap((history) =>
    history.authorName === null ? [] : [history.authorName],
  )
  const editorNames = [...new Set([...oldNames, ...newNames])]
  const newest = otherHistories.reduce<ChangeHistory | null>(
    (latest, history) =>
      latest === null || instantOf(history) > instantOf(latest) ? history : latest,
    null,
  )
  const changedAt = newest !== null ? newest.created : wasPending ? stored.changedAt : null
  return {
    update: {
      viewed,
      current,
      updated,
      changedBy: editorNames.length === 0 ? null : editorNames.join(', '),
      changedAt,
    },
    isNewChange: changedByOthers.some((field) => pending.includes(field)),
  }
}
