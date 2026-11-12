# Workday Timesheet (GĐ 2) Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- frontend nằm trong cùng repo (`packages/client`)

**Goal:** Làm trang Timesheet: xếp ticket vào hàng đợi theo ngày, log lên TSC (Excel qua Graph, token lấy bằng Playwright) và HRM (MCP), tự chạy lúc `logTime` (mặc định 18:00), đọc lại tuần thành thẻ ngày, Log OFF; port từ `LoggingService`, `TicketQueue`, `TimeSlots`, `HoursSplit`, `LogDays`, `QueueDayStatus`, `WeekReview`, `GraphTscClient`, `HrmMcpClient`, `TscTokenSniffer`, `SixPmScheduler` của NoisWorkday.

**Expected outcome (acceptance criteria):**

- [ ] Settings > Timesheet: nhập giờ log, HRM MCP URL, HRM project id, HRM API key (lưu vào `secrets.json`), TSC share URL, mẫu tên sheet, cột, các trang lấy token; **Check HRM** báo đúng / sai key / không kết nối được; **Check TSC session** báo còn / hết phiên; **Sign in to TSC** mở Chrome có giao diện để đăng nhập lại. Không có giá trị riêng của công ty nào trong code.
- [ ] Chưa cấu hình TSC / HRM: server vẫn chạy, trang Timesheet báo phần nào chưa kết nối và dẫn sang Settings; các nút log tương ứng bị tắt.
- [ ] Gõ `MDP-1, 2` cùng một ngày rồi bấm **+**: hàng đợi có một mục ngày đó, chia đều 8h; gõ thêm vào ngày đã có thì gộp (không trùng); tổng > 8h thì từ chối, hàng đợi không đổi. `queue.json` cùng dạng với app WPF.
- [ ] Sửa giờ từng ticket (ô giờ hoặc kéo thanh giờ, bước 30 phút, mỗi ticket >= 30 phút, ngày <= 8h) được lưu; bỏ một ticket bằng [X]; **Clear queue** hỏi trước rồi xóa hết.
- [ ] Đúng `logTime` theo `timeZone` của config: hàng đợi có mục thì drain (TSC + HRM song song cho từng ngày, chỉ bỏ khỏi hàng đợi ngày thành công cả hai bên); hàng đợi trống vào ngày thường và hôm nay không có đơn nghỉ cả ngày thì trang Timesheet hiện lời nhắc; cuối tuần thì im lặng.
- [ ] Khởi động server (và sau khi Sign in to TSC thành công) mà hàng đợi có ngày đã tới hạn (ngày đã qua, hoặc hôm nay từ 18:00) thì drain bù.
- [ ] Ticket thêm vào hàng đợi trong lúc drain không bị mất; chạy lại một ngày đã log không ghi đôi (TSC bỏ qua ô đã đúng, HRM coi `LOGTIME_OVERLAP` là xong).
- [ ] TSC: ghi vào mọi cột cấu hình ở dòng `headerRows + dayOfYear`; cột B của dòng không khớp `M/D/YYYY` của ngày thì hủy, không ghi gì. Ghi ticket đè lên ô `OFF` thì xóa màu nền.
- [ ] Log hôm nay lên HRM trước 18:00 (Log now, HRM only, Log now của thẻ ngày hôm nay) bị chặn với lời giải thích; TSC only vẫn được.
- [ ] **Log OFF** (chọn ngày, xác nhận) ghi `offMarker` có nền `offFillColor` vào mọi cột của ngày đó, rồi bỏ ngày đó khỏi hàng đợi.
- [ ] Mở trang Timesheet: đọc tuần hiện tại (được mở Chrome headless một lần để lấy token); tuần trước / sau và đọc lại sau khi log thì không mở Chrome; mỗi thẻ thứ Hai - thứ Sáu hiện đúng trạng thái Off / Queued / Logged / Empty / Future; tiêu đề có `HRM 32h / 40h` và `TSC 4 / 4`.
- [ ] Rà soát tuần: ticket không tồn tại trên Jira, không phải của mình (kèm gợi ý key gõ nhầm một chữ số), chỉ có ở TSC hoặc chỉ có ở HRM được đánh dấu trên thẻ ngày; Jira lỗi thì không đánh dấu "không phải của mình".
- [ ] Ô ticket kiểm tra key với Jira (chấm xanh / đỏ / vàng, summary) và cảnh báo "Not your ticket" kèm nút **Use <KEY>** khi có key của mình cách một lỗi gõ.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` sạch.

**Architecture:** Logic thuần (chia giờ, hàng đợi, trạng thái ngày, rà soát tuần, ô TSC) nằm trong `@workday/core`; hai tích hợp là hai port `SheetLog` (TSC) và `HoursLog` (HRM) trong `core/src/ports`, adapter trong `packages/server/src/tsc` và `src/hrm`. `TimesheetService` ở server giữ hàng đợi, drain, đọc tuần, xếp mọi thay đổi vào một chuỗi tuần tự như `BoardService`, phát `timesheet.changed`; client tự tính thẻ ngày từ dữ liệu thô bằng hàm của core.

**Assumptions:**

- Roadmap ghi một port `TimeLog`; plan tách thành `SheetLog` và `HoursLog` vì hai đích có khả năng khác nhau (TSC có phiên trình duyệt, HRM có đơn nghỉ và tổng giờ).
- Bố cục ngày làm việc (9:00-12:00, 13:00-18:00, 8h) và giờ HRM mở cho hôm nay (18:00) là hằng số trong core như `TimeSlots`, không đưa vào config ở GĐ 2.
- Mọi giá trị của TSC / HRM / MDP (URL MCP, project id HRM, share URL, mẫu tên sheet `Daily Reports - {year}`, cột `M, J`, URL các trang lấy token, `cf[11012]` trong JQL "của mình") nằm trong `config.json`; code chỉ có mặc định trung tính (`headerRows` 2, `offMarker` `OFF`, `offFillColor` `#FFFF00`, `logTime` `18:00`, `mineJql` không có custom field). `tsc` / `hrm` thiếu giá trị bắt buộc thì là `null` (chưa kết nối), giống `jira`.
- Secret mới: `hrmApiKey` trong `secrets.json`, biến môi trường `WORKDAY_HRM_API_KEY` thắng; `WORKDAY_MS_GRAPH_TOKEN` (chỉ biến môi trường) thay cho việc sniff, giống `MS_GRAPH_TOKEN`. Key HRM chỉ gửi tới `mcpUrl` đã lưu cùng nó (cùng luật với token Jira).
- Profile Chrome riêng ở `<dataDir>/tsc-browser`, không dùng chung `~/.tsc-daily-log-browser` của app WPF: lần đầu phải **Sign in to TSC** một lần. Dùng `playwright-core` với `channel: "chrome"` (Chrome của máy, không tải Chromium). Sign in cần màn hình; trên Linux không có màn hình thì dùng `WORKDAY_MS_GRAPH_TOKEN`.
- Chưa làm ở GĐ 2 (cần Workspace / thông báo của GĐ 3-5): gợi ý theo commit / Claude (`DaySuggestions`, trạng thái `Suggested`, khối Today, "Likely" của ngày tới), Start -> tự xếp hàng (`AddStartedTicket`, `TscWrittenDates`), badge sidebar, thông báo rà soát thứ Sáu, push điện thoại. Lời nhắc 18:00 chỉ hiện trên trang Timesheet và một chấm ở mục Timesheet của sidebar.
- `lastRun` (kết quả lần chạy tự động / drain gần nhất) chỉ giữ trong bộ nhớ, mất khi restart.
- Lỗi từ TSC / HRM: client hiện theo `AppError.code` (dịch được), kèm `detail` là chuỗi gốc từ upstream (không dịch) trong tooltip.
- Thư viện: `@modelcontextprotocol/sdk` (client Streamable HTTP) và `playwright-core`; tra Context7 lấy API hiện tại trước khi viết adapter.

