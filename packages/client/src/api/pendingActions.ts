// The actions (requests other than reads) in flight, by path: the bell spins for them and lists them by name.
let pending: readonly string[] = [] // replaced, never changed in place, so a snapshot stays stable
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

export function pendingActions(): readonly string[] {
  return pending
}

export async function trackAction<Result>(
  path: string,
  run: () => Promise<Result>,
): Promise<Result> {
  pending = [...pending, path]
  notify()
  try {
    return await run()
  } finally {
    const at = pending.indexOf(path)
    pending = pending.filter((_, index) => index !== at)
    notify()
  }
}
