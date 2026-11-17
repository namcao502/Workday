// Turns a Claude Code transcript (JSONL lines) into chat rows. Pure: the server reads the file.

import type { ChatRequest } from './agentRequests.js'
import type { AgentCatalog, AgentMode, AgentUsage } from './ports/claudeAgent.js'

export interface ToolEdit {
  readonly oldText: string // empty for a Write
  readonly newText: string
}

export interface ChatTodo {
  readonly text: string
  readonly status: 'pending' | 'in_progress' | 'completed'
}

export interface ChatMessage {
  readonly id: number // line byte offset * 100 + block index, stable while the file grows
  readonly role: 'user' | 'assistant' | 'tool' | 'notice'
  readonly text: string | null
  readonly toolName: string | null
  readonly toolDetail: string | null
  readonly isError: boolean
  readonly at: string | null
  readonly uuid: string | null // a prompt's id, the point a file rewind goes back to
  readonly status: 'running' | 'background' | null
  readonly output: string | null // the tool's result text, cut to MAX_OUTPUT_LENGTH
  readonly edit: ToolEdit | null // what an Edit or Write changed
  readonly todos: readonly ChatTodo[] | null // the list a TodoWrite set
}

export interface ChatView {
  readonly messages: readonly ChatMessage[]
  readonly hasMore: boolean
  readonly working: boolean
  readonly requests: readonly ChatRequest[]
  readonly running: boolean
  readonly mode: AgentMode
  readonly model: string | null
  readonly contextTokens: number | null // prompt size of the last reply, from the transcript
  readonly branch: string | null // filled by the route from git
  readonly added: number
  readonly removed: number
  readonly catalog: AgentCatalog | null // models and slash commands; null until a session has run
  readonly usage: AgentUsage | null // read from a live session; null before the first reading
}

type Json = Readonly<Record<string, unknown>>

const MAX_DETAIL_LENGTH = 120
const MAX_NOTICE_LENGTH = 1500
const MAX_OUTPUT_LENGTH = 3000
const DETAIL_KEYS = [
  'file_path',
  'notebook_path',
  'command',
  'pattern',
  'url',
  'skill',
  'description',
  'prompt',
]
const HIDDEN_TEXT_PREFIXES = [
  '<system-reminder>',
  '<local-command-stdout>',
  '<local-command-caveat>',
]
const INTERRUPT_MARKER = '[Request interrupted'
const COMMAND_NAME = /<command-name>(.*?)<\/command-name>/s
const COMMAND_ARGS = /<command-args>(.*?)<\/command-args>/s
const SUMMARY = /<summary>(.*?)<\/summary>/s
const NOTIFIED_TOOL = /<tool-use-id>(.*?)<\/tool-use-id>/s
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(element: unknown, name: string): string | null {
  if (!isJson(element)) {
    return null
  }
  const value = element[name]
  return typeof value === 'string' ? value : null
}

function flag(element: unknown, name: string): boolean {
  return isJson(element) && element[name] === true
}

function num(element: unknown, name: string): number {
  if (!isJson(element)) {
    return 0
  }
  const value = element[name]
  return typeof value === 'number' ? value : 0
}

// Whitespace runs to one space, cut to MAX_DETAIL_LENGTH.
function oneLine(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim()
  return line.length <= MAX_DETAIL_LENGTH ? line : `${line.slice(0, MAX_DETAIL_LENGTH - 3)}...`
}

function toolDetail(input: unknown, cwd: string | null): string | null {
  if (!isJson(input)) {
    return null
  }
  for (const key of DETAIL_KEYS) {
    let value = str(input, key)
    if (value === null || value.trim() === '') {
      continue
    }
    if (key === 'file_path' && cwd !== null && cwd !== '') {
      const prefix = `${cwd.replace(/[\\/]+$/, '').replaceAll('\\', '/')}/`.toLowerCase()
      if (value.replaceAll('\\', '/').toLowerCase().startsWith(prefix)) {
        value = value.slice(prefix.length)
      }
    }
    return oneLine(value)
  }
  return null
}

