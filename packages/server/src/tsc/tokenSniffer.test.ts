import type { TscConfig } from '@workday/core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { fakeBrowser, fakeJwt, fastClock, type FakeBrowser } from '../testing/fakeBrowser.js'
import { BrowserLock } from './browserLock.js'
import { isSignedInUrl, PlaywrightTokenSource } from './tokenSniffer.js'

const SHARE_URL =
  'https://example-my.sharepoint.com/:x:/r/personal/someone/_layouts/15/doc2.aspx?file=a.xlsx'

describe('isSignedInUrl', () => {
  it('is signed in on the share host even when the query mentions login', () => {
    const url =
      'https://example-my.sharepoint.com/:x:/r/personal/someone/_layouts/15/doc2.aspx?login_hint=me'
    expect(isSignedInUrl(url, SHARE_URL)).toBe(true)
  })

  it('is signed out on the Microsoft login host', () => {
    expect(
      isSignedInUrl('https://login.microsoftonline.com/common/oauth2/authorize', SHARE_URL),
    ).toBe(false)
  })

  it('is signed out on a login path of the share host', () => {
    expect(isSignedInUrl('https://example-my.sharepoint.com/_forms/login.aspx', SHARE_URL)).toBe(
      false,
    )
  })
})

// The launch log goes next to the profile, so the profile sits in a temp folder, not in the repo.
const DATA_DIR = mkdtempSync(join(tmpdir(), 'tsc-sniffer-'))
const PROFILE = join(DATA_DIR, 'profile')

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true })
})

const TOKEN_PAGE = 'https://example-my.sharepoint.com/personal/someone/_layouts/15/onedrive.aspx'
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive'
const CONFIG: TscConfig = {
  shareUrl: SHARE_URL,
  worksheetPattern: 'Daily Reports - {year}',
  columns: ['M', 'J'],
  headerRows: 2,
  offMarker: 'OFF',
  offFillColor: '#FFFF00',
  tokenPages: ['https://example.com/broken', TOKEN_PAGE],
  driveId: null,
  itemId: null,
}

function bearer(scp: string): { readonly url: string; readonly headers: Record<string, string> } {
  return { url: GRAPH, headers: { authorization: `Bearer ${fakeJwt({ scp })}` } }
}

function source(browser: FakeBrowser, lock = new BrowserLock()): PlaywrightTokenSource {
  return new PlaywrightTokenSource(
    CONFIG,
    PROFILE,
    lock,
    () => Promise.resolve(browser.context),
    fastClock(),
  )
}

describe('PlaywrightTokenSource', () => {
  it('sniffs the broadest Graph token, skipping a token page that fails to load', async () => {
    const browser = fakeBrowser({
      failingUrls: ['https://example.com/broken'],
      requestsAt: { [TOKEN_PAGE]: [bearer('User.Read'), bearer('Files.ReadWrite.All')] },
    })
    const result = await source(browser).sniff()
    expect(result).toEqual({ token: fakeJwt({ scp: 'Files.ReadWrite.All' }) })
    expect(browser.visited).toEqual(['https://example.com/broken', TOKEN_PAGE])
    expect(browser.closed()).toBe(true)
  })

  it('reports noToken when no page sends a Graph token', async () => {
    const result = await source(fakeBrowser()).sniff()
    expect(result).toMatchObject({ failure: 'noToken' })
  })

  it('is busy while another caller holds the browser, and frees the lock after a run', async () => {
    const lock = new BrowserLock()
    const release = lock.tryAcquire()
    expect(await source(fakeBrowser(), lock).sniff()).toMatchObject({ failure: 'browserBusy' })
    release?.()
    await source(fakeBrowser(), lock).sniff()
    expect(lock.tryAcquire()).not.toBeNull()
  })

  it('names a missing Edge as browserMissing and any other launch error as failed', async () => {
    const lock = new BrowserLock()
    const failing = (message: string): PlaywrightTokenSource =>
      new PlaywrightTokenSource(CONFIG, PROFILE, lock, () => Promise.reject(new Error(message)))
    expect(await failing("Chromium distribution 'msedge' is not found").sniff()).toMatchObject({
      failure: 'browserMissing',
    })
    expect(await failing('crashed').sniff()).toEqual({ failure: 'failed', detail: 'crashed' })
  })

  it('checks the saved session by where the share link lands', async () => {
    const signedIn = fakeBrowser()
    expect(await source(signedIn).checkSession()).toEqual({ signedIn: true })
    const signedOut = fakeBrowser({
      landsAt: () => 'https://login.microsoftonline.com/common/oauth2/authorize',
    })
    expect(await source(signedOut).checkSession()).toEqual({ signedIn: false })
  })

  it('a sign-in keeps the Graph token the token pages send', async () => {
    const browser = fakeBrowser({
      requestsAt: { [TOKEN_PAGE]: [bearer('Files.ReadWrite.All')] },
    })
    expect(await source(browser).signIn()).toEqual({
      ok: true,
      token: fakeJwt({ scp: 'Files.ReadWrite.All' }),
    })
  })

  it('a sign-in fails when the window is closed first', async () => {
    const browser = fakeBrowser({ closedAfterGoto: true })
    expect(await source(browser).signIn()).toMatchObject({ ok: false, failure: 'failed' })
  })
})
