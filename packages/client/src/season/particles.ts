import type { Season } from '@workday/core'

// What falls (or drifts) behind the panes in each season; the canvas draws, this only moves numbers.
export type ParticleShape = 'flake' | 'petal' | 'leaf' | 'mote' | 'star' | 'blossom'

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

const STARS: ParticleStyle = {
  shape: 'star',
  areaPerParticle: 70000,
  maxCount: 18,
  size: [3, 5.5],
  speed: [8, 18],
  sway: [4, 10],
  spin: 0.4,
  colors: ['rgba(255,214,90,0.95)', 'rgba(255,245,200,0.95)'],
}

// One or more layers per season, drawn in order: Christmas is snow with a few gold stars, Tet yellow mai
// flowers with some pink peach petals.
export const PARTICLE_STYLES: Readonly<Record<Season, readonly ParticleStyle[]>> = {
  winter: [SNOW],
  christmas: [{ ...SNOW, areaPerParticle: 12000, maxCount: 110 }, STARS],
  spring: [
    {
      shape: 'petal',
      areaPerParticle: 32000,
      maxCount: 40,
      size: [4, 7],
      speed: [20, 45],
      sway: [20, 50],
      spin: 1.2,
      colors: ['rgba(244,143,177,0.85)', 'rgba(248,187,208,0.85)', 'rgba(255,224,236,0.9)'],
    },
  ],
  summer: [
    {
      shape: 'mote',
      areaPerParticle: 45000,
      maxCount: 26,
      size: [1.5, 3.5],
      speed: [6, 16],
      sway: [10, 30],
      spin: 0,
      colors: ['rgba(255,214,102,0.7)', 'rgba(255,236,170,0.6)'],
    },
  ],
  autumn: [
    {
      shape: 'leaf',
      areaPerParticle: 38000,
      maxCount: 32,
      size: [6, 10],
      speed: [28, 60],
      sway: [25, 60],
      spin: 1.6,
      colors: ['rgba(214,96,40,0.85)', 'rgba(232,150,52,0.85)', 'rgba(156,74,38,0.8)'],
    },
  ],
  tet: [
    {
      shape: 'blossom',
      areaPerParticle: 40000,
      maxCount: 28,
      size: [5, 8],
      speed: [18, 40],
      sway: [15, 40],
      spin: 0.9,
      colors: ['rgba(255,196,0,0.95)', 'rgba(255,214,64,0.95)'],
    },
    {
      shape: 'petal',
      areaPerParticle: 90000,
      maxCount: 14,
      size: [4, 6],
      speed: [20, 42],
      sway: [20, 45],
      spin: 1.2,
      colors: ['rgba(240,128,160,0.85)', 'rgba(250,180,200,0.85)'],
    },
  ],
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

// density: 1 for full effects, below 1 for the light level.
export function particleCount(
  style: ParticleStyle,
  width: number,
  height: number,
  density = 1,
): number {
  return Math.floor(
    Math.min(style.maxCount, Math.floor((width * height) / style.areaPerParticle)) * density,
  )
}

// Spread over the whole screen at the start, so the first frame is not an empty sky.
export function createParticles(
  style: ParticleStyle,
  width: number,
  height: number,
  density = 1,
  random: Random = Math.random,
): readonly Particle[] {
  return Array.from({ length: particleCount(style, width, height, density) }, () =>
    newParticle(style, width, random() * height, random),
  )
}

// How bright a particle is now: a star twinkles with its phase, the rest stay solid.
export function particleAlpha(shape: ParticleShape, particle: Particle): number {
  return shape === 'star' ? 0.35 + 0.65 * Math.abs(Math.sin(particle.phase * 2)) : 1
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
