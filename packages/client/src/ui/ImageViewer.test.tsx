import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ImageViewer } from './ImageViewer.js'

const IMAGES = [
  { src: '/a.png', fullSrc: null },
  { src: '/b.png', fullSrc: null },
]

it('shows the picked image with its place among the others, and Right / Left step through them', () => {
  render(<ImageViewer images={IMAGES} startIndex={0} onClose={vi.fn()} />)
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute('src', '/a.png')
  fireEvent.keyDown(window, { key: 'ArrowRight' })
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute('src', '/b.png')
  fireEvent.keyDown(window, { key: 'ArrowRight' })
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
})

it('closes on Esc, on the close button and on the dark area around the image', () => {
  const onClose = vi.fn()
  render(<ImageViewer images={IMAGES} startIndex={1} onClose={onClose} />)
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  const stage = screen.getByRole('dialog').querySelector('img')?.parentElement
  expect(stage).not.toBeNull()
  fireEvent.click(stage as HTMLElement)
  expect(onClose).toHaveBeenCalledTimes(3)
})

it('shows no count or step buttons for a single image', () => {
  render(
    <ImageViewer
      images={[IMAGES[0] ?? { src: '', fullSrc: null }]}
      startIndex={0}
      onClose={vi.fn()}
    />,
  )
  expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  expect(screen.queryByText(/\//)).not.toBeInTheDocument()
})
