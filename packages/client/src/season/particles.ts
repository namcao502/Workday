import type { Season } from '@workday/core'

// What falls (or drifts) behind the panes in each season; the canvas draws, this only moves numbers.
export type ParticleShape =
  'flake' | 'petal' | 'leaf' | 'star' | 'blossom' | 'firefly' | 'glow' | 'raindrop'

export interface Particle {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly speed: number // px per second, down (or up for a rising shape)
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
  readonly windy?: boolean // pushed by the passing gusts
  readonly drift?: number // steady sideways px per second (slanting rain)
  readonly outline?: string // an edge drawn round each one, so a white shape shows on a light backdrop
}

// Fireflies and lantern glows float up; everything else falls.
const RISING: ReadonlySet<ParticleShape> = new Set<ParticleShape>(['firefly', 'glow'])

const SNOW: ParticleStyle = {
  shape: 'flake',
  areaPerParticle: 6000,
  maxCount: 220,
  size: [2, 6],
  speed: [18, 55],
  sway: [6, 22],
  spin: 0.3,
  colors: ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.52)'], // see-through: the flakes drift over text
}

// On a light backdrop: whiter flakes with a thin blue-grey edge, else they vanish into the near-white sky.
const LIGHT_SNOW: ParticleStyle = {
  ...SNOW,
  colors: ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0.85)'],
  outline: 'rgba(80,110,155,0.55)',
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

const PETALS: ParticleStyle = {
  shape: 'petal',
  areaPerParticle: 26000,
  maxCount: 48,
  size: [6, 10],
  speed: [20, 45],
  sway: [20, 50],
  spin: 1.2,
  colors: ['rgba(240,128,166,0.9)', 'rgba(246,170,196,0.9)', 'rgba(252,206,222,0.95)'],
  windy: true,
}

const LEAVES: ParticleStyle = {
  shape: 'leaf',
  areaPerParticle: 34000,
  maxCount: 34,
  size: [9, 14],
  speed: [28, 60],
  sway: [25, 60],
  spin: 1.6,
  colors: ['rgba(214,96,40,0.9)', 'rgba(232,150,52,0.9)', 'rgba(156,74,38,0.85)'],
  windy: true,
}

const FIREFLIES: ParticleStyle = {
  shape: 'firefly',
  areaPerParticle: 40000,
  maxCount: 30,
  size: [1.6, 2.8],
  speed: [4, 12],
  sway: [20, 45],
  spin: 0,
  colors: ['rgba(214,255,120,1)', 'rgba(255,240,140,1)'],
}

const LANTERN_GLOWS: ParticleStyle = {
  shape: 'glow',
  areaPerParticle: 60000,
  maxCount: 18,
  size: [3, 6],
  speed: [10, 22],
  sway: [8, 20],
  spin: 0,
  colors: ['rgba(255,170,70,0.9)', 'rgba(255,120,60,0.85)', 'rgba(255,214,120,0.9)'],
}

function rain(dark: boolean): ParticleStyle {
  return {
    shape: 'raindrop',
    areaPerParticle: 6500,
    maxCount: 170,
    size: [10, 20], // streak length
    speed: [650, 950],
    sway: [0, 0],
    spin: 0,
    colors: dark
      ? ['rgba(190,210,240,0.35)', 'rgba(220,230,250,0.25)']
      : ['rgba(70,95,130,0.32)', 'rgba(90,115,150,0.22)'],
    drift: -140,
  }
}

// One or more layers per season, drawn in order. A summer day has none (sun rays are CSS), a summer night
// has fireflies; Christmas is snow with gold stars, Tet mai flowers with peach petals.
export function seasonStyles(season: Season, dark: boolean): readonly ParticleStyle[] {
  switch (season) {
    case 'winter':
      return [dark ? SNOW : LIGHT_SNOW]
    case 'christmas':
      return [{ ...(dark ? SNOW : LIGHT_SNOW), areaPerParticle: 8000, maxCount: 170 }, STARS]
    case 'spring':
      return [PETALS]
    case 'summer':
      return dark ? [FIREFLIES] : []
    case 'autumn':
      return [LEAVES]
    case 'tet':
      return [
        {
          shape: 'blossom',
          areaPerParticle: 40000,
          maxCount: 28,
          size: [5, 8],
          speed: [18, 40],
          sway: [15, 40],
          spin: 0.9,
          colors: ['rgba(255,196,0,0.95)', 'rgba(255,214,64,0.95)'],
          windy: true,
        },
        { ...PETALS, areaPerParticle: 90000, maxCount: 14 },
      ]
    case 'midautumn':
      return [LANTERN_GLOWS, { ...STARS, areaPerParticle: 90000, maxCount: 12 }]
    case 'rain':
      return [rain(dark)]
  }
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

// How bright a particle is now: a star twinkles, a firefly blinks on and off, the rest stay solid.
export function particleAlpha(shape: ParticleShape, particle: Particle): number {
  if (shape === 'star') {
    return 0.35 + 0.65 * Math.abs(Math.sin(particle.phase * 2))
  }
  if (shape === 'firefly') {
    return Math.max(0, Math.sin(particle.phase * 1.5)) ** 2
  }
  return 1
}

const GUST_EVERY_SECONDS = 14
const GUST_SECONDS = 4
const GUST_PX_PER_SECOND = 90

// A gust every 14 s that rises and falls over 4 s; between gusts the air is still.
export function windAt(seconds: number): number {
  const into = seconds % GUST_EVERY_SECONDS
  return into < GUST_SECONDS ? Math.sin((Math.PI * into) / GUST_SECONDS) * GUST_PX_PER_SECOND : 0
}

// One frame: fall (or rise), sway, drift with the wind, spin; a particle that leaves the screen at the top
// or bottom comes back at the far edge, and one blown off a side comes back on the other.
export function stepParticles(
  particles: readonly Particle[],
  style: ParticleStyle,
  width: number,
  height: number,
  seconds: number,
  random: Random = Math.random,
  wind = 0,
): readonly Particle[] {
  const rising = RISING.has(style.shape)
  const sideways = (style.windy === true ? wind : 0) + (style.drift ?? 0)
  return particles.map((particle) => {
    const y = particle.y + (rising ? -particle.speed : particle.speed) * seconds
    const gone = rising ? y < -particle.size * 2 : y > height + particle.size * 2
    if (gone) {
      return newParticle(style, width, rising ? height + particle.size : -particle.size, random)
    }
    const phase = particle.phase + seconds
    const moved = particle.x + (Math.cos(phase) * particle.sway + sideways) * seconds
    const x = moved < -20 ? moved + width + 40 : moved > width + 20 ? moved - width - 40 : moved
    return { ...particle, y, phase, x, angle: particle.angle + particle.spin * seconds }
  })
}
