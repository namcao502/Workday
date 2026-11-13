import type { SettingsView } from '@workday/core'
import { useState } from 'react'
import { useSaveSettings } from '../api/useSettings.js'
import { t } from '../i18n.js'
import { TextField } from './TextField.js'
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
    <section className="section">
      <h2 className="section-title">{t('Workspace', 'Không gian làm việc')}</h2>
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
      <label className="field-row">
        <span>{t('Chat view', 'Chat view')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={form.chatView}
          onChange={(event) => {
            change({ chatView: event.target.checked })
          }}
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => {
            void runSave()
          }}
        >
          {t('Save', 'Lưu')}
        </button>
      </div>
      {status === null ? null : (
        <p className={status.ok ? 'status success' : 'status danger'} role="status">
          {status.text}
        </p>
      )}
    </section>
  )
}