**Tech Stack:** như GĐ 1, thêm `@modelcontextprotocol/sdk`, `playwright-core` ở server.

---

### Task 1: Core: ngày, chia giờ, hàng đợi

Hàm thuần, không mutate input. Đặc tả là code + test C# trong `C:\Project\NoisWorkday`; port test thành Vitest trước, chạy thấy đỏ, rồi viết code.

**Files:**

- Modify: `packages/core/src/zonedDate.ts` -- thêm `zonedClock`, `addDays`, `mondayOf`, `weekdayOf`, `dayOfYear`
- Modify: `packages/core/src/ticketKey.ts` -- thêm `isTicketKey`, `parseTicketKeys` (từ `TicketParser.Parse`)
- Create: `packages/core/src/timeSlots.ts` -- từ `Helpers/TimeSlots.cs` (bỏ `SplitByActivity`) và `Helpers/HoursSplit.cs`
- Create: `packages/core/src/timesheetQueue.ts` -- thao tác thuần trên hàng đợi (từ `TicketQueue.cs`, phần không I/O) và `QueueDayStatus`
- Modify: `packages/core/src/index.ts` -- export các file mới
- Test: `zonedDate.test.ts`, `ticketKey.test.ts`, `timeSlots.test.ts`, `timesheetQueue.test.ts` cùng thư mục

**Shape:**

```ts
// Dates are "YYYY-MM-DD"; minutes are minutes since local midnight in the config time zone.
export interface ZonedClock {
  readonly date: string
  readonly minutes: number
  readonly weekday: number // 0 = Sunday
}
export function zonedClock(timeZone: string, now: Date): ZonedClock // unknown zone -> UTC+7, like todayIn
export function addDays(date: string, days: number): string
export function mondayOf(date: string): string
export function weekdayOf(date: string): number
export function dayOfYear(date: string): number

export function isTicketKey(value: string): boolean // ^[A-Z][A-Z0-9]+-\d+$
export function parseTicketKeys(
  raw: string | null,
  projectKey: string | null,
): { readonly tickets: readonly string[]; readonly invalid: readonly string[] }

export const WORK_MINUTES = 480
export const HRM_OPENS_AT_MINUTES = 1080 // 18:00
export const HOURS_STEP_MINUTES = 30
export interface TimeSlot {
  readonly start: string // "HH:mm"
  readonly end: string
}
export function evenSplit(ticketCount: number): readonly number[]
export function slotsFor(minutesPerTicket: readonly number[], ticketIndex: number): readonly TimeSlot[]
export function describeSlots(slots: readonly TimeSlot[]): string // "9:00 AM - 12:00 PM, 1:00 PM - 2:00 PM"
export function moveBoundary(
  minutes: readonly number[],
  boundaryIndex: number,
  boundaryMinutes: number,
): readonly number[]

export interface QueueEntry {
  readonly date: string
  readonly tickets: readonly string[]
  readonly minutes: readonly number[] | null // null = even split
}
export type QueueAddOutcome =
  | { readonly status: 'added' | 'merged'; readonly queue: readonly QueueEntry[] }
  | { readonly status: 'overEightHours' | 'invalidTicket' }
export function addTickets(
  queue: readonly QueueEntry[],
  date: string,
  tickets: readonly string[],
  minutes: readonly number[] | null,
): QueueAddOutcome
export function mergeInto(
  existing: QueueEntry,
  tickets: readonly string[],
  minutes: readonly number[] | null,
): QueueEntry
export function dayMinutes(entry: QueueEntry): number
export function entryMinutes(entry: QueueEntry): readonly number[] // minutes ?? evenSplit
export function removeLogged(
  queue: readonly QueueEntry[],
  processed: readonly QueueEntry[],
): readonly QueueEntry[]
export function removeTicket(
  queue: readonly QueueEntry[],
  date: string,
  ticket: string,
): readonly QueueEntry[]
export function minutesWith(
  entry: QueueEntry,
  ticket: string,
  ticketMinutes: number,
): readonly number[] | null
export function setMinutes(
  queue: readonly QueueEntry[],
  date: string,
  tickets: readonly string[],
  minutes: readonly number[],
): readonly QueueEntry[] | null // null = the entry no longer holds exactly these tickets
export function isTodayDue(clock: ZonedClock, logTimeMinutes: number): boolean
export function queueDayState(date: string, clock: ZonedClock, logTimeMinutes: number): 'waiting' | 'due'
export function minutesUntilRun(clock: ZonedClock, logTimeMinutes: number): number
export function isHrmClosed(date: string, clock: ZonedClock): boolean
```

**Logic:**

- Ngày tính bằng `Date.UTC` trên chuỗi `YYYY-MM-DD`, không dùng múi giờ của máy. `zonedClock` dùng `Intl.DateTimeFormat` như `todayIn` (giờ `hourCycle: "h23"`).
- `parseTicketKeys`: tách theo dấu phẩy / khoảng trắng / chấm phẩy; số trơn thành `<projectKey>-<số>` (bỏ vào `invalid` khi `projectKey` null); key đủ hoặc link Jira qua `parseTicketKey`; viết hoa, bỏ trùng, giữ thứ tự.
- `slotsFor`: xếp từ 9:00, bỏ giờ trưa; mốc 180 phút là 12:00 khi là điểm cuối, 13:00 khi là điểm đầu; làm tròn 5 phút, nửa làm tròn lên. Ngày không đủ 8h thì dừng sớm.
- `moveBoundary`: đúng `HoursSplit.MoveBoundary` (bước 30, mỗi ticket >= 30, ranh cuối đổi với phần trống tới 480).
- `addTickets`: key không hợp lệ (`isTicketKey`) hoặc danh sách rỗng -> `invalidTicket`; ngày đã có thì `mergeInto` rồi `dayMinutes > 480` -> `overEightHours`; hàng đợi trả về sắp theo ngày tăng dần. Không chặn cuối tuần hay giờ muộn (đó là luật của `AddStartedTicket`, chưa port).
- `mergeInto` / `removeLogged` / `minutesWith` / `setMinutes`: đúng bản C#, `minutes` luôn đi cùng `tickets` theo từng vị trí; `removeLogged` chạy trên hàng đợi **hiện tại**, chỉ bỏ ticket đã xử lý của ngày đó, ngày hết ticket thì bỏ cả mục.
- `isTodayDue`: `clock.minutes >= max(logTimeMinutes, 1080)`. `queueDayState`: ngày < hôm nay, hoặc hôm nay và `isTodayDue` -> `due`. `minutesUntilRun`: tới `max(logTime, 18:00)`, không âm. `isHrmClosed`: `date === clock.date && clock.minutes < 1080`.

**Tests** (port theo hàm được gọi; tên tiếng Anh):

- `TimeSlotsTests` trừ `SplitByActivity_*` -> `timeSlots.test.ts`; `HoursSplitTests` (3 test) -> `timeSlots.test.ts`
- `TicketQueueTests`: các test `MergeInto*`, `DayMinutes*`, `RemoveLogged*`, `RemoveTicket*`, `MinutesWith_*`, `SetMinutes_*`, `AddTickets_*` -> `timesheetQueue.test.ts` (chạy trên mảng, không file); bỏ `AddStartedTicket_*`, `TodayRefusal_*`; các test đọc file (`ReturnsEmptyWhenFileMissing`, `DropsMalformedEntries...`, `DropsMinutesThatDoNotMatch...`, `RoundTrips*`) để Task 5
- `QueueDayStatusTests` (2 test) -> `timesheetQueue.test.ts`, thêm `isHrmClosed is true for today before 18:00 only`
- `TicketParserTests` phần `Parse` -> `ticketKey.test.ts`, thêm `parseTicketKeys marks bare digits invalid without a project key`
- `zonedClock gives the Ho Chi Minh time of day at 23:30 UTC`, `mondayOf a Sunday is the Monday before`, `dayOfYear of a leap-year Dec 31 is 366`

