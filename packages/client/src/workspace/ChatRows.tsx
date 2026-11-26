import { Alert, Button, Chip, Disclosure, Spinner } from '@heroui/react'
import type { ChatMessage, ChatTodo, ToolEdit } from '@workday/core'
import { memo, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t } from '../i18n.js'
import { copyWithListMarkers } from '../ui/copyListMarkers.js'
import { COPY_BLOCKS } from '../ui/markdownBlocks.js'
import { ChatCode, ChatLink } from './chatFileLinks.js'

const COLLAPSE_FROM = 4

type Row =
  | { readonly kind: 'message'; readonly message: ChatMessage }
  | { readonly kind: 'steps'; readonly tools: readonly ChatMessage[] }
  | { readonly kind: 'analysis'; readonly messages: readonly ChatMessage[] }
  | { readonly kind: 'analyses'; readonly turns: readonly (readonly ChatMessage[])[] }

// The line the server sends for an automatic Teams analysis (teamsAnalysis.ts, analysisLine).
const ANALYSIS_PROMPT =
  /^Read .*teams-tasks[\\/][^\\/]*-analysis-[^\\/]*\.md and do the analysis it asks for\.$/

function isAnalysisPrompt(message: ChatMessage): boolean {
  return message.role === 'user' && ANALYSIS_PROMPT.test((message.text ?? '').trim())
}

// "Teams analysis: 2 issue(s), 1 open" from the JSON block Claude answered with; the plain title otherwise.
function analysisTitle(messages: readonly ChatMessage[]): string {
  const answer = messages.findLast((message) => message.role === 'assistant')?.text ?? ''
  const start = answer.indexOf('{')
  const end = answer.lastIndexOf('}')
  try {
    const parsed: unknown = JSON.parse(answer.slice(start, end + 1))
    const issues =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)['issues']
        : null
    if (Array.isArray(issues)) {
      const open = issues.filter(
        (issue: unknown) =>
          typeof issue === 'object' &&
          issue !== null &&
          (issue as Record<string, unknown>)['status'] === 'open',
      ).length
      return t('workspace.teamsAnalysisIssues', {
        total: String(issues.length),
        open: String(open),
      })
    }
  } catch {
    // Not a finished analysis (still running, or Claude answered in prose): the plain title.
  }
  return t('workspace.teamsAnalysis')
}

// Back-to-back analysis turns (a burst of Teams messages) fold further into one "N Teams analyses" row.
function mergeAnalyses(rows: readonly Row[]): readonly Row[] {
  const merged: Row[] = []
  let turns: (readonly ChatMessage[])[] = []
  const flush = (): void => {
    if (turns.length === 1 && turns[0] !== undefined) {
      merged.push({ kind: 'analysis', messages: turns[0] })
    } else if (turns.length > 1) {
      merged.push({ kind: 'analyses', turns })
    }
    turns = []
  }
  for (const row of rows) {
    if (row.kind === 'analysis') {
      turns.push(row.messages)
    } else {
      flush()
      merged.push(row)
    }
  }
  flush()
  return merged
}

// An automatic Teams analysis turn (its prompt up to the next user message) folds into one row, so the
// chat reads as the user's own conversation; the rest groups as usual.
export function groupRows(messages: readonly ChatMessage[], foldAnalysis = true): readonly Row[] {
  if (foldAnalysis) {
    const rows: Row[] = []
    let plain: ChatMessage[] = []
    let turn: ChatMessage[] | null = null
    for (const message of messages) {
      if (message.role === 'user') {
        if (turn !== null) {
          rows.push({ kind: 'analysis', messages: turn })
          turn = null
        }
        if (isAnalysisPrompt(message)) {
          rows.push(...groupRows(plain, false))
          plain = []
          turn = [message]
          continue
        }
      }
      if (turn === null) {
        plain.push(message)
      } else {
        turn.push(message)
      }
    }
    if (turn !== null) {
      rows.push({ kind: 'analysis', messages: turn })
    }
    rows.push(...groupRows(plain, false))
    return mergeAnalyses(rows)
  }
  const rows: Row[] = []
  let run: ChatMessage[] = []
  const flush = (): void => {
    if (run.length >= COLLAPSE_FROM) {
      rows.push({ kind: 'steps', tools: run })
    } else {
      rows.push(...run.map((message): Row => ({ kind: 'message', message })))
    }
    run = []
  }
  for (const message of messages) {
    if (message.role === 'tool') {
      run.push(message)
    } else {
      flush()
      rows.push({ kind: 'message', message })
    }
  }
  flush()
  return rows
}

