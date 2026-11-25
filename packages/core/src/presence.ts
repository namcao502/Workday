// Teams-style routing: while the user is at the PC a notice stays on the PC; the phone gets it once they leave.
export interface NoticeRouting {
  readonly phoneOnlyWhenAway: boolean
  readonly idleMinutes: number // no input for this long counts as away
  readonly fallbackMinutes: number // a notice still unread this long after it came goes to the phone; 0 = never
}

export const DEFAULT_NOTICE_ROUTING: NoticeRouting = {
  phoneOnlyWhenAway: true,
  idleMinutes: 5,
  fallbackMinutes: 5,
}

export const ROUTING_MINUTES_MAX = 60

// What the desktop app last reported about this PC.
export interface DesktopPresence {
  readonly idleSeconds: number
  readonly locked: boolean
  readonly at: string // ISO time of the report
}

// The app reports every 30 seconds; a report older than this means the app is gone.
export const PRESENCE_STALE_MS = 90_000

export function isAtPc(
  presence: DesktopPresence | null,
  routing: NoticeRouting,
  now: string,
): boolean {
  if (presence === null || presence.locked) {
    return false
  }
  const age = Date.parse(now) - Date.parse(presence.at)
  return age >= 0 && age < PRESENCE_STALE_MS && presence.idleSeconds < routing.idleMinutes * 60
}
