import { readdirSync, lstatSync, type Dirent } from 'node:fs'
import { basename, extname, join } from 'node:path'

const SLIM_FOLDERS: ReadonlySet<string> = new Set(['attachments', '.pr-scratch', 'sandbox'])
const SLIM_FILES: ReadonlySet<string> = new Set([
  'plan-review.md',
  'impl-review.md',
  'test-plan.md',
  '.issue.json',
  'teams-analysis.json',
])
const KEPT_DATA_FILES: ReadonlySet<string> = new Set([
  'migrate.sql',
  'translation.sql',
  'schema_migrate.sql',
  'revert.sql',
])
const DATA_EXTENSIONS: ReadonlySet<string> = new Set(['.sql', '.csv'])
// The bugs tree is handled per bug folder; local-test keeps its scripts (the user's call).
const UNTOUCHED_FOLDERS: ReadonlySet<string> = new Set(['bugs', 'local-test'])
// jira-fetch keeps the previous ticket.md here on every re-fetch.
const TICKET_BACKUP = /^ticket\..*\.bak\.md$/i

export function entriesOf(folder: string): Dirent[] {
  try {
    return readdirSync(folder, { withFileTypes: true })
  } catch {
    return []
  }
}

// Every file below a folder; a link (junction) is never followed. Root-level folders in skip are left out.
export function listFiles(folder: string, skip: ReadonlySet<string>): string[] {
  return entriesOf(folder).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      return skip.has(entry.name.toLowerCase()) ? [] : listFiles(path, new Set())
    }
    return entry.isFile() ? [path] : []
  })
}

function targetsOfRoot(root: string): string[] {
  const entries = entriesOf(root)
  const folders = entries
    .filter((entry) => entry.isDirectory() && SLIM_FOLDERS.has(entry.name.toLowerCase()))
    .map((entry) => entry.name.toLowerCase())
  const files = entries.filter(
    (entry) =>
      entry.isFile() &&
      (SLIM_FILES.has(entry.name.toLowerCase()) || TICKET_BACKUP.test(entry.name)),
  )
  const skip = new Set([...UNTOUCHED_FOLDERS, ...folders])
  const dataFiles = listFiles(root, skip).filter((path) => {
    return (
      DATA_EXTENSIONS.has(extname(path).toLowerCase()) &&
      !KEPT_DATA_FILES.has(basename(path).toLowerCase())
    )
  })
  const folderPaths = entries
    .filter((entry) => entry.isDirectory() && folders.includes(entry.name.toLowerCase()))
    .map((entry) => join(root, entry.name))
  return [...folderPaths, ...files.map((entry) => join(root, entry.name)), ...dataFiles]
}

// What Slim docs deletes under docs/<KEY>: the ticket folder and each docs/<KEY>/bugs/<BUG> as its own root.
export function slimTargets(ticketDocsPath: string): readonly string[] {
  const bugRoots = entriesOf(join(ticketDocsPath, 'bugs'))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(ticketDocsPath, 'bugs', entry.name))
  const roots = lstatIsDirectory(ticketDocsPath) ? [ticketDocsPath, ...bugRoots] : []
  return roots.flatMap(targetsOfRoot)
}

function lstatIsDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory()
  } catch {
    return false
  }
}

function sizeOf(path: string): number {
  try {
    const stat = lstatSync(path)
    if (!stat.isDirectory()) {
      return stat.size
    }
    return entriesOf(path).reduce((total, entry) => total + sizeOf(join(path, entry.name)), 0)
  } catch {
    return 0
  }
}

export function slimBytes(ticketDocsPath: string): number {
  return slimTargets(ticketDocsPath).reduce((total, target) => total + sizeOf(target), 0)
}
