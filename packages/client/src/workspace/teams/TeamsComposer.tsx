import { At, Paperclip, Picture } from '@gravity-ui/icons'
import { Button, CloseButton, Input } from '@heroui/react'
import {
  isEmptyHtml,
  shortName,
  type TeamsDraft,
  type TeamsMention,
  type TeamsPerson,
} from '@workday/core'
import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n.js'
import { fileProblem, readAttached, sizeText, type AttachedFile } from './teamsComposerFiles.js'
import { imageFiles, imageProblem, pickImage } from './teamsComposerImages.js'
import { TeamsComposerToolbar } from './TeamsComposerToolbar.js'
import {
  applyFormat,
  applyLink,
  chipBefore,
  currentRange,
  draftFromEditor,
  insertChip,
  insertImage,
  insertPlainText,
  makeChip,
  matchPeople,
  mentionTrigger,
  setEditorHtml,
  type FormatCommand,
  type PickedImage,
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
  const imagesRef = useRef<readonly PickedImage[]>([])
  const [files, setFiles] = useState<readonly AttachedFile[]>([])
  const attachInput = useRef<HTMLInputElement>(null)
  const nextImageId = useRef(1)
  const fileInput = useRef<HTMLInputElement>(null)
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

  async function addImages(files: readonly File[]): Promise<void> {
    const editor = editorRef.current
    if (editor === null) {
      return
    }
    for (const file of files) {
      const refused = imageProblem(file, imagesRef.current.length)
      if (refused !== null) {
        setProblem(refused)
        continue
      }
      try {
        const id = nextImageId.current
        nextImageId.current += 1
        const picked = await pickImage(file, id)
        imagesRef.current = [...imagesRef.current, picked]
        insertImage(editor, picked)
        setProblem(null)
        onChange?.()
      } catch {
        setProblem(t('Could not read the image.', 'Không đọc được ảnh.'))
      }
    }
  }

  async function addFiles(picked: readonly File[]): Promise<void> {
    let attached = files
    for (const file of picked) {
      const refused = fileProblem(file, attached)
      if (refused !== null) {
        setProblem(refused)
        continue
      }
      try {
        const id = nextImageId.current
        nextImageId.current += 1
        attached = [...attached, await readAttached(file, id)]
        setFiles(attached)
        setProblem(null)
        onChange?.()
      } catch {
        setProblem(t('Could not read the file.', 'Không đọc được file.'))
      }
    }
  }

  // Images join the text where the caret is; every other file is listed under it.
  function addDropped(list: FileList | undefined): boolean {
    const all = Array.from(list ?? [])
    if (mode === 'edit' || all.length === 0) {
      return false
    }
    const images = imageFiles(list)
    void addImages(images)
    void addFiles(all.filter((file) => !images.includes(file)))
    return true
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
    const edited = draftFromEditor(editor, mentionsRef.current, imagesRef.current)
    const draft: TeamsDraft = {
      ...edited,
      files: files.map(({ data, name }) => ({ data, fileName: name })),
    }
    if (isEmptyHtml(draft.html) && (draft.images ?? []).length === 0 && files.length === 0) {
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
          imagesRef.current = []
          setFiles([])
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
        className="max-h-60 min-h-18 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-secondary p-2 text-sm outline-none focus:bg-field-focus [&_pre]:my-1 [&_pre]:rounded-lg [&_pre]:bg-surface [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs"
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
        onDragOver={(event) => {
          if (mode !== 'edit' && event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
          }
        }}
        onDrop={(event) => {
          if (addDropped(event.dataTransfer.files)) {
            event.preventDefault()
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          if (addDropped(event.clipboardData.files)) {
            return
          }
          if (editorRef.current !== null) {
            insertPlainText(editorRef.current, event.clipboardData.getData('text/plain'))
            onChange?.()
          }
        }}
      />
      {files.length === 0 ? null : (
        <ul
          className="m-0 flex list-none flex-wrap gap-1 p-0"
          aria-label={t('Attached files', 'File đính kèm')}
        >
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-1 rounded-xl bg-surface-secondary py-0.5 pl-3 pr-1 text-sm"
            >
              <span className="max-w-60 truncate">{file.name}</span>
              <span className="text-xs text-muted">{sizeText(file.size)}</span>
              <CloseButton
                className="size-6 hover:bg-danger hover:text-danger-foreground"
                aria-label={t(`Remove ${file.name}`, `Bỏ ${file.name}`)}
                onPress={() => {
                  setFiles((current) => current.filter((item) => item.id !== file.id))
                }}
              />
            </li>
          ))}
        </ul>
      )}
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
        {mode === 'edit' ? null : (
          <>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept="image/png,image/jpeg,image/gif"
              aria-label={t('Choose images', 'Chọn ảnh')}
              onChange={(event) => {
                void addImages([...(event.target.files ?? [])])
                event.target.value = ''
              }}
            />
            <input
              ref={attachInput}
              type="file"
              hidden
              multiple
              aria-label={t('Choose files', 'Chọn file')}
              onChange={(event) => {
                void addFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            <Button
              isIconOnly
              variant="secondary"
              size="sm"
              aria-label={t('Attach a file', 'Đính kèm file')}
              isDisabled={sending}
              onPress={() => {
                attachInput.current?.click()
              }}
            >
              <span title={t('Attach a file', 'Đính kèm file')} className="flex">
                <Paperclip />
              </span>
            </Button>
            <Button
              isIconOnly
              variant="secondary"
              size="sm"
              aria-label={t('Add an image', 'Thêm ảnh')}
              isDisabled={sending}
              onPress={() => {
                fileInput.current?.click()
              }}
            >
              <span title={t('Add an image', 'Thêm ảnh')} className="flex">
                <Picture />
              </span>
            </Button>
          </>
        )}
        <Button
          isIconOnly
          variant="secondary"
          size="sm"
          aria-label={t('Tag someone', 'Tag người')}
          isDisabled={sending}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onPress={startMention}
        >
          <span title={t('Tag someone', 'Tag người')} className="flex">
            <At />
          </span>
        </Button>
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
          <Button variant="secondary" size="sm" onPress={onCancel}>
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
