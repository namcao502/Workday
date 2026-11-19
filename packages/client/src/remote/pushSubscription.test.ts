import { expect, it } from 'vitest'
import { shouldAdoptLocalPush } from './pushSubscription.js'

const START = 'http://127.0.0.1:4870'
const DEV = 'http://127.0.0.1:5173'

it('takes over desktop push when it is on for another origin and this one may notify', () => {
  expect(shouldAdoptLocalPush([DEV], START, 'granted')).toBe(true)
  expect(shouldAdoptLocalPush([''], START, 'granted')).toBe(true)
})

it('leaves it alone when push is off, already here, or not allowed on this origin', () => {
  expect(shouldAdoptLocalPush([], START, 'granted')).toBe(false)
  expect(shouldAdoptLocalPush([DEV, START], START, 'granted')).toBe(false)
  expect(shouldAdoptLocalPush([START], 'http://localhost:4870', 'granted')).toBe(false)
  expect(shouldAdoptLocalPush([DEV], START, 'default')).toBe(false)
})

it('the installed app takes push over unless it holds the newest subscription itself', () => {
  const APP = 'http://localhost:4870'
  // 127.0.0.1 is another origin to the browser: its worker cannot focus the app's window.
  expect(shouldAdoptLocalPush([START], APP, 'granted', true)).toBe(true)
  expect(shouldAdoptLocalPush([APP, START], APP, 'granted', true)).toBe(true)
  expect(shouldAdoptLocalPush([START, APP], APP, 'granted', true)).toBe(false)
  expect(shouldAdoptLocalPush([], APP, 'granted', true)).toBe(false)
  expect(shouldAdoptLocalPush([START], APP, 'default', true)).toBe(false)
})
