import type { SettingsView } from '@workday/core'
import { Button, Switch } from '@heroui/react'
import { useState } from 'react'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { TextField } from '../ui/TextField.js'
import { CleanupDialog } from '../workspace/CleanupDialog.js'
import { formFromWorkspace, workspaceFromForm, type WorkspaceForm } from './workspaceForm.js'

export function WorkspaceSection({
  settings,
}: {
  readonly settings: SettingsView
}): React.JSX.Element {
  const save = useSaveSettings()
  const [form, setForm] = useState<WorkspaceForm>(() =>
    formFromWorkspace(settings.config.workspace),
  )
  const [busy, setBusy] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [status, setStatus] = useState<{ readonly ok: boolean; readonly text: string } | null>(null)

  function change(changes: Partial<WorkspaceForm>): void {
    setForm((current) => ({ ...current, ...changes }))
  }

  async function runSave(): Promise<void> {
    setBusy(true)
    try {
      await save({ workspace: workspaceFromForm(form) })
      setStatus({ ok: true, text: t('settings.saved') })
    } catch {
      setStatus({
        ok: false,
        text: t('settings.couldNotSaveTheWorkspaceSettings'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t('settings.workspace')}>
      <TextField
        id="workspace-dev-repo"
        label={t('settings.devRepo')}
        hint={t('settings.theMainCheckoutEveryTicketWorktree')}
        value={form.devRepoPath}
        onChange={(value) => {
          change({ devRepoPath: value })
        }}
      />
      <TextField
        id="workspace-sibling-glob"
        label={t('settings.siblingRepoPattern')}
        hint={t('settings.eGAngularEmptyOnlyThe')}
        value={form.siblingRepoGlob}
        onChange={(value) => {
          change({ siblingRepoGlob: value })
        }}
      />
      <TextField
        id="workspace-start-prompt"
        label={t('settings.startPrompt')}
        hint={t('settings.isTheTicketEmptyPlainClaude')}
        value={form.startPrompt}
        onChange={(value) => {
          change({ startPrompt: value })
        }}
      />
      <Switch
        isSelected={form.autoStartTickets}
        onChange={(selected) => {
          change({ autoStartTickets: selected })
        }}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {t('settings.startANewlyAssignedTicketBy')}
        </Switch.Content>
      </Switch>
      <TextField
        id="workspace-claude-executable"
        label={t('settings.claudeExecutable')}
        hint={t('settings.emptyLocalBinClaudeElsePath')}
        value={form.claudeExecutable}
        onChange={(value) => {
          change({ claudeExecutable: value })
        }}
      />
      <TextField
        id="workspace-local-only"
        label={t('settings.localOnlyPaths')}
        hint={t('settings.onePerLineNeverListedIn')}
        multiline
        value={form.localOnlyPaths}
        onChange={(value) => {
          change({ localOnlyPaths: value })
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
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
        <Button
          variant="secondary"
          size="sm"
          onPress={() => {
            setCleaning(true)
          }}
        >
          {t('settings.cleanUpWorktrees')}
        </Button>
      </div>
      {status === null ? null : (
        <p className={status.ok ? 'text-sm text-success' : 'text-sm text-danger'} role="status">
          {status.text}
        </p>
      )}
      {cleaning ? (
        <CleanupDialog
          onClose={() => {
            setCleaning(false)
          }}
        />
      ) : null}
    </Section>
  )
}
