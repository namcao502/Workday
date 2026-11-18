import { expect, it } from 'vitest'
import type { DiffRow } from './diffRows.js'
import { changeRuns } from './diffOverview.js'

function row(kind: DiffRow['kind']): DiffRow {
  return { kind, text: '', oldLine: null, newLine: null, hiddenCount: 0 }
}

it('groups neighbouring rows of one kind into a run and skips the rest', () => {
  const rows = ['context', 'removed', 'removed', 'added', 'context', 'gap', 'added'].map((kind) =>
    row(kind as DiffRow['kind']),
  )
  expect(changeRuns(rows)).toEqual([
    { kind: 'removed', start: 1, end: 2 },
    { kind: 'added', start: 3, end: 3 },
    { kind: 'added', start: 6, end: 6 },
  ])
})

it('a diff without changes has no runs', () => {
  expect(changeRuns([row('context'), row('gap')])).toEqual([])
})
