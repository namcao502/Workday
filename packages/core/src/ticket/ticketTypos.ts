const KEY = /^([A-Z][A-Z0-9]*)-(\d+)$/i

interface SplitKey {
  readonly prefix: string
  readonly digits: string
}

function splitKey(key: string): SplitKey | null {
  const match = KEY.exec(key)
  const prefix = match?.[1]
  const digits = match?.[2]
  return prefix === undefined || digits === undefined
    ? null
    : { prefix: prefix.toUpperCase(), digits }
}

// 0 = neighbouring swap, 1 = one digit changed, 2 = one digit added or dropped; null = not one slip apart.
function typoRank(typed: string, candidate: string): 0 | 1 | 2 | null {
  if (typed.length === candidate.length) {
    const differing = Array.from(typed, (digit, index) =>
      digit === candidate[index] ? -1 : index,
    ).filter((index) => index >= 0)
    const [first, second] = differing
    if (differing.length === 1) {
      return 1
    }
    const isSwap =
      first !== undefined &&
      second !== undefined &&
      differing.length === 2 &&
      second === first + 1 &&
      typed[first] === candidate[second] &&
      typed[second] === candidate[first]
    return isSwap ? 0 : null
  }
  const [longer, shorter] =
    typed.length > candidate.length ? [typed, candidate] : [candidate, typed]
  if (longer.length - shorter.length !== 1) {
    return null
  }
  for (let drop = 0; drop < longer.length; drop += 1) {
    if (longer.slice(0, drop) + longer.slice(drop + 1) === shorter) {
      return 2
    }
  }
  return null
}

// Keys of the same prefix one typing slip from `key`: swaps first, then changed, then added or dropped digits; by key within a kind.
export function typoNeighbors(key: string, candidates: Iterable<string>): readonly string[] {
  const typed = splitKey(key)
  if (typed === null) {
    return []
  }
  const ranked: { readonly rank: number; readonly key: string }[] = []
  for (const candidate of new Set(candidates)) {
    const split = splitKey(candidate)
    if (split === null || split.prefix !== typed.prefix) {
      continue
    }
    const rank = typoRank(typed.digits, split.digits)
    if (rank !== null) {
      ranked.push({ rank, key: candidate })
    }
  }
  return ranked
    .sort(
      (left, right) =>
        left.rank - right.rank || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
    )
    .map((item) => item.key)
}
