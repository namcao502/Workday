import type { SettingsView } from '@workday/core'
import { useState } from 'react'
import { ApiError, checkHrm, checkTscSession, signInTsc } from '../api/client.js'
import { useSaveSettings } from '../api/useSettings.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { TextField } from './TextField.js'
import { TokenField } from './TokenField.js'
import { TscAdvancedFields } from './TscAdvancedFields.js'
import { formFromTimesheet, timesheetFromForm, type TimesheetForm } from './timesheetForm.js'

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
      className={status.kind === 'error' ? 'status danger' : 'status success'}
      role="status"
      title={status.detail ?? undefined}
    >
      {status.text}
    </p>
  )
}

function failureText(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 400) {
    return t('Enter the HRM key again for the new URL', 'Hãy nhập lại key HRM cho địa chỉ mới')
  }
  return t('Could not reach the Workday server', 'Không kết nối được tới Workday server')
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
  const [showAdvanced, setShowAdvanced] = useState(false)
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
      setSaveStatus({ kind: 'ok', text: t('Saved', 'Đã lưu') })
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
          ? { kind: 'ok', text: t('HRM accepted the key', 'HRM đã chấp nhận key') }
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
            ? { kind: 'ok', text: t('Signed in to TSC', 'Đã đăng nhập TSC') }
            : { kind: 'error', text: t('Not signed in to TSC', 'Chưa đăng nhập TSC') },
        )
      } else {
        setTscStatus({ kind: 'error', text: errorText(result.error), detail: result.detail })
      }
    } catch {
      setTscStatus({
        kind: 'error',
        text: t('Could not reach the Workday server', 'Không kết nối được tới Workday server'),
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
          ? { kind: 'ok', text: t('Signed in to TSC', 'Đã đăng nhập TSC') }
          : { kind: 'error', text: errorText(result.error), detail: result.detail },
      )
    } catch {
      setTscStatus({
        kind: 'error',
        text: t('Could not reach the Workday server', 'Không kết nối được tới Workday server'),
      })
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <section className="section">
      <h2 className="section-title">{t('Timesheet', 'Chấm công')}</h2>
      <h3 className="section-subtitle">{t('Auto-log', 'Tự động log')}</h3>
      <TextField
        id="timesheet-log-time"
        label={t('Log time', 'Giờ log')}
        hint={t(
          "HH:mm. HRM accepts today's hours only from 6:00 PM.",
          'HH:mm. HRM chỉ nhận giờ của hôm nay từ 6:00 PM.',
        )}
        placeholder="18:00"
        value={form.logTime}
        onChange={(value) => {
          change({ logTime: value })
        }}
      />
      <h3 className="section-subtitle">HRM</h3>
      <TextField
        id="hrm-mcp-url"
        label={t('HRM MCP URL', 'Địa chỉ MCP của HRM')}
        hint={t('The address of the HRM MCP server', 'Địa chỉ máy chủ MCP của HRM')}
        value={form.mcpUrl}
        onChange={(value) => {
          change({ mcpUrl: value })
        }}
      />
      <TextField
        id="hrm-project-id"
        label={t('HRM project id', 'Mã dự án HRM')}
        hint={t('The project your hours are logged to', 'Dự án mà giờ làm được log vào')}
        value={form.projectId}
        onChange={(value) => {
          change({ projectId: value })
        }}
      />
      <TokenField
        id="hrm-api-key"
        label={t('HRM API key', 'HRM API key')}
        envText={t('Set by WORKDAY_HRM_API_KEY', 'Được đặt bởi WORKDAY_HRM_API_KEY')}
        helpText={t(
          'Sent only to the MCP URL it was saved with.',
          'Chỉ được gửi tới địa chỉ MCP đã lưu cùng nó.',
        )}
        source={settings.hrmKeySource}
        replacing={replacing}
        value={hrmKey}
        onChange={setHrmKey}
        onReplace={() => {
          setReplacing(true)
        }}
      />
      <div className="button-row">
        <button
          type="button"
          className="button secondary"
          disabled={busy || form.mcpUrl.trim() === ''}
          onClick={() => {
            void runCheckHrm()
          }}
        >
          {t('Check HRM', 'Kiểm tra HRM')}
        </button>
      </div>
      <StatusText status={hrmStatus} />
      <h3 className="section-subtitle">TSC</h3>
      <TextField
        id="tsc-share-url"
        label={t('TSC share URL', 'Share URL của TSC')}
        hint={t('The share link of the timesheet workbook', 'Link chia sẻ của workbook chấm công')}
        value={form.shareUrl}
        onChange={(value) => {
          change({ shareUrl: value })
        }}
      />
      <TextField
        id="tsc-worksheet-pattern"
        label={t('Sheet name pattern', 'Mẫu tên sheet')}
        hint={t('{year} is replaced by the current year', '{year} được thay bằng năm hiện tại')}
        placeholder="Daily Reports - {year}"
        value={form.worksheetPattern}
        onChange={(value) => {
          change({ worksheetPattern: value })
        }}
      />
      <TextField
        id="tsc-columns"
        label={t('Hour columns', 'Cột giờ')}
        hint={t(
          'Sheet columns the hours are written to, comma separated',
          'Các cột của sheet nhận giờ, cách nhau bằng dấu phẩy',
        )}
        placeholder="M, J"
        value={form.columns}
        onChange={(value) => {
          change({ columns: value })
        }}
      />
      <TextField
        id="tsc-token-pages"
        label={t('Sign-in pages', 'Trang lấy token')}
        hint={t(
          'One URL per line, tried in order, to read the Microsoft token from',
          'Mỗi dòng một URL, thử lần lượt, để lấy token Microsoft',
        )}
        rows={3}
        value={form.tokenPages}
        onChange={(value) => {
          change({ tokenPages: value })
        }}
      />
      <button
        type="button"
        className="button ghost"
        aria-expanded={showAdvanced}
        onClick={() => {
          setShowAdvanced((current) => !current)
        }}
      >
        {t('Advanced TSC', 'TSC nâng cao')}
      </button>
      {showAdvanced ? <TscAdvancedFields form={form} onChange={change} /> : null}
      <div className="button-row">
        <button
          type="button"
          className="button secondary"
          disabled={busy || signingIn}
          onClick={() => {
            void runCheckTsc()
          }}
        >
          {t('Check TSC session', 'Kiểm tra phiên TSC')}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy || signingIn}
          onClick={() => {
            void runSignIn()
          }}
        >
          {t('Sign in to TSC', 'Đăng nhập TSC')}
        </button>
        {signingIn ? <span className="spinner" aria-hidden="true" /> : null}
      </div>
      <StatusText status={tscStatus} />
      <div className="button-row">
        <button
          type="button"
          className="button primary"
          disabled={busy || signingIn}
          onClick={() => {
            void runSave()
          }}
        >
          {t('Save', 'Lưu')}
        </button>
      </div>
      <StatusText status={saveStatus} />
    </section>
  )
}
