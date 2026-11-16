import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jsonResponse, renderWithQuery, stubFetch } from '../testSupport.js'
import { FolderPickerDialog } from './FolderPickerDialog.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const LISTINGS: Record<string, unknown> = {
  '/api/workspace/folders': {
    path: '/repos',
    parent: '/',
    folders: [{ name: 'Dev', path: '/repos/Dev' }],
  },
  '/api/workspace/folders?path=%2Frepos%2FDev': {
    path: '/repos/Dev',
    parent: '/repos',
    folders: [],
  },
}

it('steps into a folder and chooses the one shown', async () => {
  stubFetch((url) => jsonResponse(LISTINGS[url] ?? {}))
  const onChoose = vi.fn()
  renderWithQuery(<FolderPickerDialog startPath={null} onChoose={onChoose} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Dev' }))
  expect(await screen.findByText('No subfolders')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Choose this folder' }))
  expect(onChoose).toHaveBeenCalledWith('/repos/Dev')
})
