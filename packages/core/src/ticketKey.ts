function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// One key from "1234", "ABC-1234" (any case) or a pasted Jira link; the key comes back uppercase.
export function parseTicketKey(input: string, projectKey: string): string | null {
  const trimmed = input.trim()
  const upperProjectKey = projectKey.toUpperCase()
  if (/^\d+$/.test(trimmed)) {
    return `${upperProjectKey}-${trimmed}`
  }
  const keyInText = new RegExp(`\\b${escapeRegExp(projectKey)}-(\\d+)\\b`, 'i')
  const match = keyInText.exec(trimmed)
  const digits = match?.[1]
  return digits === undefined ? null : `${upperProjectKey}-${digits}`
}

const TICKET_KEY = /^[A-Z][A-Z0-9]+-\d+$/

export function isTicketKey(value: string): boolean {
  return TICKET_KEY.test(value)
}

// Without a project key a bare number is invalid; only a full key counts.
export function parseTicketKeys(
  raw: string | null,
  projectKey: string | null,
): { readonly tickets: readonly string[]; readonly invalid: readonly string[] } {
  const tickets: string[] = []
  const invalid: string[] = []
  if (raw === null) {
    return { tickets, invalid }
  }
  for (const token of raw.split(/[,;\s]+/).filter((part) => part !== '')) {
    const key = projectKey === null ? fullKeyOf(token) : parseTicketKey(token, projectKey)
    if (key === null) {
      invalid.push(token)
    } else if (!tickets.includes(key)) {
      tickets.push(key)
    }
  }
  return { tickets, invalid }
}

function fullKeyOf(token: string): string | null {
  const upper = token.toUpperCase()
  return isTicketKey(upper) ? upper : null
}
