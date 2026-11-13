import { describe, expect, it } from 'vitest'
import { MAX_DIFF_CHARS, bugBranchOf, listedChanges, parseExcerpt, parseNameStatus } from './gitParse.js'

describe('parseNameStatus', () => {
  it('reads status/path pairs', () => {
    expect(parseNameStatus('M\0src/A.cs\0D\0b.txt\0')).toEqual([
      { path: 'src/A.cs', status: 'M' },
      { path: 'b.txt', status: 'D' },
    ])
  })

  it('reads other letters as modified', () => {
    expect(parseNameStatus('T\0link\0A\0new.cs\0')).toEqual([
      { path: 'link', status: 'M' },
      { path: 'new.cs', status: 'A' },
    ])
  })
})

describe('listedChanges', () => {
  it('drops local-only paths case-insensitively, merges duplicates to M and sorts', () => {
    const files = [
      { path: 'b.txt', status: 'A' as const },
      { path: 'SRC/docker-compose.yml', status: 'M' as const },
      { path: 'a.txt', status: 'D' as const },
      { path: 'a.txt', status: 'A' as const },
      { path: 'C.txt', status: 'M' as const },
    ]
    expect(listedChanges(files, ['src/docker-compose.yml'])).toEqual([
      { path: 'a.txt', status: 'M' },
      { path: 'b.txt', status: 'A' },
      { path: 'C.txt', status: 'M' },
    ])
  })
})

describe('bugBranchOf', () => {
  it.each([
    ['MDP-2', 'MDP-2'],
    ['MDP-2-dev', 'MDP-2'],
  ])('%s -> %s', (branch, expected) => {
    expect(bugBranchOf(branch, 'MDP-1')).toBe(expected)
  })

  it.each(['MDP-1', 'MDP-1-dev', 'main', 'feature/x', ''])('%j -> null', (branch) => {
    expect(bugBranchOf(branch, 'MDP-1')).toBeNull()
  })
})

describe('parseExcerpt', () => {
  it('keeps hunks with real line numbers and gap lines', () => {
    const diff =
      'diff --git a/f.txt b/f.txt\nindex 1..2 100644\n--- a/f.txt\n+++ b/f.txt\n' +
      '@@ -4,3 +4,3 @@\n c4\n-old5\n+new5\n c6\n' +
      '@@ -20,2 +20,3 @@\n c20\n+added21\n c21\n'
    expect(parseExcerpt(diff)).toEqual({
      original: '\nc4\nold5\nc6\n\nc20\nc21',
      modified: '\nc4\nnew5\nc6\n\nc20\nadded21\nc21',
      originalLines: [0, 4, 5, 6, 0, 20, 21],
      modifiedLines: [0, 4, 5, 6, 0, 20, 21, 22],
      truncated: false,
    })
  })

  it('reads an added file and skips the no-newline marker', () => {
    const diff = '--- /dev/null\n+++ b/f.txt\n@@ -0,0 +1,2 @@\n+a\r\n+b\n\\ No newline at end of file\n'
    expect(parseExcerpt(diff)).toEqual({
      original: '',
      modified: 'a\nb',
      originalLines: [],
      modifiedLines: [1, 2],
      truncated: false,
    })
  })

  it('returns null for a binary diff', () => {
    expect(parseExcerpt('diff --git a/x b/x\nBinary files a/x and b/x differ\n')).toBeNull()
  })

  it('stops with a gap line and truncated over 1 MB', () => {
    const line = 'x'.repeat(1000)
    const count = Math.floor(MAX_DIFF_CHARS / 1000) + 10
    const diff = `@@ -0,0 +1,${String(count)} @@\n` + `+${line}\n`.repeat(count)
    const excerpt = parseExcerpt(diff)
    expect(excerpt?.truncated).toBe(true)
    expect(excerpt?.modifiedLines.at(-1)).toBe(0)
    expect(excerpt?.modified.length).toBeLessThan(MAX_DIFF_CHARS + 2000)
    expect(excerpt?.original).toBe('')
  })
})
