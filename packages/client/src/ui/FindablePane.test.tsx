import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { FindablePane } from './FindablePane.js'

afterEach(cleanup)

function renderPane(): HTMLElement {
  return render(
    <div data-testid="workspace-left">
      <button type="button">tree</button>
      <FindablePane>
        <pre>
          <span className="code-number">12</span>
          <span>alpha beta</span>
          <span className="code-number">13</span>
          <span>Beta gamma beta</span>
        </pre>
      </FindablePane>
    </div>,
  ).container
}

function openFind(): HTMLElement {
  screen.getByRole('button', { name: 'tree' }).focus()
  fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
  return screen.getByRole('textbox', { name: 'Find in this file' })
}

it('Ctrl+F opens the find bar and counts matches, ignoring line numbers and case', () => {
  renderPane()
  const box = openFind()
  fireEvent.change(box, { target: { value: 'beta' } })
  expect(screen.getByRole('status')).toHaveTextContent('1/3')
  fireEvent.change(box, { target: { value: '12' } })
  expect(screen.getByRole('status')).toHaveTextContent('0/0')
})

it('Enter steps to the next match, Shift+Enter back, wrapping around', () => {
  renderPane()
  const box = openFind()
  fireEvent.change(box, { target: { value: 'beta' } })
  fireEvent.keyDown(box, { key: 'Enter' })
  expect(screen.getByRole('status')).toHaveTextContent('2/3')
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
  expect(screen.getByRole('status')).toHaveTextContent('3/3')
})

it('Esc in the find box closes the bar', () => {
  renderPane()
  const box = openFind()
  fireEvent.keyDown(box, { key: 'Escape' })
  expect(screen.queryByRole('textbox', { name: 'Find in this file' })).not.toBeInTheDocument()
})

it('Ctrl+A selects only the pane text', () => {
  renderPane()
  screen.getByRole('button', { name: 'tree' }).focus()
  fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
  expect(window.getSelection()?.toString()).toContain('alpha beta')
  expect(window.getSelection()?.toString()).not.toContain('tree')
})

function select(node: Node, start: number, end: number): void {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

it('Ctrl+F with text selected in the pane searches for it, starting at the selected match', () => {
  renderPane()
  // "beta" at the end of "Beta gamma beta": the third match, so the count starts there, not at the top.
  const line = screen.getByText('Beta gamma beta').firstChild
  if (line === null) {
    throw new Error('no text node')
  }
  select(line, 11, 15)
  // Focus is not in the pane (a selection made with the mouse can leave it on the page): the selection is enough.
  ;(document.activeElement as HTMLElement | null)?.blur()
  fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
  expect(screen.getByRole('textbox', { name: 'Find in this file' })).toHaveValue('beta')
  expect(screen.getByRole('status')).toHaveTextContent('3/3')
})

it('a selection spanning lines is not taken as the search', () => {
  render(
    <div data-testid="workspace-left">
      <button type="button">tree</button>
      <FindablePane>
        <pre data-testid="two-lines">{'one gamma\ntwo'}</pre>
      </FindablePane>
    </div>,
  )
  const box = openFind()
  fireEvent.change(box, { target: { value: 'gamma' } })
  const text = screen.getByTestId('two-lines').firstChild
  if (text === null) {
    throw new Error('no text node')
  }
  select(text, 0, 13)
  fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
  expect(box).toHaveValue('gamma')
})

it('Ctrl+A in an editable box inside the pane area keeps the browser select-all', () => {
  render(
    <div data-testid="workspace-left">
      <FindablePane>
        <p>thread text</p>
      </FindablePane>
      <div contentEditable suppressContentEditableWarning data-testid="composer">
        draft
      </div>
    </div>,
  )
  const composer = screen.getByTestId('composer')
  composer.focus()
  const event = fireEvent.keyDown(composer, { key: 'a', ctrlKey: true })
  // Not prevented: the browser selects the draft, not the thread.
  expect(event).toBe(true)
})
