import type { TicketContent, TicketField } from '@workday/core'
import { diffWords } from 'diff'
import { t } from '../i18n.js'

export function fieldLabel(field: TicketField): string {
  switch (field) {
    case 'summary':
      return t('Title', 'Tiêu đề')
    case 'description':
      return t('Description', 'Mô tả')
    case 'attachments':
      return t('Attachments', 'File đính kèm')
    case 'dueDate':
      return 'Due'
    case 'eta':
      return 'ETA'
    case 'devPriority':
      return 'P'
  }
}

// Long fields (attachments, description) get a block of their own, the short ones sit in a row.
export function isLongField(field: TicketField): boolean {
  return field === 'description' || field === 'attachments'
}

const EMPTY = '-'

export function fieldValue(content: TicketContent, field: TicketField): string {
  switch (field) {
    case 'summary':
      return content.summary === '' ? EMPTY : content.summary
    case 'description':
      return content.description === '' ? EMPTY : content.description
    case 'attachments':
      return content.attachments === '' ? EMPTY : content.attachments
    case 'dueDate':
      return content.dueDate ?? EMPTY
    case 'eta':
      return content.eta ?? EMPTY
    case 'devPriority':
      return content.devPriority === null ? EMPTY : String(content.devPriority)
  }
}

// Short fields first, then attachments and description (the WPF dialog order).
export function orderedFields(fields: readonly TicketField[]): readonly TicketField[] {
  return [
    ...fields.filter((field) => !isLongField(field)),
    ...fields.filter((field) => field === 'attachments'),
    ...fields.filter((field) => field === 'description'),
  ]
}

export interface DiffPart {
  readonly text: string
  readonly change: 'same' | 'added' | 'removed'
}

// Word by word, like the C# dialog's side-by-side diff: the before side keeps 'same' and 'removed', the after side
// 'same' and 'added'.
export function diffParts(before: string, after: string): readonly DiffPart[] {
  return diffWords(before, after).map((part) => ({
    text: part.value,
    change: part.added ? 'added' : part.removed ? 'removed' : 'same',
  }))
}
