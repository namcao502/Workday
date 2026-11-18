import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PriorityText } from './PriorityText.js'

afterEach(() => {
  cleanup()
})

it('P1 is red, P2 orange and a lower priority plain', () => {
  render(
    <>
      <PriorityText devPriority={1} text="P1" />
      <PriorityText devPriority={2} text="P2" />
      <PriorityText devPriority={5} text="P5" />
    </>,
  )
  expect(screen.getByText('P1')).toHaveClass('text-danger')
  expect(screen.getByText('P2')).toHaveClass('text-warning')
  expect(screen.getByText('P5')).not.toHaveClass('text-danger', 'text-warning')
})