// react-markdown drops raw HTML unless a plugin allows it, and none does.
const COMPONENTS: Components = {
  ...COPY_BLOCKS,
  a: ({ href, children }) => <ChatLink href={href}>{children}</ChatLink>,
  code: ({ className, children }) => <ChatCode className={className}>{children}</ChatCode>,
}

// Memoized by text: a refetch hands over the same strings, and parsing markdown is the costly part of a render.
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
}: {
  readonly text: string
}): React.JSX.Element {
  return (
    <div className="markdown-view break-words text-sm" onCopy={copyWithListMarkers}>
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  )
})

function EditBlock({ edit }: { readonly edit: ToolEdit }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 font-mono text-xs whitespace-pre-wrap">
      {edit.oldText === '' ? null : (
        <div className="rounded-lg bg-danger-soft px-2 py-1 text-danger">{edit.oldText}</div>
      )}
      <div className="rounded-lg bg-success-soft px-2 py-1 text-success">{edit.newText}</div>
    </div>
  )
}

const TODO_MARK: Readonly<Record<ChatTodo['status'], string>> = {
  completed: '[x]',
  in_progress: '[>]',
  pending: '[ ]',
}

function TodoList({ todos }: { readonly todos: readonly ChatTodo[] }): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-0.5 rounded-lg bg-surface-secondary px-3 py-2 text-sm">
      {todos.map((todo, index) => (
        <li
          key={`${String(index)}-${todo.text}`}
          className={
            todo.status === 'completed'
              ? 'text-muted line-through'
              : todo.status === 'in_progress'
                ? 'font-semibold'
                : ''
          }
        >
          <span className="mr-2 font-mono text-xs">{TODO_MARK[todo.status]}</span>
          {todo.text}
        </li>
      ))}
    </ul>
  )
}

