import { Button, Chip, Disclosure, Spinner } from '@heroui/react'
import type { ChatMessage, ChatTodo, ToolEdit } from '@workday/core'
import { memo, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t } from '../i18n.js'
import { copyWithListMarkers } from '../ui/copyListMarkers.js'
import { ctrlLinkHint, openLinkOnCtrl } from '../ui/ctrlLink.js'
import { COPY_BLOCKS } from '../ui/markdownBlocks.js'

const COLLAPSE_FROM = 4

type Row =
  | { readonly kind: 'message'; readonly message: ChatMessage }
  | { readonly kind: 'steps'; readonly tools: readonly ChatMessage[] }

// A run of COLLAPSE_FROM or more tool lines becomes one "N steps" row.
export function groupRows(messages: readonly ChatMessage[]): readonly Row[] {
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
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={ctrlLinkHint()}
      onClick={openLinkOnCtrl}
    >
      {children}
    </a>
  ),
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
      {message.toolDetail === null ? null : <span>{message.toolDetail}</span>}
      {message.status === 'running' ? (
        <Spinner size="sm" aria-label={t('running', 'đang chạy')} />
      ) : null}
      {message.status === 'background' ? (
        <Chip size="sm">{t('Background', 'Chạy nền')}</Chip>
      ) : null}
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
        <div className="rounded-2xl bg-accent-soft px-3 py-1.5 text-sm whitespace-pre-wrap">
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
            {t('Rewind files to here', 'Hoàn tác file về đây')}
          </Button>
        )}
      </div>
    )
  }
  return (
    <div
      className={`self-center text-center text-xs whitespace-pre-wrap ${message.isError ? 'text-danger' : 'text-muted'}`}
    >
      {message.text}
    </div>
  )
}

export function ChatRows({
  messages,
  onRewind,
}: {
  readonly messages: readonly ChatMessage[]
  readonly onRewind?: (uuid: string) => void
}): React.JSX.Element {
  return (
    <>
      {groupRows(messages).map((row) =>
        row.kind === 'steps' ? (
          <Disclosure key={row.tools[0]?.id}>
            <Disclosure.Heading>
              <Disclosure.Trigger className="flex items-center gap-1 text-xs text-muted">
                {t(`${String(row.tools.length)} steps`, `${String(row.tools.length)} bước`)}
                <Disclosure.Indicator />
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="flex flex-col gap-1 pt-1">
                {row.tools.map((tool) => (
                  <ToolLine key={tool.id} message={tool} />
                ))}
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        ) : (
          <MessageRow key={row.message.id} message={row.message} onRewind={onRewind} />
        ),
      )}
    </>
  )
}
