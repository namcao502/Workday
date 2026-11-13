import { isTicketKey } from './ticketKey.js'

export type FileChangeStatus = 'A' | 'M' | 'D'

export interface FileChange {
  readonly path: string
  readonly status: FileChangeStatus
}

export interface DiffExcerpt {
  readonly original: string
  readonly modified: string
  readonly originalLines: readonly number[]
  readonly modifiedLines: readonly number[]
  readonly truncated: boolean
}

export const MAX_DIFF_CHARS = 1 << 20

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

// `git diff --name-status -z` is "<status>\0<path>\0" pairs.
export function parseNameStatus(output: string): readonly FileChange[] {
  const parts = output.split('\0').filter((part) => part !== '')
  const files: FileChange[] = []
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const letter = parts[index]?.[0]
    const path = parts[index + 1] ?? ''
    files.push({ path, status: letter === 'A' ? 'A' : letter === 'D' ? 'D' : 'M' })
  }
  return files
}

// A path both deleted from the index and untracked (`git rm --cached`) is one modified file.
export function listedChanges(
  files: readonly FileChange[],
  localOnlyPaths: readonly string[],
): readonly FileChange[] {
  const hidden = new Set(localOnlyPaths.map((path) => path.toLowerCase()))
  const byPath = new Map<string, FileChange>()
  for (const file of files) {
    if (hidden.has(file.path.toLowerCase())) {
      continue
    }
    byPath.set(file.path, byPath.has(file.path) ? { path: file.path, status: 'M' } : file)
  }
  return [...byPath.values()].sort((a, b) => {
    const left = a.path.toLowerCase()
    const right = b.path.toLowerCase()
    return left < right ? -1 : left > right ? 1 : 0
  })
}

// The bug key when the current branch is another ticket's (with or without "-dev"), else null.
export function bugBranchOf(currentBranch: string, ticketKey: string): string | null {
  const branchKey = currentBranch.endsWith('-dev') ? currentBranch.slice(0, -'-dev'.length) : currentBranch
  return isTicketKey(branchKey) && branchKey !== ticketKey ? branchKey : null
}

// A unified diff as two texts holding only its hunks; a gap line (empty text, line 0) on both sides marks unchanged lines left out.
export function parseExcerpt(unifiedDiff: string): DiffExcerpt | null {
  const original: string[] = []
  const modified: string[] = []
  const originalLines: number[] = []
  const modifiedLines: number[] = []
  const addGap = (): void => {
    original.push('')
    modified.push('')
    originalLines.push(0)
    modifiedLines.push(0)
  }
  let shownChars = 0
  let oldLine = 1
  let newLine = 1
  let inHunk = false
  let truncated = false
  for (const rawLine of unifiedDiff.split('\n')) {
    const line = rawLine.replace(/\r+$/, '')
    const header = HUNK_HEADER.exec(line)
    if (header !== null) {
      // A side with no lines (",0") names the line before the hunk.
      const hunkOld = Number(header[1]) + (header[2] === '0' ? 1 : 0)
      const hunkNew = Number(header[3]) + (header[4] === '0' ? 1 : 0)
      if (hunkOld > oldLine) {
        addGap()
      }
      oldLine = hunkOld
      newLine = hunkNew
      inHunk = true
      continue
    }
    if (!inHunk || line.length === 0) {
      continue
    }
    if (shownChars > MAX_DIFF_CHARS) {
      addGap()
      truncated = true
      break
    }
    const text = line.slice(1)
    const marker = line[0]
    if (marker === ' ') {
      original.push(text)
      originalLines.push(oldLine++)
      modified.push(text)
      modifiedLines.push(newLine++)
      shownChars += 2 * (text.length + 1)
    } else if (marker === '-') {
      original.push(text)
      originalLines.push(oldLine++)
      shownChars += text.length + 1
    } else if (marker === '+') {
      modified.push(text)
      modifiedLines.push(newLine++)
      shownChars += text.length + 1
    }
  }
  if (originalLines.length === 0 && modifiedLines.length === 0) {
    return null
  }
  return {
    original: original.join('\n'),
    modified: modified.join('\n'),
    originalLines,
    modifiedLines,
    truncated,
  }
}
