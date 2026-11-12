const MILLISECONDS_PER_MINUTE = 60_000

export class PollScheduler {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly poll: () => Promise<void>,
    private readonly logError: (message: string, error: unknown) => void = console.error,
  ) {}

  // Polls now, then every pollMinutes; a second start replaces the first schedule.
  start(pollMinutes: number): void {
    this.stop()
    this.runPoll()
    this.timer = setInterval(() => {
      this.runPoll()
    }, pollMinutes * MILLISECONDS_PER_MINUTE)
  }

  stop(): void {
    if (this.timer !== null) {
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
