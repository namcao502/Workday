// Linear-time tag and attribute scanner: no regex may backtrack on hostile content.
// This runs on other people's messages, on the server's event loop.

export interface TagToken {
  readonly index: number
  readonly length: number
  readonly isClosing: boolean
  readonly name: string
  readonly attributes: string
}

interface TagScanner {
  readonly gt: readonly number[]
  readonly doubleQuote: readonly number[]
  readonly singleQuote: readonly number[]
  // Position outside a quote -> where the tag ends (index of '>') or -1; shared by every start that reaches it.
  readonly memo: Map<number, number>
}

function isLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57
}

function isNameStart(code: number): boolean {
  return isLetter(code) || code === 95 || code === 58
}

function isNameChar(code: number): boolean {
  return isNameStart(code) || isDigit(code) || code === 45 || code === 46
}

function isSpace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char)
}

// First position at or after `from`, or Infinity.
function firstAtOrAfter(positions: readonly number[], from: number): number {
  let low = 0
  let high = positions.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((positions[middle] ?? 0) < from) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low < positions.length ? (positions[low] ?? Infinity) : Infinity
}

function buildScanner(content: string): TagScanner {
  const gt: number[] = []
  const doubleQuote: number[] = []
  const singleQuote: number[] = []
  for (let index = 0; index < content.length; index++) {
    const code = content.charCodeAt(index)
    if (code === 62) {
      gt.push(index)
    } else if (code === 34) {
      doubleQuote.push(index)
    } else if (code === 39) {
      singleQuote.push(index)
    }
  }
  return { gt, doubleQuote, singleQuote, memo: new Map() }
}

function tagEnd(scanner: TagScanner, start: number): number {
  const visited: number[] = []
  let position = start
  let result = -1
  for (;;) {
    const known = scanner.memo.get(position)
    if (known !== undefined) {
      result = known
      break
    }
    visited.push(position)
    const gt = firstAtOrAfter(scanner.gt, position)
    const doubleQuote = firstAtOrAfter(scanner.doubleQuote, position)
    const singleQuote = firstAtOrAfter(scanner.singleQuote, position)
    const quote = Math.min(doubleQuote, singleQuote)
    if (gt < quote) {
      result = gt
      break
    }
    if (quote === Infinity) {
      break
    }
    const closer = firstAtOrAfter(
      quote === doubleQuote ? scanner.doubleQuote : scanner.singleQuote,
      quote + 1,
    )
    if (closer === Infinity) {
      break
    }
    position = closer + 1
  }
  for (const seen of visited) {
    scanner.memo.set(seen, result)
  }
  return result
}

/** Every `<name attrs>` / `</name>` in order, not overlapping; a quote must close before the tag does. */
export function tokenizeTags(content: string): readonly TagToken[] {
  const scanner = buildScanner(content)
  const tokens: TagToken[] = []
  let from = 0
  for (;;) {
    const open = content.indexOf('<', from)
    if (open === -1) {
      return tokens
    }
    from = open + 1
    const isClosing = content[from] === '/'
    const nameStart = isClosing ? from + 1 : from
    if (!isLetter(content.charCodeAt(nameStart))) {
      continue
    }
    let nameEnd = nameStart + 1
    while (isLetter(content.charCodeAt(nameEnd)) || isDigit(content.charCodeAt(nameEnd))) {
      nameEnd++
    }
    const end = tagEnd(scanner, nameEnd)
    if (end !== -1) {
      tokens.push({
        index: open,
        length: end + 1 - open,
        isClosing,
        name: content.slice(nameStart, nameEnd).toLowerCase(),
        attributes: content.slice(nameEnd, end),
      })
      from = end + 1
    }
  }
}

function attributeValueEnd(attributes: string, valueStart: number): [number, number] | null {
  const quote = attributes[valueStart]
  if (quote === '"' || quote === "'") {
    const close = attributes.indexOf(quote, valueStart + 1)
    return close === -1 ? null : [valueStart + 1, close]
  }
  let end = valueStart
  while (
    end < attributes.length &&
    !isSpace(attributes[end]) &&
    !'"\'>'.includes(attributes[end] ?? '')
  ) {
    end++
  }
  return end === valueStart ? null : [valueStart, end]
}

/** The value of the first attribute called `name` (lower case), or null. */
export function getAttribute(attributes: string, name: string): string | null {
  let index = 0
  while (index < attributes.length) {
    if (!isNameStart(attributes.charCodeAt(index))) {
      index++
      continue
    }
    let nameEnd = index + 1
    while (nameEnd < attributes.length && isNameChar(attributes.charCodeAt(nameEnd))) {
      nameEnd++
    }
    const attributeName = attributes.slice(index, nameEnd).toLowerCase()
    let cursor = nameEnd
    while (isSpace(attributes[cursor])) {
      cursor++
    }
    index = nameEnd
    if (attributes[cursor] !== '=') {
      continue
    }
    cursor++
    while (isSpace(attributes[cursor])) {
      cursor++
    }
    const value = attributeValueEnd(attributes, cursor)
    if (value === null) {
      continue
    }
    if (attributeName === name) {
      return attributes.slice(value[0], value[1])
    }
    index = value[1] + (attributes[value[1]] === '"' || attributes[value[1]] === "'" ? 1 : 0)
  }
  return null
}
