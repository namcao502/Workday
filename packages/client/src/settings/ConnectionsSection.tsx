import type { SettingsView } from '@workday/core'
import { Button } from '@heroui/react'
import { useState } from 'react'
import { ApiError, checkJira } from '../api/client.js'
import { useSaveSettings } from '../api/useSettings.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { AdvancedDisclosure } from './AdvancedDisclosure.js'
import { AdvancedFields } from './AdvancedFields.js'
import { TextField } from '../ui/TextField.js'
import { TokenField } from './TokenField.js'
import { configFromForm, formFromConfig, hasRequiredFields, type JiraForm } from './jiraForm.js'

interface StatusLine {
  readonly kind: 'ok' | 'error'
  readonly text: string
}

function failureText(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 400) {
    return t(
      'Rejected. Check the values; a new Jira URL needs an API token.',
      'Bị từ chối. Kiểm tra các giá trị; địa chỉ Jira mới cần API token.',
    )
  }
  return t('Could not reach the Workday server', 'Không kết nối được tới máy chủ Workday')
}

export function ConnectionsSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const savedJira = settings.config.jira
  const save = useSaveSettings()
  const [form, setForm] = useState<JiraForm>(() => formFromConfig(savedJira))
  const [token, setToken] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<StatusLine | null>(null)

  function change(changes: Partial<JiraForm>): void {
    setForm((current) => ({ ...current, ...changes }))
  }

  async function runCheck(): Promise<void> {
    setBusy(true)
    try {
      const trimmedToken = token.trim()
      const result = await checkJira({
        baseUrl: form.baseUrl.trim(),
        email: form.email.trim(),
        ...(trimmedToken === '' ? {} : { jiraApiToken: trimmedToken }),
      })
      setStatus(
        result.ok
          ? {
              kind: 'ok',
              text: t(`Connected as ${result.displayName}`, `Đã kết nối: ${result.displayName}`),
            }
          : { kind: 'error', text: errorText(result.error) },
      )
    } catch (failure) {
      setStatus({ kind: 'error', text: failureText(failure) })
    } finally {
      setBusy(false)
    }
  }

  async function runSave(): Promise<void> {
    setBusy(true)
    try {
      const trimmedToken = token.trim()
      await save({
        jira: configFromForm(form, savedJira),
        ...(trimmedToken === '' ? {} : { jiraApiToken: trimmedToken }),
      })
      setToken('')
      setReplacing(false)
      setStatus({ kind: 'ok', text: t('Saved', 'Đã lưu') })
    } catch (failure) {
      setStatus({ kind: 'error', text: failureText(failure) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t('Connections', 'Kết nối')}>
      <h3 className="text-sm font-semibold">Jira</h3>
      <TextField
        id="jira-base-url"
        label={t('Jira site URL', 'Địa chỉ trang Jira')}
        hint={t(
          'The address you open Jira at, without a path',
          'Địa chỉ bạn mở Jira, không kèm đường dẫn phía sau',
        )}
        placeholder="https://yourcompany.atlassian.net"
        value={form.baseUrl}
        onChange={(value) => {
          change({ baseUrl: value })
        }}
      />
      <TextField
        id="jira-email"
        label={t('Jira account email', 'Email tài khoản Jira')}
        hint={t('The email you sign in to Jira with', 'Email bạn dùng để đăng nhập Jira')}
        type="email"
        value={form.email}
        onChange={(value) => {
          change({ email: value })
        }}
      />
      <TokenField
        source={settings.jiraTokenSource}
        replacing={replacing}
        value={token}
        onChange={setToken}
        onReplace={() => {
          setReplacing(true)
        }}
      />
      <TextField
        id="jira-project-key"
        label={t('Ticket key prefix', 'Tiền tố mã ticket')}
        hint={t(
          'The letters before the number in a ticket key: MDP for MDP-1234',
          'Phần chữ trước số trong mã ticket: MDP cho MDP-1234',
        )}
        placeholder="MDP"
        value={form.projectKey}
        onChange={(value) => {
          change({ projectKey: value })
        }}
      />
      <AdvancedDisclosure title={t('Advanced', 'Nâng cao')}>
        <AdvancedFields form={form} onChange={change} />
      </AdvancedDisclosure>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy || !hasRequiredFields(form)}
          onPress={() => {
            void runCheck()
          }}
        >
          {t('Check', 'Kiểm tra')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy || !hasRequiredFields(form)}
          onPress={() => {
            void runSave()
          }}
        >
          {t('Save', 'Lưu')}
        </Button>
      </div>
      {status === null ? null : (
        <p
          className={status.kind === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}
          role="status"
        >
          {status.text}
        </p>
      )}
    </Section>
  )
}
