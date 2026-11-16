import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import type { FolderListing } from '@workday/core'

const FIRST_LETTER = 65 // 'A'
const LETTER_COUNT = 26
const ROOTS = ''

function roots(): FolderListing {
  if (process.platform !== 'win32') {
    return listFolders(parse(homedir()).root)
  }
  const drives = Array.from(
    { length: LETTER_COUNT },
    (_, index) => `${String.fromCharCode(FIRST_LETTER + index)}:\\`,
  ).filter((drive) => existsSync(drive))
  return {
    path: ROOTS,
    parent: null,
    folders: drives.map((drive) => ({ name: drive, path: drive })),
  }
}

// The folders directly under `path` for the folder picker; hidden ones are left out.
// An unreadable folder lists as empty rather than failing, so the user can still step back out.
export function listFolders(path: string | null): FolderListing {
  if (path === ROOTS) {
    return roots()
  }
  const folder = path ?? homedir()
  const parent =
    dirname(folder) === folder ? (process.platform === 'win32' ? ROOTS : null) : dirname(folder)
  let names: string[]
  try {
    names = readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
  } catch {
    names = []
  }
  names.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
  return {
    path: folder,
    parent,
    folders: names.map((name) => ({ name, path: join(folder, name) })),
  }
}
