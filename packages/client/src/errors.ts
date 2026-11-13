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
    case 'remoteDisabled':
      return t('Remote access is turned off', 'Truy cập từ xa đang tắt')
    case 'accessRequired':
      return t(
        'Sign in through Cloudflare Access first',
        'Hãy đăng nhập qua Cloudflare Access trước',
      )
    case 'notPaired':
      return t('This device is not paired yet', 'Thiết bị này chưa được ghép nối')
    case 'forbidden':
      return t(
        'This device is not allowed to do that',
        'Thiết bị này không có quyền thực hiện việc đó',
      )
    case 'pairingClosed':
      return t('Pairing is closed. Open it on the PC.', 'Ghép nối đã đóng. Hãy mở lại trên PC.')
    case 'wrongCode':
      return t('That code is not right', 'Mã không đúng')
    case 'workspaceNotConfigured':
      return t(
        'Set the dev repo folder in Settings first',
        'Hãy đặt thư mục dev repo trong Cài đặt trước',
      )
    case 'worktreeMissing':
      return t('The ticket has no worktree yet', 'Ticket chưa có worktree')
    case 'worktreeFailed':
      return t('The worktree could not be created', 'Không tạo được worktree')
    case 'parentBranchMissing':
      return t('The parent ticket branch was not found', 'Không tìm thấy nhánh của ticket cha')
    case 'mainNotMerged':
      return t('Main is not merged into the branch yet', 'Nhánh chưa được merge main')
    case 'sessionNotFound':
      return t('That session no longer exists', 'Phiên này không còn nữa')
    case 'pathOutside':
      return t('That path is outside the worktree', 'Đường dẫn nằm ngoài worktree')
    case 'gitFailed':
      return t('A git command failed', 'Lệnh git thất bại')
    case 'adoRejected':
      return t('Azure DevOps rejected the token', 'Azure DevOps từ chối token')
    case 'adoUnreachable':
      return t('Azure DevOps could not be reached', 'Không kết nối được tới Azure DevOps')
    case 'adoNotConfigured':
      return t('Azure DevOps is not set up', 'Chưa cấu hình Azure DevOps')
  }
}
