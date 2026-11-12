import { afterEach, describe, expect, it, vi } from 'vitest'
import { retryTransient } from './retry.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('retryTransient', () => {
  it('retries a network error but not an HTTP error', async () => {
    vi.useFakeTimers()
    let networkCalls = 0
    const networkOperation = (): Promise<string> => {
      networkCalls += 1
      return networkCalls < 3
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve('done')
    }
    const pending = retryTransient(networkOperation)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toBe('done')
    expect(networkCalls).toBe(3)

    let httpCalls = 0
    const httpOperation = (): Promise<string> => {
      httpCalls += 1
      return Promise.reject(new Error('Streamable HTTP error: 500'))
    }
    await expect(retryTransient(httpOperation)).rejects.toThrow('500')
    expect(httpCalls).toBe(1)
  })

  it('retries an error whose cause is a network error', async () => {
    vi.useFakeTimers()
    let calls = 0
    const operation = (): Promise<string> => {
      calls += 1
      return calls === 1
        ? Promise.reject(new Error('wrapped', { cause: new TypeError('fetch failed') }))
        : Promise.resolve('ok')
    }
    const pending = retryTransient(operation)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toBe('ok')
  })

  it('retries a request timeout', async () => {
    vi.useFakeTimers()
    let calls = 0
    const operation = (): Promise<string> => {
      calls += 1
      return calls === 1
        ? Promise.reject(new DOMException('timed out', 'TimeoutError'))
        : Promise.resolve('ok')
    }
    const pending = retryTransient(operation)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toBe('ok')
  })

  it('gives up after the attempts and rethrows the last error', async () => {
    vi.useFakeTimers()
    let calls = 0
    const operation = (): Promise<string> => {
      calls += 1
      return Promise.reject(new TypeError('fetch failed'))
    }
    const pending = retryTransient(operation, 2)
    const assertion = expect(pending).rejects.toThrow('fetch failed')
    await vi.advanceTimersByTimeAsync(2000)
    await assertion
    expect(calls).toBe(2)
  })
})
