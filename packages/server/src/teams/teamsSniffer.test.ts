import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser, fakeJwt, fastClock, type FakeBrowser } from '../testing/fakeBrowser.js'
import { BrowserLock } from '../tsc/browserLock.js'
import { PlaywrightTeamsSniffer } from './teamsSniffer.js'

const TEAMS_URL = 'https://teams.cloud.microsoft/'
const CHAT_URL = 'https://teams.test/api/chatsvc/apac/v1/users/ME/conversations?x=1'
const AGGREGATOR_URL = 'https://teams.test/api/csa/apac/api/v3/teams/users/me'
const EXPIRES = Date.UTC(2026, 11, 1) / 1000

const CHAT = {
  url: CHAT_URL,
  headers: {
    authorization: `Bearer ${fakeJwt({ oid: 'ABC-1', name: 'Test User', aud: 'ic3.teams.office.com', exp: EXPIRES })}`,
    'x-ms-client-version': '1415/26',
  },
}
const AGGREGATOR = {
  url: AGGREGATOR_URL,
  headers: { authorization: `Bearer ${fakeJwt({ exp: EXPIRES })}` },
}

let profileDir: string

beforeEach(() => {
  profileDir = mkdtempSync(join(tmpdir(), 'teams-profile-'))
})

afterEach(() => {
  rmSync(profileDir, { recursive: true, force: true })
})

function sniffer(
  browser: FakeBrowser,
  lock = new BrowserLock(),
  dir = profileDir,
  clock = fastClock(),
): PlaywrightTeamsSniffer {
  return new PlaywrightTeamsSniffer(dir, lock, () => Promise.resolve(browser.context), clock)
}

describe('PlaywrightTeamsSniffer.sniff', () => {
  it('builds a session from the chat and aggregator requests Teams web sends', async () => {
    const browser = fakeBrowser({ requestsAt: { [TEAMS_URL]: [CHAT, AGGREGATOR] } })
    const result = await sniffer(browser).sniff()
    expect(result.kind).toBe('session')
    expect(browser.visited).toEqual([TEAMS_URL])
    expect(browser.closed()).toBe(true)
  })

  it('is signed out without a profile, and never opens a browser for it', async () => {
    const browser = fakeBrowser()
    const result = await sniffer(browser, new BrowserLock(), join(profileDir, 'missing')).sniff()
    expect(result).toEqual({ kind: 'signedOut' })
    expect(browser.visited).toEqual([])
  })

  it('is signed out when Teams lands on the Microsoft login page', async () => {
    const browser = fakeBrowser({ landsAt: () => 'https://login.microsoftonline.com/common' })
    expect(await sniffer(browser).sniff()).toEqual({ kind: 'signedOut' })
  })

  it('is busy while the browser is held', async () => {
    const lock = new BrowserLock()
    lock.tryAcquire()
    expect(await sniffer(fakeBrowser(), lock).sniff()).toEqual({ kind: 'busy' })
  })

  it('reports a launch failure', async () => {
    const failing = new PlaywrightTeamsSniffer(profileDir, new BrowserLock(), () =>
      Promise.reject(new Error('no edge')),
    )
    expect(await failing.sniff()).toEqual({ kind: 'failed', detail: 'no edge' })
  })
})

describe('PlaywrightTeamsSniffer.signIn', () => {
  it('is done once both tokens arrive', async () => {
    const browser = fakeBrowser({ requestsAt: { [TEAMS_URL]: [CHAT, AGGREGATOR] } })
    expect(await sniffer(browser).signIn()).toEqual({ kind: 'ok' })
  })

  it('fails when the window closes, and when the time runs out', async () => {
    expect(await sniffer(fakeBrowser({ closedAfterGoto: true })).signIn()).toMatchObject({
      kind: 'failed',
    })
    // 200s a read against the 270s sign-in limit: one pass, one real 2s wait, then out of time.
    const chatOnly = fakeBrowser({ requestsAt: { [TEAMS_URL]: [CHAT] } })
    const slowSignIn = sniffer(chatOnly, new BrowserLock(), profileDir, fastClock(200_000))
    expect(await slowSignIn.signIn()).toEqual({
      kind: 'failed',
      detail: 'Timed out waiting for the Teams sign-in.',
    })
  })
})
