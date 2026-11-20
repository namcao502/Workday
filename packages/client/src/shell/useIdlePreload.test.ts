import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIdlePreload } from './useIdlePreload.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useIdlePreload', () => {
  it('runs every loader once the fallback delay passes', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const first = vi.fn(async () => Promise.resolve())
    const second = vi.fn(async () => Promise.resolve())
    renderHook(() => {
      useIdlePreload([first, second])
    })
    expect(first).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })

  it('uses requestIdleCallback when the browser has it', () => {
    let idle: (() => void) | undefined
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle = callback
      return 1
    })
    const cancel = vi.fn()
    vi.stubGlobal('cancelIdleCallback', cancel)
    const load = vi.fn(async () => Promise.resolve())
    const { unmount } = renderHook(() => {
      useIdlePreload([load])
    })
    expect(load).not.toHaveBeenCalled()
    idle?.()
    expect(load).toHaveBeenCalledOnce()
    unmount()
    expect(cancel).toHaveBeenCalledWith(1)
  })

  it('a failing loader does not throw', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const load = vi.fn(async () => Promise.reject(new Error('offline')))
    renderHook(() => {
      useIdlePreload([load])
    })
    vi.advanceTimersByTime(2000)
    await vi.runAllTimersAsync()
    expect(load).toHaveBeenCalledOnce()
  })

  it('cancels the pending preload on unmount', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const load = vi.fn(async () => Promise.resolve())
    const { unmount } = renderHook(() => {
      useIdlePreload([load])
    })
    unmount()
    vi.advanceTimersByTime(2000)
    expect(load).not.toHaveBeenCalled()
  })
})