### Task 2: Core: ô TSC, tuần, rà soát, port và kiểu API

**Files:**

- Create: `packages/core/src/tscCells.ts` -- từ `Helpers/TscCells.cs`, nhận mẫu tên sheet, cột, `headerRows` làm tham số (không hằng)
- Create: `packages/core/src/timesheetWeek.ts` -- `DayCoverage`, `buildLogDays` (từ `LogDays.Build`, bỏ `Suggested`), `tscStateFor` (từ `LoggingService.TscStateFor`), `hrmWeekTotal`, `weekTicketTotals` (từ `WeekTicketTotals.Build`)
- Create: `packages/core/src/ticketTypos.ts` -- `typoNeighbors` (từ `TicketTypos.Neighbors`, prefix bất kỳ, không cứng `MDP`)
- Create: `packages/core/src/weekReview.ts` -- `reviewWeek` (từ `WeekReview.Review`); text hiển thị để client làm
- Create: `packages/core/src/ports/sheetLog.ts`, `packages/core/src/ports/hoursLog.ts`
- Modify: `packages/core/src/ports/ticketTracker.ts` -- thêm `filterMine`
- Modify: `packages/core/src/api.ts` -- config, view, request / result của Timesheet (Shape dưới)
- Modify: `packages/core/src/index.ts`
- Test: `tscCells.test.ts`, `timesheetWeek.test.ts`, `ticketTypos.test.ts`, `weekReview.test.ts`

**Shape:**

```ts
export function worksheetFor(date: string, pattern: string): string // "{year}" -> 2026
export function rowForDate(date: string, headerRows: number): number
export function cellsForDate(date: string, columns: readonly string[], headerRows: number): readonly string[]
export function parseColumns(raw: string): readonly string[]
export function expectedDateLabel(date: string): string // "M/D/YYYY", no leading zeros
export function dateLabelsMatch(read: string, expected: string): boolean

export type TscReadState = 'read' | 'notDue' | 'noToken' | 'failed'
export interface DayCoverage {
  readonly date: string
  readonly hrmHours: number | null
  readonly tscText: string | null
  readonly isOff: boolean
  readonly tscState: TscReadState
}
export interface HrmTask {
  readonly date: string
  readonly ticketKey: string
  readonly summary: string | null
  readonly workingSeconds: number
}
export type LogDayState = 'off' | 'queued' | 'logged' | 'empty' | 'future'
export interface LogDayView {
  readonly date: string
  readonly state: LogDayState
  readonly coverage: DayCoverage | null
  readonly queued: QueueEntry | null
}
export function buildLogDays(
  weekdays: readonly string[],
  coverage: readonly DayCoverage[] | null,
  queue: readonly QueueEntry[],
  today: string,
): readonly LogDayView[]
export function tscStateFor(
  date: string,
  today: string,
  hadToken: boolean,
  allowSniff: boolean,
  cells: Readonly<Record<string, string | null>> | null,
): TscReadState
export function hrmWeekTotal(
  coverage: readonly DayCoverage[],
  today: string,
): { readonly hours: number; readonly targetHours: number; readonly isWeekOver: boolean }
export function weekTicketTotals(
  hrmTasks: readonly HrmTask[] | null,
  queue: readonly QueueEntry[],
  weekdays: readonly string[],
): readonly { readonly key: string; readonly minutes: number }[]

export type WeekReviewIssue = 'notFound' | 'notMine' | 'tscOnly' | 'hrmOnly'
export interface WeekReviewItem {
  readonly date: string
  readonly ticketKey: string
  readonly summary: string | null
  readonly issue: WeekReviewIssue
  readonly suggestedKey: string | null
}
export function reviewWeek(input: {
  readonly week: readonly DayCoverage[]
  readonly hrmTasks: readonly HrmTask[] | null // null = HRM not read: only the TSC side is checked
  readonly mineKeys: ReadonlySet<string>
  readonly missingKeys: ReadonlySet<string>
  readonly offMarker: string
  readonly projectKey: string | null
}): readonly WeekReviewItem[]
export function typoNeighbors(key: string, candidates: Iterable<string>): readonly string[]
```

```ts
// ports/sheetLog.ts -- the TSC workbook. Every method resolves; failures come back as values.
export type SheetFailure = 'noToken' | 'dateMismatch' | 'chromeMissing' | 'browserBusy' | 'failed'
export interface SheetError {
  readonly failure: SheetFailure
  readonly detail: string // upstream text, never a token
}
export type SheetWrite = { readonly ok: true } | ({ readonly ok: false } & SheetError)
export type SheetRead =
  | { readonly kind: 'read'; readonly cells: Readonly<Record<string, string | null>> } // a date whose column B did not match is absent
  | { readonly kind: 'noToken' }
  | { readonly kind: 'failed'; readonly detail: string }
export interface SheetLog {
  writeTickets(date: string, text: string): Promise<SheetWrite>
  writeOff(date: string): Promise<SheetWrite>
  readTickets(dates: readonly string[], options: { readonly allowSniff: boolean }): Promise<SheetRead>
  checkSession(): Promise<{ readonly signedIn: boolean } | SheetError>
  signIn(): Promise<SheetWrite>
}

// ports/hoursLog.ts -- HRM.
export type HoursWrite = { readonly ok: true } | { readonly ok: false; readonly detail: string }
export interface HoursLog {
  validate(): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' }>
  // minutes: one per ticket, already resolved from the even split.
  logTickets(date: string, tickets: readonly string[], minutes: readonly number[]): Promise<HoursWrite>
  dayHours(dates: readonly string[]): Promise<Readonly<Record<string, number | null>>> // never rejects
  tasks(from: string, to: string): Promise<readonly HrmTask[] | null> // never rejects
  offDates(from: string, to: string): Promise<readonly string[]> // never rejects; FORBIDDEN -> []
}

// ports/ticketTracker.ts
filterMine(keys: readonly string[]): Promise<ReadonlySet<string>> // throws on failure
```

