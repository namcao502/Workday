import { fireEvent, render, screen } from '@testing-library/react'
import type { FileContentView } from '@workday/core'
import { expect, it, vi } from 'vitest'
import { FileViewer } from './FileViewer.js'

const KNOWN = ['docs/plan.md', 'docs/notes/a.md', 'docs/pic.png']

function renderViewer(
  content: FileContentView,
  path = 'docs/notes/a.md',
  onSelectPath = vi.fn(),
): HTMLElement {
  return render(
    <FileViewer
      tabId="MDP-1"
      group="docs"
      path={path}
      content={content}
      knownPaths={KNOWN}
      onSelectPath={onSelectPath}
      onOpenInEditor={vi.fn()}
    />,
  ).container
}

it('does not render a script or raw html from markdown', () => {
  const container = renderViewer({
    kind: 'markdown',
    text: '# Title\n\n<script>window.hacked = 1</script>\n\n<b>raw</b>',
  })
  expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy()
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('b')).toBeNull()
})

it('selects a listed file for a relative link and drops an unknown one', () => {
  const onSelectPath = vi.fn()
  renderViewer(
    { kind: 'markdown', text: '[plan](../plan.md) and [gone](../missing.md)' },
    'docs/notes/a.md',
    onSelectPath,
  )
  fireEvent.click(screen.getByText('plan'))
  expect(onSelectPath).toHaveBeenCalledWith('docs/plan.md')
  expect(screen.getByText('gone').closest('a')).toBeNull()
})

it('opens an http link in a new tab', () => {
  renderViewer({ kind: 'markdown', text: '[site](https://example.com)' })
  const link = screen.getByText('site').closest('a')
  expect(link?.getAttribute('target')).toBe('_blank')
  expect(link?.getAttribute('rel')).toBe('noreferrer')
})

it('loads a markdown image and an image file through the raw url', () => {
  const container = renderViewer({ kind: 'markdown', text: '![shot](../pic.png)' })
  expect(container.querySelector('img')?.getAttribute('src')).toBe(
    '/api/workspace/tabs/MDP-1/files/raw?group=docs&path=docs%2Fpic.png',
  )
})

it('shows an image file from the raw url', () => {
  const container = renderViewer({ kind: 'image' }, 'docs/pic.png')
  expect(container.querySelector('img')?.getAttribute('src')).toContain('files/raw')
})

it('shows the source with line numbers', () => {
  const container = renderViewer({ kind: 'text', text: 'one\ntwo' }, 'docs/x.txt')
  expect(container.querySelectorAll('.code-line')).toHaveLength(2)
})

it('offers VS Code for a file that is too large', () => {
  renderViewer({ kind: 'tooLarge' })
  expect(screen.getByRole('button', { name: /VS Code/ })).toBeTruthy()
})
