import type { SettingsView } from '@workday/core'
import { Button } from '@heroui/react'
import { useState } from 'react'
import { ApiError, checkAdo } from '../api/client.js'
import { useSaveSettings } from '../api/useSettings.js'
import { errorText } from '../errors.js'
import { t } from '../i18n.js'
import { adoFromForm, formFromAdo, hasAdoTarget, type AdoForm } from './adoForm.js'
import { Section } from '../ui/Section.js'
import { TextField } from '../ui/TextField.js'
import { TokenField } from './TokenField.js'

interface StatusLine {
  readonly kind: 'ok' | 'error'
  readonly text: string
}

function failureText(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 400) {
    return t('settings.rejectedCheckTheValuesANew')
  }
  return t('settings.couldNotReachTheWorkdayServer')
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
              text: t('settings.connectedAs', { displayName: result.displayName }),
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
      setStatus({ kind: 'ok', text: t('settings.saved') })
    } catch (failure) {
      setStatus({ kind: 'error', text: failureText(failure) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Azure DevOps">
      <TextField
        id="ado-organization"
        label={t('settings.organization')}
        hint={t('settings.theNameInDevAzureCom')}
        value={form.organization}
        onChange={(value) => {
          change({ organization: value })
        }}
      />
      <TextField
        id="ado-project"
        label={t('settings.project')}
        hint={t('settings.theProjectThatHoldsTheRepos')}
        value={form.project}
        onChange={(value) => {
          change({ project: value })
        }}
      />
      <TextField
        id="ado-repo-labels"
        label={t('settings.repoLabels')}
        hint={t('settings.oneRepoLabelPerLineIn')}
        multiline
        value={form.repoLabels}
        onChange={(value) => {
          change({ repoLabels: value })
        }}
      />
      <TextField
        id="ado-dev-pipeline-folder"
        label={t('settings.devPipelineFolder')}
        hint={t('settings.eGDevelopmentPipelinesEmptyNo')}
        value={form.devPipelineFolder}
        onChange={(value) => {
          change({ devPipelineFolder: value })
        }}
      />
      <TokenField
        id="ado-pat"
        label={t('settings.azureDevopsPat')}
        envText={t('settings.takenFromWorkdayAdoPatIn')}
        helpText={t('settings.aPersonalAccessTokenWithCode')}
        source={settings.adoPatSource}
        replacing={replacing}
        value={pat}
        onChange={setPat}
        onReplace={() => {
          setReplacing(true)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          isDisabled={busy || !hasAdoTarget(form)}
          onPress={() => {
            void runCheck()
          }}
        >
          {t('settings.check')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            void runSave()
          }}
        >
          {t('settings.save')}
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
