import { Check, Copy, Xmark } from '@gravity-ui/icons'
import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { t } from '../i18n.js'

const RESET_MS = 1500

type CopyState = 'idle' | 'copied' | 'failed'

interface CopyButtonProps {
  readonly text: string
  readonly className?: string
}

// Copies `text` to the clipboard; the icon says whether it worked for a moment.
export function CopyButton({ text, className = '' }: CopyButtonProps): React.JSX.Element {
  const [state, setState] = useState<CopyState>('idle')
  useEffect(() => {
    if (state === 'idle') {
      return undefined
    }
    const timer = setTimeout(() => {
      setState('idle')
    }, RESET_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [state])

  const label =
    state === 'copied'
      ? t('Copied', 'Đã chép')
      : state === 'failed'
        ? t('Could not copy', 'Không chép được')
        : t('Copy', 'Chép')
  return (
    <Button
      isIconOnly
      size="sm"
      variant="secondary"
      className={className}
      aria-label={label}
      onPress={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setState('copied')
          },
          () => {
            setState('failed')
          },
        )
      }}
    >
      {state === 'copied' ? <Check /> : state === 'failed' ? <Xmark /> : <Copy />}
    </Button>
  )
}
