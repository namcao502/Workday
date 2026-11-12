import { describe, expect, it } from 'vitest'
import { BrowserLock } from './browserLock.js'

describe('BrowserLock', () => {
  it('browserLock rejects a second holder until released', () => {
    const lock = new BrowserLock()
    const release = lock.tryAcquire()
    expect(release).not.toBeNull()
    expect(lock.tryAcquire()).toBeNull()
    release?.()
    expect(lock.tryAcquire()).not.toBeNull()
  })

  it('releasing twice does not free a later holder', () => {
    const lock = new BrowserLock()
    const first = lock.tryAcquire()
    first?.()
    const second = lock.tryAcquire()
    first?.()
    expect(lock.tryAcquire()).toBeNull()
    second?.()
  })
})
