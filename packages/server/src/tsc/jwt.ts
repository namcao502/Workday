function payloadOf(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8'))
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

// Null for an opaque token or one without a numeric exp.
export function jwtExpiry(token: string): Date | null {
  const exp = payloadOf(token)?.exp
  return typeof exp === 'number' ? new Date(exp * 1000) : null
}

// A string claim such as oid, name or aud; null when absent or not text.
export function jwtClaim(token: string, name: string): string | null {
  const value = payloadOf(token)?.[name]
  return typeof value === 'string' ? value : null
}

// Delegated scopes (scp) or app roles, space separated; empty when unreadable.
export function jwtScopes(token: string): string {
  const payload = payloadOf(token)
  if (payload === null) {
    return ''
  }
  if (typeof payload.scp === 'string') {
    return payload.scp
  }
  if (Array.isArray(payload.roles)) {
    return payload.roles.filter((role): role is string => typeof role === 'string').join(' ')
  }
  return ''
}

const ALL_SCOPE = /Files\.ReadWrite\.All|Sites\.ReadWrite\.All/i
const READ_WRITE_SCOPE = /Files\.ReadWrite|Sites\.ReadWrite/i

export function hasAllScope(scopes: string): boolean {
  return ALL_SCOPE.test(scopes)
}

// Broadest first: a .All scope, then any ReadWrite, then the first token seen. Null when none.
export function pickBroadestToken(seen: ReadonlyMap<string, string>): string | null {
  const entries = [...seen]
  const pick =
    entries.find(([, scopes]) => ALL_SCOPE.test(scopes)) ??
    entries.find(([, scopes]) => READ_WRITE_SCOPE.test(scopes)) ??
    entries[0]
  return pick === undefined ? null : pick[0]
}
