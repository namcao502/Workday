import type { SettingsView } from '@workday/core'
import { Button, Label } from '@heroui/react'
import { useState } from 'react'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { Section } from '../ui/Section.js'
import { TextField } from '../ui/TextField.js'
import { ModeSelect } from '../workspace/ModeSelect.js'
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
  const [status, setStatus] = useState<{ readonly ok: boolean; readonly text: string } | null>(null)

  function change(changes: Partial<WorkspaceForm>): void {
    setForm((current) => ({ ...current, ...changes }))
  }

  async function runSave(): Promise<void> {
    setBusy(true)
    try {
      await save({ workspace: workspaceFromForm(form) })
      setStatus({ ok: true, text: t('Saved', 'Đã lưu') })
    } catch {
      setStatus({
        ok: false,
        text: t(
          'Could not save the workspace settings',
          'Không lưu được cài đặt không gian làm việc',
        ),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t('Workspace', 'Không gian làm việc')}>
      <TextField
        id="workspace-dev-repo"
        label={t('Dev repo', 'Dev repo')}
        hint={t(
          'The main checkout every ticket worktree is made from',
          'Bản checkout chính để tạo worktree cho từng ticket',
        )}
        value={form.devRepoPath}
        onChange={(value) => {
          change({ devRepoPath: value })
        }}
      />
      <TextField
        id="workspace-sibling-glob"
        label={t('Sibling repo pattern', 'Mẫu repo anh em')}
        hint={t(
          'e.g. *-Angular. Empty = only the dev repo',
          'Ví dụ *-Angular. Để trống = chỉ dev repo',
        )}
        value={form.siblingRepoGlob}
        onChange={(value) => {
          change({ siblingRepoGlob: value })
        }}
      />
      <TextField
        id="workspace-start-prompt"
        label={t('Start prompt', 'Lời nhắc khi bắt đầu')}
        hint={t(
          '{key} is the ticket. Empty = plain claude',
          '{key} là ticket. Để trống = chạy claude thường',
        )}
        value={form.startPrompt}
        onChange={(value) => {
          change({ startPrompt: value })
        }}
      />
      <TextField
        id="workspace-claude-executable"
        label={t('Claude executable', 'File chạy Claude')}
        hint={t(
          'Empty = ~/.local/bin/claude, else PATH',
          'Để trống = ~/.local/bin/claude, nếu không thì PATH',
        )}
        value={form.claudeExecutable}
        onChange={(value) => {
          change({ claudeExecutable: value })
        }}
      />
      <TextField
        id="workspace-local-only"
        label={t('Local-only paths', 'Đường dẫn chỉ ở máy')}
        hint={t(
          'One per line. Never listed in Changes',
          'Mỗi dòng một đường dẫn. Không hiện trong Changes',
        )}
        rows={3}
        value={form.localOnlyPaths}
        onChange={(value) => {
          change({ localOnlyPaths: value })
        }}
      />
      <div className="flex flex-col gap-1">
        <Label>{t('Default permission mode', 'Chế độ quyền mặc định')}</Label>
        <ModeSelect
          label={t('Default permission mode', 'Chế độ quyền mặc định')}
          value={form.permissionMode}
          onChange={(permissionMode) => {
            change({ permissionMode })
          }}
        />
        <p className="text-sm text-muted">
          {t(
            'The mode a new Claude chat session starts in',
            'Chế độ một phiên chat Claude mới bắt đầu',
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isDisabled={busy}
          onPress={() => {
            void runSave()
          }}
        >
          {t('Save', 'Lưu')}
        </Button>
      </div>
      {status === null ? null : (
        <p className={status.ok ? 'text-sm text-success' : 'text-sm text-danger'} role="status">
          {status.text}
        </p>
      )}
    </Section>
  )
}