// Null for text the chat does not show: empty, injected reminders, local command output.
function userText(text: string): string | null {
  const name = COMMAND_NAME.exec(text)
  if (name !== null) {
    const args = COMMAND_ARGS.exec(text)
    return `${(name[1] ?? '').trim()} ${args === null ? '' : (args[1] ?? '').trim()}`.trim()
  }
  const trimmed = text.trim()
  if (trimmed === '' || HIDDEN_TEXT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return null
  }
  return text
}

function originKind(root: Json): string | null {
  return str(root['origin'], 'kind')
}

// A person's prompt line: not a tool result, not injected, not from an agent or a notification.
function isPrompt(root: Json, type: string | null): boolean {
  if (type !== 'user' || flag(root, 'isSidechain') || flag(root, 'isMeta')) {
    return false
  }
  const message = root['message']
  if (!isJson(message) || !('content' in message)) {
    return false
  }
  const kind = originKind(root)
  if (kind !== null && kind !== 'human') {
    return false
  }
  const content = message['content']
  if (typeof content === 'string') {
    return true
  }
  return (
    Array.isArray(content) &&
    content.every((block) => str(block, 'type') !== 'tool_result') &&
    content.some((block) => str(block, 'type') === 'text')
  )
}

// A tool_result's text: its content string, or its text blocks joined.
function resultText(block: unknown): string {
  const content = isJson(block) ? block['content'] : null
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .filter((item) => str(item, 'type') === 'text')
    .map((item) => str(item, 'text') ?? '')
    .join('\n')
}

