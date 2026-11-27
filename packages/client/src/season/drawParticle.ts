import { particleAlpha, type Particle, type ParticleShape } from './particles.js'

// Canvas drawing for each particle shape; particles.ts moves them, this only paints one frame.

const FLAKE_HALO = 'rgba(70, 100, 140, 0.15)'
const CRYSTAL_FROM = 4.2 // a flake this big or bigger is drawn as a six-arm crystal, smaller as a dot
const BLOSSOM_CENTER = 'rgba(200, 90, 20, 0.9)'
const LEAF_VEIN = 'rgba(90, 40, 15, 0.55)'
const STAR_POINTS = 4
const BLOSSOM_PETALS = 5
const CRYSTAL_ARMS = 6

// Draw in the particle's own frame: origin at its center, x along its angle.
function inFrame(context: CanvasRenderingContext2D, p: Particle, draw: () => void): void {
  context.save()
  context.translate(p.x, p.y)
  context.rotate(p.angle)
  draw()
  context.restore()
}

function drawFlake(context: CanvasRenderingContext2D, p: Particle): void {
  // A faint cool halo keeps a white flake visible on a light backdrop.
  context.fillStyle = FLAKE_HALO
  context.beginPath()
  context.arc(p.x, p.y, p.size + 1.2, 0, Math.PI * 2)
  context.fill()
  if (p.size < CRYSTAL_FROM) {
    context.fillStyle = p.color
    context.beginPath()
    context.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    context.fill()
    return
  }
  inFrame(context, p, () => {
    context.strokeStyle = p.color
    context.lineWidth = 1.4
    context.lineCap = 'round'
    context.beginPath()
    for (let arm = 0; arm < CRYSTAL_ARMS; arm += 1) {
      const angle = (arm * Math.PI * 2) / CRYSTAL_ARMS
      const tipX = Math.cos(angle) * p.size * 1.6
      const tipY = Math.sin(angle) * p.size * 1.6
      context.moveTo(0, 0)
      context.lineTo(tipX, tipY)
      // A short twig on each arm, two thirds out.
      const midX = tipX * 0.6
      const midY = tipY * 0.6
      context.moveTo(midX, midY)
      context.lineTo(
        midX + Math.cos(angle + 0.8) * p.size * 0.5,
        midY + Math.sin(angle + 0.8) * p.size * 0.5,
      )
      context.moveTo(midX, midY)
      context.lineTo(
        midX + Math.cos(angle - 0.8) * p.size * 0.5,
        midY + Math.sin(angle - 0.8) * p.size * 0.5,
      )
    }
    context.stroke()
  })
}

function drawStar(context: CanvasRenderingContext2D, p: Particle): void {
  // A four-point sparkle: long points, a narrow waist.
  context.fillStyle = p.color
  context.beginPath()
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
  context.fill()
}

function drawBlossom(context: CanvasRenderingContext2D, p: Particle): void {
  // Five round petals around a darker heart, as a mai flower.
  context.fillStyle = p.color
  context.beginPath()
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
  context.fill()
}

function drawPetal(context: CanvasRenderingContext2D, p: Particle): void {
  // A cherry petal: round at the base, a notch at the tip.
  inFrame(context, p, () => {
    const length = p.size
    const width = p.size * 0.55
    context.fillStyle = p.color
    context.beginPath()
    context.moveTo(-length / 2, 0)
    context.quadraticCurveTo(-length / 4, -width, length / 2, -width * 0.35)
    context.lineTo(length * 0.38, 0)
    context.lineTo(length / 2, width * 0.35)
    context.quadraticCurveTo(-length / 4, width, -length / 2, 0)
    context.fill()
  })
}

function drawLeaf(context: CanvasRenderingContext2D, p: Particle): void {
  // An almond leaf with a stem and a midrib.
  inFrame(context, p, () => {
    const length = p.size
    const width = p.size * 0.45
    context.fillStyle = p.color
    context.beginPath()
    context.moveTo(-length / 2, 0)
    context.bezierCurveTo(-length / 4, -width, length / 4, -width, length / 2, 0)
    context.bezierCurveTo(length / 4, width, -length / 4, width, -length / 2, 0)
    context.fill()
    context.strokeStyle = LEAF_VEIN
    context.lineWidth = 0.8
    context.beginPath()
    context.moveTo(-length / 2 - length * 0.18, 0)
    context.lineTo(length * 0.42, 0)
    context.stroke()
  })
}

function drawGlow(context: CanvasRenderingContext2D, p: Particle, haloScale: number): void {
  // A bright core fading into a soft halo: a firefly, or a lantern's light far off.
  const radius = p.size * haloScale
  const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius)
  gradient.addColorStop(0, p.color)
  gradient.addColorStop(0.25, p.color)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(p.x, p.y, radius, 0, Math.PI * 2)
  context.fill()
}

function drawRaindrop(context: CanvasRenderingContext2D, p: Particle, slant: number): void {
  // A streak along the fall, leaning with the drift.
  context.strokeStyle = p.color
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(p.x, p.y)
  context.lineTo(p.x - slant * p.size, p.y - p.size)
  context.stroke()
}

// slant: sideways px per px of fall, so a streak leans the way the rain drifts.
export function drawParticle(
  context: CanvasRenderingContext2D,
  shape: ParticleShape,
  p: Particle,
  slant = 0,
): void {
  context.globalAlpha = particleAlpha(shape, p)
  switch (shape) {
    case 'flake':
      drawFlake(context, p)
      break
    case 'star':
      drawStar(context, p)
      break
    case 'blossom':
      drawBlossom(context, p)
      break
    case 'petal':
      drawPetal(context, p)
      break
    case 'leaf':
      drawLeaf(context, p)
      break
    case 'firefly':
      drawGlow(context, p, 4)
      break
    case 'glow':
      drawGlow(context, p, 3)
      break
    case 'raindrop':
      drawRaindrop(context, p, slant)
      break
  }
  context.globalAlpha = 1
}