```ts
// api.ts
export interface HrmConfig {
  readonly mcpUrl: string
  readonly projectId: string
}
export interface TscConfig {
  readonly shareUrl: string
  readonly worksheetPattern: string // "{year}" is replaced
  readonly columns: readonly string[]
  readonly headerRows: number // default 2
  readonly offMarker: string // default "OFF"
  readonly offFillColor: string // default "#FFFF00"
  readonly tokenPages: readonly string[] // pages whose Graph calls carry a Files.ReadWrite.All token, tried in order
  readonly driveId: string | null // with itemId: skips the /shares resolve
  readonly itemId: string | null
}
export interface TimesheetConfig {
  readonly logTime: string // "HH:mm", default "18:00"
  readonly hrm: HrmConfig | null
  readonly tsc: TscConfig | null
}
// WorkdayConfig gains `timesheet: TimesheetConfig`; JiraConfig gains `mineJql: string`
// (default "assignee = currentUser() OR assignee WAS currentUser()").
// SettingsView gains `hrmKeySource: 'env' | 'file' | null`; SettingsUpdate gains `timesheet?` and `hrmApiKey?`.

export type StepOutcome =
  | { readonly status: 'ok' | 'skipped' }
  | { readonly status: 'failed'; readonly error: AppError; readonly detail: string | null }
export interface EntryOutcome {
  readonly date: string
  readonly tsc: StepOutcome
  readonly hrm: StepOutcome
}
export type RunSummary = {
  readonly at: string // ISO instant
  readonly trigger: 'schedule' | 'catchUp' | 'user'
} & (
  | {
      readonly kind: 'drained'
      readonly logged: number
      readonly kept: readonly EntryOutcome[]
      readonly timedOut: boolean
    }
  | {
      readonly kind: 'reminder' | 'weekend' | 'dayOff' | 'nothingDue' | 'notConfigured' | 'joined'
    }
)
export interface WeekState {
  readonly monday: string
  readonly reading: boolean
  readonly coverage: readonly DayCoverage[] | null
  readonly review: readonly WeekReviewItem[] | null
  readonly hrmTasks: readonly HrmTask[] | null
  readonly readAt: string | null
}
export interface TimesheetView {
  readonly tscConnected: boolean
  readonly hrmConnected: boolean
  readonly logTime: string
  readonly today: string
  readonly queue: readonly QueueEntry[]
  readonly draining: boolean
  readonly lastRun: RunSummary | null
  readonly week: WeekState | null
}
export interface TicketCheck {
  readonly key: string
  readonly status: 'valid' | 'notFound' | 'unknown'
  readonly summary: string | null
  readonly isMine: boolean | null // null = not asked or Jira failed
  readonly suggestedKey: string | null
}
// AppError gains the codes: timesheetNotConfigured, invalidTicket, overEightHours, hrmClosedForToday,
// tscNoToken, tscDateMismatch, tscFailed, chromeMissing, browserBusy, hrmRejected, hrmUnreachable.
// ServerEvent gains { type: 'timesheet.changed' }.
```

**Logic:**

- `buildLogDays`: thứ tự `off` > `queued` > `logged` (HRM > 0) > `empty`; ngày > hôm nay là `future`; `coverage` null (chưa đọc) thì ngày đã qua là `queued` hoặc `empty`.
- `hrmWeekTotal`: `hours` = tổng `hrmHours` của ngày không nghỉ; `targetHours` = 8 x số ngày thường không nghỉ trong tuần; `isWeekOver` = hôm nay > thứ Sáu của tuần đó.
- `weekTicketTotals`: ngày có trong hàng đợi tính theo hàng đợi (`entryMinutes`), ngày khác tính `workingSeconds / 60` của HRM; nhiều phút trước, rồi theo key.
- `reviewWeek`: đúng `WeekReview.Review`: ô TSC bằng `offMarker` (không phân biệt hoa thường) hoặc `isOff` thì không so TSC / HRM; key TSC lấy bằng `parseTicketKeys(tscText, projectKey)`; chỉ so hai bên khi `tscState === 'read'` và `hrmTasks !== null`; `suggestedKey` = phần tử đầu của `typoNeighbors(key, mineKeys)`. So key không phân biệt hoa thường.
- `typoNeighbors`: chỉ xét key cùng prefix; hạng 0 = đổi chỗ hai chữ số kề nhau, 1 = sai một chữ số, 2 = thừa / thiếu một chữ số; sắp theo hạng rồi theo key.

**Tests:**

- `TscCellsTests` (8 test) -> `tscCells.test.ts`, với cột và mẫu sheet truyền vào
- `LogDaysTests` trừ `Build_MarksSuggested_*` -> `timesheetWeek.test.ts`
- `tscStateFor is notDue for a future day`, `tscStateFor is noToken without a sniff and failed after one`, `tscStateFor is failed for a date missing from the cells`
- `hrmWeekTotal leaves days off out of the target`, `weekTicketTotals counts a queued day from the queue, not HRM`
- `WeekReviewTests` các test `Review_*` -> `weekReview.test.ts` (bỏ `NoticeText_*`, `IssueText_*`, `IsReviewDay_*`: là text / thông báo)
- `typoNeighbors ranks a swap before a changed digit before a dropped one`, `typoNeighbors ignores another prefix`

### Task 3: Server: config / secret của Timesheet và adapter HRM (MCP)

**Files:**

- Modify: `packages/server/src/config.ts` -- `parseTimesheet` (và `parseJira` thêm `mineJql`), `Secrets.hrmApiKey`, `loadHrmKey` (env `WORKDAY_HRM_API_KEY` thắng file), `loadGraphTokenOverride` (env `WORKDAY_MS_GRAPH_TOKEN`)
- Create: `packages/server/src/retry.ts` -- `retryTransient(operation, attempts = 3)` (từ `Helpers/Retry.cs`)
- Create: `packages/server/src/hrm/parseHrm.ts` -- `buildLogArgs`, `parseToolEnvelope`, `parseDayHours`, `parseTimesheetTasks` (từ `Helpers/Timesheet.cs`), `parseOffDates`, `parseTotalPages` (từ `Helpers/Leave.cs`)
- Create: `packages/server/src/hrm/mcpSession.ts` -- `McpSession` và `connectMcp(url, apiKey)` bọc SDK
- Create: `packages/server/src/hrm/hrmHoursLog.ts` -- `HrmHoursLog implements HoursLog` (từ `Services/HrmMcpClient.cs`)
- Modify: `packages/server/package.json` -- thêm `@modelcontextprotocol/sdk`
- Test: `config.test.ts` (thêm), `retry.test.ts`, `hrm/parseHrm.test.ts`, `hrm/hrmHoursLog.test.ts`

**Shape:**

```ts
// The seam the tests fake; connectMcp opens a Streamable HTTP session with "Authorization: Bearer <key>".
export interface McpSession {
  callTool(name: string, args: Readonly<Record<string, unknown>>): Promise<{ readonly isError: boolean; readonly text: string | null }>
  close(): Promise<void>
}
export function connectMcp(url: string, apiKey: string): Promise<McpSession>

export class HrmHoursLog implements HoursLog {
  constructor(config: HrmConfig, apiKey: string, connect?: (url: string, apiKey: string) => Promise<McpSession>)
}
```

**Logic:**

- `parseTimesheet`: `logTime` không đúng `HH:mm` (00:00-23:59) thì `"18:00"`; `hrm` null khi thiếu `mcpUrl` hoặc `projectId`; `tsc` null khi thiếu `shareUrl`, `worksheetPattern`, hoặc `columns` / `tokenPages` rỗng; `columns` qua `parseColumns` (nhận cả chuỗi `"M, J"` lẫn mảng); `headerRows` không phải số nguyên >= 0 thì 2. Không bao giờ log hay trả key HRM / token Graph.
- `retryTransient`: chỉ thử lại lỗi mạng (`TypeError` của `fetch`, lỗi có `cause` là lỗi mạng) và timeout của chính request (`TimeoutError`), không thử lại theo HTTP status; chờ 200ms, 600ms (cộng jitter <= 150ms).
- `logTickets`: một phiên MCP cho cả lượt; với từng ticket, từng `slotsFor(minutes, index)` gọi `log_timesheet` với `buildLogArgs(projectId, ticket, date, slot)` (đủ 11 trường, `startTime` `"HH:mm:00"`, `isBillable: true`, còn lại `null`, `idempotencyKey: null`). Kết quả qua `parseToolEnvelope`: `LOGTIME_OVERLAP` coi là xong, đi tiếp; lỗi khác ghi `"<ticket>: <code>: <message>"` và bỏ các slot còn lại của ticket đó, chuyển ticket sau. Có lỗi thì `{ ok: false, detail: "HRM rejected " + lỗi nối bằng "; " }`. Mỗi lần gọi tool timeout 30s, bọc `retryTransient`.
- `dayHours`: `get_my_day_logs` với `{ workDate, projectId: null }` từng ngày; lỗi một ngày -> `null` cho ngày đó; kết nối lỗi -> mọi ngày `null`.
- `tasks`: một lần `get_my_timesheet_tasks { fromDate, toDate, projectId }`; `parseTimesheetTasks` bỏ mục có `taskId` không qua `isTicketKey` (viết hoa trước khi xét) hoặc `workDate` sai dạng.
- `offDates`: `find_my_requests { kind: "leave", status: null, fromDate: "<from>T00:00:00", toDate: "<to>T23:59:59", page, pageSize: 50 }`, tối đa 5 trang theo `parseTotalPages`; chỉ đơn `periodType` `AllDay`, bỏ `Rejected` / `Cancelled`, mở rộng `fromDate..toDate`; envelope hai lớp `success` / `data`. Mọi lỗi -> `[]` và một dòng log.
- `validate`: mở phiên + `listTools`, timeout 20s; thông điệp lỗi có `401` / `403` / `unauthorized` / `forbidden` -> `rejected`, còn lại `unreachable`.

