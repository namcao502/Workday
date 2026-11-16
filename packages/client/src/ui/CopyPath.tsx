import { useEffect, useState } from 'react'
import { t } from '../i18n.js'

const RESET_MS = 1500

// A path or name shown as text; a click copies it and the text says so for a moment.
export function CopyPath({ text }: { readonly text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) {
      return undefined
    }
    const timer = setTimeout(() => {
      setCopied(false)
    }, RESET_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [copied])
  return (
    <button
      type="button"
      className="min-w-0 flex-1 cursor-pointer truncate rounded-lg px-2 py-1 text-left text-sm text-muted hover:bg-surface-secondary hover:text-foreground"
      title={`${text}\n${t('Click to copy', 'Bấm để chép')}`}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true)
          },
          () => {
            setCopied(false)
          },
        )
      }}
    >
      {copied ? t('Copied', 'Đã chép') : text}
    </button>
  )
}
