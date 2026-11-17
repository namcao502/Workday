import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseShortstat, readGitStatusCached } from './gitStatus.js'

it('sums insertions and deletions from a shortstat line', () => {
  expect(parseShortstat(' 3 files changed, 947 insertions(+), 117 deletions(-)\n')).toEqual({
    added: 947,
    removed: 117,
  })
  expect(parseShortstat(' 1 file changed, 1 insertion(+)\n')).toEqual({ added: 1, removed: 0 })
  expect(parseShortstat('')).toEqual({ added: 0, removed: 0 })
})

it('the cached status is read once inside the window and again after it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'workday-status-'))
  let clock = 1_000_000
  const first = readGitStatusCached(dir, () => clock)
  expect(readGitStatusCached(dir, () => clock)).toBe(first)
  clock += 10_000
  expect(readGitStatusCached(dir, () => clock)).not.toBe(first)
  expect(await first).toEqual({ branch: null, added: 0, removed: 0 })
})
