import { existsSync } from 'node:fs'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import type { BrowserLock } from '../tsc/browserLock.js'
import {
  hasBothTokens,
  outcomeOf,
  recordRequest,
  type TeamsCapture,
  type TeamsSignInResult,
  type TeamsSniffer,
  type TeamsSniffResult,
} from './teamsSession.js'

const TEAMS_URL = 'https://teams.cloud.microsoft/'
const GOTO_TIMEOUT_MILLISECONDS = 60_000
const SNIFF_WAIT_MILLISECONDS = 45_000
const SNIFF_POLL_MILLISECONDS = 500
const SIGN_IN_TIMEOUT_MILLISECONDS = 270_000
const SIGN_IN_POLL_MILLISECONDS = 2_000

export type LaunchContext = (profileDir: string, visible: boolean) => Promise<BrowserContext>

function launchChrome(profileDir: string, visible: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: !visible,
    serviceWorkers: 'block',
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 },
  })
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Playwright on its own Teams profile (not the TSC one): headless sniff, visible sign-in. Never logs a token.
export class PlaywrightTeamsSniffer implements TeamsSniffer {
  constructor(
    private readonly profileDir: string,
    private readonly lock: BrowserLock,
    private readonly launch: LaunchContext = launchChrome,
    private readonly now: () => number = Date.now,
  ) {}

  async sniff(): Promise<TeamsSniffResult> {
    const release = this.lock.tryAcquire()
    if (release === null) {
      return { kind: 'busy' }
    }
    let context: BrowserContext | null = null
    try {
      if (!existsSync(this.profileDir)) {
        return { kind: 'signedOut' }
      }
      context = await this.launch(this.profileDir, false)
      const capture = watchRequests(context)
      const page = await firstPage(context)
      await page.goto(TEAMS_URL, {
        waitUntil: 'domcontentloaded',
        timeout: GOTO_TIMEOUT_MILLISECONDS,
      })
      const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => null)
      const deadline = this.now() + SNIFF_WAIT_MILLISECONDS
      while (this.now() < deadline && !hasBothTokens(capture)) {
        await sleep(SNIFF_POLL_MILLISECONDS)
      }
      return outcomeOf(capture, this.now(), userAgent, page.url())
    } catch (error: unknown) {
      return { kind: 'failed', detail: describeFailure(error) }
    } finally {
      await context?.close().catch(() => undefined)
      release()
    }
  }

  // The only visible browser flow: the user signs in to Teams web and the session stays in the profile.
  async signIn(): Promise<TeamsSignInResult> {
    const release = this.lock.tryAcquire()
    if (release === null) {
      return { kind: 'busy' }
    }
    let context: BrowserContext | null = null
    try {
      context = await this.launch(this.profileDir, true)
      const capture = watchRequests(context)
      const page = await firstPage(context)
      await page.goto(TEAMS_URL, {
        waitUntil: 'domcontentloaded',
        timeout: GOTO_TIMEOUT_MILLISECONDS,
      })
      const deadline = this.now() + SIGN_IN_TIMEOUT_MILLISECONDS
      while (this.now() < deadline) {
        if (page.isClosed()) {
          return { kind: 'failed', detail: 'Browser closed before sign-in completed.' }
        }
        // Both tokens: with only the chat token Teams web still shows its "sign in again" banner.
        if (hasBothTokens(capture)) {
          return { kind: 'ok' }
        }
        await sleep(SIGN_IN_POLL_MILLISECONDS)
      }
      return { kind: 'failed', detail: 'Timed out waiting for the Teams sign-in.' }
    } catch (error: unknown) {
      return { kind: 'failed', detail: describeFailure(error) }
    } finally {
      await context?.close().catch(() => undefined)
      release()
    }
  }
}

function watchRequests(context: BrowserContext): TeamsCapture {
  const capture: TeamsCapture = {}
  context.on('request', (request) => {
    request
      .allHeaders()
      .then((headers) => {
        recordRequest(capture, request.url(), headers)
      })
      .catch(() => undefined) // a request that ended before its headers could be read carries nothing we need
  })
  return capture
}

async function firstPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? (await context.newPage())
}