function ToolLine({ message }: { readonly message: ChatMessage }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  if (message.todos !== null && message.todos.length !== 0) {
    return <TodoList todos={message.todos} />
  }
  const expandable = message.edit !== null || message.output !== null
  const head = (
    <>
      <span className="font-semibold">{message.toolName ?? ''}</span>
      {message.toolDetail === null ? null : (
        <span className="min-w-0 wrap-anywhere">{message.toolDetail}</span>
      )}
      {message.status === 'running' ? (
        <Spinner size="sm" aria-label={t('workspace.running')} />
      ) : null}
      {message.status === 'background' ? <Chip size="sm">{t('workspace.background')}</Chip> : null}
    </>
  )
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg bg-surface-secondary px-2 py-1 font-mono text-xs ${message.isError ? 'text-danger' : 'text-muted'}`}
      data-error={message.isError}
    >
      {expandable ? (
        <button
          type="button"
          className="flex flex-wrap items-center gap-1 text-left whitespace-pre-wrap"
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value)
          }}
        >
          {head}
          <span aria-hidden="true">{open ? 'v' : '>'}</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-1 whitespace-pre-wrap">{head}</div>
      )}
      {open && message.edit !== null ? <EditBlock edit={message.edit} /> : null}
      {open && message.output !== null ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-foreground">
          {message.output}
        </pre>
      ) : null}
    </div>
  )
}

interface MessageRowProps {
  readonly message: ChatMessage
  readonly onRewind: ((uuid: string) => void) | undefined // absent: no live session to rewind
}

function MessageRow({ message, onRewind }: MessageRowProps): React.JSX.Element {
  if (message.role === 'tool') {
    return <ToolLine message={message} />
  }
  if (message.role === 'assistant') {
    return <ChatMarkdown text={message.text ?? ''} />
  }
  if (message.role === 'user') {
    const uuid = message.uuid
    return (
      <div className="flex max-w-[80%] flex-col items-end gap-1 self-end">
        <div className="rounded-2xl bg-accent-soft px-3 py-1.5 text-sm whitespace-pre-wrap wrap-anywhere">
          {message.text}
        </div>
        {uuid === null || onRewind === undefined ? null : (
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
              onRewind(uuid)
            }}
          >
            {t('workspace.rewindFilesToHere')}
          </Button>
        )}
      </div>
    )
  }
  return <NoticeRow text={message.text ?? ''} isError={message.isError} />
}

const INTERRUPT_MARKER = '[Request interrupted'
// The API's wording for an expired or revoked Claude sign-in.
const AUTH_ERROR = /failed to authenticate|oauth|\b401\b|\/login/i

function NoticeRow({
  text,
  isError,
}: {
  readonly text: string
  readonly isError: boolean
}): React.JSX.Element {
  if (isError && AUTH_ERROR.test(text)) {
    return (
      <Alert status="danger" data-auth-error="true">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('workspace.claudeSignInExpired')}</Alert.Title>
          <Alert.Description>
            {t('workspace.runClaudeInATerminalAnd')}
            <span className="mt-1 block text-xs wrap-anywhere opacity-70">{text}</span>
          </Alert.Description>
        </Alert.Content>
      </Alert>
    )
  }
  // Claude writes this marker itself when a turn is stopped; show it as a plain status line.
  const shown = text.startsWith(INTERRUPT_MARKER) ? t('workspace.stoppedByYou') : text
  return (
    <div
      className={`self-center text-center text-xs whitespace-pre-wrap wrap-anywhere ${isError ? 'text-danger' : 'text-muted'}`}
    >
      {shown}
    </div>
  )
}

function StepsRow({ tools }: { readonly tools: readonly ChatMessage[] }): React.JSX.Element {
  return (
    <Disclosure>
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex items-center gap-1 text-xs text-muted">
          {t('workspace.steps', { length: String(tools.length) })}
          <Disclosure.Indicator />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="flex flex-col gap-1 pt-1">
          {tools.map((tool) => (
            <ToolLine key={tool.id} message={tool} />
          ))}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  )
}

function RowList({
  rows,
  onRewind,
}: {
  readonly rows: readonly Row[]
  readonly onRewind?: ((uuid: string) => void) | undefined
}): React.JSX.Element {
  return (
    <>
      {rows.map((row) => {
        switch (row.kind) {
          case 'steps':
            return <StepsRow key={row.tools[0]?.id} tools={row.tools} />
          case 'analysis':
            return (
              <Disclosure key={row.messages[0]?.id}>
                <Disclosure.Heading>
                  <Disclosure.Trigger className="flex items-center gap-1 text-xs text-muted">
                    {analysisTitle(row.messages)}
                    <Disclosure.Indicator />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="flex flex-col gap-2 pt-1">
                    <RowList rows={groupRows(row.messages, false)} onRewind={onRewind} />
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            )
          case 'analyses':
            return (
              <Disclosure key={row.turns[0]?.[0]?.id}>
                <Disclosure.Heading>
                  <Disclosure.Trigger className="flex items-center gap-1 text-xs text-muted">
                    {t('workspace.teamsAnalyses', { count: String(row.turns.length) })}
                    <Disclosure.Indicator />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="flex flex-col gap-1 pt-1 pl-3">
                    <RowList
                      rows={row.turns.map((turn): Row => ({ kind: 'analysis', messages: turn }))}
                      onRewind={onRewind}
                    />
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            )
          case 'message':
            return <MessageRow key={row.message.id} message={row.message} onRewind={onRewind} />
        }
      })}
    </>
  )
}

export function ChatRows({
  messages,
  onRewind,
}: {
  readonly messages: readonly ChatMessage[]
  readonly onRewind?: (uuid: string) => void
}): React.JSX.Element {
  return <RowList rows={groupRows(messages)} onRewind={onRewind} />
}
