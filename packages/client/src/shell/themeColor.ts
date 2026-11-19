// The installed app's title strip (and the window buttons drawn over the page once it is hidden) uses
// theme-color; it follows the page background so it matches the theme and season.
export function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]')
  const background = getComputedStyle(document.body).backgroundColor
  if (meta !== null && background !== '' && background !== 'rgba(0, 0, 0, 0)') {
    meta.setAttribute('content', background)
  }
}
