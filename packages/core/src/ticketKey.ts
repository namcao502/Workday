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
