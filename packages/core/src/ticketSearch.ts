import type { Ticket } from './ticket.js'

// Every whitespace-separated word must appear in the key or summary, in any order.
export function matchesTicket(ticket: Ticket, query: string): boolean {
  const words = query.split(/\s+/).filter((word) => word.length !== 0)
  const searchableText = `${ticket.key} ${ticket.summary}`.toLowerCase()
  return words.every((word) => searchableText.includes(word.toLowerCase()))
}
