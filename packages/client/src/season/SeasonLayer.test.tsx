import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubMatchMedia } from '../testSupport.js'
import { SeasonLayer } from './SeasonLayer.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('draws nothing when no season is on', () => {
  render(<SeasonLayer season={null} />)
  expect(screen.queryByTestId('season-layer')).toBeNull()
})

it('draws the backdrop behind the panes, with the particle canvas', () => {
  stubMatchMedia(false)
  render(<SeasonLayer season="winter" />)
  const layer = screen.getByTestId('season-layer')
  expect(layer).toHaveClass('season-backdrop', '-z-10', 'pointer-events-none')
  expect(screen.getByTestId('season-canvas')).toBeInTheDocument()
})

it('keeps the backdrop but no falling particles when the system asks for reduced motion', () => {
  stubMatchMedia(true)
  render(<SeasonLayer season="winter" />)
  expect(screen.getByTestId('season-layer')).toBeInTheDocument()
  expect(screen.queryByTestId('season-canvas')).toBeNull()
})
