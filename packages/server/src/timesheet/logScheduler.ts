import { zonedClock } from '@workday/core'

const CHECK_INTERVAL_MILLISECONDS = 60_000
const MINUTES_PER_HOUR = 60

export interface LogTimer {
  start(logTime: string, timeZone: string): void
  setLogTime(logTime: string, timeZone: string): void
  stop(): void
}

function minutesOf(logTime: string): number {
  const [hours = 0, minutes = 0] = logTime.split(':').map(Number)
  return hours * MINUTES_PER_HOUR + minutes
}

// Checks every minute instead of arming one long timer, so a sleep or clock change still fires within a minute.
export class LogScheduler implements LogTimer {
  private timer: NodeJS.Timeout | null = null
  private logMinutes = 0
  private timeZone = 'UTC'
  private lastFiredDate: string | null = null
  private firing = false

  constructor(
    private readonly fire: () => Promise<void>,
    private readonly logError: (message: string, error: unknown) => void = console.error,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(logTime: string, timeZone: string): void {
    this.stop()
    this.setLogTime(logTime, timeZone)
    this.timer = setInterval(() => {
      this.tick()
    }, CHECK_INTERVAL_MILLISECONDS)
  }

  // A time already past today counts as fired (the catch-up handles what is queued); a run made today stays made.
  setLogTime(logTime: string, timeZone: string): void {
    this.logMinutes = minutesOf(logTime)
    this.timeZone = timeZone
    const clock = zonedClock(timeZone, this.now())
    const firedToday = this.lastFiredDate === clock.date
    this.lastFiredDate = firedToday || clock.minutes >= this.logMinutes ? clock.date : null
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    if (this.firing) {
      return
    }
    const clock = zonedClock(this.timeZone, this.now())
    if (clock.minutes < this.logMinutes || this.lastFiredDate === clock.date) {
      return
    }
    this.lastFiredDate = clock.date
    this.firing = true
    this.fire()
      .catch((error: unknown) => {
        this.logError('Scheduled log run failed', error)
      })
      .finally(() => {
        this.firing = false
      })
  }
}
