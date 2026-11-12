// One browser on the profile at a time; a second caller is refused at once, never queued.
export class BrowserLock {
  private held = false

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
      }
    }
  }
}
