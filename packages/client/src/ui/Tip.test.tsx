import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Tip } from './Tip.js'

it('shows the hint in a tooltip on hover, and keeps the wrapper a plain span', async () => {
  render(
    <Tip content="Copy the path" className="block">
      <button type="button">src/app.ts</button>
    </Tip>,
  )
  const wrapper = screen.getByRole('button', { name: 'src/app.ts' }).parentElement
  expect(wrapper?.tagName).toBe('SPAN')
  expect(wrapper).not.toHaveAttribute('role')
  expect(wrapper).not.toHaveAttribute('tabindex')
  expect(wrapper).not.toHaveAttribute('title')

  fireEvent.pointerMove(document.body, { pointerType: 'mouse' })
  fireEvent.pointerEnter(screen.getByText('src/app.ts'), { pointerType: 'mouse' })
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Copy the path')
})

it('shows no tooltip when the hint is empty', async () => {
  render(<Tip content={null}>text</Tip>)
  fireEvent.pointerMove(document.body, { pointerType: 'mouse' })
  fireEvent.pointerEnter(screen.getByText('text'), { pointerType: 'mouse' })
  await new Promise((resolve) => setTimeout(resolve, 700))
  expect(screen.queryByRole('tooltip')).toBeNull()
})

function hover(element: HTMLElement): void {
  fireEvent.pointerMove(document.body, { pointerType: 'mouse' })
  fireEvent.pointerEnter(element, { pointerType: 'mouse' })
}

it('a truncated-only hint stays hidden while the text shows in full', async () => {
  render(
    <Tip content="src/deep/folder/app.ts" whenTruncated>
      app.ts
    </Tip>,
  )
  hover(screen.getByText('app.ts'))
  await new Promise((resolve) => setTimeout(resolve, 700))
  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('a truncated-only hint shows once the text is cut, and never takes a click', async () => {
  render(
    <Tip content="src/deep/folder/a-very-long-name.ts" whenTruncated>
      a-very-long-name.ts
    </Tip>,
  )
  const text = screen.getByText('a-very-long-name.ts')
  Object.defineProperty(text, 'scrollWidth', { configurable: true, value: 300 })
  Object.defineProperty(text, 'clientWidth', { configurable: true, value: 120 })
  hover(text)
  const tooltip = await screen.findByRole('tooltip')
  expect(tooltip).toHaveTextContent('src/deep/folder/a-very-long-name.ts')
  expect(tooltip).toHaveClass('pointer-events-none')
})
