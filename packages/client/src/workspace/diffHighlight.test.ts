import { expect, it } from 'vitest'
import type { DiffRow } from './diffRows.js'
import { highlightRows } from './diffHighlight.js'

function row(kind: DiffRow['kind'], text: string): DiffRow {
  return { kind, text, oldLine: null, newLine: null, hiddenCount: 0 }
}

it('colours each side as one text, so a comment opened on a context line carries on', () => {
  const rows = [
    row('context', '/* start'),
    row('removed', 'old */'),
    row('added', 'new */'),
    row('gap', ''),
    row('context', 'return 1;'),
  ]
  const html = highlightRows(rows, 'csharp')
  expect(html).toHaveLength(5)
  expect(html[1]).toContain('hljs-comment')
  expect(html[2]).toContain('hljs-comment')
  expect(html[3]).toBe('')
  expect(html[4]).toContain('hljs-keyword')
})
