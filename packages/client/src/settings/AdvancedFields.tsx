import { t } from '../i18n.js'
import type { JiraForm } from './jiraForm.js'
import { TextField } from './TextField.js'

interface AdvancedFieldsProps {
  readonly form: JiraForm
  readonly onChange: (changes: Partial<JiraForm>) => void
}

export function AdvancedFields({ form, onChange }: AdvancedFieldsProps): React.JSX.Element {
  return (
    <div className="advanced">
      <TextField
        id="jira-eta-field"
        label={t('ETA date field id', 'Mã trường ngày ETA')}
        hint={t(
          'The Jira custom field that holds the ETA date. Empty: no ETA column.',
          'Trường tùy chỉnh của Jira chứa ngày ETA. Để trống: không có cột ETA.',
        )}
        placeholder="customfield_10735"
        value={form.etaFieldId}
        onChange={(value) => {
          onChange({ etaFieldId: value })
        }}
      />
      <TextField
        id="jira-dev-priority-field"
        label={t('Dev priority field id', 'Mã trường Dev priority')}
        hint={t(
          'The Jira custom field that holds the dev priority (the P column). Empty: no P column.',
          'Trường tùy chỉnh của Jira chứa độ ưu tiên dev (cột P). Để trống: không có cột P.',
        )}
        placeholder="customfield_11111"
        value={form.devPriorityFieldId}
        onChange={(value) => {
          onChange({ devPriorityFieldId: value })
        }}
      />
      <TextField
        id="jira-assigned-jql"
        label={t('Assigned tickets query (JQL)', 'Truy vấn ticket được giao (JQL)')}
        hint={t(
          'Which tickets the board checks. Empty: your open tickets, newest first.',
          'Những ticket board sẽ kiểm. Để trống: ticket chưa xong của bạn, mới nhất trước.',
        )}
        rows={2}
        value={form.assignedJql}
        onChange={(value) => {
          onChange({ assignedJql: value })
        }}
      />
      <TextField
        id="jira-mine-jql"
        label={t('Query for my tickets', 'Truy vấn ticket của tôi')}
        hint={t(
          'Which tickets count as yours when you log time. Empty: assigned to you now or before.',
          'Những ticket được tính là của bạn khi log giờ. Để trống: được giao cho bạn hiện tại hoặc trước đây.',
        )}
        rows={2}
        value={form.mineJql}
        onChange={(value) => {
          onChange({ mineJql: value })
        }}
      />
      <TextField
        id="jira-pre-work-statuses"
        label={t('Statuses before work starts', 'Trạng thái trước khi bắt đầu làm')}
        hint={t(
          'One per line, as Jira names them: Backlog, Selected for Development, In Progress, Hold.',
          'Mỗi dòng một tên, đúng như Jira: Backlog, Selected for Development, In Progress, Hold.',
        )}
        rows={3}
        value={form.preWorkStatuses}
        onChange={(value) => {
          onChange({ preWorkStatuses: value })
        }}
      />
      <TextField
        id="jira-rework-statuses"
        label={t('Statuses that mean sent back', 'Trạng thái nghĩa là bị trả lại')}
        hint={t(
          'One per line. A Done ticket that moves to one of these returns to Working: In Progress, QA Failed, Reopened.',
          'Mỗi dòng một tên. Ticket đã Done chuyển sang một trong các trạng thái này sẽ quay về Working: In Progress, QA Failed, Reopened.',
        )}
        rows={3}
        value={form.reworkStatuses}
        onChange={(value) => {
          onChange({ reworkStatuses: value })
        }}
      />
    </div>
  )
}
