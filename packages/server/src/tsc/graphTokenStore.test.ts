import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fileGraphTokenStore } from './graphTokenStore.js'

it('a saved token comes back from a new store, is encrypted on disk, and clear removes it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workday-token-'))
  const stored = { token: 'secret-token-value', expiresAtMilliseconds: 1234 }
  fileGraphTokenStore(dir).save(stored)

  expect(fileGraphTokenStore(dir).load()).toEqual(stored)
  expect(readFileSync(join(dir, 'graph-token.json'), 'utf8')).not.toContain('secret-token-value')

  fileGraphTokenStore(dir).clear()
  expect(fileGraphTokenStore(dir).load()).toBeNull()
})

it('a missing or unreadable file loads as no token', () => {
  expect(fileGraphTokenStore(mkdtempSync(join(tmpdir(), 'workday-token-'))).load()).toBeNull()
})
