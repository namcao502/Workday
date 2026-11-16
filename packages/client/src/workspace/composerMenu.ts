import type { AgentCommand } from '@workday/core'

const MAX_SUGGESTIONS = 8

export interface Suggestion {
  readonly key: string
  readonly insert: string // replaces the typed token
  readonly label: string
  readonly note: string
}

export interface ActiveToken {
  readonly kind: 'command' | 'file'
  readonly start: number // index of the "/" or "@"
  readonly query: string
}

// The "/command" at the very start, or the "@path" right before the caret; null when the caret is elsewhere.
export function activeToken(text: string, caret: number): ActiveToken | null {
  const before = text.slice(0, caret)
  const command = /^\/(\S*)$/.exec(before)
  if (command !== null) {
    return { kind: 'command', start: 0, query: command[1] ?? '' }
  }
  const file = /(?:^|\s)@(\S*)$/.exec(before)
  if (file !== null) {
    const query = file[1] ?? ''
    return { kind: 'file', start: caret - query.length - 1, query }
  }
  return null
}

function rank(name: string, query: string): number {
  const lower = name.toLowerCase()
  if (lower.startsWith(query)) {
    return 0
  }
  return lower.includes(query) ? 1 : 2
}

function best<T>(items: readonly T[], name: (item: T) => string, query: string): readonly T[] {
  const needle = query.toLowerCase()
  return items
    .map((item) => ({ item, rank: rank(name(item), needle) }))
    .filter((entry) => entry.rank !== 2)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.item)
}

export function commandSuggestions(
  commands: readonly AgentCommand[],
  query: string,
): readonly Suggestion[] {
  return best(commands, (command) => command.name, query).map((command) => ({
    key: command.name,
    insert: `/${command.name} `,
    label: `/${command.name}${command.hint === '' ? '' : ` ${command.hint}`}`,
    note: command.description,
  }))
}

export function fileSuggestions(paths: readonly string[], query: string): readonly Suggestion[] {
  return best(paths, (path) => path, query).map((path) => ({
    key: path,
    insert: `@${path} `,
    label: path,
    note: '',
  }))
}

// The text with the active token replaced by the chosen suggestion.
export function applySuggestion(
  text: string,
  caret: number,
  token: ActiveToken,
  suggestion: Suggestion,
): { readonly text: string; readonly caret: number } {
  const next = `${text.slice(0, token.start)}${suggestion.insert}${text.slice(caret)}`
  return { text: next, caret: token.start + suggestion.insert.length }
}
