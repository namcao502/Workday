// How many actions (requests other than reads) are in flight, for the global loading icon.
let pending = 0
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function pendingActions(): number {
  return pending
}

export async function trackAction<Result>(run: () => Promise<Result>): Promise<Result> {
  pending += 1
  notify()
  try {
    return await run()
  } finally {
    pending -= 1
    notify()
  }
}
