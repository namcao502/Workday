import { expect, it } from 'vitest'
import {
  createParticles,
  PARTICLE_STYLES,
  particleAlpha,
  particleCount,
  stepParticles,
  type Particle,
} from './particles.js'

const HALF: () => number = () => 0.5

it('fewer particles on a small screen, capped on a big one', () => {
  const [snow] = PARTICLE_STYLES.winter
  if (snow === undefined) {
    throw new Error('winter has a snow layer')
  }
  expect(particleCount(snow, 390, 844)).toBe(36)
  expect(particleCount(snow, 3840, 2160)).toBe(snow.maxCount)
  expect(createParticles(snow, 390, 844, 1, HALF)).toHaveLength(36)
  // The light level keeps 40% of them.
  expect(createParticles(snow, 390, 844, 0.4, HALF)).toHaveLength(14)
})

it('Christmas adds twinkling stars to the snow, Tet mixes mai flowers with peach petals', () => {
  expect(PARTICLE_STYLES.christmas.map((style) => style.shape)).toEqual(['flake', 'star'])
  expect(PARTICLE_STYLES.tet.map((style) => style.shape)).toEqual(['blossom', 'petal'])
})

it('a star dims and brightens with its phase; other shapes stay solid', () => {
  const base: Particle = {
    x: 0,
    y: 0,
    size: 3,
    speed: 0,
    sway: 0,
    phase: 0,
    angle: 0,
    spin: 0,
    color: 'gold',
  }
  expect(particleAlpha('star', base)).toBeCloseTo(0.35)
  expect(particleAlpha('star', { ...base, phase: Math.PI / 4 })).toBeCloseTo(1)
  expect(particleAlpha('flake', base)).toBe(1)
})

it('a flake falls and comes back at the top once it leaves the bottom', () => {
  const snow = PARTICLE_STYLES.winter[0]
  if (snow === undefined) {
    throw new Error('winter has a snow layer')
  }
  const flake: Particle = {
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
  const [fallen] = stepParticles([flake], snow, 800, 600, 1, HALF)
  expect(fallen?.y).toBe(90)
  const [reborn] = stepParticles([{ ...flake, y: 600 }], snow, 800, 600, 1, HALF)
  expect(reborn?.y).toBeLessThan(0)
  expect(reborn?.x).toBe(400)
})

it('a summer mote rises and comes back at the bottom', () => {
  const motes = PARTICLE_STYLES.summer[0]
  if (motes === undefined) {
    throw new Error('summer has a mote layer')
  }
  const mote: Particle = {
    x: 10,
    y: 0,
    size: 2,
    speed: 10,
    sway: 0,
    phase: 0,
    angle: 0,
    spin: 0,
    color: 'gold',
  }
  const [reborn] = stepParticles([mote], motes, 800, 600, 1, HALF)
  expect(reborn?.y).toBeGreaterThan(600)
})
