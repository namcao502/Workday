import type { BrowserContext } from 'playwright-core'

export interface FakeRequest {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
}

export interface FakeBrowserScript {
  // The requests a page.goto(url) sends, by the URL it was sent to.
  readonly requestsAt?: Readonly<Record<string, readonly FakeRequest[]>>
  // Where the page ends up after goto(url); defaults to url itself.
  readonly landsAt?: (url: string) => string
  // A goto to one of these URLs throws, as a timeout would.
  readonly failingUrls?: readonly string[]
  readonly closedAfterGoto?: boolean
}

export interface FakeBrowser {
  readonly context: BrowserContext
  readonly visited: string[]
  readonly closed: () => boolean
}

// A Playwright persistent context reduced to what the sniffers use: one page, request events, close.
export function fakeBrowser(script: FakeBrowserScript = {}): FakeBrowser {
  const visited: string[] = []
  const listeners: ((request: unknown) => void)[] = []
  let currentUrl = 'about:blank'
  let pageClosed = false
  let contextClosed = false
  const page = {
    goto: (url: string): Promise<null> => {
      visited.push(url)
      if (script.failingUrls?.includes(url) === true) {
        return Promise.reject(new Error(`Timeout loading ${url}`))
      }
      currentUrl = script.landsAt?.(url) ?? url
      for (const request of script.requestsAt?.[url] ?? []) {
        const event = {
          url: () => request.url,
          allHeaders: () => Promise.resolve(request.headers),
        }
        for (const listener of listeners) {
          listener(event)
        }
      }
      pageClosed = script.closedAfterGoto === true
      return Promise.resolve(null)
    },
    url: () => currentUrl,
    isClosed: () => pageClosed,
    evaluate: () => Promise.resolve('FakeAgent/1.0'),
  }
  const context = {
    on: (event: string, listener: (request: unknown) => void) => {
      if (event === 'request') {
        listeners.push(listener)
      }
    },
    pages: () => [page],
    newPage: () => Promise.resolve(page),
    close: () => {
      contextClosed = true
      return Promise.resolve()
    },
  }
  return {
    context: context as unknown as BrowserContext,
    visited,
    closed: () => contextClosed,
  }
}

// A clock that jumps on every read, so a wait loop checks once or twice instead of waiting for real.
export function fastClock(stepMilliseconds = 60_000): () => number {
  let now = Date.UTC(2026, 10, 1)
  return () => {
    now += stepMilliseconds
    return now
  }
}

export function fakeJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`
}
