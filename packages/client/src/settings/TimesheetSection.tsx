import type { SettingsView } from '@workday/core'
import { Button, Spinner } from '@heroui/react'
import { useState } from 'react'
import { ApiError, checkHrm, checkTscSession, signInTsc } from '../api/client.js'
import { useSaveSettings } from '../api/useSettings.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { TextField } from '../ui/TextField.js'
import { AdvancedDisclosure } from './AdvancedDisclosure.js'
import { TokenField } from './TokenField.js'
import { TscAdvancedFields } from './TscAdvancedFields.js'
import { formFromTimesheet, timesheetFromForm, type TimesheetForm } from './timesheetForm.js'
import { Tip } from '../ui/Tip.js'

interface StatusLine {
  readonly kind: 'ok' | 'error'
  readonly text: string
  readonly detail?: string | null
}

function StatusText({ status }: { readonly status: StatusLine | null }): React.JSX.Element | null {
  if (status === null) {
    return null
  }
  return (
    <p
      className={status.kind === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}
      role="status"
    >
      <Tip content={status.detail}>{status.text}</Tip>
    </p>
  )
}

function failureText(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 400) {
    return t('settings.enterTheHrmKeyAgainFor')
  }
  return t('settings.couldNotReachTheWorkdayServer2')
}

export function TimesheetSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const [form, setForm] = useState<TimesheetForm>(() =>
    formFromTimesheet(settings.config.timesheet),
  )
  const [hrmKey, setHrmKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [saveStatus, setSaveStatus] = useState<StatusLine | null>(null)
  const [hrmStatus, setHrmStatus] = useState<StatusLine | null>(null)
  const [tscStatus, setTscStatus] = useState<StatusLine | null>(null)

  function change(changes: Partial<TimesheetForm>): void {
    setForm((current) => ({ ...current, ...changes }))
  }

  async function runSave(): Promise<void> {
    setBusy(true)
    try {
      const key = hrmKey.trim()
      await save({
        timesheet: timesheetFromForm(form),
        ...(key === '' ? {} : { hrmApiKey: key }),
      })
      setHrmKey('')
      setReplacing(false)
      setSaveStatus({ kind: 'ok', text: t('settings.saved') })
    } catch (failure) {
      setSaveStatus({ kind: 'error', text: failureText(failure) })
    } finally {
      setBusy(false)
    }
  }

  async function runCheckHrm(): Promise<void> {
    setBusy(true)
    try {
      const key = hrmKey.trim()
      const result = await checkHrm({
        mcpUrl: form.mcpUrl.trim(),
        ...(key === '' ? {} : { hrmApiKey: key }),
      })
      setHrmStatus(
        result.ok
          ? { kind: 'ok', text: t('settings.hrmAcceptedTheKey') }
          : { kind: 'error', text: errorText(result.error) },
      )
    } catch (failure) {
      setHrmStatus({ kind: 'error', text: failureText(failure) })
    } finally {
      setBusy(false)
    }
  }

  async function runCheckTsc(): Promise<void> {
    setBusy(true)
    try {
      const result = await checkTscSession()
      if ('signedIn' in result) {
        setTscStatus(
          result.signedIn
            ? { kind: 'ok', text: t('settings.signedInToTsc') }
            : { kind: 'error', text: t('settings.notSignedInToTsc') },
        )
      } else {
        setTscStatus({ kind: 'error', text: errorText(result.error), detail: result.detail })
      }
    } catch {
      setTscStatus({
        kind: 'error',
        text: t('settings.couldNotReachTheWorkdayServer2'),
      })
    } finally {
      setBusy(false)
    }
  }

  async function runSignIn(): Promise<void> {
    setSigningIn(true)
    try {
      const result = await signInTsc()
      setTscStatus(
        result.ok
          ? { kind: 'ok', text: t('settings.signedInToTsc') }
          : { kind: 'error', text: errorText(result.error), detail: result.detail },
      )
    } catch {
      setTscStatus({
        kind: 'error',
        text: t('settings.couldNotReachTheWorkdayServer2'),
      })
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <Section title={t('settings.timesheet2')}>
      <h3 className="text-sm font-semibold">{t('settings.autoLog2')}</h3>
      <TextField
        id="timesheet-log-time"
        label={t('settings.logTime')}
        hint={t('settings.hhMmHrmAcceptsTodayS')}
        placeholder="18:00"
        value={form.logTime}
        onChange={(value) => {
          change({ logTime: value })
        }}
      />
      <h3 className="text-sm font-semibold">HRM</h3>
      <TextField
        id="hrm-mcp-url"
        label={t('settings.hrmMcpUrl')}
        hint={t('settings.theAddressOfTheHrmMcp')}
        value={form.mcpUrl}
        onChange={(value) => {
          change({ mcpUrl: value })
        }}
      />
      <TextField
        id="hrm-project-id"
        label={t('settings.hrmProjectId')}
        hint={t('settings.theProjectYourHoursAreLogged')}
        value={form.projectId}
        onChange={(value) => {
          change({ projectId: value })
        }}
      />
      <TokenField
        id="hrm-api-key"
        label={t('settings.hrmApiKey')}
        envText={t('settings.setByWorkdayHrmApiKey')}
        helpText={t('settings.sentOnlyToTheMcpUrl')}
        source={settings.hrmKeySource}
        replacing={replacing}
        value={hrmKey}
        onChange={setHrmKey}
        onReplace={() => {
          setReplacing(true)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy || form.mcpUrl.trim() === ''}
          onPress={() => {
            void runCheckHrm()
          }}
        >
          {t('settings.checkHrm')}
        </Button>
      </div>
      <StatusText status={hrmStatus} />
      <h3 className="text-sm font-semibold">TSC</h3>
      <TextField
        id="tsc-share-url"
        label={t('settings.tscShareUrl')}
        hint={t('settings.theShareLinkOfTheTimesheet')}
        value={form.shareUrl}
        onChange={(value) => {
          change({ shareUrl: value })
        }}
      />
      <TextField
        id="tsc-worksheet-pattern"
        label={t('settings.sheetNamePattern')}
        hint={t('settings.isReplacedByTheCurrentYear')}
        placeholder="Daily Reports - {year}"
        value={form.worksheetPattern}
        onChange={(value) => {
          change({ worksheetPattern: value })
        }}
      />
      <TextField
        id="tsc-columns"
        label={t('settings.hourColumns')}
        hint={t('settings.sheetColumnsTheHoursAreWritten')}
        placeholder="M, J"
        value={form.columns}
        onChange={(value) => {
          change({ columns: value })
        }}
      />
      <TextField
        id="tsc-token-pages"
        label={t('settings.signInPages')}
        hint={t('settings.oneUrlPerLineTriedIn')}
        multiline
        value={form.tokenPages}
        onChange={(value) => {
          change({ tokenPages: value })
        }}
      />
      <AdvancedDisclosure title={t('settings.advancedTsc')}>
        <TscAdvancedFields form={form} onChange={change} />
      </AdvancedDisclosure>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy || signingIn}
          onPress={() => {
            void runCheckTsc()
          }}
        >
          {t('settings.checkTscSession')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy || signingIn}
          onPress={() => {
            void runSignIn()
          }}
        >
          {t('settings.signInToTsc')}
        </Button>
        {signingIn ? <Spinner size="sm" /> : null}
      </div>
      <StatusText status={tscStatus} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy || signingIn}
          onPress={() => {
            void runSave()
          }}
        >
          {t('settings.save')}
        </Button>
      </div>
      <StatusText status={saveStatus} />
    </Section>
  )
}
