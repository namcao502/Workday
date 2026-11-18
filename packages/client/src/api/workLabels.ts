import { t } from '../i18n.js'

// Names each request for the bell's "running now" list (WPF BusyWork labels).
// Built at read time, so it follows the app language.

type Label = (id: string) => string // id: the ticket key in the path or query key, else empty

interface Rule {
  readonly pattern: RegExp // matched against the path without its query string
  readonly label: Label
}

const KEY = '([^/]+)'

// First match wins, so a specific path comes before its area's catch-all.
const ACTION_RULES: readonly Rule[] = [
  {
    pattern: /^\/api\/board\/check$/,
    label: () => t('Checking Jira for ticket changes', 'Đang kiểm tra Jira'),
  },
  { pattern: /^\/api\/board\/add$/, label: () => t('Adding a ticket', 'Đang thêm ticket') },
  {
    pattern: new RegExp(`^/api/board/${KEY}/`),
    label: (id) => t(`Updating ${id}`, `Đang cập nhật ${id}`),
  },
  {
    pattern: /^\/api\/settings\/jira\/check$/,
    label: () => t('Checking the Jira connection', 'Đang kiểm tra kết nối Jira'),
  },
  {
    pattern: /^\/api\/settings\/ado\/check$/,
    label: () => t('Checking the Azure DevOps connection', 'Đang kiểm tra kết nối Azure DevOps'),
  },
  {
    pattern: /^\/api\/settings\/hrm\/check$/,
    label: () => t('Checking the HRM connection', 'Đang kiểm tra kết nối HRM'),
  },
  { pattern: /^\/api\/settings\/tsc\//, label: () => t('Signing in to TSC', 'Đang đăng nhập TSC') },
  { pattern: /^\/api\/settings$/, label: () => t('Saving settings', 'Đang lưu cài đặt') },
  {
    pattern: /^\/api\/timesheet\/drain$/,
    label: () => t('Logging the queued days', 'Đang log các ngày trong hàng đợi'),
  },
  {
    pattern: /^\/api\/timesheet\/log$/,
    label: () => t('Logging hours to TSC and HRM', 'Đang log giờ lên TSC và HRM'),
  },
  { pattern: /^\/api\/timesheet\/off$/, label: () => t('Logging a day off', 'Đang log ngày nghỉ') },
  {
    pattern: /^\/api\/timesheet\/week$/,
    label: () => t("Reading the week's logs", 'Đang đọc log của tuần'),
  },
  {
    pattern: /^\/api\/timesheet\/tickets\/check$/,
    label: () => t('Checking the typed tickets', 'Đang kiểm tra ticket vừa nhập'),
  },
  {
    pattern: /^\/api\/timesheet\/queue/,
    label: () => t('Updating the log queue', 'Đang cập nhật hàng đợi log'),
  },
  {
    pattern: /^\/api\/teams\/signin$/,
    label: () => t('Signing in to Teams', 'Đang đăng nhập Teams'),
  },
  {
    pattern: new RegExp(`^/api/teams/${KEY}/(reply|post)$`),
    label: (id) => t(`Sending the ${id} reply to Teams`, `Đang gửi trả lời ${id} lên Teams`),
  },
  {
    pattern: new RegExp(`^/api/teams/${KEY}/analysis$`),
    label: (id) => t(`Starting the ${id} analysis`, `Đang bắt đầu phân tích ${id}`),
  },
  {
    pattern: new RegExp(`^/api/teams/${KEY}/handoff$`),
    label: (id) => t(`Handing ${id} to Claude`, `Đang chuyển ${id} cho Claude`),
  },
  { pattern: /^\/api\/teams\//, label: () => t('Updating Teams', 'Đang cập nhật Teams') },
  {
    pattern: new RegExp(`^/api/workspace/start/${KEY}$`),
    label: (id) => t(`Creating the ${id} worktree`, `Đang tạo worktree ${id}`),
  },
  {
    pattern: new RegExp(`^/api/workspace/open/${KEY}$`),
    label: (id) => t(`Opening ${id}`, `Đang mở ${id}`),
  },
  { pattern: /^\/api\/workspace\/vscode$/, label: () => t('Opening VS Code', 'Đang mở VS Code') },
  {
    pattern: /^\/api\/workspace\/cleanup/,
    label: () => t('Cleaning up worktrees', 'Đang dọn worktree'),
  },
  {
    pattern: /^\/api\/workspace\/sessions\/[^/]+\/rewind$/,
    label: () => t('Rewinding files', 'Đang khôi phục file'),
  },
  {
    pattern: /^\/api\/workspace\/sessions\/[^/]+\/prompt$/,
    label: () => t('Sending to Claude', 'Đang gửi cho Claude'),
  },
  {
    pattern: /^\/api\/workspace\//,
    label: () => t('Updating the workspace', 'Đang cập nhật workspace'),
  },
  {
    pattern: new RegExp(`^/api/work/ready-to-test/${KEY}$`),
    label: (id) => t(`Moving ${id} to Ready to Test`, `Đang chuyển ${id} sang Ready to Test`),
  },
  {
    pattern: new RegExp(`^/api/work/suggestions/${KEY}/take$`),
    label: (id) => t(`Taking ${id}`, `Đang nhận ${id}`),
  },
  {
    pattern: new RegExp(`^/api/work/bugs/${KEY}/fix$`),
    label: (id) => t(`Starting the ${id} fix`, `Đang bắt đầu sửa ${id}`),
  },
  {
    pattern: new RegExp(`^/api/tickets/${KEY}/update`),
    label: (id) => t(`Updating ${id}`, `Đang cập nhật ${id}`),
  },
  {
    pattern: /^\/api\/schedules\/scan\/run$/,
    label: () => t('Running the knowledge scan', 'Đang chạy knowledge scan'),
  },
  { pattern: /^\/api\/insights$/, label: () => t('Reading the report', 'Đang đọc báo cáo') },
  {
    pattern: /^\/api\/(remote|pair)/,
    label: () => t('Updating remote access', 'Đang cập nhật truy cập từ xa'),
  },
  {
    pattern: /^\/api\/push/,
    label: () => t('Updating phone notifications', 'Đang cập nhật thông báo điện thoại'),
  },
  { pattern: /^\/api\/notices/, label: () => t('Updating notices', 'Đang cập nhật thông báo') },
]

const LOAD_LABELS: Readonly<Record<string, Label>> = {
  board: () => t('Loading the tickets', 'Đang tải danh sách ticket'),
  work: () => t('Loading the to-do list', 'Đang tải việc cần làm'),
  timesheet: () => t('Loading the timesheet', 'Đang tải timesheet'),
  'day-suggestions': () => t('Loading the day suggestions', 'Đang tải gợi ý trong ngày'),
  insights: () => t('Reading the report', 'Đang đọc báo cáo'),
  teams: (id) => t(`Reading Teams for ${id}`, `Đang đọc Teams của ${id}`),
  'teams-analysis': (id) => t(`Reading the ${id} analysis`, `Đang đọc phân tích ${id}`),
  'ticket-update': (id) => t(`Reading what changed in ${id}`, `Đang đọc thay đổi của ${id}`),
  workspace: () => t('Loading the workspace', 'Đang tải workspace'),
  'workspace-files': () => t('Loading files', 'Đang tải file'),
  folders: () => t('Loading folders', 'Đang tải thư mục'),
  settings: () => t('Loading settings', 'Đang tải cài đặt'),
  schedules: () => t('Loading schedules', 'Đang tải lịch chạy'),
  notices: () => t('Loading notices', 'Đang tải thông báo'),
  remote: () => t('Loading remote access', 'Đang tải truy cập từ xa'),
}

export function actionLabel(path: string): string {
  const bare = path.split('?')[0] ?? path
  for (const rule of ACTION_RULES) {
    const match = rule.pattern.exec(bare)
    if (match !== null) {
      return rule.label(decodeURIComponent(match[1] ?? ''))
    }
  }
  return t('Working...', 'Đang xử lý...')
}

// A query key is [area, ...ids]; the second part is the ticket where the area has one.
export function loadLabel(queryKey: readonly unknown[]): string {
  const [area, id] = queryKey
  const label = typeof area === 'string' ? LOAD_LABELS[area] : undefined
  if (label === undefined) {
    return t('Loading...', 'Đang tải...')
  }
  return label(typeof id === 'string' ? id : '')
}
