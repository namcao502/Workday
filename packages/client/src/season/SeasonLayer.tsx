import type { Season } from '@workday/core'
import { useEffect, useRef } from 'react'
import { drawParticle } from './drawParticle.js'
import {
  createParticles,
  seasonStyles,
  stepParticles,
  windAt,
  type Particle,
  type ParticleStyle,
} from './particles.js'

// What a season draws besides its colors: nothing, a calmer light set, or everything.
export type EffectLevel = 'off' | 'light' | 'full'

const MAX_FRAME_SECONDS = 0.1 // a long pause (tab hidden) does not jump the particles
const LIGHT_DENSITY = 0.4

interface Layer {
  readonly style: ParticleStyle
  readonly particles: readonly Particle[]
}

// Keyed on season, theme and density (not on a styles array, which is new on every render and would
// restart the particles each time the app re-renders).
function Particles({
  season,
  dark,
  density,
}: {
  readonly season: Season
  readonly dark: boolean
  readonly density: number
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d') ?? null
    if (canvas === null || context === null) {
      return undefined
    }
    const styles = seasonStyles(season, dark)
    let width = window.innerWidth
    let height = window.innerHeight
    let layers: readonly Layer[] = []
    let frame = 0
    const start = performance.now()
    let last = start

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
      const wind = windAt((now - start) / 1000)
      layers = layers.map((layer) => ({
        style: layer.style,
        particles: stepParticles(
          layer.particles,
          layer.style,
          width,
          height,
          seconds,
          Math.random,
          wind,
        ),
      }))
      context.clearRect(0, 0, width, height)
      for (const layer of layers) {
        const speed = layer.style.speed[0] === 0 ? 1 : layer.style.speed[0]
        const slant = (layer.style.drift ?? 0) / speed
        for (const particle of layer.particles) {
          drawParticle(context, layer.style.shape, particle, slant)
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
  }, [season, dark, density])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      data-testid="season-canvas"
    />
  )
}

// Rain is the one season with nothing hung around the edges.
type GarlandSeason = Exclude<Season, 'rain'>

const GARLAND_ITEM: Readonly<Record<GarlandSeason, string>> = {
  christmas: 'garland-bulb',
  tet: 'garland-lantern',
  midautumn: 'garland-star',
  winter: 'garland-flake',
  spring: 'garland-flower',
  summer: 'garland-flag',
  autumn: 'garland-leaf',
}

// Colors cycled along the string; a season without a list draws its ornament in its CSS colors.
const GARLAND_COLORS: Readonly<Partial<Record<GarlandSeason, readonly string[]>>> = {
  christmas: ['#e5484d', '#f5c542', '#30a46c', '#3e8ef7'],
  midautumn: ['#e5484d', '#f5b82e'],
  winter: ['#8fb6e6', '#b9d4f2', '#6f9fd8'],
  spring: ['#f08aa6', '#f6b3c8', '#fbd3e0'],
  summer: ['#ff8a3d', '#ffd23f', '#2bb3a3', '#3e8ef7', '#e5484d'],
  autumn: ['#d6602a', '#e8963a', '#9c4a26', '#c9a227'],
}

// The top string runs the full width; each side only drops a short way (it fades out in CSS).
const GARLAND_EDGES = [
  { edge: 'top', count: 70 }, // long enough for a 2400px window; the frame clips the rest
  { edge: 'right', count: 8 },
  { edge: 'left', count: 8 },
] as const
const GARLAND_GAP_PX = 34
// The top wire sags between hooks three ornaments apart; season.css draws the same curve.
const SWAG_ITEMS = 3
const WIRE_TOP_PX = 4
const SWAG_SAG_PX = 6

function itemColor(season: GarlandSeason, index: number): string | undefined {
  const colors = GARLAND_COLORS[season]
  return colors === undefined ? undefined : colors[index % colors.length]
}

// Where an ornament hooks onto the wire: on the sagging top string, lower toward the middle of a swag.
function itemTop(edge: string, index: number): number {
  if (edge !== 'top') {
    return WIRE_TOP_PX + 1
  }
  const along = ((index % SWAG_ITEMS) + 0.5) / SWAG_ITEMS
  return WIRE_TOP_PX + 1 + Math.round(4 * SWAG_SAG_PX * along * (1 - along))
}

function hasGarland(season: Season): season is GarlandSeason {
  return season !== 'rain'
}

// A string draped along the top with a short drop down each side, its ornaments hanging inward: Christmas
// bulbs, Tet lanterns, star lanterns, snowflakes, blossoms, bunting or leaves. It takes no click; on the light
// level nothing swings.
function Garland({
  season,
  still,
}: {
  readonly season: GarlandSeason
  readonly still: boolean
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`season-garland pointer-events-none fixed inset-0 z-30 overflow-hidden ${still ? 'is-still' : ''}`}
      data-garland={season}
      data-testid="season-garland"
    >
      {GARLAND_EDGES.map(({ edge, count }, edgeIndex) => (
        <div key={edge} className="garland-edge" data-edge={edge}>
          {Array.from({ length: count }, (_, index) => {
            const color = itemColor(season, index + edgeIndex)
            // Only the middle of each swag moves: every animated ornament costs a style pass each frame.
            const lively = index % SWAG_ITEMS === 1
            return (
              <span
                key={index}
                className={`${GARLAND_ITEM[season]}${lively ? ' is-lively' : ''}`}
                style={{
                  left: `${String(index * GARLAND_GAP_PX + GARLAND_GAP_PX / 2)}px`,
                  top: `${String(itemTop(edge, index))}px`,
                  animationDelay: `${String(((index + edgeIndex * 3) % 7) * 0.37)}s`,
                  ...(color === undefined ? {} : { color }),
                }}
              />
            )
          })}
        </div>
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

interface SeasonLayerProps {
  readonly season: Season | null
  readonly level: EffectLevel
  readonly dark: boolean
}

// The season's backdrop behind every pane (it fades in when the season changes), its particles drifting
// over the panes (sparse, and they take no click), and the garland frame. Reduced motion drops the particles.
export function SeasonLayer({ season, level, dark }: SeasonLayerProps): React.JSX.Element | null {
  if (season === null) {
    return null
  }
  const reduced = prefersReducedMotion()
  const still = level === 'light' || reduced
  const moving = level !== 'off' && !reduced && seasonStyles(season, dark).length !== 0
  return (
    <>
      <div
        key={season}
        aria-hidden="true"
        className="season-backdrop season-fade-in pointer-events-none fixed inset-0 -z-10"
        data-still={still || level === 'off' ? 'true' : undefined}
        data-testid="season-layer"
      />
      {moving ? (
        <div
          key={`particles-${season}`}
          aria-hidden="true"
          className="season-fade-in pointer-events-none fixed inset-0 z-20"
        >
          <Particles season={season} dark={dark} density={level === 'full' ? 1 : LIGHT_DENSITY} />
        </div>
      ) : null}
      {level !== 'off' && hasGarland(season) ? <Garland season={season} still={still} /> : null}
    </>
  )
}
