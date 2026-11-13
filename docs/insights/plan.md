# Insights + Schedules Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- `packages/client` trong cùng repo

**Goal:** Trang **Insights** gom theo khoảng thời gian giờ HRM, số liệu Claude (token, turn, thời gian, skill, tool, subagent, compact, lỗi API) và commit git của từng ticket, có biểu đồ, bảng, chi tiết, xuất markdown / CSV; trang **Schedules** để server tự chạy quét knowledge theo lịch (thay Windows Task Scheduler) và xem các job của app.

**Expected outcome (acceptance criteria):**
- [ ] Insights (sidebar, sau Timesheet, chỉ local): chọn This week / Last week / This month / Last month (tuần từ thứ Hai, theo `timeZone`) hoặc Custom (hai ngày, đảo khi from > to); lựa chọn được nhớ (localStorage). Mở trang đọc khi chưa có báo cáo, khi đổi khoảng hoặc khi báo cáo cũ hơn 5 phút; Refresh đọc ngay; một lần đọc tại một thời điểm (lần mới bỏ kết quả lần cũ); đọc lỗi giữ báo cáo cũ và hiện một dòng lỗi.
- [ ] Dòng = ticket có giờ HRM, commit hoặc token trong khoảng; sắp theo giờ, rồi token, rồi key (không phân biệt hoa thường). Summary từ board, không có thì từ HRM. Không tính tab terminal, commit nhánh không phải `<project>-*`, merge commit, task HRM không có key.
- [ ] Số liệu Claude theo ngày (giờ `timeZone`): token mỗi message id tính một lần, turn + thời gian turn theo ngày của dòng; skill, compact, subagent, lỗi API cắt theo thời điểm riêng; tool cộng từ mọi session có ngày trong khoảng. Đọc transcript của mọi worktree ticket trên board + key đã lưu, lưu `agent-stats.json` để session cũ vẫn có.
- [ ] Commit: mỗi repo (dev repo + repo anh em theo glob Workspace) `git log --first-parent --no-merges --numstat --branches=<project>-* --remotes=origin/<project>-*`, tác giả = `user.email` của repo, timeout 60 giây; file tính một lần mỗi repo, file nhị phân 0 dòng; repo lỗi bị bỏ (log).
- [ ] Thân trang: tổng (TICKETS, HOURS, TOKENS, COMMITS, FILES), 4 biểu đồ cột (giờ theo ticket, token theo ticket: top 10 + "Other (n)"; giờ theo ngày, token theo ngày), bảng (pill key mở Jira), bấm dòng thấy chi tiết Skills / Tools / Subagents / Compacts / API errors. HRM không đọc được: ô giờ "–", một dòng ghi chú, không có biểu đồ giờ. Không có dòng: "No work in this range - pick another range".
- [ ] Copy markdown và Export CSV (RFC 4180, số invariant, 4 phần token thành cột riêng, dòng Total, UTF-8 BOM).
- [ ] Schedules (trang riêng, chỉ local) -- card **Knowledge scan**: lệnh chạy (vd `pwsh -File <dev repo>\docs\local-config\daily-knowledge-scan.ps1`), bật / tắt, Every day hoặc một thứ trong tuần, giờ bắt đầu (6 AM - 11 PM), giới hạn 1/2/3/4/6 giờ; lần chạy kế tiếp; Run now (hỏi trước, khóa khi đang chạy); 10 lần chạy mới nhất (bắt đầu, thời lượng, kết quả: OK / With problems / Stopped / Failed / Running) và log của lần chọn (đang chạy thì log tăng dần).
- [ ] Server tự chạy quét theo lịch (giờ máy theo `timeZone`), giết tiến trình khi quá giới hạn, lưu log từng lần vào `scan-runs/<stamp>.log` + `scan-runs.json`; lần chạy hỏng / bị dừng / có dòng lỗi (`FAILED (exit`, `Giving up on `, `ERROR:`) -> một notice (topic `knowledge`) và chấm trên mục Schedules tới khi mở trang.
- [ ] Card **App jobs**: poll Jira, kiểm PR, watcher Teams, chạy timesheet 18:00, catch-up: lịch, lần chạy kế, kết quả lần cuối, tooltip 10 lần gần nhất (`job-runs.json`).
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, convention lint, `npm run build` sạch.

