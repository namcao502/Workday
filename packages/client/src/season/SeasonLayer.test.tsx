import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { stubMatchMedia } from '../testSupport.js'
import { effectLevel } from './effectLevel.js'
import { SeasonLayer } from './SeasonLayer.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('draws nothing when no season is on', () => {
  render(<SeasonLayer season={null} level="full" dark={false} />)
  expect(screen.queryByTestId('season-layer')).toBeNull()
})

it('draws the backdrop behind the panes and the particles over them, taking no click', () => {
  stubMatchMedia(false)
  render(<SeasonLayer season="winter" level="full" dark={false} />)
  const layer = screen.getByTestId('season-layer')
  expect(layer).toHaveClass('season-backdrop', '-z-10', 'pointer-events-none')
  expect(layer).not.toHaveAttribute('data-still')
  const canvas = screen.getByTestId('season-canvas')
  expect(layer).not.toContainElement(canvas)
  expect(canvas.parentElement).toHaveClass('z-20', 'pointer-events-none')
})

it('hangs nothing along the edges, festivals included', () => {
  stubMatchMedia(false)
  const { container } = render(<SeasonLayer season="christmas" level="full" dark={false} />)
  expect(container.querySelector('.season-garland')).toBeNull()
})

it('keeps a still backdrop but no particles when the system asks for reduced motion', () => {
  stubMatchMedia(true)
  render(<SeasonLayer season="christmas" level="full" dark={false} />)
  expect(screen.getByTestId('season-layer')).toHaveAttribute('data-still', 'true')
  expect(screen.queryByTestId('season-canvas')).toBeNull()
})

it('the light level keeps the particles but stills the sky', () => {
  stubMatchMedia(false)
  render(<SeasonLayer season="tet" level="light" dark={false} />)
  expect(screen.getByTestId('season-layer')).toHaveAttribute('data-still', 'true')
  expect(screen.getByTestId('season-canvas')).toBeInTheDocument()
})

it('a summer day has no particles but a summer night does', () => {
  stubMatchMedia(false)
  const { rerender } = render(<SeasonLayer season="summer" level="full" dark={false} />)
  expect(screen.queryByTestId('season-canvas')).toBeNull()
  rerender(<SeasonLayer season="summer" level="full" dark />)
  expect(screen.getByTestId('season-canvas')).toBeInTheDocument()
})

it('effects off keeps the colors and backdrop but nothing that moves', () => {
  stubMatchMedia(false)
  render(<SeasonLayer season="christmas" level="off" dark={false} />)
  expect(screen.getByTestId('season-layer')).toBeInTheDocument()
  expect(screen.queryByTestId('season-canvas')).toBeNull()
})

it('auto effects are full on a wide screen and light on a phone; a pick wins', () => {
  expect(effectLevel('auto', false)).toBe('full')
  expect(effectLevel('auto', true)).toBe('light')
  expect(effectLevel(undefined, true)).toBe('light')
  expect(effectLevel('off', false)).toBe('off')
  expect(effectLevel('full', true)).toBe('full')
})
