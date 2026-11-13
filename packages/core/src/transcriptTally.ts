import {
  EMPTY_DAY_USAGE,
  addDayUsage,
  type AgentApiError,
  type AgentCompact,
  type AgentDayUsage,
  type AgentSkillRun,
  type AgentStats,
  type AgentToolUsage,
} from './agentStats.js'
import { todayIn } from './zonedDate.js'

type Json = Readonly<Record<string, unknown>>

const DEFAULT_WINDOW = 200_000
const LARGE_WINDOW = 1_000_000
const API_ERROR_TEXT_LENGTH = 200
const MILLISECONDS_PER_SECOND = 1000
// A line holding none of these is never parsed: most of a transcript is prompts, attachments and snapshots.
const PREFILTERS = [
  '"type":"assistant"',
  '"tool_result"',
  '"compact_boundary"',
  '"turn_duration"',
  '"type":"api-request"',
]

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(element: Json, name: string): string | null {
  const value = element[name]
  return typeof value === 'string' ? value : null
}

function int(element: Json, name: string): number | null {
  const value = element[name]
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function bool(element: Json, name: string): boolean | null {
  const value = element[name]
  return typeof value === 'boolean' ? value : null
}

function obj(element: Json, name: string): Json | null {
  const value = element[name]
  return isJson(value) ? value : null
}

function blocks(message: Json): readonly Json[] {
  const content = message['content']
  return Array.isArray(content) ? content.filter(isJson) : []
}

function parseLine(line: string): Json | null {
  if (!PREFILTERS.some((prefilter) => line.includes(prefilter))) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(line)
    return isJson(parsed) ? parsed : null
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return null // a cut or damaged line; the next one is independent
    }
    throw error
  }
}

function isoOf(root: Json): string | null {
  const text = str(root, 'timestamp')
  const milliseconds = text === null ? Number.NaN : Date.parse(text)
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString()
}

class Tally {
  private readonly toolCalls = new Map<string, number>()
  private readonly toolErrors = new Map<string, number>()
  private readonly toolNamesById = new Map<string, string>()
  private readonly compacts: AgentCompact[] = []
  private readonly skills: AgentSkillRun[] = []
  private readonly apiErrors: AgentApiError[] = []
  private readonly days = new Map<string, AgentDayUsage>()
  private lastMessageId: string | null = null
  private inputTokens = 0
  private outputTokens = 0
  private cacheReadTokens = 0
  private cacheWriteTokens = 0
  private turns = 0
  private turnMilliseconds = 0
  private lastContextTokens: number | null = null
  private maxContextTokens = 0
  private model: string | null = null
  private is1M = false
  private lastAt: string | null = null

  constructor(private readonly timeZone: string) {}

  addLine(line: string): void {
    const root = parseLine(line)
    if (root === null) {
      return
    }
    const timestamp = isoOf(root)
    const at = timestamp ?? this.lastAt
    if (this.addByType(root, str(root, 'type'), at)) {
      this.touch(timestamp)
    }
  }

  stats(): AgentStats {
    const tools: Record<string, AgentToolUsage> = {}
    for (const name of new Set([...this.toolCalls.keys(), ...this.toolErrors.keys()])) {
      tools[name] = { calls: this.toolCalls.get(name) ?? 0, errors: this.toolErrors.get(name) ?? 0 }
    }
    return {
      contextTokens: this.lastContextTokens,
      contextWindow:
        this.is1M || this.maxContextTokens > DEFAULT_WINDOW ? LARGE_WINDOW : DEFAULT_WINDOW,
      model: this.model,
      sessions: 1,
      turns: this.turns,
      turnSeconds: this.turnMilliseconds / MILLISECONDS_PER_SECOND,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cacheReadTokens: this.cacheReadTokens,
      cacheWriteTokens: this.cacheWriteTokens,
      compacts: this.compacts,
      skills: this.skills,
      subagents: [],
      tools,
      apiErrors: this.apiErrors,
      lastActivity: this.lastAt,
      days: Object.fromEntries(this.days),
    }
  }

  private addByType(root: Json, type: string | null, at: string | null): boolean {
    switch (type) {
      case 'assistant':
        this.addAssistant(root, at)
        return true
      case 'user':
        this.addUser(root)
        return true
      case 'system':
        return this.addSystem(root, str(root, 'subtype'), at)
      case 'api-request':
        this.addApiRequest(root)
        return true
      default:
        return false
    }
  }

  private touch(timestamp: string | null): void {
    if (timestamp !== null && (this.lastAt === null || timestamp > this.lastAt)) {
      this.lastAt = timestamp
    }
  }

  private addAssistant(root: Json, at: string | null): void {
    if (bool(root, 'isApiErrorMessage') === true) {
      this.addApiError(root, at)
      return
    }
    const message = obj(root, 'message')
    if (message === null) {
      return
    }
    const model = str(message, 'model')
    if (model === '<synthetic>') {
      return
    }
    const usage = obj(message, 'usage')
    if (usage !== null) {
      this.addUsage(root, message, usage, model, at)
    }
    for (const item of blocks(message)) {
      if (str(item, 'type') === 'tool_use') {
        this.addToolUse(item, at)
      }
    }
  }

