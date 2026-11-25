export interface TicketCommitStats {
  readonly commits: number
  readonly files: number
  readonly added: number
  readonly deleted: number
}

type CommitsByTicket = Readonly<Record<string, TicketCommitStats>>

const RECORD_SEPARATOR = '\u001e'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Tally {
  commits: number
  added: number
  deleted: number
  readonly files: Set<string>
}

// "-" (binary file) is not a number: the file counts, its lines do not.
function lineCount(text: string): number {
  return /^\d+$/.test(text) ? Number(text) : 0
}

// Parses one repo's `git log --numstat` (records start with : hash, ref, unix time, numstat lines).
// A commit under two refs counts once.
export function parseNumstat(output: string, branchPrefix: string): CommitsByTicket {
  const keyInRef = new RegExp(`\\b${escapeRegExp(branchPrefix)}\\d+\\b`)
  const seenHashes = new Set<string>()
  const tallies = new Map<string, Tally>()

  for (const record of output.split(RECORD_SEPARATOR)) {
    const lines = record.split('\n').filter((line) => line !== '')
    const head = (lines[0] ?? '').split('\t')
    const [hash = '', ref = '', time = ''] = head
    if (head.length < 3 || !/^\d+$/.test(time.trim())) {
      continue
    }
    const ticketKey = keyInRef.exec(ref)?.[0]
    if (ticketKey === undefined || seenHashes.has(hash.trim())) {
      continue
    }
    seenHashes.add(hash.trim())

    const tally = tallies.get(ticketKey) ?? { commits: 0, added: 0, deleted: 0, files: new Set() }
    tally.commits += 1
    for (const line of lines.slice(1)) {
      const parts = line.split('\t')
      if (parts.length < 3) {
        continue
      }
      tally.files.add(parts.slice(2).join('\t').trim())
      tally.added += lineCount(parts[0] ?? '')
      tally.deleted += lineCount(parts[1] ?? '')
    }
    tallies.set(ticketKey, tally)
  }

  const stats: Record<string, TicketCommitStats> = {}
  for (const [ticketKey, tally] of tallies) {
    stats[ticketKey] = {
      commits: tally.commits,
      files: tally.files.size,
      added: tally.added,
      deleted: tally.deleted,
    }
  }
  return stats
}

// Each repository counts its own paths once and a path never repeats across repositories, so file counts add.
export function addCommits(left: CommitsByTicket, right: CommitsByTicket): CommitsByTicket {
  const total: Record<string, TicketCommitStats> = { ...left }
  for (const [ticketKey, added] of Object.entries(right)) {
    const existing = total[ticketKey]
    total[ticketKey] =
      existing === undefined
        ? added
        : {
            commits: existing.commits + added.commits,
            files: existing.files + added.files,
            added: existing.added + added.added,
            deleted: existing.deleted + added.deleted,
          }
  }
  return total
}
