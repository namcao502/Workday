import { Button } from '@heroui/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n.js'

const ABOVE_PX = 40 // the button sits this far above the selection's top

interface Offer {
  readonly text: string
  readonly top: number
  readonly left: number
}

// The selection inside the list, with where to show the button; null when there is none.
function offerFor(list: HTMLElement | null): Offer | null {
  const selection = window.getSelection()
  if (list === null || selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }
  const range = selection.getRangeAt(0)
  const text = selection.toString().trim()
  if (text === '' || !list.contains(range.commonAncestorContainer)) {
    return null
  }
  // jsdom has no layout for a range; there the button just sits at the corner.
  const box =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : { top: 0, left: 0, width: 0 }
  return { text, top: Math.max(box.top - ABOVE_PX, 0), left: box.left + box.width / 2 }
}

// Selecting text in the chat offers Quote, as claude.ai's reply does: it hands the text to the prompt box.
export function SelectionQuote({
  list,
  onQuote,
}: {
  readonly list: React.RefObject<HTMLElement | null>
  readonly onQuote: (text: string) => void
}): React.JSX.Element | null {
  const [offer, setOffer] = useState<Offer | null>(null)

  useEffect(() => {
    const element = list.current
    function update(): void {
      setOffer(offerFor(list.current))
    }
    document.addEventListener('selectionchange', update)
    // The selection moves with the list; place the button again rather than leave it behind.
    element?.addEventListener('scroll', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      element?.removeEventListener('scroll', update)
    }
  }, [list])

  if (offer === null) {
    return null
  }
  return createPortal(
    <div
      className="fixed z-50 -translate-x-1/2"
      style={{ top: offer.top, left: offer.left }}
      // Pressing the button must not clear the selection before the click reads it.
      onMouseDown={(event) => {
        event.preventDefault()
      }}
    >
      <Button
        size="sm"
        variant="secondary"
        className="shadow-overlay"
        onPress={() => {
          onQuote(offer.text)
          window.getSelection()?.removeAllRanges()
          setOffer(null)
        }}
      >
        {t('Quote', 'Trích dẫn')}
      </Button>
    </div>,
    document.body,
  )
}
