export type RemoteArea = 'board' | 'timesheet'
export const REMOTE_AREAS: readonly RemoteArea[] = ['board', 'timesheet']
export type AccessLevel = 'off' | 'view' | 'act'
export type DeviceRights = Readonly<Record<RemoteArea, AccessLevel>>

export const DEFAULT_DEVICE_RIGHTS: DeviceRights = { board: 'view', timesheet: 'act' }

const LEVELS: ReadonlySet<string> = new Set<AccessLevel>(['off', 'view', 'act'])

function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === 'string' && LEVELS.has(value)
}

// act includes view; off allows nothing.
export function allows(rights: DeviceRights, area: RemoteArea, needed: 'view' | 'act'): boolean {
  const level = rights[area]
  return level === 'act' || (level === 'view' && needed === 'view')
}

// Unknown areas are dropped; a missing or invalid level becomes off.
export function parseRights(raw: unknown): DeviceRights {
  const source: Readonly<Record<string, unknown>> =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const level = (area: RemoteArea): AccessLevel => {
    const value = source[area]
    return isAccessLevel(value) ? value : 'off'
  }
  return { board: level('board'), timesheet: level('timesheet') }
}
