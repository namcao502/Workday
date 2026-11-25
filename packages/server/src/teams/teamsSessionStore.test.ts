import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fileTeamsSessionStore } from './teamsSessionStore.js'
import type { TeamsSession } from './teamsSession.js'

function session(): TeamsSession {
  return {
    chatToken: 'chat-secret-value',
    chatUrl: 'https://teams.test/api/chatsvc/apac/v1/users/ME/',
    aggregatorToken: 'aggregator-secret-value',
    aggregatorUrl: 'https://teams.test/api/csa/apac/',
    clientVersion: '1415/26',
    userAgent: 'Mozilla/5.0 Chrome/130',
    myId: '8:orgid:abc',
    myName: 'Test User',
    expiresAt: 1234,
    sharePointToken: 'sharepoint-secret-value',
    oneDriveHost: 'tenant-my.sharepoint.com',
  }
}

it('a saved session comes back from a new store, is encrypted on disk, and clear removes it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workday-teams-'))
  const stored = session()
  fileTeamsSessionStore(dir).save(stored)

  expect(fileTeamsSessionStore(dir).load()).toEqual(stored)
  const onDisk = readFileSync(join(dir, 'teams-session.json'), 'utf8')
  expect(onDisk).not.toContain('chat-secret-value')
  expect(onDisk).not.toContain('sharepoint-secret-value')

  fileTeamsSessionStore(dir).clear()
  expect(fileTeamsSessionStore(dir).load()).toBeNull()
})

it('a missing or unreadable file loads as no session', () => {
  expect(fileTeamsSessionStore(mkdtempSync(join(tmpdir(), 'workday-teams-'))).load()).toBeNull()
})