  private addUsage(
    root: Json,
    message: Json,
    usage: Json,
    model: string | null,
    at: string | null,
  ): void {
    const input = int(usage, 'input_tokens') ?? 0
    const cacheRead = int(usage, 'cache_read_input_tokens') ?? 0
    const cacheWrite = int(usage, 'cache_creation_input_tokens') ?? 0
    const messageId = str(message, 'id')

    // Claude Code writes one line per content block of an API message, each repeating its usage.
    if (messageId === null || messageId !== this.lastMessageId) {
      const output = int(usage, 'output_tokens') ?? 0
      this.inputTokens += input
      this.cacheReadTokens += cacheRead
      this.cacheWriteTokens += cacheWrite
      this.outputTokens += output
      this.addToDay(at, {
        ...EMPTY_DAY_USAGE,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
      })
    }
    this.lastMessageId = messageId

    if (bool(root, 'isSidechain') !== true) {
      const context = input + cacheRead + cacheWrite
      this.lastContextTokens = context
      this.maxContextTokens = Math.max(this.maxContextTokens, context)
      this.model = model ?? this.model
    }
  }

  private addToolUse(item: Json, at: string | null): void {
    const name = str(item, 'name')
    if (name === null) {
      return
    }
    this.toolCalls.set(name, (this.toolCalls.get(name) ?? 0) + 1)
    const id = str(item, 'id')
    if (id !== null) {
      this.toolNamesById.set(id, name)
    }
    const input = obj(item, 'input')
    const skill = name === 'Skill' && input !== null ? str(input, 'skill') : null
    if (skill !== null && input !== null && at !== null) {
      this.skills.push({ at, skill, args: str(input, 'args') })
    }
  }

  private addApiError(root: Json, at: string | null): void {
    const message = obj(root, 'message')
    const textBlock =
      message === null ? undefined : blocks(message).find((b) => str(b, 'type') === 'text')
    const text = (textBlock === undefined ? null : str(textBlock, 'text')) ?? ''
    if (at !== null) {
      this.apiErrors.push({
        at,
        status: int(root, 'apiErrorStatus'),
        text: text.slice(0, API_ERROR_TEXT_LENGTH),
      })
    }
  }

  private addUser(root: Json): void {
    const message = obj(root, 'message')
    if (message === null) {
      return
    }
    for (const item of blocks(message)) {
      if (str(item, 'type') !== 'tool_result' || bool(item, 'is_error') !== true) {
        continue
      }
      const toolUseId = str(item, 'tool_use_id')
      const name = (toolUseId === null ? undefined : this.toolNamesById.get(toolUseId)) ?? '?'
      this.toolErrors.set(name, (this.toolErrors.get(name) ?? 0) + 1)
    }
  }

  private addSystem(root: Json, subtype: string | null, at: string | null): boolean {
    if (subtype === 'turn_duration') {
      const durationMs = int(root, 'durationMs') ?? 0
      this.turns += 1
      this.turnMilliseconds += durationMs
      this.addToDay(at, {
        ...EMPTY_DAY_USAGE,
        turns: 1,
        turnSeconds: durationMs / MILLISECONDS_PER_SECOND,
      })
      return true
    }
    const metadata = subtype === 'compact_boundary' ? obj(root, 'compactMetadata') : null
    if (metadata === null) {
      return false
    }
    const postTokens = int(metadata, 'postTokens') ?? 0
    if (at !== null) {
      this.compacts.push({
        at,
        isAuto: str(metadata, 'trigger') === 'auto',
        preTokens: int(metadata, 'preTokens') ?? 0,
        postTokens,
        durationMs: int(metadata, 'durationMs') ?? 0,
      })
    }
    this.lastContextTokens = postTokens
    return true
  }

  // A line with neither its own time nor an earlier one has no day; the session totals still count it.
  private addToDay(at: string | null, added: AgentDayUsage): void {
    if (at === null) {
      return
    }
    const day = todayIn(this.timeZone, new Date(at))
    this.days.set(day, addDayUsage(this.days.get(day) ?? EMPTY_DAY_USAGE, added))
  }

  private addApiRequest(root: Json): void {
    const params = obj(root, 'params')
    const betas = params === null ? null : params['betas']
    if (Array.isArray(betas)) {
      this.is1M = betas.some((beta) => typeof beta === 'string' && beta.includes('context-1m'))
    }
  }
}

// One session's transcript lines; a malformed or unneeded line is ignored. Days are keyed in `timeZone`.
export function tallyTranscript(lines: readonly string[], timeZone: string): AgentStats {
  const tally = new Tally(timeZone)
  for (const line of lines) {
    tally.addLine(line)
  }
  return tally.stats()
}
