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
import { Tip } from '../../ui/Tip.js'

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
        label: t('teams.boldCtrlBSelectTextFirst'),
        Icon: Bold,
      },
      {
        command: 'italic',
        label: t('teams.italicCtrlISelectTextFirst'),
        Icon: Italic,
      },
      {
        command: 'underline',
        label: t('teams.underlineCtrlUSelectTextFirst'),
        Icon: Underline,
      },
      {
        command: 'strikeThrough',
        label: t('teams.strikethroughSelectTextFirst'),
        Icon: Strikethrough,
      },
    ],
    [
      {
        command: 'insertUnorderedList',
        label: t('teams.bulletedListPressAgainToUndo'),
        Icon: ListUl,
      },
      {
        command: 'insertOrderedList',
        label: t('teams.numberedListPressAgainToUndo'),
        Icon: ListOl,
      },
      {
        command: 'blockquote',
        label: t('teams.quotePressAgainToUndo'),
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
              <Tip content={label} className="flex">
                <Icon />
              </Tip>
            </Button>
          ))}
        </div>
      ))}
      <Button
        isIconOnly
        variant={active.has('codeBlock') ? 'primary' : 'secondary'}
        size="sm"
        aria-label={t('teams.insertCodeBlockPressAgainTo')}
        aria-pressed={active.has('codeBlock')}
        isDisabled={disabled}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onPress={() => {
          onFormat('codeBlock')
        }}
      >
        <Tip content={t('teams.insertCodeBlockPressAgainTo')} className="flex">
          <Code />
        </Tip>
      </Button>
      <Button
        isIconOnly
        variant="secondary"
        size="sm"
        aria-label={t('teams.linkCtrlK')}
        isDisabled={disabled}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onPress={() => {
          onLinkOpen()
          setLinking(true)
        }}
      >
        <Tip content={t('teams.linkCtrlKSelectTextTo')} className="flex">
          <Link />
        </Tip>
      </Button>
      {linking ? (
        <span className="inline-flex items-center gap-1">
          <Input
            variant="secondary"
            aria-label={t('teams.linkAddress')}
            placeholder={t('teams.pasteALinkThenEnter')}
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
            {t('teams.addLink')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setLinking(false)
              setInvalid(false)
            }}
          >
            {t('teams.cancel')}
          </Button>
          {invalid ? (
            <span className="text-sm text-danger" role="alert">
              {t('teams.onlyHttpSLinks')}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
