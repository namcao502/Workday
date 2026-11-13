import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FileTree } from './FileTree.js'

const PATHS = ['README.md', 'src/app/main.ts', 'src/app/util/a.ts', 'docs/Guide.md']

function renderTree(defaultOpen: boolean, onSelect = vi.fn()): void {
  render(
    <FileTree paths={PATHS} selectedPath={null} onSelect={onSelect} defaultOpen={defaultOpen} />,
  )
}

it('opens and closes a folder', () => {
  renderTree(false)
  expect(screen.queryByText('Guide.md')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /docs/ }))
  expect(screen.getByText('Guide.md')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /docs/ }))
  expect(screen.queryByText('Guide.md')).toBeNull()
})

it('shows merged folders open by default when asked', () => {
  renderTree(true)
  expect(screen.getByRole('button', { name: /src\/app/ })).toBeTruthy()
  expect(screen.getByText('main.ts')).toBeTruthy()
})

it('filters to a flat case-insensitive list and selects', async () => {
  const onSelect = vi.fn()
  renderTree(false, onSelect)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'GUIDE' } })
  const item = await waitFor(() => screen.getByRole('button', { name: 'docs/Guide.md' }))
  expect(screen.queryByText('README.md')).toBeNull()
  fireEvent.click(item)
  expect(onSelect).toHaveBeenCalledWith('docs/Guide.md')
})
