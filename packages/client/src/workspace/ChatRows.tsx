import { Chip, Disclosure, Spinner } from '@heroui/react'
import type { ChatMessage } from '@workday/core'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { t } from '../i18n.js'

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
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
}

export function ChatMarkdown({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <div className="markdown-view break-words text-sm">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  )
}

function ToolLine({ message }: { readonly message: ChatMessage }): React.JSX.Element {
  return (
    <div
      className={`flex flex-wrap items-center gap-1 font-mono text-xs whitespace-pre-wrap ${message.isError ? 'text-danger' : 'text-muted'}`}
      data-error={message.isError}
    >
      <span className="font-semibold">{message.toolName ?? ''}</span>
      {message.toolDetail === null ? null : <span>{message.toolDetail}</span>}
      {message.status === 'running' ? (
        <Spinner size="sm" aria-label={t('running', 'đang chạy')} />
      ) : null}
      {message.status === 'background' ? (
        <Chip size="sm">{t('Background', 'Chạy nền')}</Chip>
      ) : null}
    </div>
  )
}

function MessageRow({ message }: { readonly message: ChatMessage }): React.JSX.Element {
  if (message.role === 'tool') {
    return <ToolLine message={message} />
  }
  if (message.role === 'assistant') {
    return <ChatMarkdown text={message.text ?? ''} />
  }
  if (message.role === 'user') {
    return (
      <div className="max-w-[80%] self-end rounded-2xl bg-accent-soft px-3 py-1.5 text-sm whitespace-pre-wrap">
        {message.text}
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
}: {
  readonly messages: readonly ChatMessage[]
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
          <MessageRow key={row.message.id} message={row.message} />
        ),
      )}
    </>
  )
}
