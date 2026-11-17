import { t } from '../i18n.js'

interface ClickLike {
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  preventDefault(): void
}

// As in the WPF terminal a link in chat text opens on Ctrl+click only, so a plain click can select the text.
export function openLinkOnCtrl(event: ClickLike): void {
  if (!event.ctrlKey && !event.metaKey) {
    event.preventDefault()
  }
}

export function ctrlLinkHint(): string {
  return t('Ctrl+click to open', 'Ctrl+click để mở')
}

// For HTML set as a string: the click lands on the container, so the link is found from the target.
export function guardHtmlLinks(event: React.MouseEvent<HTMLElement>): void {
  if (event.target instanceof Element && event.target.closest('a[href]') !== null) {
    openLinkOnCtrl(event)
  }
}
