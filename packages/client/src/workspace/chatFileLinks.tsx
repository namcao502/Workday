import { createContext, useContext, useMemo } from 'react'
import { useFiles } from '../api/useWorkspace.js'
import { t } from '../i18n.js'
import { ctrlLinkHint, openLinkOnCtrl } from '../ui/ctrlLink.js'
import { openWorkspaceFile, resolveFileLink, type FileLinkTarget } from './fileLinks.js'

interface FileLinks {
  readonly resolve: (raw: string) => FileLinkTarget | null
  readonly open: (target: FileLinkTarget) => void
}

const FileLinksContext = createContext<FileLinks | null>(null)

// The chat of one workspace tab: its links and path-like code open that tab's files.
export function ChatFileLinks({
  tabId,
  children,
}: {
  readonly tabId: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  const { data } = useFiles(tabId)
  const links = useMemo<FileLinks>(
    () => ({
      resolve: (raw) => resolveFileLink(raw, data ?? []),
      open: (target) => {
        openWorkspaceFile(tabId, target)
      },
    }),
    [data, tabId],
  )
  return <FileLinksContext.Provider value={links}>{children}</FileLinksContext.Provider>
}

// A markdown link: a file of the tab opens in Files on a plain click; a web link keeps Ctrl+click.
export function ChatLink({
  href,
  children,
}: {
  readonly href?: string | undefined
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const links = useContext(FileLinksContext)
  const target = href === undefined || links === null ? null : links.resolve(href)
  if (target !== null && links !== null) {
    return (
      <a
        href={href}
        title={t('Open in Files', 'Mở trong Files')}
        onClick={(event) => {
          event.preventDefault()
          links.open(target)
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={ctrlLinkHint()}
      onClick={openLinkOnCtrl}
    >
      {children}
    </a>
  )
}

// Inline code naming a file of the tab ("src/app.ts:42") opens it; any other code stays plain. A code
// block's text ends with a newline, so blocks never become links.
export function ChatCode({
  className,
  children,
}: {
  readonly className?: string | undefined
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const links = useContext(FileLinksContext)
  const text = typeof children === 'string' && !children.includes('\n') ? children : null
  const target = text === null || links === null ? null : links.resolve(text)
  if (target === null || links === null) {
    return <code className={className}>{children}</code>
  }
  return (
    <button
      type="button"
      className="cursor-pointer text-accent hover:underline"
      title={t('Open in Files', 'Mở trong Files')}
      onClick={() => {
        links.open(target)
      }}
    >
      <code className={className}>{children}</code>
    </button>
  )
}
