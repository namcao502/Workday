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
