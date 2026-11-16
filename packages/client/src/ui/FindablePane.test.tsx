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
