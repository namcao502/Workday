const MILLISECONDS_PER_MINUTE = 60_000

export class PollScheduler {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly poll: () => Promise<void>,
    private readonly logError: (message: string, error: unknown) => void = console.error,
    private readonly firstPollMinutes: number | null = null,
  ) {}

  // Polls now (or after firstPollMinutes), then every pollMinutes; a second start replaces the first schedule.
  start(pollMinutes: number): void {
    this.stop()
    const every = pollMinutes * MILLISECONDS_PER_MINUTE
    const repeat = (): void => {
      this.timer = setInterval(() => {
        this.runPoll()
      }, every)
    }
    if (this.firstPollMinutes === null) {
      this.runPoll()
      repeat()
      return
    }
    this.timer = setTimeout(() => {
      this.runPoll()
      repeat()
    }, this.firstPollMinutes * MILLISECONDS_PER_MINUTE)
  }

  stop(): void {
    if (this.timer !== null) {
      // Timers share one handle space, so this also cancels a first-poll timeout.
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private runPoll(): void {
    this.poll().catch((error: unknown) => {
      this.logError('Scheduled poll failed', error)
    })
  }
}
