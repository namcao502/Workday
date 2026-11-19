import { afterEach, expect, it } from 'vitest'
import { syncThemeColor } from './themeColor.js'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
})

it('the window title strip takes the page background, so the window buttons sit on the theme', () => {
  document.head.innerHTML = '<meta name="theme-color" content="#1c1c1e" />'
  document.body.style.backgroundColor = 'rgb(250, 248, 245)'
  syncThemeColor()
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    'rgb(250, 248, 245)',
  )
})

it('a season leaves the body see-through, so the color comes from the page root', () => {
  document.head.innerHTML = '<meta name="theme-color" content="#1c1c1e" />'
  document.documentElement.style.backgroundColor = 'rgb(247, 247, 247)'
  syncThemeColor()
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    'rgb(247, 247, 247)',
  )
})

it('no meta tag or no background leaves things as they are', () => {
  expect(() => {
    syncThemeColor()
  }).not.toThrow()
  document.head.innerHTML = '<meta name="theme-color" content="#1c1c1e" />'
  syncThemeColor()
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#1c1c1e')
})

it('an unchanged color is not written again, so the browser never repaints the window frames for nothing', () => {
  document.head.innerHTML = '<meta name="theme-color" content="rgb(250, 248, 245)" />'
  document.body.style.backgroundColor = 'rgb(250, 248, 245)'
  const meta = document.querySelector('meta[name="theme-color"]')
  const writes: MutationRecord[] = []
  const observer = new MutationObserver((records) => writes.push(...records))
  if (meta !== null) {
    observer.observe(meta, { attributes: true })
  }
  syncThemeColor()
  syncThemeColor()
  writes.push(...observer.takeRecords())
  observer.disconnect()
  expect(writes).toEqual([])
})
