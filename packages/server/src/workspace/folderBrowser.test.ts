import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listFolders } from './folderBrowser.js'

describe('listFolders', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'folders-'))
    mkdirSync(join(root, 'beta'))
    mkdirSync(join(root, 'Alpha'))
    mkdirSync(join(root, '.hidden'))
    writeFileSync(join(root, 'file.txt'), 'x')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('lists only visible folders, sorted ignoring case, with the parent', () => {
    const listing = listFolders(root)
    expect(listing.path).toBe(root)
    expect(listing.parent).toBe(dirname(root))
    expect(listing.folders.map((folder) => folder.name)).toEqual(['Alpha', 'beta'])
    expect(listing.folders[0]?.path).toBe(join(root, 'Alpha'))
  })

  it('an unreadable folder lists as empty', () => {
    expect(listFolders(join(root, 'missing')).folders).toEqual([])
  })

  it('an empty path lists the roots with no parent', () => {
    const listing = listFolders('')
    expect(listing.path).toBe('')
    expect(listing.parent).toBeNull()
    expect(listing.folders.length).toBeGreaterThan(0)
  })
})
