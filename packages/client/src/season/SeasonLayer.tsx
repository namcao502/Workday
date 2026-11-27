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
// over the panes (sparse, and they take no click). Reduced motion keeps the backdrop and drops the particles.
export function SeasonLayer({ season, level, dark }: SeasonLayerProps): React.JSX.Element | null {
  if (season === null) {
    return null
  }
  const reduced = prefersReducedMotion()
  const still = level !== 'full' || reduced
  const moving = level !== 'off' && !reduced && seasonStyles(season, dark).length !== 0
  return (
    <>
      <div
        key={season}
        aria-hidden="true"
        className="season-backdrop season-fade-in pointer-events-none fixed inset-0 -z-10"
        data-still={still ? 'true' : undefined}
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
    </>
  )
}
