import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_WHOLE_FILE_BYTES, readTranscriptLines, TAIL_BYTES } from './transcriptReader.js'

function tempFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'workday-transcript-')), 's.jsonl')
  writeFileSync(path, content)
  return path
}

describe('readTranscriptLines', () => {
  it('reads a small file whole with byte offsets', () => {
    const { lines, offsets } = readTranscriptLines(tempFile('ab\r\ncde\nf'))
    expect(lines).toEqual(['ab', 'cde', 'f'])
    expect(offsets).toEqual([0, 4, 8])
  })

  it('reads only the tail of a file over 20 MB, drops the cut line, keeps absolute offsets', () => {
    const filler = 'x'.repeat(1023) + '\n'
    const head = filler.repeat(MAX_WHOLE_FILE_BYTES / 1024)
    const tail = 'first-whole\nlast\n'
    const path = tempFile(head + 'y'.repeat(TAIL_BYTES - tail.length - 5) + '\n' + tail)
    const { lines, offsets } = readTranscriptLines(path)
    const total = head.length + TAIL_BYTES - tail.length - 4 + tail.length
    expect(lines.slice(-2)).toEqual(['first-whole', 'last'])
    expect(offsets.at(-1)).toBe(total - 'last\n'.length)
    expect(lines[0]?.startsWith('y')).toBe(true)
    expect(offsets[0]).toBeGreaterThanOrEqual(total - TAIL_BYTES)
  })
})
