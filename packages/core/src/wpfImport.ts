// Maps NOIS Workday (WPF) data onto Workday state. Added = taken from WPF, kept = Workday already had it.
// Malformed input is skipped, never thrown.
import type { BoardSection, BoardState, DismissedTicket } from './board.js'
import { postedKey } from './teamsPost.js'
import { MAX_PEOPLE, type TeamsPerson } from './teamsCompose.js'
import type { TeamsChannelIndex, TeamsIndexedPost, TeamsPostIndex } from './teamsPostIndex.js'
import type { Ticket } from './ticket.js'
import { isTicketKey } from './ticketKey.js'
import type { QueueEntry } from './timesheetQueue.js'
import { isTerminalName, MAX_RECENT_FOLDERS, type WorkspaceTab } from './workspaceTabs.js'

export interface MergeCount {
  readonly added: number
  readonly kept: number
}
export interface Merged<T> {
  readonly value: T
  readonly count: MergeCount
}
export interface MergedParts<T, Part extends string> {
  readonly value: T
  readonly counts: Readonly<Record<Part, MergeCount>>
}

/** The Teams marks the import fills; the server's TeamsState has exactly these. */
export interface WpfTeamsState {
  readonly seenAt: Readonly<Record<string, string>>
  readonly notifiedAt: Readonly<Record<string, string>>
  readonly postedAt: Readonly<Record<string, string>>
  readonly baselineDone: boolean
  readonly people: readonly TeamsPerson[]
}

/** The workspace fields the import fills; the server's WorkspaceState has exactly these. */
export interface WpfWorkspaceState {
  readonly tabs: readonly WorkspaceTab[]
  readonly sessionIds: Readonly<Record<string, string>>
  readonly recentFolders: readonly string[]
}

type Json = Readonly<Record<string, unknown>>
const NONE: MergeCount = { added: 0, kept: 0 }
const BOM = 0xfeff
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function entriesOf(value: unknown): [string, unknown][] {
  return isJson(value) ? Object.entries(value) : []
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item: unknown): item is string => typeof item === 'string' && item !== '')
    : []
}

