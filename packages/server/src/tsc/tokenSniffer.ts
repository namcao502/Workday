import type { SheetError, SheetWrite, TscConfig } from '@workday/core'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import type { BrowserLock } from './browserLock.js'
import type { TokenSource } from './graphSheetLog.js'
import { hasAllScope, jwtScopes, pickBroadestToken } from './jwt.js'

const GRAPH_HOST = 'https://graph.microsoft.com/'
const SNIFF_WAIT_MILLISECONDS = 30_000
const SNIFF_POLL_MILLISECONDS = 500
const GOTO_TIMEOUT_MILLISECONDS = 60_000
const SESSION_GOTO_TIMEOUT_MILLISECONDS = 30_000
const SESSION_SETTLE_MILLISECONDS = 2_000
const SIGN_IN_POLL_MILLISECONDS = 2_000
const SIGN_IN_TIMEOUT_MILLISECONDS = 270_000
const BEARER = /^bearer\s+(.+)$/i
const LOGIN_URL = /login|microsoftonline/i

const BUSY: SheetError = { failure: 'browserBusy', detail: 'The TSC browser is already in use.' }

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

// A launch failure naming Chrome as missing becomes chromeMissing; anything else stays failed.
function explain(error: unknown): SheetError {
  const detail = error instanceof Error ? error.message : String(error)
  const lower = detail.toLowerCase()
  const missing =
    lower.includes('chrome') && (lower.includes('not found') || lower.includes('distribution'))
  return { failure: missing ? 'chromeMissing' : 'failed', detail }
}

// The only module that drives a browser: sniffs a Graph token, checks the saved session, signs in.
export class PlaywrightTokenSource implements TokenSource {
  constructor(
    private readonly config: TscConfig,
    private readonly profileDir: string,
    private readonly lock: BrowserLock,
  ) {}

  sniff(): Promise<{ readonly token: string } | SheetError> {
    return this.withBrowser(false, async (context) => {
      const seen = new Map<string, string>()
      context.on('request', (request) => {
        if (request.url().startsWith(GRAPH_HOST)) {
          void collectToken(request, seen)
        }
      })
      const page = await firstPage(context)
      for (const url of this.config.tokenPages) {
        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: GOTO_TIMEOUT_MILLISECONDS,
          })
        } catch {
          continue
        }
        const deadline = Date.now() + SNIFF_WAIT_MILLISECONDS
        while (Date.now() < deadline && ![...seen.values()].some(hasAllScope)) {
          await sleep(SNIFF_POLL_MILLISECONDS)
        }
        if ([...seen.values()].some(hasAllScope)) {
          break
        }
      }
      const token = pickBroadestToken(seen)
      return token === null
        ? ({
            failure: 'noToken',
            detail: 'No Graph token seen; the saved TSC session may be signed out.',
          } as const)
        : { token }
    })
  }

  checkSession(): Promise<{ readonly signedIn: boolean } | SheetError> {
    return this.withBrowser(false, async (context) => {
      const page = await firstPage(context)
      await page.goto(this.config.shareUrl, {
        waitUntil: 'domcontentloaded',
        timeout: SESSION_GOTO_TIMEOUT_MILLISECONDS,
      })
      await sleep(SESSION_SETTLE_MILLISECONDS)
      return { signedIn: this.isSignedInAt(page.url()) }
    })
  }

  async signIn(): Promise<SheetWrite> {
    const result = await this.withBrowser(true, async (context) => {
      const page = await firstPage(context)
      await page.goto(this.config.shareUrl, {
        waitUntil: 'domcontentloaded',
        timeout: GOTO_TIMEOUT_MILLISECONDS,
      })
      const deadline = Date.now() + SIGN_IN_TIMEOUT_MILLISECONDS
      while (Date.now() < deadline) {
        await sleep(SIGN_IN_POLL_MILLISECONDS)
        if (page.isClosed()) {
          return { failure: 'failed', detail: 'Browser closed before login completed.' } as const
        }
        if (this.isSignedInAt(page.url())) {
          return { ok: true } as const
        }
      }
      return { failure: 'failed', detail: 'Timed out waiting for login.' } as const
    })
    return 'ok' in result ? result : { ok: false, ...result }
  }

  private isSignedInAt(url: string): boolean {
    return isSignedInUrl(url, this.config.shareUrl)
  }

  // Takes the lock first (busy -> browserBusy) and always closes the browser and releases it.
  private async withBrowser<Result>(
    visible: boolean,
    use: (context: BrowserContext) => Promise<Result>,
  ): Promise<Result | SheetError> {
    const release = this.lock.tryAcquire()
    if (release === null) {
      return BUSY
    }
    let context: BrowserContext | null = null
    try {
      context = await chromium.launchPersistentContext(this.profileDir, {
        channel: 'chrome',
        headless: !visible,
        serviceWorkers: 'block',
        args: ['--disable-blink-features=AutomationControlled'],
        viewport: { width: 1280, height: 800 },
      })
      return await use(context)
    } catch (error: unknown) {
      return explain(error)
    } finally {
      await context?.close().catch(() => undefined)
      release()
    }
  }
}

async function firstPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? (await context.newPage())
}

async function collectToken(
  request: { allHeaders(): Promise<Record<string, string>> },
  seen: Map<string, string>,
): Promise<void> {
  try {
    const headers = await request.allHeaders()
    const token = BEARER.exec(headers.authorization ?? '')?.[1]
    if (token !== undefined && !seen.has(token)) {
      seen.set(token, jwtScopes(token))
    }
  } catch {
    // a request that ended before its headers could be read carries nothing we need
  }
}

// Signed in when the page stays on the share's host and its path is no login page; the query may say "login".
export function isSignedInUrl(url: string, shareUrl: string): boolean {
  try {
    const page = new URL(url)
    return page.host === new URL(shareUrl).host && !LOGIN_URL.test(page.pathname)
  } catch {
    return false
  }
}
