import { expect, it } from 'vitest'
import { diffRows } from './diffRows.js'

it('marks an edit in the middle of a file', () => {
  const rows = diffRows({ kind: 'full', original: 'a\nb\nc\n', modified: 'a\nB\nc\nd\n' })
  expect(rows.map((row) => [row.kind, row.text, row.oldLine, row.newLine])).toEqual([
    ['context', 'a', 1, 1],
    ['removed', 'b', 2, null],
    ['added', 'B', null, 2],
    ['context', 'c', 3, 3],
    ['added', 'd', null, 4],
  ])
})

it('shows a new file as all added', () => {
  const rows = diffRows({ kind: 'full', original: '', modified: 'x\ny\n' })
  expect(rows.map((row) => row.kind)).toEqual(['added', 'added'])
  expect(rows.map((row) => row.newLine)).toEqual([1, 2])
})

it('shows a deleted line', () => {
  const rows = diffRows({ kind: 'full', original: 'a\nb', modified: 'a' })
  expect(rows.map((row) => row.kind)).toEqual(['context', 'removed'])
})

it('counts the hidden lines between excerpt hunks', () => {
  const rows = diffRows({
    kind: 'excerpt',
    original: 'a\nb\n\nx\ny',
    modified: 'a\nB\n\nx\ny',
    originalLines: [1, 2, 0, 10, 11],
    modifiedLines: [1, 2, 0, 10, 11],
    truncated: false,
  })
  expect(rows.map((row) => row.kind)).toEqual([
    'context',
    'removed',
    'added',
    'gap',
    'context',
    'context',
  ])
  const gap = rows.find((row) => row.kind === 'gap')
  expect(gap?.hiddenCount).toBe(7)
  expect(rows.at(-1)?.oldLine).toBe(11)
})

it('numbers excerpt rows by the line arrays and adds a truncated row', () => {
  const rows = diffRows({
    kind: 'excerpt',
    original: 'p\nq',
    modified: 'p\nq',
    originalLines: [40, 41],
    modifiedLines: [42, 43],
    truncated: true,
  })
  expect(rows[0]).toMatchObject({ kind: 'context', oldLine: 40, newLine: 42 })
  expect(rows.at(-1)).toMatchObject({ kind: 'gap', text: '(truncated)' })
})