**Tests:**

- `TimesheetTests` (15 test) và `LeaveTests` (10 test) -> `hrm/parseHrm.test.ts`
- `logTickets splits a slot across lunch into two calls`
- `logTickets treats LOGTIME_OVERLAP as done`
- `logTickets skips a rejected ticket and still logs the next one`
- `offDates reads every page up to totalPages and returns [] on FORBIDDEN`
- `validate reports rejected on a 401`
- `retryTransient retries a network error but not an HTTP error`
- `a timesheet config without columns loads with tsc null`; `logTime 25:00 falls back to 18:00`; `the HRM key from the environment wins over secrets.json`

### Task 4: Server: adapter TSC (Graph Excel + Playwright)

**Files:**

- Create: `packages/server/src/tsc/jwt.ts` -- `jwtExpiry(token)`, `jwtScopes(token)` (từ `DecodeJwtExpiry` / `DecodeJwtScopes`)
- Create: `packages/server/src/tsc/graphWorkbook.ts` -- REST Graph: `encodeShareId`, resolve drive item, mở / đóng session, đọc / ghi ô, đặt / xóa màu nền
- Create: `packages/server/src/tsc/browserLock.ts` -- một trình duyệt mỗi lúc, từ chối ngay khi bận (không xếp hàng)
- Create: `packages/server/src/tsc/tokenSniffer.ts` -- `PlaywrightTokenSource` (từ `TscTokenSniffer.cs`): sniff, kiểm phiên, đăng nhập có giao diện
- Create: `packages/server/src/tsc/graphSheetLog.ts` -- `GraphSheetLog implements SheetLog`: cache token, luật ghi / đọc / OFF (từ `GraphTscClient.cs` + phần token của `LoggingService.cs`)
- Modify: `packages/server/package.json` -- thêm `playwright-core`
- Test: `tsc/jwt.test.ts`, `tsc/graphSheetLog.test.ts` (fetch giả + token source giả), `tsc/browserLock.test.ts`

**Shape:**

```ts
// GraphSheetLog's seam for the browser; the tests pass a fake.
export interface TokenSource {
  sniff(): Promise<{ readonly token: string } | SheetError> // headless
  checkSession(): Promise<{ readonly signedIn: boolean } | SheetError> // headless
  signIn(): Promise<SheetWrite> // visible browser
}
export class PlaywrightTokenSource implements TokenSource {
  constructor(config: TscConfig, profileDir: string, lock: BrowserLock)
}
export class GraphSheetLog implements SheetLog {
  constructor(config: TscConfig, tokens: TokenSource, override: string | null, fetchFn?: typeof fetch)
}
```

**Logic:**

- Token: `override` (env) thắng. Không thì dùng token cache khi còn > 2 phút trước `exp` (token không đọc được `exp` thì sống 30 phút); hết thì `sniff()`. Sniff chạy nối tiếp qua một promise dùng chung: hai lời gọi cùng lúc chờ chung một lần sniff, không mở Chrome hai lần. `readTickets({ allowSniff: false })` chỉ dùng override / cache, không sniff, không chờ sniff đang chạy (trả `noToken`). `signIn()` thành công thì xóa cache.
- Ghi (`writeTickets`, `writeOff`): resolve item (dùng `driveId` + `itemId` khi có, không thì `GET /shares/{encodeShareId(shareUrl)}/driveItem`), `createSession` với `{ persistChanges: true }`, luôn `closeSession` trong `finally` (lỗi đóng thì bỏ qua). Sheet = `worksheetFor(date, worksheetPattern)`. **Đọc cột B của dòng trước, `dateLabelsMatch` sai hoặc ô trống -> `dateMismatch`, không ghi ô nào.**
- `writeTickets`: mỗi ô của `cellsForDate`: giá trị hiện tại bằng `text` thì bỏ qua; khác thì PATCH `values`; giá trị cũ là `offMarker` thì `POST .../format/fill/clear` (lỗi bỏ qua).
- `writeOff`: mỗi ô: khác `offMarker` thì ghi `offMarker`; luôn PATCH `format/fill { color: offFillColor }` (ô OFF gõ tay cũng được tô).
- `readTickets`: một session cho cả tuần; ngày có cột B không khớp thì không có trong `cells`; giá trị là ô đầu tiên không rỗng theo thứ tự `columns`, rỗng hết thì `null`. Lỗi ở bất kỳ request nào -> `failed` kèm detail.
- URL ô: `.../workbook/worksheets('<sheet>')/range(address='<A1>')`, tên sheet và địa chỉ qua `encodeURIComponent`; header `workbook-session-id`; timeout 30s mỗi request; GET và PATCH bọc `retryTransient`. Lỗi HTTP: detail `"<việc> -> <status>: <300 ký tự đầu của body>"`.
- Sniffer: `chromium.launchPersistentContext(profileDir, { channel: "chrome", headless, serviceWorkers: "block", args: ["--disable-blink-features=AutomationControlled"], viewport: 1280x800 })`. Nghe mọi request tới `https://graph.microsoft.com/` có `Authorization: Bearer`, gom token + scope; mở lần lượt `tokenPages` (mỗi trang đợi tối đa 30s), dừng khi có token mang `Files.ReadWrite.All` hoặc `Sites.ReadWrite.All`. Chọn: có `.All` > có `ReadWrite` > token đầu. Không thấy token nào -> `noToken`.
- `checkSession`: headless, mở `shareUrl`, đợi 2s; đã đăng nhập khi host của URL hiện tại trùng host của `shareUrl` và URL không chứa `login` / `microsoftonline`. `signIn`: có giao diện, mở `shareUrl`, kiểm mỗi 2s tới 270s; đóng trình duyệt giữa chừng hoặc hết giờ -> `failed`.
- Mọi lối vào Playwright lấy `BrowserLock` trước (bận -> `browserBusy`), nhả trong `finally`. Lỗi khởi chạy có nhắc tới `chrome` + `not found` / `distribution` -> `chromeMissing`.

**Tests:**

- `jwtExpiry reads exp and returns null for an opaque token`
- `writeTickets aborts on a column B date mismatch without writing`
- `writeTickets skips a cell that already holds the text`
- `writeTickets clears the fill when it overwrites the off marker`
- `writeOff colours a cell that already holds the off marker`
- `readTickets leaves out a date whose column B does not match`
- `the session is closed even when a write fails`
- `a cached token is reused until two minutes before it expires`
- `two writes at once sniff once`
- `readTickets without sniff returns noToken when nothing is cached`
- `the override token is used without sniffing`
- `browserLock rejects a second holder until released`
- Chạy tay một lần với Chrome thật (ghi vào `impl-notes.md`): Sign in, sniff, đọc tuần.

