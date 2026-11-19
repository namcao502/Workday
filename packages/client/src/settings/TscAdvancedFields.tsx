import { t } from '../i18n.js'
import { TextField } from '../ui/TextField.js'
import type { TimesheetForm } from './timesheetForm.js'

interface TscAdvancedFieldsProps {
  readonly form: TimesheetForm
  readonly onChange: (changes: Partial<TimesheetForm>) => void
}

export function TscAdvancedFields({ form, onChange }: TscAdvancedFieldsProps): React.JSX.Element {
  return (
    <>
      <TextField
        id="tsc-header-rows"
        label={t('settings.headerRows')}
        hint={t('settings.rowsAtTheTopOfThe')}
        value={form.headerRows}
        onChange={(value) => {
          onChange({ headerRows: value })
        }}
      />
      <TextField
        id="tsc-off-marker"
        label={t('settings.dayOffMarker')}
        hint={t('settings.theTextADayOffRow')}
        value={form.offMarker}
        onChange={(value) => {
          onChange({ offMarker: value })
        }}
      />
      <TextField
        id="tsc-off-fill-color"
        label={t('settings.dayOffFillColor')}
        hint={t('settings.theCellColorOfADay')}
        value={form.offFillColor}
        onChange={(value) => {
          onChange({ offFillColor: value })
        }}
      />
      <TextField
        id="tsc-drive-id"
        label={t('settings.driveId')}
        hint={t('settings.withTheItemIdSkipsResolving')}
        value={form.driveId}
        onChange={(value) => {
          onChange({ driveId: value })
        }}
      />
      <TextField
        id="tsc-item-id"
        label={t('settings.itemId')}
        hint={t('settings.theWorkbookItemIdThatGoes')}
        value={form.itemId}
        onChange={(value) => {
          onChange({ itemId: value })
        }}
      />
    </>
  )
}
