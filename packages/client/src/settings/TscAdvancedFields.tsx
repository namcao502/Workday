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
        label={t('Header rows', 'Số dòng tiêu đề')}
        hint={t(
          'Rows at the top of the sheet before the first day. Default 2.',
          'Số dòng đầu sheet trước ngày đầu tiên. Mặc định 2.',
        )}
        value={form.headerRows}
        onChange={(value) => {
          onChange({ headerRows: value })
        }}
      />
      <TextField
        id="tsc-off-marker"
        label={t('Day-off marker', 'Ký hiệu ngày nghỉ')}
        hint={t(
          'The text a day-off row carries. Default OFF.',
          'Chữ trên dòng ngày nghỉ. Mặc định OFF.',
        )}
        value={form.offMarker}
        onChange={(value) => {
          onChange({ offMarker: value })
        }}
      />
      <TextField
        id="tsc-off-fill-color"
        label={t('Day-off fill color', 'Màu nền ngày nghỉ')}
        hint={t(
          'The cell color of a day-off row, as #RRGGBB. Default #FFFF00.',
          'Màu ô của dòng ngày nghỉ, dạng #RRGGBB. Mặc định #FFFF00.',
        )}
        value={form.offFillColor}
        onChange={(value) => {
          onChange({ offFillColor: value })
        }}
      />
      <TextField
        id="tsc-drive-id"
        label={t('Drive id', 'Mã drive')}
        hint={t(
          'With the item id, skips resolving the share URL. Empty: resolve it.',
          'Cùng mã item, bỏ qua bước phân giải share URL. Để trống: tự phân giải.',
        )}
        value={form.driveId}
        onChange={(value) => {
          onChange({ driveId: value })
        }}
      />
      <TextField
        id="tsc-item-id"
        label={t('Item id', 'Mã item')}
        hint={t(
          'The workbook item id that goes with the drive id.',
          'Mã item của workbook đi cùng mã drive.',
        )}
        value={form.itemId}
        onChange={(value) => {
          onChange({ itemId: value })
        }}
      />
    </>
  )
}