### Task 5: Server: TimesheetService, lịch log, REST và Settings

**Files:**

- Create: `packages/server/src/timesheet/queueStore.ts` -- `loadQueue` / `saveQueue` cho `queue.json` (dạng `{ entries: [{ date, tickets, minutes? }] }` như WPF, bỏ `minutes` khi null)
- Create: `packages/server/src/timesheet/timesheetService.ts` -- hàng đợi, drain, log ngay, Log OFF, đọc tuần + rà soát, kiểm ticket (từ `LoggingService*.cs`, `TrayApp.AutoLog.cs`)
- Create: `packages/server/src/timesheet/logScheduler.ts` -- tick 60s, chạy lúc `logTime` (từ `SixPmScheduler.cs`)
- Create: `packages/server/src/routes/timesheetRoutes.ts`
- Modify: `packages/server/src/jira/jiraTracker.ts` -- `filterMine`
- Modify: `packages/server/src/board/boardService.ts` -- `knownKeys()` (key của mọi list, kể cả dismissed), `summaryOf(key)`
- Modify: `packages/server/src/settings/settingsService.ts`, `routes/settingsRoutes.ts`, `settings/parseSettings.ts` -- `timesheet`, `hrmApiKey`, check HRM, phiên TSC
- Modify: `packages/server/src/services.ts`, `main.ts`, `app.ts` -- dựng adapter, service, scheduler; gọi catch-up sau `start()`
- Test: `timesheet/queueStore.test.ts`, `timesheet/timesheetService.test.ts`, `timesheet/logScheduler.test.ts`, `routes/timesheetRoutes.test.ts`, `routes/settingsRoutes.test.ts` (thêm), `jira/jiraTracker.test.ts` (thêm)

**Shape** (route; kiểu từ `core/src/api.ts`):

```text
GET    /api/timesheet                         -> TimesheetView
POST   /api/timesheet/queue                   { date, tickets, minutes|null } -> { ok: true } | { ok: false, error }
PUT    /api/timesheet/queue/:date/minutes     { tickets, minutes }            -> { ok } | { ok: false, error }
DELETE /api/timesheet/queue/:date/:key        -> 204
DELETE /api/timesheet/queue                   -> 204 (clear)
POST   /api/timesheet/drain                   { date? }                       -> RunSummary (chờ xong)
POST   /api/timesheet/log                     { date, tickets, minutes|null, target: "both"|"tsc"|"hrm" } -> EntryOutcome
POST   /api/timesheet/off                     { date }                        -> EntryOutcome (hrm luôn "skipped")
POST   /api/timesheet/week                    { monday, allowSniff }          -> 202; kết quả qua timesheet.changed
POST   /api/timesheet/tickets/check           { keys }                        -> TicketCheck[]
POST   /api/settings/hrm/check                { mcpUrl, hrmApiKey? }          -> { ok: true } | { ok: false, error }
POST   /api/settings/tsc/session              -> { signedIn } | { error }
POST   /api/settings/tsc/sign-in              -> { ok: true } | { ok: false, error } (thành công thì chạy catch-up)
```

```ts
export interface TimesheetServiceDeps {
  readonly loadQueue: () => readonly QueueEntry[]
  readonly saveQueue: (queue: readonly QueueEntry[]) => Promise<void>
  readonly events: EventSink
  readonly board: { knownKeys(): ReadonlySet<string>; summaryOf(key: string): string | null }
  readonly now: () => Date
  readonly logError?: (message: string, error: unknown) => void
}
export interface TimesheetSettings {
  readonly sheet: SheetLog | null
  readonly hours: HoursLog | null
  readonly tracker: TicketTracker | null
  readonly projectKey: string | null
  readonly timeZone: string
  readonly logTime: string
  readonly offMarker: string
}
// TimesheetService.configure(settings) is called by SettingsService.apply, like BoardService.configure.
```

**Logic:**

- Mọi thay đổi hàng đợi (thêm, sửa phút, bỏ, xóa hết, `removeLogged` sau drain, bỏ ngày khi OFF) chạy nối tiếp qua một `Promise` chain, đọc hàng đợi **hiện tại** trong chain rồi gọi hàm core, `saveQueue` xong mới gán vào bộ nhớ và `broadcast({ type: "timesheet.changed" })`. Lỗi một thao tác không làm hỏng chain. `queueStore` đi qua `readJson` (file hỏng -> `.bad`, hàng đợi rỗng); mục có ngày sai dạng, ticket không qua `isTicketKey` bị bỏ; `minutes` sai độ dài, có số <= 0 hoặc tổng > 480 thì về `null` (giữ mục).
- Log một ngày (`logEntry`, dùng cho drain và `log`): `minutes = entryMinutes`; TSC (`writeTickets(date, tickets.join(", "))`) và HRM (`logTickets`) chạy song song bằng `Promise.all`; target `tsc` / `hrm` thì bên kia `skipped`; bên chưa kết nối -> `failed` với `timesheetNotConfigured`. Map lỗi: `SheetFailure` -> `tscNoToken` / `tscDateMismatch` / `chromeMissing` / `browserBusy` / `tscFailed`; HRM -> `hrmRejected` (kèm detail).
- `log` và `drain { date }` với ngày hôm nay trước 18:00 (`isHrmClosed`) và target có HRM -> từ chối `hrmClosedForToday`, không gọi gì. `log` không đụng hàng đợi.
- Drain: chỉ một lượt mỗi lúc; yêu cầu tới trong lúc đang drain thì đặt cờ chạy thêm một lượt sau khi xong và trả ngay `kind: "joined"` (client hiện "A logging run is already in progress"; không ghi vào `lastRun`). Lượt drain chụp hàng đợi lúc bắt đầu (lọc `date` khi có), log từng ngày tuần tự, ngày thành công cả hai bên vào `processed`; hết 5 phút thì dừng trước ngày kế tiếp, `timedOut: true`. `removeLogged(processed)` chạy trong `finally` qua chain. Xong thì đọc lại tuần đang hiển thị (không sniff) nếu đã có, ghi `lastRun`.
- Lịch (fire lúc `logTime`): Timesheet chưa kết nối (cả hai null) -> `notConfigured`; hàng đợi có mục -> drain (`trigger: "schedule"`); trống và cuối tuần -> `weekend`; trống, ngày thường: `hours.offDates(today, today)` có hôm nay -> `dayOff`, không thì `reminder`. Lỗi tra cứu nghỉ coi như không nghỉ (nhắc là hướng an toàn).
- Catch-up: lúc khởi động (sau `settings.start()`) và sau `signIn` thành công: có mục `date < today`, hoặc `date === today` và giờ >= 18:00 -> drain `trigger: "catchUp"`; không thì không ghi `lastRun`.
- `logScheduler`: mỗi 60s tính `zonedClock(timeZone, now)`; chạy khi `clock.minutes >= logTime` và chưa chạy hôm nay (`lastFiredDate !== clock.date`); một lần chạy đang dở thì tick sau bỏ qua. Lúc `start` và khi đổi `logTime`: nếu giờ hiện tại đã qua `logTime` thì đánh dấu hôm nay đã chạy (việc còn tồn để catch-up lo). Dùng fake timers trong test, không tick thật.
- Đọc tuần (`readWeek(monday, allowSniff)`): đặt `week = { monday, reading: true, ... }` (giữ kết quả cũ nếu cùng tuần) và broadcast; một lần đọc đang chạy thì yêu cầu mới chạy sau nó. Ngày thường thứ Hai-Sáu; `readable` = ngày <= hôm nay. Song song: `sheet.readTickets(readable, { allowSniff })`, `hours.dayHours(readable)`, `hours.offDates(monday, friday)` (cả tuần, để ngày nghỉ sắp tới hiện "off"). `tscState` qua `tscStateFor`. Kết quả chỉ được ghi nếu `week.monday` vẫn là tuần đó. Sau đó rà soát (không chặn phần coverage, broadcast lần hai).
- Rà soát: `hours.tasks(monday, min(today, friday))`; key đã log = key TSC (`parseTicketKeys`) + key HRM. `mineKeys` = `board.knownKeys()`; với key còn lại: `tracker.getTicket` (null -> `missingKeys`; throw -> coi là của mình, không gắn cờ); key tồn tại hỏi `tracker.filterMine` (lỗi -> coi là của mình). Không có Jira thì mọi key là của mình. `filterMine` của Jira: `key in (<keys>) AND (<mineJql>)`, `maxResults` = số key, field `summary`; kết quả cache theo key trong phiên.
- Kiểm ticket (`tickets/check`): key có trên board -> `valid`, `isMine: true`, summary của board. Còn lại `getTicket` (null -> `notFound`, lỗi -> `unknown`), rồi `filterMine` cho key `valid`; `suggestedKey` = `typoNeighbors(key, board.knownKeys())[0]` khi `isMine === false` hoặc `notFound`.
- Log OFF: `sheet.writeOff(date)`; thành công thì bỏ mục ngày đó khỏi hàng đợi (qua chain) rồi đọc lại tuần.
- Settings: `SettingsUpdate.timesheet` thay cả khối; `hrmApiKey` lưu vào `secrets.json` cùng cách token Jira (rollback config khi lưu key lỗi). Đổi `hrm.mcpUrl` mà không kèm key mới, khi key lấy từ file -> 400 (`tokenRequired`). `hrm/check` dùng key đã lưu chỉ khi `mcpUrl` trùng (bỏ `/` cuối). `apply` dựng lại `HrmHoursLog` / `GraphSheetLog` khi config hoặc key đổi, gọi `timesheet.configure(...)` và `scheduler.setLogTime(...)`. `logTime` sai dạng -> 400.

