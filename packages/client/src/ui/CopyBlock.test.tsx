import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatMarkdown } from '../workspace/ChatRows.js'
import { CopyButton } from './CopyButton.js'
import { CopyPath } from './CopyPath.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const mock = vi.fn(writeText)
  vi.stubGlobal('navigator', { clipboard: { writeText: mock } })
  return mock
}

it('a code block in markdown has a copy button that copies its code', async () => {
  const writeText = stubClipboard(() => Promise.resolve())
  render(<ChatMarkdown text={'Run:\n\n```sh\nnpm test\nnpm run build\n```\n'} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
  expect(writeText).toHaveBeenCalledWith('npm test\nnpm run build')
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
})

it('a quoted block has a copy button too', () => {
  const writeText = stubClipboard(() => Promise.resolve())
  render(<ChatMarkdown text={'> a quoted note'} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
  expect(writeText).toHaveBeenCalledWith('a quoted note')
})

it('the button says so when the clipboard refuses', async () => {
  stubClipboard(() => Promise.reject(new Error('denied')))
  render(<CopyButton text="x" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Could not copy' })).toBeInTheDocument()
  })
})

it('the open file path is a button that copies the path', async () => {
  const writeText = stubClipboard(() => Promise.resolve())
  render(<CopyPath text="docs/plan.md" />)
  fireEvent.click(screen.getByRole('button', { name: 'docs/plan.md' }))
  expect(writeText).toHaveBeenCalledWith('docs/plan.md')
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
})
