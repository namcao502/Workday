import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { SkeletonRows } from './Skeleton.js'

it('skeleton rows keep the loading text for screen readers', () => {
  const { container } = render(<SkeletonRows label="Loading the tickets" rows={4} />)
  expect(screen.getByText('Loading the tickets').className).toContain('sr-only')
  expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4)
})
