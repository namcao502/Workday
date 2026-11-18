import type { Season } from '@workday/core'

// What falls (or drifts) behind the panes in each season; the canvas draws, this only moves numbers.
export type ParticleShape = 'flake' | 'petal' | 'leaf' | 'mote'

export interface Particle {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly speed: number // px per second, down (or up for a mote)
  readonly sway: number // sideways amplitude, px
  readonly phase: number // where in its sway, radians
  readonly angle: number
  readonly spin: number // radians per second
  readonly color: string
}

export interface ParticleStyle {
  readonly shape: ParticleShape
  readonly areaPerParticle: number // px^2 of screen per particle, so a phone gets fewer
  readonly maxCount: number
  readonly size: readonly [number, number]
  readonly speed: readonly [number, number]
  readonly sway: readonly [number, number]
  readonly spin: number
  readonly colors: readonly string[]
}

const SNOW: ParticleStyle = {
  shape: 'flake',
  areaPerParticle: 9000,
  maxCount: 140,
  size: [1.2, 3.6],
  speed: [18, 55],
  sway: [6, 22],
  spin: 0,
  colors: ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.75)'],
}

export const PARTICLE_STYLES: Readonly<Record<Season, ParticleStyle>> = {
  winter: SNOW,
  christmas: { ...SNOW, areaPerParticle: 12000, maxCount: 110 },
  spring: {
    shape: 'petal',
    areaPerParticle: 32000,
    maxCount: 40,
    size: [4, 7],
    speed: [20, 45],
    sway: [20, 50],
    spin: 1.2,
    colors: ['rgba(244,143,177,0.85)', 'rgba(248,187,208,0.85)', 'rgba(255,224,236,0.9)'],
  },
  summer: {
    shape: 'mote',
    areaPerParticle: 45000,
    maxCount: 26,
    size: [1.5, 3.5],
    speed: [6, 16],
    sway: [10, 30],
    spin: 0,
    colors: ['rgba(255,214,102,0.7)', 'rgba(255,236,170,0.6)'],
  },
  autumn: {
    shape: 'leaf',
    areaPerParticle: 38000,
    maxCount: 32,
    size: [6, 10],
    speed: [28, 60],
    sway: [25, 60],
    spin: 1.6,
    colors: ['rgba(214,96,40,0.85)', 'rgba(232,150,52,0.85)', 'rgba(156,74,38,0.8)'],
  },
}

export type Random = () => number

function between([low, high]: readonly [number, number], random: Random): number {
  return low + (high - low) * random()
}

function newParticle(style: ParticleStyle, width: number, y: number, random: Random): Particle {
  return {
    x: random() * width,
    y,
    size: between(style.size, random),
    speed: between(style.speed, random),
    sway: between(style.sway, random),
    phase: random() * Math.PI * 2,
    angle: random() * Math.PI * 2,
    spin: (random() - 0.5) * 2 * style.spin,
    color: style.colors[Math.floor(random() * style.colors.length)] ?? style.colors[0] ?? '#fff',
  }
}

export function particleCount(style: ParticleStyle, width: number, height: number): number {
  return Math.min(style.maxCount, Math.floor((width * height) / style.areaPerParticle))
}

// Spread over the whole screen at the start, so the first frame is not an empty sky.
export function createParticles(
  style: ParticleStyle,
  width: number,
  height: number,
  random: Random = Math.random,
): readonly Particle[] {
  return Array.from({ length: particleCount(style, width, height) }, () =>
    newParticle(style, width, random() * height, random),
  )
}

// One frame: fall (motes rise), sway, spin; a particle that leaves the screen comes back at the far edge.
export function stepParticles(
  particles: readonly Particle[],
  style: ParticleStyle,
  width: number,
  height: number,
  seconds: number,
  random: Random = Math.random,
): readonly Particle[] {
  const rising = style.shape === 'mote'
  return particles.map((particle) => {
    const y = particle.y + (rising ? -particle.speed : particle.speed) * seconds
    const gone = rising ? y < -particle.size * 2 : y > height + particle.size * 2
    if (gone) {
      return newParticle(style, width, rising ? height + particle.size : -particle.size, random)
    }
    const phase = particle.phase + seconds
    return {
      ...particle,
      y,
      phase,
      x: particle.x + Math.cos(phase) * particle.sway * seconds,
      angle: particle.angle + particle.spin * seconds,
    }
  })
}
