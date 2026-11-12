import type { AppError } from '@workday/core'
import { t } from './i18n.js'

export function errorText(error: AppError): string {
  switch (error.code) {
    case 'invalidKey':
      return t('That is not a ticket key', 'Đó không phải mã ticket')
    case 'notConnected':
      return t('Jira is not connected', 'Chưa kết nối Jira')
    case 'jiraRejected':
      return t(
        'Jira rejected the sign-in. Check the email and API token.',
        'Jira từ chối đăng nhập. Kiểm tra email và API token.',
      )
    case 'jiraUnreachable':
      return t('Jira could not be reached', 'Không kết nối được tới Jira')
    case 'pollFailed':
      return t('The last refresh failed', 'Lần làm mới gần nhất thất bại')
    case 'notFound':
      return t(`${error.key} was not found`, `Không tìm thấy ${error.key}`)
    case 'alreadyOnBoard':
      return t(`${error.key} is already on the board`, `${error.key} đã có trên bảng`)
    case 'timesheetNotConfigured':
      return t('TSC or HRM is not connected', 'Chưa kết nối TSC hoặc HRM')
    case 'invalidTicket':
      return t('Enter valid ticket keys', 'Hãy nhập mã ticket hợp lệ')
    case 'overEightHours':
      return t('The day would go over 8h', 'Ngày này sẽ vượt quá 8h')
    case 'hrmClosedForToday':
      return t(
        "HRM takes today's hours only from 6:00 PM. Queue it, or use TSC only.",
        'HRM chỉ nhận giờ hôm nay từ 6:00 PM. Hãy thêm vào hàng đợi, hoặc chỉ log TSC.',
      )
    case 'tscNoToken':
      return t(
        'No TSC sign-in. Use Sign in to TSC in Settings.',
        'Chưa đăng nhập TSC. Hãy dùng Đăng nhập TSC trong Cài đặt.',
      )
    case 'tscDateMismatch':
      return t(
        'The TSC row does not match the date, nothing was written',
        'Dòng TSC không khớp ngày, chưa ghi gì',
      )
    case 'tscFailed':
      return t('Writing to TSC failed', 'Ghi vào TSC thất bại')
    case 'chromeMissing':
      return t('Google Chrome is not installed', 'Chưa cài Google Chrome')
    case 'browserBusy':
      return t('The browser is busy with another task', 'Trình duyệt đang bận việc khác')
    case 'hrmRejected':
      return t('HRM rejected the entry', 'HRM từ chối mục này')
    case 'hrmUnreachable':
      return t('HRM could not be reached', 'Không kết nối được tới HRM')
  }
}
