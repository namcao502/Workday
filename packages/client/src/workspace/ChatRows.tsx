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

function ToolLine({ message }: { readonly message: ChatMessage }): React.JSX.Element {
  const suffix =
    message.status === 'running'
      ? t('running', 'đang chạy')
      : message.status === 'background'
        ? t('background', 'nền')
        : null
  return (
    <div className="chat-tool" data-error={message.isError}>
      <span className="chat-tool-name">{message.toolName ?? ''}</span>
      {message.toolDetail === null ? null : <span> {message.toolDetail}</span>}
      {suffix === null ? null : <span className="chat-tool-status"> {suffix}</span>}
    </div>
  )
}

function MessageRow({ message }: { readonly message: ChatMessage }): React.JSX.Element {
  if (message.role === 'tool') {
    return <ToolLine message={message} />
  }
  if (message.role === 'assistant') {
    return (
      <div className="chat-assistant markdown-view">
        <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
          {message.text ?? ''}
        </Markdown>
      </div>
    )
  }
  return (
    <div className={`chat-${message.role}`} data-error={message.isError}>
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
          <details key={row.tools[0]?.id} className="chat-steps">
            <summary>
              {t(`${String(row.tools.length)} steps`, `${String(row.tools.length)} bước`)}
            </summary>
            {row.tools.map((tool) => (
              <ToolLine key={tool.id} message={tool} />
            ))}
          </details>
        ) : (
          <MessageRow key={row.message.id} message={row.message} />
        ),
      )}
    </>
  )
}
