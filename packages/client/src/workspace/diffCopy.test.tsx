import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { copyNewSide } from './diffCopy.js'

afterEach(() => {
  cleanup()
})

function renderDiff(): HTMLTableElement {
  const { container } = render(
    <table onCopy={copyNewSide}>
      <tbody>
        <tr className="diff-context">
          <td className="diff-number">1</td>
          <td className="diff-mark"> </td>
          <td className="diff-text">keep</td>
        </tr>
        <tr className="diff-removed">
          <td className="diff-number">2</td>
          <td className="diff-mark">-</td>
          <td className="diff-text">old line</td>
        </tr>
        <tr className="diff-added">
          <td className="diff-number">2</td>
          <td className="diff-mark">+</td>
          <td className="diff-text">new line</td>
        </tr>
        <tr className="diff-gap">
          <td>3 unchanged lines</td>
        </tr>
      </tbody>
    </table>,
  )
  const table = container.querySelector('table')
  if (table === null) {
    throw new Error('no table')
  }
  return table
}

function copy(table: HTMLTableElement): ReturnType<typeof vi.fn> {
  const setData = vi.fn()
  fireEvent.copy(table, { clipboardData: { setData } })
  return setData
}

it('copying the whole diff keeps only the new side, without marks or removed lines', () => {
  const table = renderDiff()
  const range = document.createRange()
  range.selectNodeContents(table)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  expect(copy(table)).toHaveBeenCalledWith('text/plain', 'keep\nnew line')
})

it('a selection inside a removed line copies as the browser would', () => {
  const table = renderDiff()
  const removed = table.querySelector('.diff-removed .diff-text')
  const range = document.createRange()
  range.selectNodeContents(removed ?? table)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
  expect(copy(table)).not.toHaveBeenCalled()
})
