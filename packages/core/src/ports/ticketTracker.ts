import type { Ticket } from '../ticket.js'
import type { EpicTicket } from '../ticketSuggestions.js'

export type TrackerValidation =
  | { readonly ok: true; readonly displayName: string }
  | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' }

export interface TicketTracker {
  validate(): Promise<TrackerValidation>
  getAssignedTickets(): Promise<Readonly<Record<string, Ticket>>> // throws on failure
  getTicket(key: string): Promise<Ticket | null> // null = missing or not visible; other failures throw
  filterMine(keys: readonly string[]): Promise<ReadonlySet<string>> // throws on failure
  ticketUrl(key: string): string
  transition(key: string, status: string): Promise<boolean> // false = no transition leads there; HTTP failure throws
  assignToMe(key: string): Promise<string | null> // null = assigned to me now (or already); else the holder's name
  searchEpicTickets(jql: string, maxResults: number): Promise<readonly EpicTicket[]>
}
