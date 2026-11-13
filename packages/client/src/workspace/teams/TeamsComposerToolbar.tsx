import { useState } from 'react'
import { t } from '../../i18n.js'
import { isWebUrl, type FormatCommand } from './teamsComposerDom.js'

interface TeamsComposerToolbarProps {
  readonly disabled: boolean
  readonly onFormat: (command: FormatCommand) => void
  readonly onMention: () => void
  readonly onLinkOpen: () => void // the editor saves its selection before the prompt takes the focus
  readonly onLink: (url: string) => void
}

interface FormatButton {
  readonly command: FormatCommand
  readonly label: string
  readonly text: string
}

function formatButtons(): readonly FormatButton[] {
  return [
    { command: 'bold', label: t('Bold', 'Đậm'), text: 'B' },
    { command: 'italic', label: t('Italic', 'Nghiêng'), text: 'I' },
    { command: 'underline', label: t('Underline', 'Gạch chân'), text: 'U' },
    { command: 'strikeThrough', label: t('Strikethrough', 'Gạch ngang'), text: 'S' },
    { command: 'insertUnorderedList', label: t('List', 'Danh sách'), text: '•' },
    { command: 'blockquote', label: t('Quote', 'Trích dẫn'), text: '"' },
  ]
}

// Buttons keep the editor's selection: mouse down is cancelled before the focus moves.
export function TeamsComposerToolbar({
  disabled,
  onFormat,
  onMention,
  onLinkOpen,
  onLink,
}: TeamsComposerToolbarProps): React.JSX.Element {
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState('')
  const [invalid, setInvalid] = useState(false)

  function confirmLink(): void {
    const value = url.trim()
    if (!isWebUrl(value)) {
      setInvalid(true)
      return
    }
    onLink(value)
    setLinking(false)
    setUrl('')
    setInvalid(false)
  }

  return (
    <div className="teams-toolbar">
      {formatButtons().map((button) => (
        <button
          key={button.command}
          type="button"
          className="wd-button ghost"
          aria-label={button.label}
          title={button.label}
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            onFormat(button.command)
          }}
        >
          {button.text}
        </button>
      ))}
      <button
        type="button"
        className="wd-button ghost"
        aria-label={t('Link', 'Liên kết')}
        title={t('Link', 'Liên kết')}
        disabled={disabled}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onClick={() => {
          onLinkOpen()
          setLinking(true)
        }}
      >
        {t('Link', 'Liên kết')}
      </button>
      <button
        type="button"
        className="wd-button ghost"
        aria-label={t('Mention', 'Nhắc tên')}
        title={t('Mention', 'Nhắc tên')}
        disabled={disabled}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onClick={onMention}
      >
        @
      </button>
      {linking ? (
        <span className="teams-link-prompt">
          <input
            className="wd-input"
            aria-label={t('Link address', 'Địa chỉ liên kết')}
            placeholder="https://"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setInvalid(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                confirmLink()
              }
            }}
          />
          <button type="button" className="wd-button secondary" onClick={confirmLink}>
            {t('Add link', 'Thêm liên kết')}
          </button>
          <button
            type="button"
            className="wd-button ghost"
            onClick={() => {
              setLinking(false)
              setInvalid(false)
            }}
          >
            {t('Cancel', 'Hủy')}
          </button>
          {invalid ? (
            <span className="status danger" role="alert">
              {t('Only http(s) links', 'Chỉ nhận liên kết http(s)')}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
