import type { FilesGroupView } from '@workday/core'

export interface FileLink {
  readonly path: string // forward slashes; full (C:/..., /...) or relative to a worktree
  readonly line: number | null
}

export interface FileLinkTarget {
  readonly group: string
  readonly path: string // as the group lists it
  readonly line: number | null
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const DRIVE = /^[a-z]:\//i
const LINE_SUFFIX = /(?::(\d+)(?::\d+)?|#L(\d+)(?:-L?\d+)?)$/
const HAS_EXTENSION = /\.[a-z0-9]+$/i

function decoded(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

// "src/app.ts:42", "src/app.ts#L42", "C:\\repo\\x.cs", "file:///C:/repo/x.cs" -> path and line; null for a
// web link, a word or a sentence. Only a name with an extension counts, so plain words stay text.
export function parseFileLink(raw: string): FileLink | null {
  const text = raw.trim()
  if (text === '' || /\s/.test(text) || text.startsWith('#')) {
    return null
  }
  let path = decoded(text).replace(/\\/g, '/')
  if (path.toLowerCase().startsWith('file://')) {
    path = path.slice('file://'.length).replace(/^\/(?=[a-z]:\/)/i, '')
  } else if (SCHEME.test(path) && !DRIVE.test(path)) {
    return null
  }
  const match = LINE_SUFFIX.exec(path)
  const lineText = match?.[1] ?? match?.[2]
  if (match !== null) {
    path = path.slice(0, match.index)
  }
  if (!HAS_EXTENSION.test(path)) {
    return null
  }
  return { path, line: lineText === undefined ? null : Number(lineText) }
}

function listed(group: FilesGroupView, path: string): string | undefined {
  const wanted = path.toLowerCase()
  return group.paths.find((candidate) => candidate.toLowerCase() === wanted)
}

// A full path: the group whose folder holds it (the deepest one, as docs sit inside a worktree).
function resolveFull(path: string, groups: readonly FilesGroupView[]): FileLinkTarget | null {
  const lower = path.toLowerCase()
  const holders = groups
    .map((group) => ({ group, root: group.root.replace(/\\/g, '/').replace(/\/+$/, '') }))
    .filter(({ root }) => lower.startsWith(`${root.toLowerCase()}/`))
    .sort((a, b) => b.root.length - a.root.length)
  for (const { group, root } of holders) {
    const found = listed(group, path.slice(root.length + 1))
    if (found !== undefined) {
      return { group: group.id, path: found, line: null }
    }
  }
  return null
}

// A relative path: the first group listing it, else the one file anywhere that ends with it.
function resolveRelative(path: string, groups: readonly FilesGroupView[]): FileLinkTarget | null {
  const relative = path.replace(/^\.\//, '')
  for (const group of groups) {
    const found = listed(group, relative)
    if (found !== undefined) {
      return { group: group.id, path: found, line: null }
    }
  }
  // No exact match: the path and a listed one may share a segment-aligned tail, in either direction -- a bare
  // name a group lists under a folder, or a repo-relative path (docs/MDP-1/x.md) into a docs group rooted at
  // that folder, which lists it as the bare name.
  const relLower = relative.toLowerCase()
  const matches = groups.flatMap((group) =>
    group.paths
      .filter((candidate) => {
        const candidateLower = candidate.toLowerCase()
        return candidateLower.endsWith(`/${relLower}`) || relLower.endsWith(`/${candidateLower}`)
      })
      .map((candidate) => ({ group: group.id, path: candidate, line: null })),
  )
  return matches.length === 1 ? (matches[0] ?? null) : null
}

// The workspace file a chat link points at; null when no group has it.
export function resolveFileLink(
  raw: string,
  groups: readonly FilesGroupView[],
): FileLinkTarget | null {
  const link = parseFileLink(raw)
  if (link === null) {
    return null
  }
  const full = DRIVE.test(link.path) || link.path.startsWith('/')
  const target = full ? resolveFull(link.path, groups) : resolveRelative(link.path, groups)
  return target === null ? null : { ...target, line: link.line }
}

export const OPEN_FILE_EVENT = 'workday:open-file'

export interface OpenFileRequest extends FileLinkTarget {
  readonly tabId: string
  readonly id: number // a new one per click, so the same file asked twice still opens
}

let nextRequestId = 1

// Asks the Workspace page to show the file in the tab's Files view (the pane is shown if it was hidden).
export function openWorkspaceFile(tabId: string, target: FileLinkTarget): void {
  const detail: OpenFileRequest = { ...target, tabId, id: nextRequestId }
  nextRequestId += 1
  window.dispatchEvent(new CustomEvent<OpenFileRequest>(OPEN_FILE_EVENT, { detail }))
}

export function isOpenFileRequest(value: unknown): value is OpenFileRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const request = value as Record<string, unknown>
  return (
    typeof request['tabId'] === 'string' &&
    typeof request['group'] === 'string' &&
    typeof request['path'] === 'string' &&
    typeof request['id'] === 'number'
  )
}
