import { t } from '../i18n.js'
import type { JiraForm } from './jiraForm.js'
import { TextField } from '../ui/TextField.js'

interface AdvancedFieldsProps {
  readonly form: JiraForm
  readonly onChange: (changes: Partial<JiraForm>) => void
}

export function AdvancedFields({ form, onChange }: AdvancedFieldsProps): React.JSX.Element {
  return (
    <>
      <TextField
        id="jira-eta-field"
        label={t('settings.etaDateFieldId')}
        hint={t('settings.theJiraCustomFieldThatHolds')}
        placeholder="customfield_10735"
        value={form.etaFieldId}
        onChange={(value) => {
          onChange({ etaFieldId: value })
        }}
      />
      <TextField
        id="jira-dev-priority-field"
        label={t('settings.devPriorityFieldId')}
        hint={t('settings.theJiraCustomFieldThatHolds2')}
        placeholder="customfield_11111"
        value={form.devPriorityFieldId}
        onChange={(value) => {
          onChange({ devPriorityFieldId: value })
        }}
      />
      <TextField
        id="jira-assigned-jql"
        label={t('settings.assignedTicketsQueryJql')}
        hint={t('settings.whichTicketsTheBoardChecksEmpty')}
        multiline
        value={form.assignedJql}
        onChange={(value) => {
          onChange({ assignedJql: value })
        }}
      />
      <TextField
        id="jira-mine-jql"
        label={t('settings.queryForMyTickets')}
        hint={t('settings.whichTicketsCountAsYoursWhen')}
        multiline
        value={form.mineJql}
        onChange={(value) => {
          onChange({ mineJql: value })
        }}
      />
      <TextField
        id="jira-pre-work-statuses"
        label={t('settings.statusesBeforeWorkStarts')}
        hint={t('settings.onePerLineAsJiraNames')}
        multiline
        value={form.preWorkStatuses}
        onChange={(value) => {
          onChange({ preWorkStatuses: value })
        }}
      />
      <TextField
        id="jira-rework-statuses"
        label={t('settings.statusesThatMeanSentBack')}
        hint={t('settings.onePerLineADoneTicket')}
        multiline
        value={form.reworkStatuses}
        onChange={(value) => {
          onChange({ reworkStatuses: value })
        }}
      />
      <TextField
        id="jira-ready-to-test-path"
        label={t('settings.readyToTestPath')}
        hint={t('settings.oneStatusPerLineInOrder')}
        multiline
        value={form.readyToTestPath}
        onChange={(value) => {
          onChange({ readyToTestPath: value })
        }}
      />
      <TextField
        id="jira-developer-statuses"
        label={t('settings.statusesOnTheDeveloper')}
        hint={t('settings.onePerLineATicketIn')}
        multiline
        value={form.developerStatuses}
        onChange={(value) => {
          onChange({ developerStatuses: value })
        }}
      />
      <h4 className="pt-2 text-sm font-semibold">{t('settings.suggestions')}</h4>
      <TextField
        id="jira-suggestions-epic-jql"
        label={t('settings.epicQueryJql')}
        hint={t('settings.findsTheEpicThatHoldsThe')}
        multiline
        value={form.suggestionsEpicJql}
        onChange={(value) => {
          onChange({ suggestionsEpicJql: value })
        }}
      />
      <TextField
        id="jira-suggestions-epic-prefix"
        label={t('settings.epicTitlePrefix')}
        hint={t('settings.eGMdpIssues')}
        value={form.suggestionsEpicTitlePrefix}
        onChange={(value) => {
          onChange({ suggestionsEpicTitlePrefix: value })
        }}
      />
      <TextField
        id="jira-suggestions-candidates-jql"
        label={t('settings.candidatesQueryJql')}
        hint={t('settings.isReplacedByTheEpicKey')}
        multiline
        value={form.suggestionsCandidatesJql}
        onChange={(value) => {
          onChange({ suggestionsCandidatesJql: value })
        }}
      />
      <TextField
        id="jira-suggestions-mine-jql"
        label={t('settings.myTicketsInTheEpicJql')}
        hint={t('settings.isReplacedByTheEpicKey')}
        multiline
        value={form.suggestionsMineJql}
        onChange={(value) => {
          onChange({ suggestionsMineJql: value })
        }}
      />
      <TextField
        id="jira-suggestions-status"
        label={t('settings.preferredStatus')}
        hint={t('settings.ticketsInThisStatusAreListed')}
        value={form.suggestionsSelectedStatus}
        onChange={(value) => {
          onChange({ suggestionsSelectedStatus: value })
        }}
      />
    </>
  )
}
