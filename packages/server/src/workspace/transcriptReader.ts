import { closeSync, fstatSync, openSync, readSync } from 'node:fs'

export const MAX_WHOLE_FILE_BYTES = 20 * 1024 * 1024
export const TAIL_BYTES = 4 * 1024 * 1024
const LINE_FEED = 0x0a

export interface TranscriptLines {
  readonly lines: readonly string[]
  readonly offsets: readonly number[] // absolute byte offset of each line, so ids stay stable
}

// Above 20 MB only the last 4 MB is read; the first (cut) line of a tail is dropped.
export function readTranscriptLines(path: string): TranscriptLines {
  const descriptor = openSync(path, 'r')
  try {
    const { size } = fstatSync(descriptor)
    const start = size > MAX_WHOLE_FILE_BYTES ? size - TAIL_BYTES : 0
    const bytes = Buffer.alloc(size - start)
    let read = 0
    while (read < bytes.length) {
      const count = readSync(descriptor, bytes, read, bytes.length - read, start + read)
      if (count === 0) {
        break
      }
      read += count
    }
    return splitLines(bytes.subarray(0, read), start)
  } finally {
    closeSync(descriptor)
  }
}

function splitLines(bytes: Buffer, start: number): TranscriptLines {
  const lines: string[] = []
  const offsets: number[] = []
  let lineStart = 0
  if (start !== 0) {
    const firstBreak = bytes.indexOf(LINE_FEED)
    lineStart = firstBreak < 0 ? bytes.length : firstBreak + 1
  }
  while (lineStart < bytes.length) {
    const lineBreak = bytes.indexOf(LINE_FEED, lineStart)
    const lineEnd = lineBreak < 0 ? bytes.length : lineBreak
    lines.push(bytes.toString('utf8', lineStart, lineEnd).replace(/\r$/, ''))
    offsets.push(start + lineStart)
    lineStart = lineEnd + 1
  }
  return { lines, offsets }
}
