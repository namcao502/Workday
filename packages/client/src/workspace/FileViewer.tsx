import type { FileContentView } from '@workday/core'
import { useMemo, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { rawFileUrl } from '../api/workspaceApi.js'
import { t } from '../i18n.js'
import { CopyBlock } from '../ui/CopyBlock.js'
import { CopyButton } from '../ui/CopyButton.js'
import { copyWithListMarkers } from '../ui/copyListMarkers.js'
import { ctrlLinkHint, openLinkOnCtrl } from '../ui/ctrlLink.js'
import { remarkBreaks } from '../ui/remarkBreaks.js'
import { COPY_BLOCKS } from '../ui/markdownBlocks.js'
import { highlightLines, languageOf } from '../ui/highlight.js'
import { Segmented } from '../ui/Segmented.js'
import { Tip } from '../ui/Tip.js'

interface FileViewerProps {
  readonly tabId: string
  readonly group: string
  readonly path: string
  readonly content: FileContentView
  readonly knownPaths: readonly string[]
  readonly onSelectPath: (path: string) => void
}

const REMOTE_LINK = /^https?:\/\//i
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i

// Resolves a relative href against the open file's folder; null when it leaves the group.
function resolveRelative(from: string, href: string): string | null {
  if (ANY_SCHEME.test(href) || href.startsWith('#') || href.startsWith('//')) {
    return null
  }
  const target = decodeURI(href.split(/[?#]/)[0] ?? '')
  const parts = target.startsWith('/') ? [] : from.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined) {
        return null
      }
    } else if (part !== '.' && part !== '') {
      parts.push(part)
    }
  }
  return parts.join('/')
}

interface SourceViewProps {
  readonly text: string
  readonly path: string // picks the highlighting language
  readonly withCopy: boolean // false when the caller already shows a copy button for the whole file
}

// Each line is a number column and a text column; a long line wraps inside the text column.
function SourceView({ text, path, withCopy }: SourceViewProps): React.JSX.Element {
  const lines = useMemo(() => highlightLines(text, languageOf(path)), [text, path])
  const code = (
    <pre className="code-view">
      {lines.map((line, index) => (
        <span className="code-line" key={index}>
          <span className="code-number">{index + 1}</span>
          {/* highlightLines escapes the text; the only markup is highlight.js spans. */}
          <span className="code-text" dangerouslySetInnerHTML={{ __html: line }} />
        </span>
      ))}
    </pre>
  )
  return withCopy ? <CopyBlock text={text}>{code}</CopyBlock> : code
}

function MarkdownView(props: FileViewerProps & { readonly text: string }): React.JSX.Element {
  const { tabId, group, path, knownPaths, onSelectPath, text } = props
  const known = useMemo(() => new Set(knownPaths), [knownPaths])
  const components: Components = {
    ...COPY_BLOCKS,
    a: ({ href, children }) => {
      if (href !== undefined && REMOTE_LINK.test(href)) {
        return (
          <Tip className="inline" content={ctrlLinkHint()}>
            <a href={href} target="_blank" rel="noreferrer" onClick={openLinkOnCtrl}>
              {children}
            </a>
          </Tip>
        )
      }
      const target = href === undefined ? null : resolveRelative(path, href)
      if (target === null || !known.has(target)) {
        return <span>{children}</span>
      }
      return (
        <a
          href={`#${target}`}
          onClick={(event) => {
            event.preventDefault()
            onSelectPath(target)
          }}
        >
          {children}
        </a>
      )
    },
    img: ({ src, alt }) => {
      const target = typeof src === 'string' ? resolveRelative(path, src) : null
      return target === null ? (
        <span>{alt}</span>
      ) : (
        <img src={rawFileUrl(tabId, group, target)} alt={alt ?? ''} />
      )
    },
  }
  return (
    <div className="markdown-view" onCopy={copyWithListMarkers}>
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {text}
      </Markdown>
    </div>
  )
}

function MarkdownWithSource(props: FileViewerProps & { readonly text: string }): React.JSX.Element {
  const [source, setSource] = useState(false)
  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-1">
        <Segmented
          label={t('workspace.viewMode')}
          value={source ? 'source' : 'rendered'}
          options={[
            { value: 'source', label: t('workspace.source') },
            { value: 'rendered', label: t('workspace.rendered') },
          ]}
          onChange={(value) => {
            setSource(value === 'source')
          }}
        />
        <CopyButton text={props.text} />
      </div>
      {source ? (
        <SourceView text={props.text} path={props.path} withCopy={false} />
      ) : (
        <MarkdownView {...props} />
      )}
    </>
  )
}

export function FileViewer(props: FileViewerProps): React.JSX.Element {
  const { content, tabId, group, path } = props
  switch (content.kind) {
    case 'text':
      return <SourceView text={content.text} path={path} withCopy />
    case 'markdown':
      return <MarkdownWithSource {...props} text={content.text} />
    case 'image':
      return <img className="image-view" src={rawFileUrl(tabId, group, path)} alt={path} />
    default:
      return (
        <p className="text-sm text-muted">
          {content.kind === 'tooLarge'
            ? t('workspace.thisFileIsTooLargeTo')
            : t('workspace.thisIsABinaryFile')}
        </p>
      )
  }
}
