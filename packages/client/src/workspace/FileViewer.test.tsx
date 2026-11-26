import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

it('opens an image file and a markdown image full screen on click', () => {
  const container = renderViewer({ kind: 'image' }, 'docs/pic.png')
  fireEvent.click(container.querySelector('img') ?? document.body)
  expect(screen.getByRole('dialog', { name: 'Image viewer' })).toBeTruthy()
  cleanup()
  const markdown = renderViewer({ kind: 'markdown', text: '![shot](../pic.png)' })
  fireEvent.click(markdown.querySelector('img') ?? document.body)
  expect(screen.getByRole('dialog', { name: 'Image viewer' })).toBeTruthy()
})

it('shows the source with line numbers', () => {
  const container = renderViewer({ kind: 'text', text: 'one\ntwo' }, 'docs/x.txt')
  expect(container.querySelectorAll('.code-line')).toHaveLength(2)
})

it('shows a notice for a file that is too large to preview', () => {
  renderViewer({ kind: 'tooLarge' })
  expect(screen.getByText(/too large/i)).toBeTruthy()
})

it('copies the whole source of a text file and of a markdown file', () => {
  const writeText = vi.fn(() => Promise.resolve())
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  renderViewer({ kind: 'text', text: 'one\ntwo' }, 'docs/x.txt')
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
  expect(writeText).toHaveBeenLastCalledWith('one\ntwo')
  cleanup()
  renderViewer({ kind: 'markdown', text: '# Title\n\n```\ncode\n```' })
  const buttons = screen.getAllByRole('button', { name: 'Copy' })
  expect(buttons).toHaveLength(2)
  fireEvent.click(buttons[0] as HTMLElement)
  expect(writeText).toHaveBeenLastCalledWith('# Title\n\n```\ncode\n```')
  vi.unstubAllGlobals()
})

it('a markdown file in source mode shows a single copy button', () => {
  renderViewer({ kind: 'markdown', text: '# Title' })
  fireEvent.click(screen.getByRole('radio', { name: 'Source' }))
  expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(1)
})

it('breaks the line at a single newline inside a paragraph', () => {
  const container = renderViewer({ kind: 'markdown', text: 'first line\nsecond line' })
  expect(container.querySelector('.markdown-view p br')).not.toBeNull()
})

it('opens a web link only on Ctrl+click', () => {
  renderViewer({ kind: 'markdown', text: '[site](https://example.com)' })
  const link = screen.getByRole('link', { name: 'site' })
  expect(fireEvent.click(link)).toBe(false) // default prevented: nothing opens
  expect(fireEvent.click(link, { ctrlKey: true })).toBe(true)
})