function cut(text: string, max: number): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}
...`
}

function toolEdit(name: string | null, input: unknown): ToolEdit | null {
  if (name === 'Edit') {
    const newText = str(input, 'new_string')
    return newText === null
      ? null
      : {
          oldText: cut(str(input, 'old_string') ?? '', MAX_OUTPUT_LENGTH),
          newText: cut(newText, MAX_OUTPUT_LENGTH),
        }
  }
  const content = name === 'Write' ? str(input, 'content') : null
  return content === null ? null : { oldText: '', newText: cut(content, MAX_OUTPUT_LENGTH) }
}

const TODO_STATUSES: ReadonlySet<string> = new Set(['pending', 'in_progress', 'completed'])

function toolTodos(name: string | null, input: unknown): readonly ChatTodo[] | null {
  const list = name === 'TodoWrite' && isJson(input) ? input['todos'] : null
  if (!Array.isArray(list)) {
    return null
  }
  return list.flatMap((item): ChatTodo[] => {
    const text = str(item, 'content')
    const status = str(item, 'status')
    return text === null || status === null || !TODO_STATUSES.has(status)
      ? []
      : [{ text, status: status as ChatTodo['status'] }]
  })
}

function make(
  id: number,
  role: ChatMessage['role'],
  at: string | null,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    role,
    text: null,
    toolName: null,
    toolDetail: null,
    isError: false,
    at,
    uuid: null,
    status: null,
    output: null,
    edit: null,
    todos: null,
    ...extra,
  }
}

function notice(id: number, text: string, at: string | null, isError: boolean): ChatMessage | null {
  const shown = text.replace(ANSI, '').trim()
  if (shown === '') {
    return null
  }
  const cut = shown.length > MAX_NOTICE_LENGTH ? `${shown.slice(0, MAX_NOTICE_LENGTH)}...` : shown
  return make(id, 'notice', at, { text: cut, isError })
}

// Compaction and any other system line that carries text; local commands are not shown.
function systemNotice(root: Json, id: number, at: string | null): ChatMessage | null {
  const subtype = str(root, 'subtype')
  if (subtype === 'compact_boundary') {
    let text = str(root, 'content') ?? 'Conversation compacted'
    const meta = root['compactMetadata']
    if (isJson(meta) && num(meta, 'preTokens') !== 0) {
      const before = Math.floor(num(meta, 'preTokens') / 1000)
      const after = Math.floor(num(meta, 'postTokens') / 1000)
      text += ` (${String(before)}k -> ${String(after)}k tokens)`
    }
    return notice(id, text, at, false)
  }
  const content = str(root, 'content')
  return subtype === 'local_command' || content === null ? null : notice(id, content, at, false)
}

function apiErrorText(root: Json): string | null {
  const message = root['message']
  if (!isJson(message) || !('content' in message)) {
    return null
  }
  const content = message['content']
  const text = typeof content === 'string' ? content : resultText(message)
  return text.trim() === '' ? null : text.trim()
}

export function parseTranscript(
  lines: readonly string[],
  offsets: readonly number[],
  cwd: string | null,
): readonly ChatMessage[] {
  const messages: ChatMessage[] = []
  const toolIndexById = new Map<string, number>()
  const backgroundToolIds = new Set<string>()
  const offsetByUuid = new Map<string, number>()
  let lastPromptOffset = -1
  let currentUuid: string | null = null

  function addUserText(text: string | null, id: number, at: string | null): void {
    const shown = text === null ? null : userText(text)
    if (shown !== null) {
      // Claude writes the Stop marker as a user line; it is not something the person typed.
      const role = shown.startsWith(INTERRUPT_MARKER) ? 'notice' : 'user'
      messages.push(make(id, role, at, { text: shown, uuid: role === 'user' ? currentUuid : null }))
    }
  }

  function addBlocks(
    content: readonly unknown[],
    isAssistant: boolean,
    idStart: number,
    at: string | null,
  ): void {
    content.forEach((block, blockIndex) => {
      const blockType = str(block, 'type')
      const id = idStart + blockIndex
      if (!isAssistant && blockType === 'image') {
        addUserText('[Image]', id, at)
      } else if (blockType === 'text') {
        const text = str(block, 'text')
        if (!isAssistant) {
          addUserText(text, id, at)
        } else if (text !== null && text.trim() !== '') {
          messages.push(make(id, 'assistant', at, { text }))
        }
      } else if (isAssistant && blockType === 'tool_use') {
        const input = isJson(block) ? block['input'] : null
        const toolUseId = str(block, 'id')
        if (toolUseId !== null) {
          toolIndexById.set(toolUseId, messages.length)
          if (flag(input, 'run_in_background')) {
            backgroundToolIds.add(toolUseId)
          }
        }
        const toolName = str(block, 'name')
        messages.push(
          make(id, 'tool', at, {
            toolName,
            toolDetail: toolDetail(input, cwd),
            status: 'running',
            edit: toolEdit(toolName, input),
            todos: toolTodos(toolName, input),
          }),
        )
      } else if (!isAssistant && blockType === 'tool_result') {
        const toolUseId = str(block, 'tool_use_id')
        const index = toolUseId === null ? undefined : toolIndexById.get(toolUseId)
        const tool = index === undefined ? undefined : messages[index]
        if (toolUseId !== null && index !== undefined && tool !== undefined) {
          // A background launch answers at once; the step runs on until its task notification.
          const isBackground =
            backgroundToolIds.has(toolUseId) || resultText(block).startsWith('Async agent launched')
          const isError = flag(block, 'is_error')
          const output = resultText(block).trim()
          messages[index] = {
            ...tool,
            isError,
            status: isBackground && !isError ? 'background' : null,
            output: output === '' ? null : cut(output, MAX_OUTPUT_LENGTH),
          }
        }
      }
    })
  }

  function rewind(parentOffset: number): void {
    const kept = messages.findIndex((message) => message.id >= (parentOffset + 1) * 100)
    if (kept < 0) {
      return
    }
    messages.splice(kept)
    for (const [toolId, index] of [...toolIndexById]) {
      if (index >= kept) {
        toolIndexById.delete(toolId)
      }
    }
  }

  function addTaskNotification(content: string, id: number, at: string | null): void {
    const notified = NOTIFIED_TOOL.exec(content)
    const index = notified === null ? undefined : toolIndexById.get(notified[1] ?? '')
    const tool = index === undefined ? undefined : messages[index]
    if (index !== undefined && tool !== undefined) {
      messages[index] = { ...tool, status: null }
    }
    const summary = SUMMARY.exec(content)
    messages.push(
      make(id, 'tool', at, {
        toolName: 'Agent',
        toolDetail: summary === null ? null : oneLine(summary[1] ?? ''),
      }),
    )
  }

  lines.forEach((line, lineIndex) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return // the last line may be half written
    }
    if (!isJson(parsed)) {
      return
    }
    const root = parsed
    const type = str(root, 'type')
    const offset = offsets[lineIndex] ?? 0
    const idStart = offset * 100
    const at = str(root, 'timestamp')
    const uuid = str(root, 'uuid')
    currentUuid = uuid
    if (uuid !== null) {
      offsetByUuid.set(uuid, offset)
    }

    // A prompt that follows an earlier line than the last prompt came after a rewind: what followed is gone.
    if (isPrompt(root, type)) {
      const parent = str(root, 'parentUuid')
      const parentOffset = parent === null ? undefined : offsetByUuid.get(parent)
      if (parentOffset !== undefined && parentOffset < lastPromptOffset) {
        rewind(parentOffset)
      }
      lastPromptOffset = offset
    }

    const isSidechain = flag(root, 'isSidechain')
    const attachment = root['attachment']
    if (type === 'attachment' && !isSidechain && str(attachment, 'type') === 'queued_command') {
      const prompt = str(attachment, 'prompt')
      const kind = str(isJson(attachment) ? attachment['origin'] : null, 'kind')
      // Only what a person typed is a user row; a finished background task becomes a step.
      if (kind === null || kind === 'human') {
        addUserText(prompt, idStart, at)
      } else if (kind === 'task-notification' && prompt !== null) {
        addTaskNotification(prompt, idStart, at)
      }
      return
    }
    if (type === 'system' && !isSidechain) {
      const added = systemNotice(root, idStart, at)
      if (added !== null) {
        messages.push(added)
      }
      return
    }
    if (type === 'assistant' && flag(root, 'isApiErrorMessage') && !isSidechain) {
      const text = apiErrorText(root)
      const added = text === null ? null : notice(idStart, text, at, true)
      if (added !== null) {
        messages.push(added)
      }
      return
    }
    const message = root['message']
    if (
      (type !== 'user' && type !== 'assistant') ||
      isSidechain ||
      flag(root, 'isMeta') ||
      !isJson(message) ||
      !('content' in message)
    ) {
      return
    }
    const content = message['content']
    // Only a person's prompt is the user's bubble: a background agent's notice becomes a step.
    const kind = originKind(root)
    if (type === 'user' && kind !== null && kind !== 'human') {
      if (kind === 'task-notification' && typeof content === 'string') {
        addTaskNotification(content, idStart, at)
      }
      return
    }
    if (typeof content === 'string') {
      addUserText(content, idStart, at)
    } else if (Array.isArray(content)) {
      addBlocks(content, type === 'assistant', idStart, at)
    }
  })
  return messages
}

export interface TranscriptUsage {
  readonly model: string | null
  readonly contextTokens: number | null
}

// The model and prompt size of the last main-thread reply; synthetic (error) replies carry no usage.
export function transcriptUsage(lines: readonly string[]): TranscriptUsage {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let parsed: unknown
    try {
      parsed = JSON.parse(lines[index] ?? '')
    } catch {
      continue
    }
    if (!isJson(parsed) || str(parsed, 'type') !== 'assistant' || flag(parsed, 'isSidechain')) {
      continue
    }
    const message = parsed['message']
    const usage = isJson(message) ? message['usage'] : null
    const model = str(message, 'model')
    if (!isJson(usage) || model === null || model === '<synthetic>') {
      continue
    }
    const tokens =
      num(usage, 'input_tokens') +
      num(usage, 'cache_read_input_tokens') +
      num(usage, 'cache_creation_input_tokens') +
      num(usage, 'output_tokens')
    return { model, contextTokens: tokens === 0 ? null : tokens }
  }
  return { model: null, contextTokens: null }
}

// True only for an absolute .jsonl path under projectsRoot (separators and case normalized on Windows).
export function isAcceptedPath(
  transcriptPath: string | null,
  projectsRoot: string,
  platform: 'win32' | 'other',
): boolean {
  if (
    transcriptPath === null ||
    transcriptPath === '' ||
    !transcriptPath.toLowerCase().endsWith('.jsonl')
  ) {
    return false
  }
  const normalize = (value: string): string => {
    const slashed = platform === 'win32' ? value.replaceAll('\\', '/') : value
    return platform === 'win32' ? slashed.toLowerCase() : slashed
  }
  const absolute =
    platform === 'win32' ? /^[a-z]:[\\/]/i.test(transcriptPath) : transcriptPath.startsWith('/')
  const path = normalize(transcriptPath)
  const root = `${normalize(projectsRoot).replace(/\/+$/, '')}/`
  // A ".." segment could climb out of the root.
  return absolute && path.startsWith(root) && !path.split('/').includes('..')
}
