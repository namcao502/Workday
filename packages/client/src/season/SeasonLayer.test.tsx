import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubMatchMedia } from '../testSupport.js'
import { effectLevel } from './effectLevel.js'
import { SeasonLayer } from './SeasonLayer.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('draws nothing when no season is on', () => {
  render(<SeasonLayer season={null} level="full" />)
  expect(screen.queryByTestId('season-layer')).toBeNull()
})

it('draws the backdrop behind the panes, with the particle canvas', () => {
  stubMatchMedia(false)
  render(<SeasonLayer season="winter" level="full" />)
  const layer = screen.getByTestId('season-layer')
  expect(layer).toHaveClass('season-backdrop', '-z-10', 'pointer-events-none')
  expect(screen.getByTestId('season-canvas')).toBeInTheDocument()
  // Only Christmas and Tet hang a garland.
  expect(screen.queryByTestId('season-garland')).toBeNull()
})

it('keeps the backdrop but no falling particles when the system asks for reduced motion', () => {
  stubMatchMedia(true)
  render(<SeasonLayer season="christmas" level="full" />)
  expect(screen.getByTestId('season-layer')).toBeInTheDocument()
  expect(screen.queryByTestId('season-canvas')).toBeNull()
  expect(screen.getByTestId('season-garland')).toHaveClass('is-still')
})

it('Christmas hangs twinkling bulbs, Tet swinging lanterns, the light level keeps them still', () => {
  stubMatchMedia(false)
  const { rerender } = render(<SeasonLayer season="christmas" level="full" />)
  const garland = screen.getByTestId('season-garland')
  expect(garland).toHaveAttribute('data-garland', 'christmas')
  expect(garland).not.toHaveClass('is-still')
  expect(garland.querySelector('.garland-bulb')).not.toBeNull()

  rerender(<SeasonLayer season="tet" level="light" />)
  const tet = screen.getByTestId('season-garland')
  expect(tet.querySelector('.garland-lantern')).not.toBeNull()
  expect(tet).toHaveClass('is-still')
})

it('effects off keeps the colors and backdrop but nothing that moves or hangs', () => {
  stubMatchMedia(false)
  render(<SeasonLayer season="christmas" level="off" />)
  expect(screen.getByTestId('season-layer')).toBeInTheDocument()
  expect(screen.queryByTestId('season-canvas')).toBeNull()
  expect(screen.queryByTestId('season-garland')).toBeNull()
})

it('auto effects are full on a wide screen and light on a phone; a pick wins', () => {
  expect(effectLevel('auto', false)).toBe('full')
  expect(effectLevel('auto', true)).toBe('light')
  expect(effectLevel(undefined, true)).toBe('light')
  expect(effectLevel('off', false)).toBe('off')
  expect(effectLevel('full', true)).toBe('full')
})
