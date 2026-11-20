import { Button, Label } from '@heroui/react'
import { useState } from 'react'
import { ApiError } from '../api/client.js'
import { exportBackup, importBackup } from '../api/backupApi.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { isDesktopShell, requestServerRestart } from '../shell/desktopHost.js'
import { Section } from '../ui/Section.js'
import { TextField } from '../ui/TextField.js'

type Message = { readonly ok: boolean; readonly text: string }

function failureText(failure: unknown): string {
  return failure instanceof ApiError && failure.code !== null
    ? errorText({ code: failure.code })
    : t('settings.couldNotReachTheWorkdayServer2')
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function MessageLine({ message }: { readonly message: Message | null }): React.JSX.Element | null {
  return message === null ? null : (
    <p className={message.ok ? 'text-sm text-success' : 'text-sm text-danger'} role="status">
      {message.text}
    </p>
  )
}

function ExportPart(): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const differ = confirm !== '' && password !== confirm

  async function run(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const file = await exportBackup(password)
      download(file.blob, file.filename)
    } catch (failure) {
      setMessage({ ok: false, text: failureText(failure) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        id="backup-password"
        label={t('settings.backupPassword')}
        hint={t('settings.backupPasswordHint')}
        type="password"
        value={password}
        onChange={setPassword}
      />
      <TextField
        id="backup-confirm"
        label={t('settings.backupConfirmPassword')}
        hint={t('settings.backupConfirmHint')}
        type="password"
        value={confirm}
        onChange={setConfirm}
      />
      {differ ? <p className="text-sm text-danger">{t('settings.backupPasswordsDiffer')}</p> : null}
      <div>
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy || password === '' || confirm === '' || differ}
          onPress={() => {
            void run()
          }}
        >
          {t('settings.backupExport')}
        </Button>
      </div>
      <MessageLine message={message} />
    </div>
  )
}

function ImportPart(): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [isImported, setImported] = useState(false)

  async function run(): Promise<void> {
    if (file === null) {
      return
    }
    setBusy(true)
    setMessage(null)
    setImported(false)
    try {
      const result = await importBackup(password, await file.text())
      setMessage({
        ok: true,
        text: t('settings.backupImportedFiles', { files: result.files.join(', ') }),
      })
      setImported(true)
    } catch (failure) {
      setMessage({ ok: false, text: failureText(failure) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="backup-file">{t('settings.backupFile')}</Label>
        <input
          id="backup-file"
          type="file"
          accept=".wdbackup"
          className="text-sm"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
          }}
        />
      </div>
      <TextField
        id="backup-import-password"
        label={t('settings.backupImportPassword')}
        hint={t('settings.backupImportPasswordHint')}
        type="password"
        value={password}
        onChange={setPassword}
      />
      <div>
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy || file === null || password === ''}
          onPress={() => {
            void run()
          }}
        >
          {t('settings.backupImport')}
        </Button>
      </div>
      <MessageLine message={message} />
      {isImported ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">{t('settings.backupRestartHint')}</p>
          {isDesktopShell() ? (
            <Button variant="secondary" size="sm" onPress={requestServerRestart}>
              {t('settings.backupRestartNow')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function BackupSection(): React.JSX.Element {
  return (
    <Section
      title={t('settings.backupMoveToAnotherPc')}
      description={t('settings.backupDescription')}
    >
      <ExportPart />
      <ImportPart />
    </Section>
  )
}
