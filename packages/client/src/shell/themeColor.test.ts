import { afterEach, expect, it } from 'vitest'
import { syncThemeColor } from './themeColor.js'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.removeAttribute('style')
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

it('no meta tag or no background leaves things as they are', () => {
  expect(() => {
    syncThemeColor()
  }).not.toThrow()
  document.head.innerHTML = '<meta name="theme-color" content="#1c1c1e" />'
  syncThemeColor()
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#1c1c1e')
})
