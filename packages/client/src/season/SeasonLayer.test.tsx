import { render, screen } from '@testing-library/react'
import type { Season } from '@workday/core'
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
  const canvas = screen.getByTestId('season-canvas')
  expect(layer).not.toContainElement(canvas)
  expect(canvas.parentElement).toHaveClass('z-20', 'pointer-events-none')
})

it('the garland drapes along the top and drops a short way down both sides; rain hangs none', () => {
  stubMatchMedia(false)
  const { rerender } = render(<SeasonLayer season="christmas" level="full" dark={false} />)
  const garland = screen.getByTestId('season-garland')
  const edges = [...garland.querySelectorAll('.garland-edge')].map((edge) =>
    edge.getAttribute('data-edge'),
  )
  expect(edges).toEqual(['top', 'right', 'left'])
  for (const edge of garland.querySelectorAll('.garland-edge')) {
    expect(edge.querySelector('.garland-bulb')).not.toBeNull()
  }
  // The top string sags between hooks: the middle ornament of a swag hangs lower than its neighbours.
  const top = [...garland.querySelectorAll<HTMLElement>('[data-edge="top"] .garland-bulb')]
  const [first, middle, third] = top.map((item) => Number.parseFloat(item.style.top))
  expect(middle).toBeGreaterThan(first ?? 0)
  expect(third).toBe(first)
  // Only the middle ornament of each swag twinkles or swings: each moving one costs a style pass a frame.
  const lively = garland.querySelectorAll('[data-edge="top"] .is-lively')
  expect(lively.length).toBe(Math.floor(top.length / 3))
  expect(top[1]).toHaveClass('is-lively')
  // The sides are short drops, not full-height strings.
  const side = garland.querySelectorAll('[data-edge="left"] .garland-bulb')
  expect(side.length).toBeLessThan(top.length / 4)
  const ornaments: readonly (readonly [Season, string])[] = [
    ['winter', 'garland-flake'],
    ['spring', 'garland-flower'],
    ['summer', 'garland-flag'],
    ['autumn', 'garland-leaf'],
  ]
  for (const [season, ornament] of ornaments) {
    rerender(<SeasonLayer season={season} level="full" dark={false} />)
    expect(screen.getByTestId('season-garland').querySelector(`.${ornament}`)).not.toBeNull()
  }
  rerender(<SeasonLayer season="rain" level="full" dark={false} />)
  expect(screen.queryByTestId('season-garland')).toBeNull()
})

it('keeps the backdrop but no falling particles when the system asks for reduced motion', () => {
  stubMatchMedia(true)
  render(<SeasonLayer season="christmas" level="full" dark={false} />)
  expect(screen.getByTestId('season-layer')).toBeInTheDocument()
  expect(screen.queryByTestId('season-canvas')).toBeNull()
  expect(screen.getByTestId('season-garland')).toHaveClass('is-still')
})

it('Christmas hangs twinkling bulbs, Tet swinging lanterns, the light level keeps them still', () => {
  stubMatchMedia(false)
  const { rerender } = render(<SeasonLayer season="christmas" level="full" dark={false} />)
  const garland = screen.getByTestId('season-garland')
  expect(garland).toHaveAttribute('data-garland', 'christmas')
  expect(garland).not.toHaveClass('is-still')
  expect(garland.querySelector('.garland-bulb')).not.toBeNull()

  rerender(<SeasonLayer season="tet" level="light" dark={false} />)
  const tet = screen.getByTestId('season-garland')
  expect(tet.querySelector('.garland-lantern')).not.toBeNull()
  expect(tet).toHaveClass('is-still')
})

it('Mid-Autumn hangs star lanterns; a summer day has no particles but a summer night does', () => {
  stubMatchMedia(false)
  const { rerender } = render(<SeasonLayer season="midautumn" level="full" dark={false} />)
  expect(screen.getByTestId('season-garland').querySelector('.garland-star')).not.toBeNull()
  rerender(<SeasonLayer season="summer" level="full" dark={false} />)
  expect(screen.queryByTestId('season-canvas')).toBeNull()
  rerender(<SeasonLayer season="summer" level="full" dark />)
  expect(screen.getByTestId('season-canvas')).toBeInTheDocument()
})

it('effects off keeps the colors and backdrop but nothing that moves or hangs', () => {
  stubMatchMedia(false)
  render(<SeasonLayer season="christmas" level="off" dark={false} />)
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
