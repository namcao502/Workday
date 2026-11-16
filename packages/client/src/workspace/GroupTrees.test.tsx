import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { GroupTrees } from './GroupTrees.js'

afterEach(cleanup)

it('a group heading is a button that collapses and expands its tree', () => {
  render(
    <GroupTrees
      groups={[{ id: 'docs', label: 'docs', paths: ['plan.md'], error: null }]}
      selected={null}
      onSelect={() => undefined}
      defaultOpen
    />,
  )
  const heading = screen.getByRole('button', { name: 'docs' })
  expect(heading).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /plan\.md/ })).toBeInTheDocument()
  fireEvent.click(heading)
  expect(heading).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: /plan\.md/ })).not.toBeInTheDocument()
})
