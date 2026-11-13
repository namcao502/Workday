import type { SettingsView } from '@workday/core'
import { useState } from 'react'
import { ApiError, checkAdo } from '../api/client.js'
import { useSaveSettings } from '../api/useSettings.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { adoFromForm, formFromAdo, hasAdoTarget, type AdoForm } from './adoForm.js'
import { TextField } from './TextField.js'
import { TokenField } from './TokenField.js'

interface StatusLine {
  readonly kind: 'ok' | 'error'
  readonly text: string
}

function failureText(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 400) {
    return t(
      'Rejected. Check the values; a new organization needs a PAT.',
      'Bị từ chối. Kiểm tra các giá trị; organization mới cần PAT.',
    )
  }
  return t('Could not reach the Workday server', 'Không kết nối được tới máy chủ Workday')
}

export function AzureDevOpsSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const [form, setForm] = useState<AdoForm>(() => formFromAdo(settings.config.azureDevOps))
  const [pat, setPat] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<StatusLine | null>(null)

  function change(changes: Partial<AdoForm>): void {
    setForm((current) => ({ ...current, ...changes }))
  }

  async function runCheck(): Promise<void> {
    setBusy(true)
    try {
      const trimmed = pat.trim()
      const result = await checkAdo({
        organization: form.organization.trim(),
        project: form.project.trim(),
        ...(trimmed === '' ? {} : { adoPat: trimmed }),
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
      const trimmed = pat.trim()
      await save({
        azureDevOps: adoFromForm(form),
        ...(trimmed === '' ? {} : { adoPat: trimmed }),
      })
      setPat('')
      setReplacing(false)
      setStatus({ kind: 'ok', text: t('Saved', 'Đã lưu') })
    } catch (failure) {
      setStatus({ kind: 'error', text: failureText(failure) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section">
      <h2 className="section-title">Azure DevOps</h2>
      <TextField
        id="ado-organization"
        label={t('Organization', 'Organization')}
        hint={t(
          'The name in dev.azure.com/<organization>',
          'Tên trong dev.azure.com/<organization>',
        )}
        value={form.organization}
        onChange={(value) => {
          change({ organization: value })
        }}
      />
      <TextField
        id="ado-project"
        label={t('Project', 'Project')}
        hint={t('The project that holds the repos', 'Project chứa các repo')}
        value={form.project}
        onChange={(value) => {
          change({ project: value })
        }}
      />
      <TextField
        id="ado-repo-labels"
        label={t('Repo labels', 'Nhãn repo')}
        hint={t(
          'One Repo=Label per line, in the order shown. Example: MDP-Portal=Portal',
          'Mỗi dòng một Repo=Nhãn, theo thứ tự hiển thị. Ví dụ: MDP-Portal=Portal',
        )}
        rows={4}
        value={form.repoLabels}
        onChange={(value) => {
          change({ repoLabels: value })
        }}
      />
      <TextField
        id="ado-dev-pipeline-folder"
        label={t('Dev pipeline folder', 'Thư mục pipeline dev')}
        hint={t(
          'e.g. \\Development-Pipelines. Empty = no deploy watch',
          'Ví dụ \\Development-Pipelines. Để trống = không theo dõi deploy',
        )}
        value={form.devPipelineFolder}
        onChange={(value) => {
          change({ devPipelineFolder: value })
        }}
      />
      <TokenField
        id="ado-pat"
        label={t('Azure DevOps PAT', 'Azure DevOps PAT')}
        envText={t(
          'Taken from WORKDAY_ADO_PAT in .env - nothing to enter',
          'Lấy từ WORKDAY_ADO_PAT trong .env - không cần nhập',
        )}
        helpText={t(
          'A personal access token with Code (read) and Build (read) scopes.',
          'Personal access token có quyền Code (read) và Build (read).',
        )}
        source={settings.adoPatSource}
        replacing={replacing}
        value={pat}
        onChange={setPat}
        onReplace={() => {
          setReplacing(true)
        }}
      />
      <div className="button-row">
        <button
          type="button"
          className="wd-button secondary"
          disabled={busy || !hasAdoTarget(form)}
          onClick={() => {
            void runCheck()
          }}
        >
          {t('Check', 'Kiểm tra')}
        </button>
        <button
          type="button"
          className="wd-button primary"
          disabled={busy}
          onClick={() => {
            void runSave()
          }}
        >
          {t('Save', 'Lưu')}
        </button>
      </div>
      {status === null ? null : (
        <p className={status.kind === 'error' ? 'status danger' : 'status success'} role="status">
          {status.text}
        </p>
      )}
    </section>
  )
}