function isoOf(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function count(added: number, kept: number): MergeCount {
  return { added, kept }
}

/** Text of a WPF JSON file (BOM allowed) parsed; null when it is not JSON. */
export function parseWpfJson(text: string): unknown {
  try {
    const body = text.codePointAt(0) === BOM ? text.slice(1) : text
    return JSON.parse(body) as unknown
  } catch {
    return null
  }
}

/** queue.json: days Workday lacks come in as an even split; a day Workday has is kept. */
export function mergeQueue(
  existing: readonly QueueEntry[],
  raw: unknown,
): Merged<readonly QueueEntry[]> {
  const rawEntries: unknown = isJson(raw) ? raw['entries'] : null
  const days = new Set(existing.map((entry) => entry.date))
  const added: QueueEntry[] = []
  let kept = 0
  for (const entry of Array.isArray(rawEntries) ? (rawEntries as unknown[]) : []) {
    if (!isJson(entry) || typeof entry['date'] !== 'string') {
      continue
    }
    const tickets = textList(entry['tickets'])
    if (tickets.length === 0 || !tickets.every(isTicketKey)) {
      continue
    }
    if (days.has(entry['date'])) {
      kept++
    } else {
      days.add(entry['date'])
      added.push({ date: entry['date'], tickets, minutes: null })
    }
  }
  return { value: [...existing, ...added], count: count(added.length, kept) }
}

function indexedPostOf(raw: unknown): TeamsIndexedPost | null {
  const sentAt = isJson(raw) ? isoOf(raw['sentAt']) : null
  if (!isJson(raw) || typeof raw['rootId'] !== 'string' || sentAt === null) {
    return null
  }
  return { rootId: raw['rootId'], sentAt, mine: raw['mine'] === true }
}

function channelOf(raw: unknown): TeamsChannelIndex | null {
  if (!isJson(raw)) {
    return null
  }
  const posts: [string, TeamsIndexedPost][] = []
  for (const [key, rawPost] of entriesOf(raw['posts'])) {
    const post = indexedPostOf(rawPost)
    if (post !== null) {
      posts.push([key, post])
    }
  }
  const pages = raw['deepScanPages']
  return {
    syncedAt: isoOf(raw['syncedAt']),
    deepScanned: raw['deepScanned'] === true,
    deepScanPages: typeof pages === 'number' ? pages : 0,
    deepScanLink: typeof raw['deepScanLink'] === 'string' ? raw['deepScanLink'] : null,
    posts: Object.fromEntries(posts),
  }
}

/** teams-posts.json: a channel Workday lacks comes whole; in a shared one Workday wins per ticket key (counts are posts). */
export function mergePostIndex(existing: TeamsPostIndex, raw: unknown): Merged<TeamsPostIndex> {
  const value: Record<string, TeamsChannelIndex> = { ...existing }
  let added = 0
  let kept = 0
  for (const [channelId, rawChannel] of entriesOf(raw)) {
    const channel = channelOf(rawChannel)
    if (channel === null) {
      continue
    }
    const own = Object.hasOwn(existing, channelId) ? existing[channelId] : undefined
    if (own === undefined) {
      value[channelId] = channel
      added += Object.keys(channel.posts).length
      continue
    }
    const fresh = Object.entries(channel.posts).filter(([key]) => !Object.hasOwn(own.posts, key))
    kept += Object.keys(channel.posts).length - fresh.length
    added += fresh.length
    if (fresh.length !== 0) {
      value[channelId] = { ...own, posts: { ...own.posts, ...Object.fromEntries(fresh) } }
    }
  }
  return { value, count: count(added, kept) }
}

function mergeLater(
  existing: Readonly<Record<string, string>>,
  raw: unknown,
): Merged<Readonly<Record<string, string>>> {
  const value: Record<string, string> = { ...existing }
  let added = 0
  let kept = 0
  for (const [key, rawTime] of entriesOf(raw)) {
    const time = isoOf(rawTime)
    if (time === null) {
      continue
    }
    const own = Object.hasOwn(existing, key) ? existing[key] : undefined
    if (own === undefined || Date.parse(time) > Date.parse(own)) {
      value[key] = time
      added++
    } else {
      kept++
    }
  }
  return { value, count: count(added, kept) }
}

// Only a plain ticket key counts: the WPF app also stores "<key>|db-review" marks Workday has no use for.
function mergePostedAt(
  existing: Readonly<Record<string, string>>,
  raw: unknown,
): Merged<Readonly<Record<string, string>>> {
  const wanted = entriesOf(raw).filter(([key]) => isTicketKey(key) && postedKey(key) === key)
  const value: Record<string, string> = { ...existing }
  let added = 0
  let kept = 0
  for (const [key, rawTime] of wanted) {
    const time = isoOf(rawTime)
    if (time === null) {
      continue
    }
    if (Object.hasOwn(existing, key)) {
      kept++
    } else {
      value[key] = time
      added++
    }
  }
  return { value, count: count(added, kept) }
}

function personsOf(raw: unknown): TeamsPerson[] {
  const people: TeamsPerson[] = []
  for (const item of Array.isArray(raw) ? (raw as unknown[]) : []) {
    if (
      isJson(item) &&
      typeof item['mri'] === 'string' &&
      typeof item['displayName'] === 'string'
    ) {
      people.push({ mri: item['mri'], displayName: item['displayName'] })
    }
  }
  return people
}

function mergePeople(
  existing: readonly TeamsPerson[],
  raw: unknown,
): Merged<readonly TeamsPerson[]> {
  const known = new Set(existing.map((person) => person.mri))
  const fresh: TeamsPerson[] = []
  let kept = 0
  for (const person of personsOf(raw)) {
    if (known.has(person.mri)) {
      kept++
    } else {
      known.add(person.mri)
      fresh.push(person)
    }
  }
  const room = Math.max(0, MAX_PEOPLE - existing.length)
  return {
    value: [...existing, ...fresh.slice(0, room)].slice(0, MAX_PEOPLE),
    count: count(Math.min(fresh.length, room), kept),
  }
}

/** Seen / notified marks take the later time, posted marks only fill, people append, the baseline flag ORs. */
export function mergeTeamsState<T extends WpfTeamsState>(
  existing: T,
  settings: unknown,
): MergedParts<T, 'seenAt' | 'notifiedAt' | 'postedAt' | 'people' | 'baselineDone'> {
  const raw: Json = isJson(settings) ? settings : {}
  const seen = mergeLater(existing.seenAt, raw['teamsSeenAt'])
  const notified = mergeLater(existing.notifiedAt, raw['teamsNotifiedAt'])
  const posted = mergePostedAt(existing.postedAt, raw['teamsPostedAt'])
  const people = mergePeople(existing.people, raw['teamsPeople'])
  const takeBaseline = raw['teamsAttentionBaselineDone'] === true && !existing.baselineDone
  return {
    value: {
      ...existing,
      seenAt: seen.value,
      notifiedAt: notified.value,
      postedAt: posted.value,
      people: people.value,
      baselineDone: existing.baselineDone || takeBaseline,
    },
    counts: {
      seenAt: seen.count,
      notifiedAt: notified.count,
      postedAt: posted.count,
      people: people.count,
      baselineDone: takeBaseline
        ? count(1, 0)
        : raw['teamsAttentionBaselineDone'] === true
          ? count(0, 1)
          : NONE,
    },
  }
}

/** Hidden "Available to take" tickets: the union. */
export function mergeHiddenSuggestions(
  existing: readonly string[],
  settings: unknown,
): Merged<readonly string[]> {
  const known = new Set(existing)
  const fresh = [
    ...new Set(textList(isJson(settings) ? settings['hiddenTicketSuggestions'] : null)),
  ].filter((key) => !known.has(key))
  const wanted = new Set(textList(isJson(settings) ? settings['hiddenTicketSuggestions'] : null))
  return { value: [...existing, ...fresh], count: count(fresh.length, wanted.size - fresh.length) }
}

/** settings.config.DEV_REPO_PATH fills only a null path. */
export function mergeDevRepoPath(
  existing: string | null,
  settings: unknown,
): Merged<string | null> {
  const config = isJson(settings) ? settings['config'] : null
  const path = isJson(config) ? config['DEV_REPO_PATH'] : null
  if (typeof path !== 'string' || path === '') {
    return { value: existing, count: NONE }
  }
  return existing === null
    ? { value: path, count: count(1, 0) }
    : { value: existing, count: count(0, 1) }
}

function extraSessions(id: string, raw: unknown): string[] {
  const names = textList(isJson(raw) ? raw[id] : null).filter(
    (name) => name !== id && name.startsWith(`${id}~`) && /^\d+$/.test(name.slice(id.length + 1)),
  )
  return [...new Set(names)]
}

function tabsOf(settings: Json): WorkspaceTab[] {
  const tabs: WorkspaceTab[] = []
  for (const key of new Set(textList(settings['openTicketTabs']))) {
    if (isTicketKey(key)) {
      const sessions = [key, ...extraSessions(key, settings['ticketClaudeTabs'])]
      tabs.push({ id: key, kind: 'ticket', folder: null, sessions })
    }
  }
  const rawTerminals: unknown = settings['terminalTabs']
  for (const item of Array.isArray(rawTerminals) ? (rawTerminals as unknown[]) : []) {
    const name = isJson(item) ? item['name'] : null
    if (typeof name !== 'string' || !isTerminalName(name) || tabs.some((tab) => tab.id === name)) {
      continue
    }
    const directory = (item as Json)['directory']
    const folder = typeof directory === 'string' && directory !== '' ? directory : null
    tabs.push({
      id: name,
      kind: 'terminal',
      folder,
      sessions: [name, ...extraSessions(name, settings['terminalClaudeTabs'])],
    })
  }
  return tabs
}

function mergeSessionIds(
  existing: Readonly<Record<string, string>>,
  raw: unknown,
): Merged<Readonly<Record<string, string>>> {
  const value: Record<string, string> = { ...existing }
  let added = 0
  let kept = 0
  for (const [key, id] of entriesOf(raw)) {
    if (!key.includes('|') || typeof id !== 'string' || !GUID.test(id)) {
      continue
    }
    if (Object.hasOwn(existing, key)) {
      kept++
    } else {
      value[key] = id
      added++
    }
  }
  return { value, count: count(added, kept) }
}

function mergeRecentFolders(existing: readonly string[], raw: unknown): Merged<readonly string[]> {
  const known = new Set(existing)
  const fresh: string[] = []
  let kept = 0
  for (const folder of new Set(textList(raw))) {
    if (known.has(folder)) {
      kept++
    } else {
      fresh.push(folder)
    }
  }
  const room = Math.max(0, MAX_RECENT_FOLDERS - existing.length)
  const taken = fresh.slice(0, room)
  return {
    value: [...existing, ...taken].slice(0, MAX_RECENT_FOLDERS),
    count: count(taken.length, kept),
  }
}

/** Tabs come only into an empty workspace; session ids union (Workday wins); recent folders append up to the cap. */
export function mergeWorkspace<T extends WpfWorkspaceState>(
  existing: T,
  settings: unknown,
): MergedParts<T, 'tabs' | 'sessionIds' | 'recentFolders'> {
  const raw: Json = isJson(settings) ? settings : {}
  const wpfTabs = tabsOf(raw)
  const takeTabs = existing.tabs.length === 0
  const sessionIds = mergeSessionIds(existing.sessionIds, raw['claudeSessionIds'])
  const folders = mergeRecentFolders(existing.recentFolders, raw['recentClaudeDirectories'])
  return {
    value: {
      ...existing,
      tabs: takeTabs ? wpfTabs : existing.tabs,
      sessionIds: sessionIds.value,
      recentFolders: folders.value,
    },
    counts: {
      tabs: takeTabs ? count(wpfTabs.length, 0) : count(0, wpfTabs.length),
      sessionIds: sessionIds.count,
      recentFolders: folders.count,
    },
  }
}

/** The parsed tasks/ files of the WPF app; each is null when the file is missing. */
export interface WpfBoardFiles {
  readonly pending: unknown // .jira-pending-queue.json
  readonly started: unknown // .jira-started-tickets.json
  readonly done: unknown // .jira-done-tickets.json
  readonly dismissed: unknown // .jira-dismissed-tickets.json
  readonly seen: unknown // .jira-assignment-seen.json
}

const SECTION_BY_ORIGIN: readonly BoardSection[] = ['new', 'inProgress', 'done']

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

// The WPF Jira models use PascalCase keys; a record without a valid Key is no ticket.
function ticketOf(raw: unknown): Ticket | null {
  if (!isJson(raw) || typeof raw['Key'] !== 'string' || !isTicketKey(raw['Key'])) {
    return null
  }
  return {
    key: raw['Key'],
    summary: textOrNull(raw['Summary']) ?? '',
    dueDate: textOrNull(raw['DueDate']),
    eta: textOrNull(raw['Eta']),
    devPriority: numberOrNull(raw['DevPriority']),
    status: textOrNull(raw['Status']),
    statusCategory: textOrNull(raw['StatusCategory']),
    issueType: textOrNull(raw['IssueType']),
    timeSpentSeconds: numberOrNull(raw['TimeSpentSeconds']),
    updated: textOrNull(raw['Updated']),
    parentKey: textOrNull(raw['ParentKey']),
  }
}

function isOnBoard(board: BoardState, key: string): boolean {
  return (
    Object.hasOwn(board.new, key) ||
    Object.hasOwn(board.inProgress, key) ||
    Object.hasOwn(board.done, key) ||
    Object.hasOwn(board.dismissed, key)
  )
}

/** Port of the old import script: a ticket already on the Workday board stays; seen keys union. */
export function mergeBoard(
  existing: BoardState,
  files: WpfBoardFiles,
): MergedParts<BoardState, 'new' | 'inProgress' | 'done' | 'dismissed' | 'seenKeys'> {
  const placed = new Set<string>()
  const counts = { new: NONE, inProgress: NONE, done: NONE, dismissed: NONE, seenKeys: NONE }
  const sections: Record<BoardSection, Record<string, Ticket>> = {
    new: { ...existing.new },
    inProgress: { ...existing.inProgress },
    done: { ...existing.done },
  }
  const sources: [BoardSection, unknown][] = [
    ['new', files.pending],
    ['inProgress', files.started],
    ['done', files.done],
  ]
  for (const [section, raw] of sources) {
    let added = 0
    let kept = 0
    for (const [, rawTicket] of entriesOf(raw)) {
      const ticket = ticketOf(rawTicket)
      if (ticket === null || placed.has(ticket.key)) {
        continue
      }
      placed.add(ticket.key)
      if (isOnBoard(existing, ticket.key)) {
        kept++
      } else {
        sections[section][ticket.key] = ticket
        added++
      }
    }
    counts[section] = count(added, kept)
  }
  const dismissed: Record<string, DismissedTicket> = { ...existing.dismissed }
  let added = 0
  let kept = 0
  for (const [, entry] of entriesOf(files.dismissed)) {
    const ticket = isJson(entry) ? ticketOf(entry['Ticket']) : null
    if (ticket === null || placed.has(ticket.key)) {
      continue
    }
    placed.add(ticket.key)
    if (isOnBoard(existing, ticket.key)) {
      kept++
    } else {
      const origin = SECTION_BY_ORIGIN[numberOrNull((entry as Json)['Origin']) ?? -1] ?? 'new'
      dismissed[ticket.key] = { ticket, origin }
      added++
    }
  }
  counts.dismissed = count(added, kept)
  const seen = new Set(existing.seenKeys ?? [])
  const freshSeen = [...new Set(textList(files.seen))].filter((key) => !seen.has(key))
  const wantedSeen = new Set(textList(files.seen)).size
  counts.seenKeys = count(freshSeen.length, wantedSeen - freshSeen.length)
  const seenKeys =
    existing.seenKeys === null && freshSeen.length === 0
      ? null
      : [...(existing.seenKeys ?? []), ...freshSeen]
  return { value: { ...sections, dismissed, seenKeys }, counts }
}
