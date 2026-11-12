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
  }
}
