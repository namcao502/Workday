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
      <TextField
        id="jira-ready-to-test-path"
        label={t('Ready to Test path', 'Đường đi tới Ready to Test')}
        hint={t(
          'One status per line, in order; the last is Ready to Test. Empty: the feature is off.',
          'Mỗi dòng một trạng thái, theo thứ tự; dòng cuối là Ready to Test. Để trống: tắt tính năng.',
        )}
        rows={3}
        value={form.readyToTestPath}
        onChange={(value) => {
          onChange({ readyToTestPath: value })
        }}
      />
      <TextField
        id="jira-developer-statuses"
        label={t('Statuses on the developer', 'Trạng thái đang chờ developer')}
        hint={t(
          'One per line. A ticket in one of these is yours to move. Empty: every status counts.',
          'Mỗi dòng một tên. Ticket ở các trạng thái này là việc của bạn. Để trống: mọi trạng thái đều tính.',
        )}
        rows={3}
        value={form.developerStatuses}
        onChange={(value) => {
          onChange({ developerStatuses: value })
        }}
      />
      <h4 className="section-subtitle">{t('Suggestions', 'Gợi ý')}</h4>
      <TextField
        id="jira-suggestions-epic-jql"
        label={t('Epic query (JQL)', 'Truy vấn epic (JQL)')}
        hint={t(
          'Finds the epic that holds the tickets to take.',
          'Tìm epic chứa các ticket để nhận.',
        )}
        rows={2}
        value={form.suggestionsEpicJql}
        onChange={(value) => {
          onChange({ suggestionsEpicJql: value })
        }}
      />
      <TextField
        id="jira-suggestions-epic-prefix"
        label={t('Epic title prefix', 'Tiền tố tên epic')}
        hint={t('e.g. "MDP Issues - ".', 'Ví dụ "MDP Issues - ".')}
        value={form.suggestionsEpicTitlePrefix}
        onChange={(value) => {
          onChange({ suggestionsEpicTitlePrefix: value })
        }}
      />
      <TextField
        id="jira-suggestions-candidates-jql"
        label={t('Candidates query (JQL)', 'Truy vấn ticket ứng viên (JQL)')}
        hint={t('{epic} is replaced by the epic key.', '{epic} được thay bằng mã epic.')}
        rows={2}
        value={form.suggestionsCandidatesJql}
        onChange={(value) => {
          onChange({ suggestionsCandidatesJql: value })
        }}
      />
      <TextField
        id="jira-suggestions-mine-jql"
        label={t('My tickets in the epic (JQL)', 'Ticket của tôi trong epic (JQL)')}
        hint={t('{epic} is replaced by the epic key.', '{epic} được thay bằng mã epic.')}
        rows={2}
        value={form.suggestionsMineJql}
        onChange={(value) => {
          onChange({ suggestionsMineJql: value })
        }}
      />
      <TextField
        id="jira-suggestions-status"
        label={t('Preferred status', 'Trạng thái ưu tiên')}
        hint={t(
          'Tickets in this status are listed first. Empty: none.',
          'Ticket ở trạng thái này lên đầu. Để trống: không ưu tiên.',
        )}
        value={form.suggestionsSelectedStatus}
        onChange={(value) => {
          onChange({ suggestionsSelectedStatus: value })
        }}
      />
    </div>
  )
}
