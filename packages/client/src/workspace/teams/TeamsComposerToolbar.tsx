import {
  Bold,
  Code,
  Italic,
  Link,
  ListOl,
  ListUl,
  QuoteOpen,
  Strikethrough,
  Underline,
} from '@gravity-ui/icons'
import { Button, Input } from '@heroui/react'
import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { t } from '../../i18n.js'
import { isWebUrl, type FormatCommand } from './teamsComposerDom.js'

interface TeamsComposerToolbarProps {
  readonly disabled: boolean
  readonly active: ReadonlySet<FormatCommand> // the formats the caret is in
  readonly linkRequest: number // each increase opens the link row, as the Ctrl+K shortcut does
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
      {
        command: 'bold',
        label: t('Bold (Ctrl+B) - select text first', 'Đậm (Ctrl+B) - chọn chữ trước'),
        Icon: Bold,
      },
      {
        command: 'italic',
        label: t('Italic (Ctrl+I) - select text first', 'Nghiêng (Ctrl+I) - chọn chữ trước'),
        Icon: Italic,
      },
      {
        command: 'underline',
        label: t('Underline (Ctrl+U) - select text first', 'Gạch chân (Ctrl+U) - chọn chữ trước'),
        Icon: Underline,
      },
      {
        command: 'strikeThrough',
        label: t('Strikethrough - select text first', 'Gạch ngang - chọn chữ trước'),
        Icon: Strikethrough,
      },
    ],
    [
      {
        command: 'insertUnorderedList',
        label: t('Bulleted list - press again to undo', 'Danh sách - bấm lại để bỏ'),
        Icon: ListUl,
      },
      {
        command: 'insertOrderedList',
        label: t('Numbered list - press again to undo', 'Danh sách số - bấm lại để bỏ'),
        Icon: ListOl,
      },
      {
        command: 'blockquote',
        label: t('Quote - press again to undo', 'Trích dẫn - bấm lại để bỏ'),
        Icon: QuoteOpen,
      },
    ],
  ]
}

// Buttons keep the editor's selection: mouse down is cancelled before the focus moves.
export function TeamsComposerToolbar({
  disabled,
  active,
  linkRequest,
  onFormat,
  onLinkOpen,
  onLink,
}: TeamsComposerToolbarProps): React.JSX.Element {
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState('')
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (linkRequest !== 0) {
      onLinkOpen()
      setLinking(true)
    }
    // Only a new request opens the row; the handler is not a trigger.
  }, [linkRequest])

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
              variant={active.has(command) ? 'primary' : 'secondary'}
              size="sm"
              aria-label={label}
              aria-pressed={active.has(command)}
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
        variant={active.has('codeBlock') ? 'primary' : 'secondary'}
        size="sm"
        aria-label={t('Insert code block - press again to undo', 'Chèn khối code - bấm lại để bỏ')}
        aria-pressed={active.has('codeBlock')}
        isDisabled={disabled}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onPress={() => {
          onFormat('codeBlock')
        }}
      >
        <span
          title={t('Insert code block - press again to undo', 'Chèn khối code - bấm lại để bỏ')}
          className="flex"
        >
          <Code />
        </span>
      </Button>
      <Button
        isIconOnly
        variant="secondary"
        size="sm"
        aria-label={t('Link (Ctrl+K)', 'Liên kết (Ctrl+K)')}
        isDisabled={disabled}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onPress={() => {
          onLinkOpen()
          setLinking(true)
        }}
      >
        <span
          title={t(
            'Link (Ctrl+K) - select text to link it, or put the caret where the link goes',
            'Liên kết (Ctrl+K) - chọn chữ để gắn link, hoặc đặt con trỏ nơi cần chèn link',
          )}
          className="flex"
        >
          <Link />
        </span>
      </Button>
      {linking ? (
        <span className="inline-flex items-center gap-1">
          <Input
            variant="secondary"
            aria-label={t('Link address', 'Địa chỉ liên kết')}
            placeholder={t('Paste a link, then Enter', 'Dán liên kết rồi nhấn Enter')}
            autoFocus
            value={url}
            onChange={(event) => {
              setUrl(event.target.value)
              setInvalid(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                confirmLink()
              } else if (event.key === 'Escape') {
                event.stopPropagation()
                setLinking(false)
                setInvalid(false)
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
