// Skill lines the app types by itself into a ticket's Claude (port of AutoLineQueue): per session, oldest first,
// each waiting until that Claude is free. A session with no lines left has no entry.
export type AutoLines = Readonly<Record<string, readonly string[]>>

export interface PrLineChange {
  readonly newComments: number
  readonly conflicted: boolean
}

// The same line twice waits once: it is about the PR as it is when it goes out, not about each check.
export function addAutoLine(lines: AutoLines, session: string, line: string): AutoLines {
  const waiting = lines[session] ?? []
  return waiting.includes(line) ? lines : { ...lines, [session]: [...waiting, line] }
}

export function nextAutoLine(lines: AutoLines, session: string): string | null {
  return lines[session]?.[0] ?? null
}

export function removeAutoLine(lines: AutoLines, session: string, line: string): AutoLines {
  const waiting = lines[session]
  if (waiting === undefined || !waiting.includes(line)) {
    return lines
  }
  const left = waiting.filter((item) => item !== line)
  return left.length === 0 ? dropAutoLines(lines, session) : { ...lines, [session]: left }
}

export function dropAutoLines(lines: AutoLines, session: string): AutoLines {
  if (!Object.hasOwn(lines, session)) {
    return lines
  }
  return Object.fromEntries(Object.entries(lines).filter(([key]) => key !== session))
}

// What a PR check hands to Claude: pr-comments for new comments, pr-refresh for a new conflict.
export function prChangeLines(ticketKey: string, change: PrLineChange): readonly string[] {
  return [
    ...(change.newComments === 0 ? [] : [`pr-comments ${ticketKey}`]),
    ...(change.conflicted ? [`pr-refresh ${ticketKey}`] : []),
  ]
}
