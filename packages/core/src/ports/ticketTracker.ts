import type { Ticket } from '../ticket.js'

export type TrackerValidation =
  | { readonly ok: true; readonly displayName: string }
  | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' }

export interface TicketTracker {
  validate(): Promise<TrackerValidation>
  getAssignedTickets(): Promise<Readonly<Record<string, Ticket>>> // throws on failure
  getTicket(key: string): Promise<Ticket | null> // null = missing or not visible; other failures throw
  ticketUrl(key: string): string
}
