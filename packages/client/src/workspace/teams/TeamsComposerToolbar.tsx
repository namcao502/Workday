import {
  Bold,
  Italic,
  Link,
  ListOl,
  ListUl,
  QuoteOpen,
  Strikethrough,
  Underline,
} from '@gravity-ui/icons'
import { Button, Input } from '@heroui/react'
import { useState, type ComponentType, type SVGProps } from 'react'
import { t } from '../../i18n.js'
import { isWebUrl, type FormatCommand } from './teamsComposerDom.js'

interface TeamsComposerToolbarProps {
  readonly disabled: boolean
  readonly onFormat: (command: FormatCommand) => void
  readonly onLinkOpen: () => void // the editor saves its selection before the prompt takes the focus
  readonly onLink: (url: string) => void
}

interface FormatButton {
  readonly command: FormatCommand
  readonly label: string
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>
}

// The WPF composer's order and tooltips: text style, then lists and quote, then the link.
function formatGroups(): readonly (readonly FormatButton[])[] {
  return [
    [
      { command: 'bold', label: t('Bold (Ctrl+B)', 'Đậm (Ctrl+B)'), Icon: Bold },
      { command: 'italic', label: t('Italic (Ctrl+I)', 'Nghiêng (Ctrl+I)'), Icon: Italic },
      {
        command: 'underline',
        label: t('Underline (Ctrl+U)', 'Gạch chân (Ctrl+U)'),
        Icon: Underline,
      },
      {
        command: 'strikeThrough',
        label: t('Strikethrough', 'Gạch ngang'),
        Icon: Strikethrough,
      },
    ],
    [
      { command: 'insertUnorderedList', label: t('Bulleted list', 'Danh sách'), Icon: ListUl },
      { command: 'insertOrderedList', label: t('Numbered list', 'Danh sách số'), Icon: ListOl },
      { command: 'blockquote', label: t('Quote', 'Trích dẫn'), Icon: QuoteOpen },
    ],
  ]
}

// Buttons keep the editor's selection: mouse down is cancelled before the focus moves.
export function TeamsComposerToolbar({
  disabled,
  onFormat,
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {formatGroups().map((group) => (
        <div key={group[0]?.command} className="flex items-center gap-0.5">
          {group.map(({ command, label, Icon }) => (
            <Button
              key={command}
              isIconOnly
              variant="secondary"
              size="sm"
              aria-label={label}
              isDisabled={disabled}
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onPress={() => {
                onFormat(command)
              }}
            >
              <span title={label} className="flex">
                <Icon />
              </span>
            </Button>
          ))}
        </div>
      ))}
      <Button
        isIconOnly
        variant="secondary"
        size="sm"
        aria-label={t('Link', 'Liên kết')}
        isDisabled={disabled}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onPress={() => {
          onLinkOpen()
          setLinking(true)
        }}
      >
        <span title={t('Link', 'Liên kết')} className="flex">
          <Link />
        </span>
      </Button>
      {linking ? (
        <span className="inline-flex items-center gap-1">
          <Input
            variant="secondary"
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
          <Button variant="secondary" size="sm" onPress={confirmLink}>
            {t('Add link', 'Thêm liên kết')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setLinking(false)
              setInvalid(false)
            }}
          >
            {t('Cancel', 'Hủy')}
          </Button>
          {invalid ? (
            <span className="text-sm text-danger" role="alert">
              {t('Only http(s) links', 'Chỉ nhận liên kết http(s)')}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
