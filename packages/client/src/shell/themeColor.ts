const TRANSPARENT = new Set(['', 'transparent', 'rgba(0, 0, 0, 0)'])

// The color the page shows: the body's, or the root's when a season leaves the body see-through.
function pageBackground(): string | null {
  for (const element of [document.body, document.documentElement]) {
    const color = getComputedStyle(element).backgroundColor
    if (!TRANSPARENT.has(color)) {
      return color
    }
  }
  return null
}

// Theme tokens are oklch; a canvas turns any CSS color into rgb, which every theme-color reader takes.
// Without a canvas (tests) the color is used as is.
function toRgb(color: string): string {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (context === null) {
    return color
  }
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data
  return `rgb(${String(red)}, ${String(green)}, ${String(blue)})`
}

// The installed app's title strip (and the window buttons drawn over the page once it is hidden) uses
// theme-color; it follows the page background so it matches the theme and season.
export function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]')
  const background = pageBackground()
  if (meta !== null && background !== null) {
    meta.setAttribute('content', toRgb(background))
  }
}
