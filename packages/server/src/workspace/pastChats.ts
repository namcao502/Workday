import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pastChatTitle, type PastChat } from '@workday/core'
import { isGuid, projectFolder } from './launchEnvironment.js'

const MAX_CHATS = 30
const EDGE_BYTES = 64 * 1024 // a transcript can be tens of MB: only its first and last lines name it
const JSONL = '.jsonl'

// The complete lines of `length` bytes from `start`; a cut first or last line is dropped.
function linesAt(descriptor: number, start: number, length: number, size: number): string[] {
  const bytes = Buffer.alloc(length)
  const read = readSync(descriptor, bytes, 0, length, start)
  const lines = bytes.subarray(0, read).toString('utf8').split('\n')
  const cutStart = start > 0
  const cutEnd = start + read < size
  return lines.slice(cutStart ? 1 : 0, cutEnd ? -1 : undefined).filter((line) => line !== '')
}

function titleOf(path: string, size: number): string | null {
  const descriptor = openSync(path, 'r')
  try {
    const head = linesAt(descriptor, 0, Math.min(size, EDGE_BYTES), size)
    const tail = size > EDGE_BYTES ? linesAt(descriptor, size - EDGE_BYTES, EDGE_BYTES, size) : []
    return pastChatTitle(head, tail)
  } finally {
    closeSync(descriptor)
  }
}

// The folder's chats, newest first; an unreadable folder or file is left out.
export function listPastChats(
  projectsRoot: string,
  cwd: string,
  currentId: string | null,
): readonly PastChat[] {
  const folder = projectFolder(projectsRoot, cwd)
  let names: string[]
  try {
    names = readdirSync(folder).filter(
      (name) => name.endsWith(JSONL) && isGuid(name.slice(0, -JSONL.length)),
    )
  } catch {
    return []
  }
  const files = names.flatMap((name) => {
    try {
      const { size, mtimeMs } = statSync(join(folder, name))
      return [{ name, size, mtimeMs }]
    } catch {
      return []
    }
  })
  return files
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, MAX_CHATS)
    .flatMap((file) => {
      const id = file.name.slice(0, -JSONL.length).toLowerCase()
      try {
        return [
          {
            id,
            title: titleOf(join(folder, file.name), file.size),
            modifiedAt: new Date(file.mtimeMs).toISOString(),
            current: id === currentId?.toLowerCase(),
          },
        ]
      } catch {
        return []
      }
    })
}
