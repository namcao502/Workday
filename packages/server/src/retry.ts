const BASE_DELAY_MILLISECONDS = 200
const BACKOFF_FACTOR = 3
const MAX_JITTER_MILLISECONDS = 150
const MAX_CAUSE_DEPTH = 5

function isTransient(error: unknown, depth = 0): boolean {
  if (error instanceof TypeError) {
    return true
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return true
  }
  if (error instanceof Error && error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    return isTransient(error.cause, depth + 1)
  }
  return false
}

// Never retries on an HTTP status: a request is re-sent only when it most likely never arrived.
export async function retryTransient<Value>(
  operation: () => Promise<Value>,
  attempts = 3,
): Promise<Value> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error: unknown) {
      if (attempt >= attempts || !isTransient(error)) {
        throw error
      }
      const delay =
        BASE_DELAY_MILLISECONDS * BACKOFF_FACTOR ** (attempt - 1) +
        Math.floor(Math.random() * MAX_JITTER_MILLISECONDS)
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
}
