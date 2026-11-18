import type { Season } from '@workday/core'
import { useEffect, useRef } from 'react'
import {
  createParticles,
  PARTICLE_STYLES,
  stepParticles,
  type Particle,
  type ParticleShape,
} from './particles.js'

const MAX_FRAME_SECONDS = 0.1 // a long pause (tab hidden) does not jump the particles

const FLAKE_HALO = 'rgba(70, 100, 140, 0.18)'

function drawParticle(context: CanvasRenderingContext2D, shape: ParticleShape, p: Particle): void {
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
  } else {
    // A petal is a short oval, a leaf a longer one; both turn as they fall.
    const length = shape === 'leaf' ? p.size : p.size * 0.8
    context.ellipse(p.x, p.y, length, length * 0.5, p.angle, 0, Math.PI * 2)
  }
  context.fill()
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function Particles({ season }: { readonly season: Season }): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d') ?? null
    if (canvas === null || context === null) {
      return undefined
    }
    const style = PARTICLE_STYLES[season]
    let width = window.innerWidth
    let height = window.innerHeight
    let particles: readonly Particle[] = []
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
      particles = createParticles(style, width, height)
    }

    function tick(now: number): void {
      if (context === null) {
        return
      }
      const seconds = Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
      last = now
      particles = stepParticles(particles, style, width, height, seconds)
      context.clearRect(0, 0, width, height)
      for (const particle of particles) {
        drawParticle(context, style.shape, particle)
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
  }, [season])

  return reduced ? null : (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      data-testid="season-canvas"
    />
  )
}

// The season's backdrop and its falling particles, behind every pane; it never takes a click.
export function SeasonLayer({
  season,
}: {
  readonly season: Season | null
}): React.JSX.Element | null {
  if (season === null) {
    return null
  }
  return (
    <div
      aria-hidden="true"
      className="season-backdrop pointer-events-none fixed inset-0 -z-10"
      data-testid="season-layer"
    >
      <Particles season={season} />
    </div>
  )
}
