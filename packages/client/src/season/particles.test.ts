import { expect, it } from 'vitest'
import {
  createParticles,
  particleAlpha,
  particleCount,
  seasonStyles,
  stepParticles,
  windAt,
  type Particle,
  type ParticleStyle,
} from './particles.js'

const HALF: () => number = () => 0.5

const BASE: Particle = {
  x: 100,
  y: 50,
  size: 2,
  speed: 40,
  sway: 0,
  phase: 0,
  angle: 0,
  spin: 0,
  color: 'white',
}

function only(styles: readonly ParticleStyle[]): ParticleStyle {
  const [style] = styles
  if (style === undefined) {
    throw new Error('expected a particle layer')
  }
  return style
}

it('fewer particles on a small screen, capped on a big one', () => {
  const snow = only(seasonStyles('winter', false))
  expect(particleCount(snow, 390, 844)).toBe(54)
  expect(particleCount(snow, 3840, 2160)).toBe(snow.maxCount)
  expect(createParticles(snow, 390, 844, 1, HALF)).toHaveLength(54)
  // The light level keeps 40% of them.
  expect(createParticles(snow, 390, 844, 0.4, HALF)).toHaveLength(21)
})

it('each season draws its own layers; a summer day has none, a summer night fireflies', () => {
  const shapes = (season: Parameters<typeof seasonStyles>[0], dark = false): readonly string[] =>
    seasonStyles(season, dark).map((style) => style.shape)
  expect(shapes('christmas')).toEqual(['flake', 'star'])
  expect(shapes('tet')).toEqual(['blossom', 'petal'])
  expect(shapes('midautumn')).toEqual(['glow', 'star'])
  expect(shapes('rain')).toEqual(['raindrop'])
  expect(shapes('summer')).toEqual([])
  expect(shapes('summer', true)).toEqual(['firefly'])
})

it('a star twinkles, a firefly blinks fully off, other shapes stay solid', () => {
  expect(particleAlpha('star', { ...BASE, phase: 0 })).toBeCloseTo(0.35)
  expect(particleAlpha('star', { ...BASE, phase: Math.PI / 4 })).toBeCloseTo(1)
  expect(particleAlpha('firefly', { ...BASE, phase: Math.PI })).toBe(0)
  expect(particleAlpha('flake', BASE)).toBe(1)
})

it('a flake falls and comes back at the top once it leaves the bottom', () => {
  const snow = only(seasonStyles('winter', false))
  const [fallen] = stepParticles([BASE], snow, 800, 600, 1, HALF)
  expect(fallen?.y).toBe(90)
  const [reborn] = stepParticles([{ ...BASE, y: 600 }], snow, 800, 600, 1, HALF)
  expect(reborn?.y).toBeLessThan(0)
  expect(reborn?.x).toBe(400)
})

it('a firefly rises and comes back at the bottom', () => {
  const fireflies = only(seasonStyles('summer', true))
  const [reborn] = stepParticles([{ ...BASE, y: 0, speed: 10 }], fireflies, 800, 600, 1, HALF)
  expect(reborn?.y).toBeGreaterThan(600)
})

it('gusts come every 14 s and fade out; only windy layers move with them', () => {
  expect(windAt(0)).toBe(0)
  expect(windAt(2)).toBeCloseTo(90)
  expect(windAt(6)).toBe(0)
  expect(windAt(16)).toBeCloseTo(90)
  const petals = only(seasonStyles('spring', false))
  const snow = only(seasonStyles('winter', false))
  const [blown] = stepParticles([BASE], petals, 800, 600, 1, HALF, 90)
  const [still] = stepParticles([BASE], snow, 800, 600, 1, HALF, 90)
  expect(blown?.x).toBe(190)
  expect(still?.x).toBe(100)
})

it('rain slants by its drift and a drop blown off one side comes back on the other', () => {
  const drops = only(seasonStyles('rain', false))
  const [slanted] = stepParticles([{ ...BASE, speed: 700 }], drops, 800, 2000, 0.1, HALF)
  expect(slanted?.x).toBeCloseTo(86)
  const [wrapped] = stepParticles([{ ...BASE, x: -15, speed: 700 }], drops, 800, 2000, 0.1, HALF)
  expect(wrapped?.x).toBeGreaterThan(800)
})
