import { Button, Input } from '@heroui/react'
import {
  isEmptyHtml,
  shortName,
  type TeamsDraft,
  type TeamsMention,
  type TeamsPerson,
} from '@workday/core'
import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n.js'
import { TeamsComposerToolbar } from './TeamsComposerToolbar.js'
import {
  applyFormat,
  applyLink,
  chipBefore,
  currentRange,
  draftFromEditor,
  insertChip,
  insertPlainText,
  makeChip,
  matchPeople,
  mentionTrigger,
  setEditorHtml,
  type FormatCommand,
  type MentionTrigger,
} from './teamsComposerDom.js'

export type ComposeMode = 'reply' | 'post' | 'edit'

export type ComposeOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly uncertain: boolean }

export interface TeamsComposerProps {
  readonly mode: ComposeMode
  readonly people: readonly TeamsPerson[]
  readonly label: string
  readonly submitLabel: string
  readonly initialHtml?: string // sanitized by the caller's pipeline again on load
  readonly initialMentions?: readonly TeamsMention[]
  readonly withSubject?: boolean
  readonly initialSubject?: string
  readonly locked?: boolean // another write is running
  readonly onSend: (draft: TeamsDraft, subject: string, confirm: boolean) => Promise<ComposeOutcome>
  readonly onCancel?: () => void
  readonly onChange?: () => void // the user typed in the subject or the body
}

const NO_MENTIONS: readonly TeamsMention[] = []

export function TeamsComposer({
  mode,
  people,
  label,
  submitLabel,
  initialHtml = '',
  initialMentions = NO_MENTIONS,
  withSubject = false,
  initialSubject = '',
  locked = false,
  onSend,
  onCancel,
  onChange,
}: TeamsComposerProps): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const mentionsRef = useRef<readonly TeamsMention[]>(initialMentions)
  const linkRangeRef = useRef<Range | null>(null)
  const [subject, setSubject] = useState(initialSubject)
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null)
  const [active, setActive] = useState(0)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const suggestions = trigger === null ? [] : matchPeople(people, trigger.query)

  useEffect(() => {
    if (editorRef.current !== null) {
      setEditorHtml(editorRef.current, initialHtml)
    }
    // Loaded once: the caller remounts the composer to load another draft.
  }, [])

  function refreshTrigger(): void {
    const editor = editorRef.current
    setTrigger(editor === null ? null : mentionTrigger(editor))
    setActive(0)
  }

  function pick(person: TeamsPerson): void {
    if (trigger === null) {
      return
    }
    const text = `@${shortName(person.displayName)}`
    const index = mentionsRef.current.length
    mentionsRef.current = [
      ...mentionsRef.current,
      { text, mri: person.mri, displayName: person.displayName },
    ]
    insertChip(trigger, makeChip(index, text))
    setTrigger(null)
    onChange?.()
  }

  function startMention(): void {
    const editor = editorRef.current
    if (editor === null) {
      return
    }
    editor.focus()
    insertPlainText(editor, '@')
    refreshTrigger()
  }

  async function submit(): Promise<void> {
    const editor = editorRef.current
    if (editor === null || sending || locked) {
      return
    }
    const draft = draftFromEditor(editor, mentionsRef.current)
    if (isEmptyHtml(draft.html)) {
      return
    }
    setSending(true)
    try {
      const outcome = await onSend(draft, subject, uncertain)
      if (outcome.ok) {
        setProblem(null)
        setUncertain(false)
        if (mode !== 'edit') {
          editor.innerHTML = ''
          mentionsRef.current = []
          setSubject('')
        }
      } else {
        setProblem(outcome.message)
        setUncertain(outcome.uncertain)
      }
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const editor = editorRef.current
    if (editor === null || event.nativeEvent.isComposing) {
      return
    }
    if (suggestions.length !== 0) {
      const chosen = suggestions[active]
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : suggestions.length - 1
        setActive((active + step) % suggestions.length)
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && chosen !== undefined) {
        event.preventDefault()
        pick(chosen)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setTrigger(null)
        return
      }
    }
    if ((event.ctrlKey || event.metaKey) && 'biu'.includes(event.key.toLowerCase())) {
      event.preventDefault()
      const keys: Readonly<Record<string, FormatCommand>> = {
        b: 'bold',
        i: 'italic',
        u: 'underline',
      }
      const command = keys[event.key.toLowerCase()]
      if (command !== undefined) {
        applyFormat(command)
      }
      return
    }
    if (event.key === 'Backspace') {
      const chip = chipBefore(editor)
      if (chip !== null) {
        event.preventDefault()
        chip.remove()
      }
      return
    }
    if (event.key === 'Escape' && onCancel !== undefined) {
      onCancel()
      return
    }
    if (event.key === 'Enter') {
      const sends = mode === 'reply' ? !event.shiftKey : event.ctrlKey || event.metaKey
      if (sends) {
        event.preventDefault()
        void submit()
      }
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5" data-mode={mode}>
      <span className="text-xs text-muted">{label}</span>
      {withSubject ? (
        <Input
          variant="secondary"
          aria-label={t('Subject', 'Tiêu đề')}
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value)
            onChange?.()
          }}
        />
      ) : null}
      <TeamsComposerToolbar
        disabled={sending}
        onFormat={applyFormat}
        onMention={startMention}
        onLinkOpen={() => {
          const editor = editorRef.current
          linkRangeRef.current =
            editor === null ? null : (currentRange(editor)?.cloneRange() ?? null)
        }}
        onLink={(url) => {
          const range = linkRangeRef.current
          editorRef.current?.focus()
          if (range !== null) {
            const selection = window.getSelection()
            selection?.removeAllRanges()
            selection?.addRange(range)
            applyLink(range, url)
            onChange?.()
          }
        }}
      />
      <div
        ref={editorRef}
        className="max-h-60 min-h-18 overflow-y-auto whitespace-pre-wrap rounded-xl border border-field-border bg-field-background p-2 text-sm outline-none focus:border-field-border-focus"
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          refreshTrigger()
          onChange?.()
        }}
        onClick={refreshTrigger}
        onKeyDown={onKeyDown}
        onPaste={(event) => {
          event.preventDefault()
          if (editorRef.current !== null) {
            insertPlainText(editorRef.current, event.clipboardData.getData('text/plain'))
            onChange?.()
          }
        }}
      />
      {suggestions.length === 0 ? null : (
        <ul
          className="m-0 list-none rounded-xl bg-overlay p-1 shadow-overlay"
          role="listbox"
          aria-label={t('People', 'Mọi người')}
        >
          {suggestions.map((person, index) => (
            <li
              key={person.mri}
              role="option"
              aria-selected={index === active}
              className="cursor-pointer rounded-lg px-2 py-1 text-sm aria-selected:bg-default"
              onMouseDown={(event) => {
                event.preventDefault()
                pick(person)
              }}
            >
              {person.displayName}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={sending || locked}
          onPress={() => {
            void submit()
          }}
        >
          {submitLabel}
        </Button>
        {onCancel === undefined ? null : (
          <Button variant="ghost" size="sm" onPress={onCancel}>
            {t('Cancel', 'Hủy')}
          </Button>
        )}
        {problem === null ? null : (
          <span className="text-sm text-danger" role="alert">
            {uncertain
              ? t(
                  'May have been sent - check the thread before sending again',
                  'Có thể đã gửi - kiểm tra thread trước khi gửi lại',
                )
              : problem}
          </span>
        )}
      </div>
    </div>
  )
}
