// One-time copy of NOIS Workday's Tasks board (%AppData%\NoisWorkday\tasks) into Workday's board.json.
// Run with the Workday server stopped: a running server would overwrite the file from memory.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'

const appData = process.env.APPDATA
if (appData === undefined) {
  throw new Error('APPDATA is not set; this script runs on Windows only')
}
const sourceDir = join(appData, 'NoisWorkday', 'tasks')
const targetDir = process.env.WORKDAY_DATA_DIR ?? join(appData, 'Workday')
const targetFile = join(targetDir, 'board.json')
const serverPort = Number(process.env.WORKDAY_PORT ?? 4870)
const SECTION_BY_ORIGIN = ['new', 'inProgress', 'done']

function readSource(name, fallback) {
  const file = join(sourceDir, name)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback
}

function toTicket(raw) {
  return {
    key: raw.Key,
    summary: raw.Summary ?? '',
    dueDate: raw.DueDate ?? null,
    eta: raw.Eta ?? null,
    devPriority: raw.DevPriority ?? null,
    status: raw.Status ?? null,
    statusCategory: raw.StatusCategory ?? null,
    issueType: raw.IssueType ?? null,
    timeSpentSeconds: raw.TimeSpentSeconds ?? null,
    updated: raw.Updated ?? null,
    parentKey: raw.ParentKey ?? null,
  }
}

function toTicketMap(raw) {
  return Object.fromEntries(Object.values(raw).map((ticket) => [ticket.Key, toTicket(ticket)]))
}

function isServerListening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      resolve(false)
    })
  })
}

if (await isServerListening(serverPort)) {
  throw new Error(
    `The Workday server is running on port ${serverPort}; stop it first, then run this again`,
  )
}

const current = existsSync(targetFile) ? JSON.parse(readFileSync(targetFile, 'utf8')) : {}
const dismissed = Object.fromEntries(
  Object.values(readSource('.jira-dismissed-tickets.json', {})).map((entry) => [
    entry.Ticket.Key,
    { ticket: toTicket(entry.Ticket), origin: SECTION_BY_ORIGIN[entry.Origin] ?? 'new' },
  ]),
)
// Union with Workday's own baseline so no ticket already assigned shows up as new.
const seenKeys = [
  ...new Set([...readSource('.jira-assignment-seen.json', []), ...(current.seenKeys ?? [])]),
]
const board = {
  new: toTicketMap(readSource('.jira-pending-queue.json', {})),
  inProgress: toTicketMap(readSource('.jira-started-tickets.json', {})),
  done: toTicketMap(readSource('.jira-done-tickets.json', {})),
  dismissed,
  seenKeys,
}

if (existsSync(targetFile)) {
  copyFileSync(targetFile, `${targetFile}.before-import`)
}
writeFileSync(targetFile, JSON.stringify(board, null, 2))
console.log(
  `Wrote ${targetFile}: new ${Object.keys(board.new).length}, working ${Object.keys(board.inProgress).length}, ` +
    `done ${Object.keys(board.done).length}, dismissed ${Object.keys(dismissed).length}, seen ${seenKeys.length}`,
)