**Tests:**

- `queueStore`: các test đọc file của `TicketQueueTests` (`ReturnsEmptyWhenFileMissing`, `RoundTripsEntries`, `RoundTripsCustomMinutes`, `DropsMalformedEntriesAndInvalidTickets`, `ReturnsEmptyOnMalformedJson`, `DropsMinutesThatDoNotMatchTheTickets`, `ClearsWhenWrittenEmpty`)
- `a drain removes only the days that succeeded on both sides`
- `a ticket queued during a drain survives the drain`
- `a drain requested during a drain runs one more pass afterwards`
- `a drain stops at the five minute deadline and keeps the rest`
- `log now for today before 18:00 with HRM is refused without calling HRM`; `TSC only for today before 18:00 is allowed`
- `log off removes that day's queued entry`
- `the schedule shows a reminder on a weekday with an empty queue and no leave`; `the schedule stays silent on a day off and at the weekend`
- `catch-up drains a past day at start and does nothing for today before 18:00`
- `logScheduler fires once at logTime and not again the same day`; `logScheduler started after logTime waits for tomorrow`
- `readWeek does not sniff when allowSniff is false`; `a stale week read does not overwrite the newer week`
- `the review does not flag a key Jira could not be asked about`
- `ticket check suggests a board key one typo away for a ticket that is not mine`
- `filterMine sends key in (...) with the configured mineJql`
- `GET /api/settings never returns the HRM key`; `the saved HRM key is never sent to another MCP URL`
- `every queue change broadcasts timesheet.changed`

### Task 6: Client: Settings > Timesheet

**Files:**

- Create: `packages/client/src/settings/TimesheetSection.tsx` -- khối Timesheet của Settings
- Create: `packages/client/src/settings/timesheetForm.ts` -- form state <-> `TimesheetConfig` (như `jiraForm.ts`)
- Modify: `packages/client/src/settings/SettingsPage.tsx` -- thêm khối sau Connections
- Modify: `packages/client/src/settings/AdvancedFields.tsx` (hoặc khối Advanced của Connections) -- ô `mineJql` ("Query for my tickets")
- Modify: `packages/client/src/api/client.ts` -- `checkHrm`, `checkTscSession`, `signInTsc`
- Modify: `packages/client/src/errors.ts` -- text hai ngôn ngữ cho mọi `AppError.code` mới
- Test: `settings/TimesheetSection.test.tsx`, `errors.test.ts` (thêm)

**Logic:**

- Ba nhóm, dùng `TextField` / `TokenField` sẵn có: **Auto-log** (giờ log `HH:mm`, gợi ý "HRM accepts today's hours only from 6:00 PM"); **HRM** (MCP URL, project id, API key: mask + Replace, khóa khi `hrmKeySource === "env"` với "Set by WORKDAY_HRM_API_KEY"; nút **Check HRM**); **TSC** (share URL, mẫu tên sheet với placeholder `Daily Reports - {year}`, cột `M, J`, các trang lấy token mỗi dòng một URL; nhóm **Advanced** gập sẵn: header rows, off marker, off fill color, drive id, item id; nút **Check TSC session** và **Sign in to TSC**).
- **Save** gửi `PUT /api/settings` với `timesheet` đầy đủ (nhóm HRM / TSC để trống hết thì gửi `null`), `hrmApiKey` chỉ khi đã gõ key mới. Lỗi `tokenRequired` hiện "Enter the HRM key again for the new URL".
- **Sign in to TSC**: nút tắt + spinner trong lúc chờ (tới 4,5 phút); kết quả hiện dưới nút, lỗi qua `errorText` + detail trong `title`.
- `errorText` cho `hrmClosedForToday`: "HRM takes today's hours only from 6:00 PM. Queue it, or use TSC only." / tiếng Việt tương ứng; `chromeMissing`: "Google Chrome is not installed".

**Tests:**

- `Save sends the timesheet block and leaves out an untouched HRM key`
- `an env HRM key locks the key box`
- `Check HRM shows rejected for a wrong key`
- `Sign in to TSC disables the button while it runs`
- `errorText has English and Vietnamese text for every AppError code` (duyệt mọi code, không có chuỗi rỗng)

### Task 7: Client: trang Timesheet

**Files:**

