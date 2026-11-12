import type { Ticket } from '../ticket.js'

// Test-only builder: a plain ticket with every optional field null unless overridden.
export function makeTicket(key: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    key,
    summary: 'Summary',
    dueDate: null,
    eta: null,
    devPriority: null,
    status: null,
    statusCategory: null,
    issueType: null,
    timeSpentSeconds: null,
    updated: null,
    parentKey: null,
    ...overrides,
  }
}
