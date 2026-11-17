const PREEMPT_POLL_MILLISECONDS = 100
const PREEMPT_WAIT_MILLISECONDS = 10_000

// One browser on the profile at a time; a second caller is refused at once, never queued.
// A background (headless) holder can offer to be stopped, so a visible sign-in does not wait behind it.
export class BrowserLock {
  private held = false
  private stop: (() => Promise<void>) | null = null

  // Returns a release function (idempotent), or null when busy.
  tryAcquire(): (() => void) | null {
    if (this.held) {
      return null
    }
    this.held = true
    let released = false
    return () => {
      if (!released) {
        released = true
        this.held = false
        this.stop = null
      }
    }
  }

  // The holder says how to close its browser early; only a background read does this.
  offerStop(stop: () => Promise<void>): void {
    this.stop = stop
  }

  // Stops a background holder and waits for it to let go; false when the lock is still held (a visible window).
  async preempt(): Promise<boolean> {
    const stop = this.stop
    if (this.held && stop !== null) {
      await stop().catch(() => undefined)
    }
    const deadline = Date.now() + PREEMPT_WAIT_MILLISECONDS
    while (this.held && stop !== null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, PREEMPT_POLL_MILLISECONDS))
    }
    return !this.held
  }
}
