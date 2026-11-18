import type { Season } from '@workday/core'
import { useEffect, useRef } from 'react'
import {
  createParticles,
  PARTICLE_STYLES,
  particleAlpha,
  stepParticles,
  type Particle,
  type ParticleShape,
  type ParticleStyle,
} from './particles.js'

// What a season draws besides its colors: nothing, a calmer light set, or everything.
export type EffectLevel = 'off' | 'light' | 'full'

const MAX_FRAME_SECONDS = 0.1 // a long pause (tab hidden) does not jump the particles
const LIGHT_DENSITY = 0.4
const FLAKE_HALO = 'rgba(70, 100, 140, 0.18)'
const BLOSSOM_CENTER = 'rgba(200, 90, 20, 0.9)'
const STAR_POINTS = 4
const BLOSSOM_PETALS = 5

function drawStar(context: CanvasRenderingContext2D, p: Particle): void {
  // A four-point sparkle: long points, a narrow waist.
  for (let index = 0; index < STAR_POINTS * 2; index += 1) {
    const radius = index % 2 === 0 ? p.size : p.size * 0.32
    const angle = p.angle + (index * Math.PI) / STAR_POINTS
    const x = p.x + Math.cos(angle) * radius
    const y = p.y + Math.sin(angle) * radius
    if (index === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  }
  context.closePath()
}

function drawBlossom(context: CanvasRenderingContext2D, p: Particle): void {
  // Five round petals around a darker heart, as a mai flower.
  for (let index = 0; index < BLOSSOM_PETALS; index += 1) {
    const angle = p.angle + (index * 2 * Math.PI) / BLOSSOM_PETALS
    const x = p.x + Math.cos(angle) * p.size * 0.55
    const y = p.y + Math.sin(angle) * p.size * 0.55
    context.moveTo(x + p.size * 0.45, y)
    context.arc(x, y, p.size * 0.45, 0, Math.PI * 2)
  }
  context.fill()
  context.fillStyle = BLOSSOM_CENTER
  context.beginPath()
  context.arc(p.x, p.y, p.size * 0.22, 0, Math.PI * 2)
}

function drawParticle(context: CanvasRenderingContext2D, shape: ParticleShape, p: Particle): void {
  context.globalAlpha = particleAlpha(shape, p)
  if (shape === 'flake') {
    // A faint cool halo keeps a white flake visible on a light backdrop.
    context.fillStyle = FLAKE_HALO
    context.beginPath()
    context.arc(p.x, p.y, p.size + 0.9, 0, Math.PI * 2)
    context.fill()
  }
  context.fillStyle = p.color
  context.beginPath()
  if (shape === 'flake' || shape === 'mote') {
    context.arc(p.x, p.y, p.size, 0, Math.PI * 2)
  } else if (shape === 'star') {
    drawStar(context, p)
  } else if (shape === 'blossom') {
    drawBlossom(context, p)
  } else {
    // A petal is a short oval, a leaf a longer one; both turn as they fall.
    const length = shape === 'leaf' ? p.size : p.size * 0.8
    context.ellipse(p.x, p.y, length, length * 0.5, p.angle, 0, Math.PI * 2)
  }
  context.fill()
  context.globalAlpha = 1
}

interface Layer {
  readonly style: ParticleStyle
  readonly particles: readonly Particle[]
}

function Particles({
  season,
  density,
}: {
  readonly season: Season
  readonly density: number
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d') ?? null
    if (canvas === null || context === null) {
      return undefined
    }
    const styles = PARTICLE_STYLES[season]
    let width = window.innerWidth
    let height = window.innerHeight
    let layers: readonly Layer[] = []
    let frame = 0
    let last = performance.now()

    function resize(): void {
      if (canvas === null || context === null) {
        return
      }
      const ratio = window.devicePixelRatio || 1
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      layers = styles.map((style) => ({
        style,
        particles: createParticles(style, width, height, density),
      }))
    }

    function tick(now: number): void {
      if (context === null) {
        return
      }
      const seconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
      last = now
      layers = layers.map((layer) => ({
        style: layer.style,
        particles: stepParticles(layer.particles, layer.style, width, height, seconds),
      }))
      context.clearRect(0, 0, width, height)
      for (const layer of layers) {
        for (const particle of layer.particles) {
          drawParticle(context, layer.style.shape, particle)
        }
      }
      frame = requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [season, density])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      data-testid="season-canvas"
    />
  )
}

const CHRISTMAS_BULBS = ['#e5484d', '#f5c542', '#30a46c', '#3e8ef7'] as const
const GARLAND_GAP_PX = 34
const GARLAND_COUNT = 70 // wide enough for a 2400px window; the strip clips the rest

// A string along the top edge: Christmas bulbs or small Tet lanterns. It hangs over the panes but takes no
// click; on the light level it does not twinkle or swing.
function Garland({
  season,
  still,
}: {
  readonly season: 'christmas' | 'tet'
  readonly still: boolean
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`season-garland pointer-events-none fixed inset-x-0 top-0 z-30 overflow-hidden ${still ? 'is-still' : ''}`}
      data-garland={season}
      data-testid="season-garland"
    >
      {Array.from({ length: GARLAND_COUNT }, (_, index) => (
        <span
          key={index}
          className={season === 'christmas' ? 'garland-bulb' : 'garland-lantern'}
          style={{
            left: `${String(index * GARLAND_GAP_PX + GARLAND_GAP_PX / 2)}px`,
            animationDelay: `${String((index % 7) * 0.37)}s`,
            ...(season === 'christmas'
              ? { color: CHRISTMAS_BULBS[index % CHRISTMAS_BULBS.length] }
              : {}),
          }}
        />
      ))}
    </div>
  )
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// The season's backdrop, its falling particles behind every pane, and the Christmas or Tet garland.
// Reduced motion keeps the garland still and drops the particles.
export function SeasonLayer({
  season,
  level,
}: {
  readonly season: Season | null
  readonly level: EffectLevel
}): React.JSX.Element | null {
  if (season === null) {
    return null
  }
  const reduced = prefersReducedMotion()
  const moving = level !== 'off' && !reduced
  return (
    <>
      <div
        aria-hidden="true"
        className="season-backdrop pointer-events-none fixed inset-0 -z-10"
        data-testid="season-layer"
      >
        {moving ? (
          <Particles season={season} density={level === 'full' ? 1 : LIGHT_DENSITY} />
        ) : null}
      </div>
      {level !== 'off' && (season === 'christmas' || season === 'tet') ? (
        <Garland season={season} still={level === 'light' || reduced} />
      ) : null}
    </>
  )
}
