import { expect, it } from 'vitest'
import { drawParticle } from './drawParticle.js'
import type { Particle } from './particles.js'

const FLAKE: Particle = {
  x: 10,
  y: 10,
  size: 2,
  speed: 0,
  sway: 0,
  phase: 0,
  angle: 0,
  spin: 0,
  color: 'white',
}

// Records the color of every fill and stroke the drawing makes.
function recorder(): { context: CanvasRenderingContext2D; painted: string[] } {
  const painted: string[] = []
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', globalAlpha: 1 }
  const noop = (): void => undefined
  const context = {
    ...state,
    beginPath: noop,
    arc: noop,
    moveTo: noop,
    lineTo: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    fill(this: typeof state) {
      painted.push(`fill ${this.fillStyle}`)
    },
    stroke(this: typeof state) {
      painted.push(`stroke ${this.strokeStyle}`)
    },
  }
  return { context: context as unknown as CanvasRenderingContext2D, painted }
}

it('draws an outlined flake as a white dot with its edge, and a plain one with the soft halo', () => {
  const outlined = recorder()
  drawParticle(outlined.context, 'flake', FLAKE, 0, 'blue')
  expect(outlined.painted).toEqual(['fill white', 'stroke blue'])

  const plain = recorder()
  drawParticle(plain.context, 'flake', FLAKE)
  expect(plain.painted).toEqual(['fill rgba(70, 100, 140, 0.15)', 'fill white'])
})

it('draws an outlined crystal over a wider stroke of its edge color', () => {
  const big = recorder()
  drawParticle(big.context, 'flake', { ...FLAKE, size: 5 }, 0, 'blue')
  expect(big.painted).toEqual(['stroke blue', 'stroke white'])
})