**Architecture:** Core thêm logic thuần: khoảng báo cáo, đếm transcript theo ngày, gộp số liệu Claude, parse commit, dựng báo cáo, xuất markdown / CSV, lịch quét và đánh giá kết quả. Server thêm `insights/` (đọc transcript + lưu, đọc commit, gom 4 nguồn song song) và `schedules/` (`ScanRunner` spawn lệnh quét theo lịch, `JobRuns` ghi kết quả các job). Client thêm trang Insights và Schedules.

**Assumptions:**
- Server Workday thay Windows Task Scheduler cho quét knowledge (GĐ 7 chạy trên Linux nên cần lịch riêng). Mặc định tắt; người dùng tắt task Windows `DailyKnowledgeScan` khi bật ở đây, nếu không hai bên cùng chạy.
- Log mỗi lần chạy lấy từ stdout / stderr của tiến trình (không parse file log chung của script như C#); số ticket tìm / đào / map refresh đọc từ các dòng log giống C# (`Found N ticket`, `Mining `, map refresh) khi có.
- Bỏ khỏi giai đoạn này: cảnh báo context / compact (`AgentAlerts`), Insights trên điện thoại, xem / sửa trigger tùy biến của Task Scheduler.
- Biểu đồ vẽ bằng SVG tự viết (không thêm thư viện chart).
- Tiền tố nhánh lấy từ `jira.projectKey` (vd `MDP` -> `MDP-*`).

**Tech Stack:** git CLI (`execFile`), `child_process.spawn` cho lệnh quét, SVG.

---

## File structure

```
packages/core/src/
  reportRanges.ts       rangeFor(kind, today)
  transcriptTally.ts    tallyTranscript(lines) -> AgentStats (theo ngày)
  agentStats.ts         AgentStats, combine, agentInRange
  ticketCommits.ts      parseNumstat, addCommits
  ticketReports.ts      buildReport
  reportExport.ts       reportMarkdown, reportCsv
  knowledgeScan.ts      nextRunAt, judgeRun, scanProblemLines
packages/server/src/insights/
  agentStatsReader.ts, agentStatsStore.ts, commitReader.ts, reportReader.ts
packages/server/src/schedules/
  scanRunner.ts, scanStore.ts, jobRuns.ts
packages/server/src/routes/insightsRoutes.ts, schedulesRoutes.ts
packages/client/src/insights/  InsightsPage.tsx, ReportHeader.tsx, ReportBody.tsx, ReportTable.tsx, ReportDetail.tsx, BarChart.tsx, insights.css
packages/client/src/schedules/ SchedulesPage.tsx, ScanCard.tsx, JobsCard.tsx, schedules.css
```

Mỗi file mới < 300 dòng. Spec C# ở `C:\Project\NoisWorkday` (tài liệu: `.claude/rules/arch/reports.md`, `schedules.md`); port test C# tương ứng.

---

### Task 1: Core: đếm transcript Claude và số liệu theo ngày

**Files:**
- Create: `packages/core/src/agentStats.ts` (+ test) -- kiểu `AgentStats` và các kiểu con (port `Models/AgentStats.cs`, `AgentDayUsage`, `AgentCompact`, `AgentSkillRun`, `AgentSubagent`, `AgentApiError`), `combineAgentStats` (port `Helpers/AgentStatsMerge.cs`); test `AgentStatsMergeTests`
- Create: `packages/core/src/transcriptTally.ts` (+ test, tách file nếu > 300 dòng) -- port `Helpers/TranscriptTally.cs`; test `TranscriptTallyTests`
- Modify: `packages/core/src/index.ts`

**Shape:**
```ts
export interface AgentDayUsage { readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens: number
  readonly cacheWriteTokens: number; readonly turns: number; readonly turnSeconds: number }
export interface AgentStats {
  readonly contextTokens: number | null; readonly contextWindow: number; readonly model: string | null
  readonly sessions: number; readonly turns: number; readonly turnSeconds: number
  readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens: number; readonly cacheWriteTokens: number
  readonly compacts: readonly AgentCompact[]; readonly skills: readonly AgentSkillRun[]; readonly subagents: readonly AgentSubagent[]
  readonly tools: Readonly<Record<string, { readonly calls: number; readonly errors: number }>>
  readonly apiErrors: readonly AgentApiError[]; readonly lastActivity: string | null
  readonly days: Readonly<Record<string, AgentDayUsage>> | null // "YYYY-MM-DD" in the given time zone; null = saved before per-day
}
export function tallyTranscript(lines: readonly string[], timeZone: string): AgentStats // one session's JSONL lines
export function combineAgentStats(sessions: readonly AgentStats[]): AgentStats
```

**Logic:**
- Mỗi dòng JSONL là `unknown`, kiểm từng trường; dòng hỏng bị bỏ.
- Token cộng một lần mỗi message id. Ngày tính bằng `zonedDate.ts` theo `timeZone` (C# dùng giờ HCM cố định).
- Các thời điểm là chuỗi ISO.

**Tests:** port `TranscriptTallyTests`, `AgentStatsMergeTests`, thêm:
- `tallyTranscript counts a message id's tokens once across its streamed lines`
- `tallyTranscript puts a turn on the day of its line in the configured time zone`

---

### Task 2: Core: commit, dựng báo cáo, xuất, khoảng thời gian

**Files:**
- Create: `packages/core/src/reportRanges.ts` (+ test) -- port `Helpers/ReportRanges.cs`; test `ReportRangesTests`
- Create: `packages/core/src/ticketCommits.ts` (+ test) -- port `Helpers/TicketCommits.cs`; test `TicketCommitsTests`
- Create: `packages/core/src/ticketReports.ts` (+ test) -- port `Helpers/TicketReports.cs` + `TicketReports.Agent.cs`; test `TicketReportsTests` (dữ liệu từ `ReportTestData.cs`)
- Create: `packages/core/src/reportExport.ts` (+ test) -- port `Helpers/ReportExport.cs`; test `ReportExportTests`
- Modify: `packages/core/src/api.ts` -- `InsightsView`, `index.ts`

**Shape:**
```ts
export type ReportRangeKind = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom'
export interface ReportRange { readonly kind: ReportRangeKind; readonly from: string; readonly to: string }
export function rangeFor(kind: Exclude<ReportRangeKind, 'custom'>, today: string): ReportRange
export interface TicketCommitStats { readonly commits: number; readonly files: number; readonly added: number; readonly deleted: number }
export function parseNumstat(output: string, branchPrefix: string): Readonly<Record<string, TicketCommitStats>> // per ticket key
export function addCommits(left: Readonly<Record<string, TicketCommitStats>>, right: Readonly<Record<string, TicketCommitStats>>):
  Readonly<Record<string, TicketCommitStats>>
export interface TicketReportFacts { readonly summary: string | null; readonly status: string | null; readonly section: string | null }
export interface TicketReportRow {
  readonly ticketKey: string; readonly facts: TicketReportFacts; readonly hours: number | null
  readonly sessions: number; readonly turns: number; readonly claudeSeconds: number; readonly tokens: AgentDayUsage
  readonly commits: TicketCommitStats | null; readonly agent: AgentStats | null
}
export interface TicketReport {
  readonly range: ReportRange; readonly rows: readonly TicketReportRow[]; readonly hoursRead: boolean
  readonly hoursByDay: Readonly<Record<string, number>>; readonly tokensByDay: Readonly<Record<string, number>>
}
export interface TicketReportInput {
  readonly range: ReportRange
  readonly agent: Readonly<Record<string, readonly AgentStats[]>> // per ticket, one entry per session
  readonly hrmTasks: readonly HrmTask[] | null
  readonly commits: Readonly<Record<string, TicketCommitStats>>
  readonly facts: Readonly<Record<string, TicketReportFacts>>
}
export function buildReport(input: TicketReportInput): TicketReport
export function reportMarkdown(report: TicketReport): string
export function reportCsv(report: TicketReport): string // without the BOM; the client adds it
export interface InsightsView { readonly report: TicketReport; readonly readAt: string }
```

**Logic:**
- Luật dòng / sắp xếp / summary / session cũ không có `days` (đặt cả session vào ngày `lastActivity`) giữ như C# và tiêu chí của plan.
- Commit: tiền tố nhánh là tham số (`<projectKey>-`), không hardcode `MDP`.
- Số trong CSV dùng dấu chấm, không định dạng theo locale.

**Tests:** port các test C# đã nêu, thêm:
- `parseNumstat counts a file once per repo and a binary file as zero lines`
- `buildReport keeps hours null when HRM was not read`
- `reportCsv escapes quotes, commas and line breaks`

---

### Task 3: Server: đọc số liệu Claude, commit, gom báo cáo + route

**Files:**
- Create: `packages/server/src/insights/agentStatsStore.ts` -- `agent-stats.json` (key ticket -> session id -> `AgentStats`), port `Services/AgentStatsStore.cs`; test `AgentStatsStoreTests`
- Create: `packages/server/src/insights/agentStatsReader.ts` (+ test) -- port `Services/AgentStatsReader.cs` + `AgentStatsService.cs`: tìm transcript của worktree ticket (dùng `claudeProjectDirName` + `findWorktrees` của GĐ 4), đọc từng session (đuôi 20 MB như `transcriptReader.ts`), `tallyTranscript`, lưu
- Create: `packages/server/src/insights/commitReader.ts` (+ test) -- port `Services/TicketCommitReader.cs` qua `workspace/git.ts`
- Create: `packages/server/src/insights/reportReader.ts` (+ test) -- port `Services/TicketReportReader.cs`
- Create: `packages/server/src/routes/insightsRoutes.ts` (+ test)
- Modify: `services.ts`, `app.ts`

**Logic:**
- `reportReader.read(range)`: 4 nguồn song song: HRM `hours.tasks(from, to)` (null khi lỗi hoặc chưa cấu hình), số liệu Claude (key đã lưu + ticket inProgress / done trên board), commit (không có `devRepoPath` -> `{}`), facts từ board; rồi `buildReport`.
- Một lần đọc tại một thời điểm; yêu cầu mới trong lúc đang đọc cùng khoảng thì dùng chung, khác khoảng thì chờ lần cũ xong rồi đọc.
- Route (local-only):
  - `GET /api/insights?kind=&from=&to=` -> `InsightsView`.
  - `kind` sai, hoặc ngày không đúng `YYYY-MM-DD` khi `custom` -> 400; khoảng custom > 366 ngày -> 400.
  - Lỗi đọc -> 500 với code `insightsFailed` (thêm vào AppError + `errors.ts` client).
- Không log nội dung transcript.

**Tests:**
- port `AgentStatsStoreTests`, `AgentStatsReaderTests` phần đọc file
- `commitReader sums the repos and skips a repo whose git fails`
- `read runs the four sources and builds the report`
- `read keeps hours unread when HRM fails`
- `insights route rejects a bad range and is local-only`

---

### Task 4: Client: trang Insights

**Files:**
- Create: `packages/client/src/insights/InsightsPage.tsx`, `ReportHeader.tsx`, `ReportBody.tsx`, `ReportTable.tsx`, `ReportDetail.tsx`, `BarChart.tsx`, `insights.css`, `useInsights.ts` (+ test cho page, chart, table) -- port bố cục / chữ của `UI/ReportsPage*.cs`, `UI/ReportBarChart.cs`
- Modify: `shell/pages.ts`, `Sidebar.tsx` (mục Insights sau Timesheet, ẩn trên thiết bị từ xa), `api/client.ts`

**Logic:**
- Khoảng lưu trong `localStorage` (`workday.insights.range`); thứ tự đọc lại như tiêu chí.
- `BarChart` là SVG: thanh ngang, một màu nhấn, tooltip giá trị (`<title>`), top 10 + "Other (n)" cho biểu đồ theo ticket.
- Token hiển thị gọn (1.2k, 3.4M) như `TokenText.Format` của C#.
- Export CSV tải file `workday-report-<from>-<to>.csv` có BOM; Copy markdown dùng `navigator.clipboard`.

**Tests:**
- `insights page reads on open and again when the range changes`
- `a failed read keeps the last report and shows the error`
- `bar chart groups everything past the top ten into Other`
- `hours cells show a dash when HRM was not read`
- `clicking a row shows its Claude detail tables`

---

### Task 5: Core + server: quét knowledge theo lịch, lịch sử job

**Files:**
- Create: `packages/core/src/knowledgeScan.ts` (+ test) -- `nextRunAt`, `judgeRun`, `scanCounts`, port phần thuần của `Helpers/KnowledgeScan.cs` (dòng lỗi, đếm, `StartTimeChoices`); test `KnowledgeScanTests` phần tương ứng
- Create: `packages/server/src/schedules/scanStore.ts`, `scanRunner.ts` (+ test), `jobRuns.ts` (+ test, port `Helpers/JobRuns.cs`)
- Create: `packages/server/src/routes/schedulesRoutes.ts` (+ test)
- Modify: `core/src/api.ts` (`KnowledgeScanConfig`, `WorkdayConfig.knowledgeScan`, `SchedulesView`), `core/src/notices.ts` (topic `knowledge`, event `scanBad { outcome }`, mặc định toast + desktop), `server/src/config.ts`, `settings/*`, `services.ts`, `main.ts`; ghi `JobRuns` trong `board/boardService.ts` (poll), `prs/prService.ts` (check), `teams/teamsWatcher.ts` (check), `timesheet/timesheetService.ts` (chạy 18:00 và catch-up)

**Shape:**
```ts
export interface KnowledgeScanConfig {
  readonly enabled: boolean
  readonly command: string // "pwsh"
  readonly args: readonly string[] // ["-NoProfile", "-File", "C:/Project/Backend-DotNet/docs/local-config/daily-knowledge-scan.ps1"]
  readonly day: 'daily' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  readonly time: string // "HH:mm", on the hour 06:00-23:00
  readonly limitHours: 1 | 2 | 3 | 4 | 6
}
export type ScanOutcome = 'running' | 'ok' | 'withProblems' | 'stopped' | 'failed'
export interface ScanRun { readonly id: string; readonly startedAt: string; readonly endedAt: string | null; readonly outcome: ScanOutcome
  readonly exitCode: number | null; readonly found: number; readonly mined: number; readonly refreshed: number
  readonly problemLines: readonly string[]; readonly trigger: 'schedule' | 'user' }
export type AppJobName = 'jiraPoll' | 'prCheck' | 'teamsCheck' | 'timesheetRun' | 'catchUp'
export interface JobRun { readonly startedAt: string; readonly endedAt: string; readonly ok: boolean; readonly summary: string | null }
export interface SchedulesView {
  readonly scan: { readonly config: KnowledgeScanConfig | null; readonly nextRunAt: string | null; readonly runs: readonly ScanRun[]
    readonly unseenBad: boolean }
  readonly jobs: Readonly<Record<AppJobName, { readonly runs: readonly JobRun[]; readonly nextRunAt: string | null }>>
}
```

**Logic:**
- `scanRunner`:
  - Hẹn giờ một lần tới `nextRunAt` (tính theo `timeZone`), chạy xong tính lại. Đổi config thì hủy hẹn cũ.
  - Một lần chạy tại một thời điểm; Run now khi đang chạy -> 409.
  - `spawn(command, args)` không qua shell, `cwd` = thư mục của file script nếu có, env không mang biến `CLAUDE*` / `ANTHROPIC*` của server (dùng `launchEnvironment.ts`). stdout + stderr ghi vào `scan-runs/<id>.log`.
  - Quá `limitHours` -> kill cả cây (Windows: `taskkill /T /F /PID`, khác: `process.kill(-pid)` với `detached: true`), outcome `stopped`.
  - Exit khác 0 -> `failed`; có dòng lỗi -> `withProblems`.
  - Restart server mà còn run `running` -> đổi thành `stopped`.
  - Giữ 30 run, xóa log cũ.
- Run xấu (`withProblems` / `stopped` / `failed`) -> notice `scanBad` (target schedules), `unseenBad = true` tới khi gọi `POST /api/schedules/scan/seen`.
- `jobRuns.record(job, run)`: 10 run mỗi job, file riêng, lỗi ghi chỉ log, không bao giờ làm hỏng job.
- Route (local-only):
  - `GET /api/schedules`.
  - `POST /api/schedules/scan/run`.
  - `POST /api/schedules/scan/seen`.
  - `GET /api/schedules/scan/runs/:id/log?from=<byte offset>` -> `{ text, next }` (tối đa 256 KB mỗi lần; id phải có trong danh sách run, chống path traversal).
  - Cấu hình qua `PUT /api/settings` `knowledgeScan`.

**Tests:**
- port `KnowledgeScanTests` phần dòng lỗi / đếm / giờ bắt đầu, `JobRunsTests`
- `nextRunAt picks today's time when still ahead, else the next matching day`
- `a run that exceeds the limit is killed and marked stopped` (spawn giả)
- `a non-zero exit is failed and a problem line is withProblems`
- `a bad run adds one knowledge notice and sets unseenBad until seen`
- `run now while running answers 409`
- `the log route refuses an unknown run id`

---

### Task 6: Client: trang Schedules

**Files:**
- Create: `packages/client/src/schedules/SchedulesPage.tsx`, `ScanCard.tsx`, `JobsCard.tsx`, `schedules.css`, `useSchedules.ts` (+ test) -- port bố cục / chữ của `UI/SchedulesPage*.cs`
- Modify: `shell/pages.ts`, `Sidebar.tsx` (mục Schedules, chấm khi `unseenBad`, ẩn trên thiết bị từ xa), `notices/noticeTarget.ts` (target schedules), `settings/NoticesSection.tsx` (topic `knowledge`)

**Logic:**
- Mở trang (và mỗi phút khi đang mở) đọc lại; mở trang -> `scan/seen`.
- Card scan:
  - Ô lệnh + đối số (một dòng mỗi đối số), switch bật, chọn ngày (Every day / Mon ... Sun), giờ (06:00 - 23:00), giới hạn (1/2/3/4/6 h). Mỗi thay đổi lưu ngay qua `PUT /api/settings`.
  - Run now hỏi trước.
  - Danh sách 10 run mới nhất; bấm một run hiện log. Run đang chạy thì mỗi 3 giây đọc tiếp từ `next`.
- Card jobs: mỗi job một dòng (tên, lịch, lần kế, kết quả lần cuối), tooltip 10 lần gần nhất.

**Tests:**
- `schedules page marks bad runs seen on open`
- `changing the day saves the knowledge scan config`
- `run now asks first`
- `a running scan's log is read on from the last offset`
- `jobs card shows the last result and the next run`

---

## Kiểm tra cuối giai đoạn

1. `npm test`, `npm run typecheck`, `npm run lint`, convention lint, `npm run build` sạch.
2. Người dùng thử thật:
   1. Insights: This week / Last month có giờ HRM, token Claude, commit khớp với thực tế; Export CSV mở được trong Excel.
   2. Schedules: đặt lệnh `pwsh` + `-NoProfile -File C:/Project/Backend-DotNet/docs/local-config/daily-knowledge-scan.ps1`, Run now, xem log chạy; tắt task Windows `DailyKnowledgeScan` rồi bật lịch ở đây.