- Create: `packages/client/src/api/useTimesheet.ts` -- query `GET /api/timesheet`, các mutation của Task 5; `useEvents` gọi lại khi có `timesheet.changed`
- Modify: `packages/client/src/api/client.ts` -- hàm cho các route `/api/timesheet/*`
- Create: `packages/client/src/timesheet/TimesheetPage.tsx` -- bố cục một cột: ô nhập, các ngày trong hàng đợi không có thẻ, tiêu đề tuần, lưới thẻ ngày, tổng theo ticket
- Create: `packages/client/src/timesheet/LogInput.tsx` -- ngày, ô ticket, nút **+**, menu "..." (Log OFF..., Log now: TSC only, Log now: HRM only, Clear queue...), khối "not added yet" của các ticket đang gõ
- Create: `packages/client/src/timesheet/TicketRows.tsx` -- dòng ticket (chấm kiểm tra, `KeyPill`, summary, ô giờ, [X]), dùng cho cả ticket đang gõ và ngày trong hàng đợi
- Create: `packages/client/src/timesheet/HoursBar.tsx` -- thanh 8h, một đoạn mỗi ticket + phần trống, kéo ranh bằng pointer events
- Create: `packages/client/src/timesheet/DayCard.tsx` -- thẻ một ngày theo `LogDayState`
- Create: `packages/client/src/timesheet/WeekHeader.tsx` -- "THIS WEEK", khoảng ngày, trước / sau / đọc lại, `HRM 32h / 40h`, `TSC 4 / 4`, dòng trạng thái
- Create: `packages/client/src/timesheet/timesheetText.ts` -- text của mục rà soát (từ `WeekReview.IssueText`), trạng thái hàng đợi, giờ dạng `2h 30m`
- Create: `packages/client/src/timesheet/ConfirmDialog.tsx` -- hộp xác nhận cho Log OFF và Clear queue
- Create: `packages/client/src/timesheet/timesheet.css`
- Modify: `packages/client/src/shell/Shell.tsx` -- trang `timesheet` dùng `TimesheetPage`; `Sidebar` / `TabBar` có chấm ở mục Timesheet khi `lastRun.kind === "reminder"` của hôm nay hoặc có ngày `due` trong hàng đợi
- Test: `timesheet/TimesheetPage.test.tsx`, `timesheet/HoursBar.test.tsx`, `timesheet/timesheetText.test.ts`

**Logic:**

- "Bây giờ" của client là `zonedClock(settings.timeZone, new Date())`, tính lại mỗi phút (đếm ngược và chuyển `waiting` -> `due` đúng giờ); `today` của view server dùng cho chọn tuần. Thẻ ngày dựng bằng `buildLogDays(weekdays, week.coverage, queue, clock.date)`; tuần đầu tiên là `mondayOf(today)`.
- Lần đầu mở trang mỗi lần tải app: `POST /week { monday: tuần này, allowSniff: true }`. Trước / sau: `allowSniff: false`. Nút đọc lại: `allowSniff: true`. Trong lúc `week.reading` thì lưới thẻ mờ, không bấm được, có chữ "Reading the week's logs...".
- Ô ticket: `parseTicketKeys(text, jira.projectKey)`; key mới gõ được kiểm qua `tickets/check` (debounce 400ms, cache theo key trong trang): chấm xanh `valid`, đỏ `notFound`, vàng `unknown`; `isMine === false` thì icon cảnh báo thay chấm và dòng "Not your ticket" kèm nút **Use <suggestedKey>** (đổi key trong ô). Không chặn thao tác nào vì kiểm tra.
- Ticket đang gõ có phút riêng (`typedMinutes`, mặc định `evenSplit`); đổi số ticket thì về `evenSplit`. Ngày > 8h hoặc có ticket 0h thì tắt **+**, **Log now** và HRM only, kèm chữ đỏ "16h - over 8h" / "each ticket needs > 0h". Enter trong ô thêm (khi **+** bật), Esc xóa ô.
- Ô giờ: nhận số giờ thập phân, lưu khi blur / Enter và chỉ khi đã gõ; ngày trong hàng đợi lưu bằng `minutesWith` + `PUT .../minutes`, `null` (0h hoặc > 8h) thì không lưu và báo. Tooltip của ô giờ là `describeSlots(slotsFor(...))`.
- `HoursBar`: chiều rộng = 480 phút; kéo ranh tính phút từ vị trí con trỏ, qua `moveBoundary`, vẽ lại ngay; thả chuột thì gọi `onCommit(minutes)` một lần nếu có đổi. Ngày trong hàng đợi chỉ lưu khi mục vẫn đúng số ticket đó (server trả lỗi thì tải lại).
- Thẻ ngày: header "MON 3" / "T2 03/11" (hôm nay màu Accent), trạng thái bên phải; thẻ đang chọn (bằng ngày của ô nhập) có khung Accent 2px, bấm vào thẻ (ngoài nút / ô nhập / thanh) thì đặt ngày của ô nhập. `queued`: dòng trạng thái ("Auto-logs at 6:00 PM (2h 15m left)" / "Past the auto-log time, not logged yet"), **Log now** (hoặc **Retry** khi `due`; tắt khi `isHrmClosed`, nhãn "(after 6 PM)"), thanh giờ, các dòng. `logged`: "✓ 8h", thanh theo task HRM của ngày, dòng "TSC ✓ MDP-1, MDP-2" hoặc trạng thái TSC (`notDue` / `noToken` "TSC not read yet" / `failed` "TSC not read"), "N ticket(s) to check" khi rà soát có mục, tooltip liệt kê từng mục. `off`: "Day off". `empty`: "Nothing logged - type a ticket above" (ngày đã qua màu Warning). `future`: "not yet".
- Lưới thẻ: số cột = số cột 260px vừa chiều rộng (1-5), theo `ResizeObserver`. Dưới lưới: "This week by ticket" (`weekTicketTotals`: pill, thanh so với ticket lớn nhất, thời gian), ẩn khi rỗng.
- Ngày trong hàng đợi không nằm trong tuần đang xem (tuần khác, cuối tuần) hiện dạng thẻ `queued` dưới nhãn "QUEUED", phía trên tiêu đề tuần.
- Log OFF và Clear queue mở `ConfirmDialog` ("Mark Tue, Nov 11 as OFF in TSC? This overwrites the day's cell."). Lúc một thao tác log chạy, nút của nó hiện "Working..." và tắt; kết quả (`EntryOutcome` / `RunSummary`) hiện ở dòng trạng thái của trang: thành công một dòng, lỗi kèm `errorText` từng bên và `detail` trong `title`.
- `lastRun.kind === "reminder"` của hôm nay: băng trên cùng "Nothing is queued for today - log your work before you leave." cho tới khi hàng đợi có mục hôm nay hoặc thẻ hôm nay là `logged`. `drained` có `kept` thì băng cảnh báo "N logged, M kept for retry" kèm nút mở Settings (phiên TSC).
- TSC hoặc HRM chưa kết nối: dòng "TSC is not connected - open Settings" (tương tự HRM); **Log now** / drain tắt khi thiếu bên cần dùng; vẫn thêm vào hàng đợi được.

**Tests:**

- `adding typed tickets posts the date, the keys and null minutes for an even split`
- `the add button is disabled when the typed day goes over 8h`
- `Log now for today before 6 PM is disabled and says after 6 PM`
- `a queued day past the run reads Retry`
- `the first visit reads this week with allowSniff, the previous week without`
- `a day card shows Day off, the logged hours, or Nothing logged by its state`
- `a ticket that is not mine shows Use KEY and the button swaps the key in the box`
- `Log OFF asks before calling the server`
- `the reminder banner shows after the 6 PM reminder until today is queued`
- `HoursBar drag snaps to half hours and commits once on release`
- `timesheetText gives the Vietnamese issue text with the suggestion`

---

## Kiểm tra cuối giai đoạn

Chạy tay sau Task 7 trên Windows với tài khoản thật (ghi kết quả vào `impl-notes.md`): Settings > Timesheet nhập cấu hình MDP, **Check HRM**, **Sign in to TSC**, **Check TSC session**; mở Timesheet thấy tuần hiện tại đọc đúng như app WPF; xếp một ngày đã qua rồi **Log now** của thẻ, kiểm ô TSC và HRM web; chạy lại lần nữa không ghi đôi; đặt `logTime` sớm hơn giờ hiện tại vài phút rồi chờ thấy lời nhắc / drain; Log OFF một ngày thử (rồi sửa lại tay trên Excel); restart server khi có ngày quá hạn trong hàng đợi thấy drain bù. Không chạy song song với app WPF trong lúc thử drain (hai app cùng ghi một ô).
