import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative as relativePath, resolve, sep } from 'node:path'
import { MAX_DIFF_CHARS, type FileContentView } from '@workday/core'
import { runGit } from './git.js'

const GIT_TIMEOUT_MS = 30_000
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const IMAGE_TYPES: ReadonlyMap<string, string> = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
])

export class PathOutsideError extends Error {
  constructor() {
    super('Path is outside the group root')
    this.name = 'PathOutsideError'
  }
}

export function imageMimeType(path: string): string | null {
  return IMAGE_TYPES.get(extname(path).toLowerCase()) ?? null
}

function byNameIgnoringCase(left: string, right: string): number {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  return a < b ? -1 : a > b ? 1 : 0
}

// Relative paths with '/'; null when the folder cannot be read.
export async function listDocs(docsRoot: string): Promise<readonly string[] | null> {
  try {
    const entries = await readdir(docsRoot, { recursive: true, withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relativePath(docsRoot, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
      .sort(byNameIgnoringCase)
  } catch {
    return null
  }
}

// Tracked + untracked-not-ignored, minus files deleted on disk; null when git fails.
// Nested repos come back as "sub/" and conflicted paths repeat, hence the filter.
export async function listWorktree(worktreePath: string): Promise<readonly string[] | null> {
  const run = (...args: string[]): ReturnType<typeof runGit> =>
    runGit(worktreePath, ['--no-optional-locks', ...args], GIT_TIMEOUT_MS)
  const listed = await run('ls-files', '-z', '--cached', '--others', '--exclude-standard')
  const deleted = listed.ok ? await run('ls-files', '-z', '--deleted') : listed
  if (!deleted.ok) {
    return null
  }
  const deletedPaths = new Set(deleted.stdout.split('\0').filter((path) => path !== ''))
  const paths = listed.stdout
    .split('\0')
    .filter((path) => path !== '' && !path.endsWith('/') && !deletedPaths.has(path))
  return [...new Set(paths)].sort(byNameIgnoringCase)
}

export async function readTicketFile(fullPath: string): Promise<FileContentView> {
  const extension = extname(fullPath).toLowerCase()
  const { size } = await stat(fullPath)
  if (IMAGE_TYPES.has(extension)) {
    return { kind: size > MAX_IMAGE_BYTES ? 'tooLarge' : 'image' }
  }
  if (size > MAX_DIFF_CHARS) {
    return { kind: 'tooLarge' }
  }
  const text = await readFile(fullPath, 'utf8')
  if (text.length > MAX_DIFF_CHARS) {
    return { kind: 'tooLarge' }
  }
  if (text.includes('\0')) {
    return { kind: 'binary' }
  }
  return { kind: extension === '.md' || extension === '.markdown' ? 'markdown' : 'text', text }
}

function isInside(root: string, path: string): boolean {
  const normalize = (value: string): string =>
    process.platform === 'win32' ? value.toLowerCase() : value
  const rootText = normalize(root)
  const pathText = normalize(path)
  return pathText === rootText || pathText.startsWith(rootText.endsWith(sep) ? rootText : rootText + sep)
}

// Throws PathOutsideError when the real path leaves root.
// A path that does not exist passes on its text alone; nothing can be read through it.
export async function resolveInside(root: string, relative: string): Promise<string> {
  const segments = relative.split(/[\\/]/)
  if (
    relative === '' ||
    relative.includes('\0') ||
    isAbsolute(relative) ||
    /^[a-zA-Z]:/.test(relative) ||
    segments.includes('..')
  ) {
    throw new PathOutsideError()
  }
  const full = resolve(root, relative)
  let realRoot: string
  try {
    realRoot = await realpath(root)
  } catch {
    throw new PathOutsideError()
  }
  let realFull: string
  try {
    realFull = await realpath(full)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return full
    }
    throw new PathOutsideError()
  }
  if (!isInside(realRoot, realFull)) {
    throw new PathOutsideError()
  }
  return full
}
