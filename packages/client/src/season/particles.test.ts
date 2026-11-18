import { expect, it } from 'vitest'
import {
  createParticles,
  PARTICLE_STYLES,
  particleCount,
  stepParticles,
  type Particle,
} from './particles.js'

const HALF: () => number = () => 0.5

it('fewer particles on a small screen, capped on a big one', () => {
  const snow = PARTICLE_STYLES.winter
  expect(particleCount(snow, 390, 844)).toBe(36)
  expect(particleCount(snow, 3840, 2160)).toBe(snow.maxCount)
  expect(createParticles(snow, 390, 844, HALF)).toHaveLength(36)
})

it('a flake falls and comes back at the top once it leaves the bottom', () => {
  const snow = PARTICLE_STYLES.winter
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
  const motes = PARTICLE_STYLES.summer
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
