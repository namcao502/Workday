function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The id of a posted message is its arrival time, a number or text; null when the answer has none.
export function parseArrivalTime(json: unknown): string | null {
  if (!isRecord(json)) {
    return null
  }
  const arrival = json['OriginalArrivalTime']
  if (typeof arrival === 'number' && Number.isFinite(arrival)) {
    return String(arrival)
  }
  return typeof arrival === 'string' && arrival !== '' ? arrival : null
}

// Next-page links name the user's id where the request said ME, so only origin and path up to "users/" must match.
export function isChatListLink(link: string, chatBaseUrl: string): boolean {
  try {
    const linkUrl = new URL(link)
    const baseUrl = new URL(chatBaseUrl)
    const usersIndex = baseUrl.pathname.indexOf('/users/')
    const usersPath =
      usersIndex === -1
        ? baseUrl.pathname
        : baseUrl.pathname.slice(0, usersIndex + '/users/'.length)
    return (
      linkUrl.protocol === 'https:' &&
      linkUrl.host.toLowerCase() === baseUrl.host.toLowerCase() &&
      linkUrl.pathname.startsWith(usersPath)
    )
  } catch {
    return false
  }
}
