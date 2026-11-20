// In the installed Edge app window every URL change (pushState, even F5) brought another Edge window to the
// front, so there the page lives in memory (and sessionStorage, for F5). A browser tab keeps the URL hash.
const STORAGE_KEY = 'workday.hash'

let memoryHash: string | null = null
let listening = false

// The installed app's own window, not a browser tab.
export function inAppWindow(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  )
}

function isReload(): boolean {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  return entry?.type === 'reload'
}

// A real fragment navigation (a notice click navigating this window) still reaches the app.
function adoptRealHash(event: HashChangeEvent): void {
  if (event.isTrusted && memoryHash !== null) {
    memoryHash = window.location.hash
    window.sessionStorage.setItem(STORAGE_KEY, memoryHash)
  }
}

// Called once before the first render: decides where the page lives for this window.
export function startAppHash(): void {
  if (!inAppWindow()) {
    memoryHash = null
    return
  }
  const stored = window.sessionStorage.getItem(STORAGE_KEY)
  memoryHash = isReload() && stored !== null ? stored : window.location.hash
  if (!listening) {
    window.addEventListener('hashchange', adoptRealHash)
    listening = true
  }
}

export function currentHash(): string {
  return memoryHash ?? window.location.hash
}

// Moves to another page and raises hashchange, which every page reader listens to.
export function setHash(hash: string): void {
  if (currentHash() === hash) {
    return
  }
  const oldURL = window.location.href
  if (memoryHash === null) {
    window.history.pushState(window.history.state, '', hash)
  } else {
    memoryHash = hash
    window.sessionStorage.setItem(STORAGE_KEY, hash)
  }
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }))
}

// Rewrites the current hash without an event, e.g. to drop a one-shot query once it is handled.
export function replaceHash(hash: string): void {
  if (memoryHash === null) {
    window.history.replaceState(null, '', hash)
  } else {
    memoryHash = hash
    window.sessionStorage.setItem(STORAGE_KEY, hash)
  }
}
