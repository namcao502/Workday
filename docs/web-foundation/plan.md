# Workday web foundation Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git (repo mới `C:\Project\Workday`)

**Frontend repo:** none -- frontend nằm trong cùng repo (`packages/client`)

**Goal:** Dựng nền móng bản web full TypeScript của NoisWorkday (chạy được trên Linux lẫn Windows, một process) và làm xong khu vực đầu tiên: Board ticket đọc từ Jira.

**Expected outcome (acceptance criteria):**

- [ ] `npm install` rồi `npm run dev` ở gốc repo chạy server + Vite; mở `http://localhost:5173` thấy khung app: sidebar Tickets / Workspace / Timesheet / Insights / Settings (các trang chưa làm hiện "Coming soon").
- [ ] Trên một bản checkout sạch, `npm ci`, `npm run build` rồi `npm start` chạy **một** process phục vụ cả UI lẫn API trên `127.0.0.1:<port>` (mặc định 4870); không có code riêng cho Windows hay Linux.
- [ ] Request có `Host` khác `127.0.0.1:<port>` / `localhost:<port>` bị từ chối (403); WebSocket từ `Origin` lạ bị từ chối.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` ở gốc đều sạch, cho cả ba workspace.
- [ ] Chưa có cấu hình Jira: server vẫn khởi động, trang Tickets báo "Jira is not connected - open Settings" thay vì lỗi.
- [ ] Settings > Connections: nhập Jira URL, email, API token, Project key (và trong nhóm **Advanced**: id field ETA, id field Dev priority, JQL), bấm **Check** gọi Jira và báo đúng / sai token / không kết nối được; **Save** lưu (token vào file secret, phần còn lại vào `config.json`) và board kết nối ngay.
- [ ] Settings > General: đổi Theme (dark / light) và Language (English / Tiếng Việt) áp dụng ngay, giữ sau khi reload; ở Tiếng Việt mọi message lỗi từ server cũng hiện tiếng Việt.
- [ ] Board poll Jira lúc khởi động, mỗi `pollMinutes` phút (mặc định 5) và khi bấm **Check now**; ticket được giao mới vào Working. Lần poll đầu chỉ lấy baseline, không đổ toàn bộ ticket cũ vào board (giống `TicketPoller`).
- [ ] Ticket trong Working mà Jira đã chuyển Done: tự chuyển sang Done ở lần poll kế tiếp (giống `TrayApp.MarkTicketDone` của app WPF); ticket ở Done mà Jira gửi lại (`isSentBack`) quay về Working.
- [ ] Views Working / Done / Dismissed có số đếm; ô search lọc theo key và summary; gõ key hoặc link Jira của ticket chưa có trên board thì hiện **Add <KEY>**, bấm hoặc Enter thì thêm; key không tồn tại thì báo lỗi, không thêm.
- [ ] Menu của từng dòng: **Done**, **Dismiss**, **Restore**, **Reopen** chuyển ticket giữa các list; trạng thái giữ nguyên sau khi restart server.
- [ ] Màu hạn: quá hạn đỏ, còn <= 2 ngày cam, ticket Jira đã Done không bao giờ bị tô (cùng quy tắc `JiraTicket.GetDueUrgency`); ngày "hôm nay" tính theo `timeZone` trong config (mặc định `Asia/Ho_Chi_Minh`).
- [ ] Mở hai tab trình duyệt: thao tác ở tab này thì tab kia cập nhật qua WebSocket, không cần reload.
- [ ] File JSON trong data dir bị hỏng: giữ lại thành `<file>.bad`, board coi như rỗng, server không crash.
- [ ] Màn hình hẹp (< 720px): sidebar thành tab bar dưới đáy, bảng thành danh sách thẻ.

**Architecture:** npm workspaces gồm `packages/core` (logic thuần + kiểu API + interface tích hợp, không I/O), `packages/server` (Fastify: adapter Jira, store file JSON, poll, REST + WebSocket, phục vụ bản build của client) và `packages/client` (React + Vite). Mỗi tích hợp của công ty là một interface trong core (`TicketTracker` ở giai đoạn này) với adapter riêng trong server, nên đổi công ty chỉ thay adapter và config.

**Assumptions:**

- Repo riêng, dữ liệu riêng: không đọc / ghi `%AppData%\NoisWorkday` của app WPF. Hai app chạy song song sẽ poll Jira riêng; giai đoạn này chưa có thông báo nên không bị báo trùng.
- Giai đoạn 1 chỉ bind `127.0.0.1`, chưa có đăng nhập; truy cập từ xa (Cloudflare Tunnel + Access + ghép nối thiết bị) là giai đoạn 3, và server phải từ chối bind địa chỉ khác cho tới lúc đó.
- Secret (Jira token) lưu dạng plain text trong `secrets.json` của data dir (Linux: quyền `0600`), hoặc lấy từ biến môi trường `WORKDAY_JIRA_API_TOKEN` (ưu tiên hơn). Mã hóa secret làm cùng giai đoạn 3, trước khi mở ra mạng.
- Không port toàn bộ 137 Helpers trước: mỗi giai đoạn port test C# của đúng khu vực mình làm thành Vitest (test C# là đặc tả), để giai đoạn nào cũng ra thứ dùng được ngay.
- Các giá trị riêng của MDP (JQL, id field ETA `customfield_10735`, Dev priority `customfield_11111`, prefix key `MDP`, tên status của workflow như "PR & Code Review", "QA Failed") nằm trong `config.json` của người dùng, không nằm trong code; code chỉ có mặc định trung tính (JQL assigned chung, danh sách status rỗng). Mọi literal port từ C# đều qua rule này.
- Gọi Jira không retry ở GĐ 1: poll kế tiếp chính là lần thử lại; lỗi ghi vào `lastPoll`.
- Board giai đoạn 1 chưa có Start / Ready to Test / Take / to-do / PR / Available to take: các nút đó cần worktree, Claude, Azure DevOps nên thuộc giai đoạn sau. Working gộp New + In progress như app WPF.
- Version thư viện: lấy bản stable mới nhất lúc scaffold, tra Context7 cho API của Fastify 5, React 19, Vite, Vitest.

**Tech Stack:** Node 22 LTS, TypeScript (strict), npm workspaces, Fastify + `@fastify/websocket` + `@fastify/static`, `tsx` (chạy server khi dev), React + Vite, Vitest + `@testing-library/react` + jsdom, ESLint (flat config, `typescript-eslint`), Prettier, `concurrently`.

---

## Lộ trình (mỗi giai đoạn một plan riêng, viết khi bắt đầu giai đoạn đó)

| GĐ  | Nội dung                                                                                                                                     | Đặc tả C# để port                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Plan này**: nền móng, Settings tối thiểu, Board từ Jira                                                                                    | `TicketPoller`, `TicketBoard`, `TicketStore`, `JiraClient`, `JiraTicket`, `TicketParser`, `TicketSearch`                                 |
| 2   | **Timesheet**: queue, drain TSC (Graph Excel + Playwright sniff) + HRM (MCP SDK), lịch 18:00, đọc tuần, thẻ ngày, Log OFF                    | `LoggingService*`, `TicketQueue`, `TimeSlots`, `HoursSplit`, `LogDays`, `QueueDayStatus`, `WeekReview`, `GraphTscClient`, `HrmMcpClient` |
| 3   | **Truy cập từ xa**: mã hóa secret, đăng nhập, ghép nối thiết bị + quyền Off / View / Act, Cloudflare Tunnel + Access, PWA manifest, Web Push | `MobileDeviceStore`, `MobileServer.Setup`, `MobilePush`, `MobileAccess`                                                                  |
| 4   | **Workspace**: terminal (`node-pty` + xterm.js), phiên Claude + hook, Start / Open (worktree), Changes / Files, chat Claude                  | `ClaudeSessionHost`, `ClaudeHookServer`, `ClaudeAttention`, `TicketWorktrees`, `GitChanges`, `ClaudeTranscriptChat`                      |
| 5   | **Board đầy đủ + thông báo**: to-do, PR (Azure DevOps), Ready to Test, Available to take, chuông thông báo, Teams                            | `DashboardTodos`, `PrTracker`, `TicketSuggestions`, `NoticeCenter`, `TeamsThreadService`                                                 |
| 6   | **Insights**, Schedules, knowledge scan                                                                                                      | `TicketReports`, `TicketReportReader`, `KnowledgeScanService`                                                                            |
| 7   | **Chuyển hẳn**: systemd service trên Linux, xuất / nhập dữ liệu từ app WPF, quyết định bỏ WPF                                                | --                                                                                                                                       |

Mỗi tích hợp có interface riêng trong `core/src/ports/` khi giai đoạn của nó tới: `TicketTracker` (GĐ 1), `TimeLog` (GĐ 2), `PullRequests` và `TeamChat` (GĐ 5). Không khai báo trước interface chưa dùng.

---

### Task 1: Scaffold repo và chuỗi dev / build / start

**Files:**

- Create: `C:\Project\Workday\` -- `git init` (nhánh `main`), `.gitignore` (`node_modules/`, `dist/`, `coverage/`, `.env*`, `*.bad`), `.editorconfig`, `.nvmrc` (`22`)
- Create: `package.json` -- workspaces `packages/*`; script `dev`, `build`, `start`, `test`, `typecheck`, `lint`, `format`
- Create: `tsconfig.base.json` -- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module`/`moduleResolution` `NodeNext` (server, core), `Bundler` (client)
- Create: `eslint.config.js`, `.prettierrc` -- `typescript-eslint` strict-type-checked; cấm `any` (`@typescript-eslint/no-explicit-any: error`)
- Create: `packages/core/` -- `package.json` (`@workday/core`, ESM), `tsconfig.json`, `src/index.ts`, `vitest.config.ts`
- Create: `packages/server/` -- `package.json` (`@workday/server`), `tsconfig.json`, `src/main.ts` (đọc port, gọi `createApp`, listen), `src/app.ts` (`createApp(deps)` dựng Fastify, đăng ký route, phục vụ `packages/client/dist` khi có), `vitest.config.ts`
- Create: `packages/client/` -- Vite + React + TS: `index.html`, `src/main.tsx`, `src/App.tsx` (chỉ một dòng "Workday" ở task này), `vite.config.ts` (proxy `/api` -> `http://127.0.0.1:4870`, cả WebSocket), `vitest.config.ts` (jsdom)
- Create: `CLAUDE.md` -- lệnh build / test / chạy một test, bố cục ba workspace, quy tắc: core không I/O, mọi giá trị riêng của công ty vào config, mỗi tích hợp là một interface trong `core/src/ports`
- Create: `README.md` -- yêu cầu (Node 22), cài đặt, chạy dev, build + start, data dir mỗi OS
- Test: `packages/server/src/app.test.ts`

**Logic:**

- `npm run dev` = `concurrently` chạy `tsx watch packages/server/src/main.ts` và `vite` của client. `npm run build` = `tsc -b` cho core + server, rồi `vite build`. `npm start` = `node packages/server/dist/main.js`.
- Server listen `127.0.0.1` cứng ở giai đoạn này; `host` trong config khác `127.0.0.1` / `localhost` thì thoát với thông báo "Remote access is not available yet" (chống mở ra mạng khi chưa có đăng nhập).
- Route không phải `/api/*` mà không trùng file tĩnh thì trả `index.html` (SPA fallback), chỉ khi `client/dist` tồn tại; khi dev thì Vite lo.
- `createApp` nhận dependency qua tham số (store, tracker...) để test dùng `app.inject()` không cần mở port.
- `GET /api/health` trả `{ ok: true, version }`, `version` đọc từ `package.json` của server lúc khởi động.
- `@workday/core` khai báo `exports` có điều kiện: `"development": "./src/index.ts"`, `"default": "./dist/index.js"` (cùng `types`). Dev chạy `tsx` với `--conditions=development` và Vite có `resolve.conditions: ["development"]`, nên không cần build core trước; `npm start` dùng `dist` đã build. `tsc -b` dùng project references để build core trước server.
- Hook `onRequest` từ chối (403) request có `Host` khác `127.0.0.1:<port>` / `localhost:<port>` (chống DNS rebinding); khi dev, thêm port của Vite (5173) vào danh sách. WebSocket `/api/events` còn từ chối `Origin` không nằm trong danh sách đó.

**Tests:**
Tên test bằng tiếng Anh (code commit là tiếng Anh):

- `health returns ok and the version`
- `an unknown non-api route returns index.html when the client build exists`
- `an unknown api route returns a JSON 404, never index.html`
- `rejects a host other than loopback` (hàm kiểm tra host, không mở port)
- `a request with a foreign Host header gets 403`
- `the events socket rejects a foreign Origin`

### Task 2: Core: ticket, ngày theo múi giờ, parser, search, luật board

Toàn bộ là hàm thuần, không I/O, không mutate input (trả object mới). Đặc tả là code và test C# trong `C:\Project\NoisWorkday`: port test sang Vitest trước, chạy thấy fail, rồi mới viết code. Bỏ các test chỉ thuộc tính năng chưa làm (work branch, epic, to-do, Start có worktree).

**Files:**

- Create: `packages/core/src/ticket.ts` -- `Ticket`, `dueUrgency`, `devPriorityLevel`, `isStatusDone`, `ticketEquals` (từ `Models/JiraTicket.cs`)
- Create: `packages/core/src/zonedDate.ts` -- `todayIn(timeZone, now)` trả `"YYYY-MM-DD"` qua `Intl.DateTimeFormat`; múi giờ không hợp lệ thì về `+07:00` (giống `Hcm`)
- Create: `packages/core/src/ticketKey.ts` -- `parseTicketKey(input, projectKey)` (từ `TicketParser.TryParseKey`: `"1234"`, `"MDP-1234"` mọi kiểu hoa thường, link Jira có key)
- Create: `packages/core/src/ticketSearch.ts` -- `matchesTicket(ticket, query)` (từ `TicketSearch.Matches`)
- Create: `packages/core/src/statusFlow.ts` -- `StatusFlow`, `isSentBack(storedStatus, liveStatus, flow)` (từ `JiraStatusFlow.IsSentBack`; tên status đến từ config, không hằng trong core)
- Create: `packages/core/src/board.ts` -- `BoardState` và các chuyển trạng thái
- Create: `packages/core/src/ports/ticketTracker.ts` -- interface `TicketTracker`
- Create: `packages/core/src/api.ts` -- kiểu request / response / event dùng chung cho server và client
- Test: `ticket.test.ts`, `zonedDate.test.ts`, `ticketKey.test.ts`, `ticketSearch.test.ts`, `statusFlow.test.ts`, `board.test.ts` cùng thư mục

**Shape:**

```ts
export interface Ticket {
  readonly key: string
  readonly summary: string
  readonly dueDate: string | null // "YYYY-MM-DD"
  readonly eta: string | null
  readonly devPriority: number | null
  readonly status: string | null
  readonly statusCategory: string | null
  readonly issueType: string | null
  readonly timeSpentSeconds: number | null
  readonly updated: string | null
  readonly parentKey: string | null
}
export type DueUrgency = 'none' | 'dueSoon' | 'overdue'
export type BoardSection = 'new' | 'inProgress' | 'done'
export interface DismissedTicket {
  readonly ticket: Ticket
  readonly origin: BoardSection
}
export interface BoardState {
  readonly new: Readonly<Record<string, Ticket>>
  readonly inProgress: Readonly<Record<string, Ticket>>
  readonly done: Readonly<Record<string, Ticket>>
  readonly dismissed: Readonly<Record<string, DismissedTicket>>
  readonly seenKeys: readonly string[] | null // null = never polled (first run takes a baseline)
}
export interface StatusFlow {
  readonly preWorkStatuses: readonly string[]
  readonly reworkStatuses: readonly string[]
}

export function ticketEquals(a: Ticket, b: Ticket): boolean
export function applyAssignedPoll(
  state: BoardState,
  assigned: Readonly<Record<string, Ticket>>,
  flow: StatusFlow,
): BoardState
export function offPollKeys(
  state: BoardState,
  assigned: Readonly<Record<string, Ticket>>,
): readonly string[]
export function applyLiveTickets(
  state: BoardState,
  live: Readonly<Record<string, Ticket>>,
): BoardState
export function addTicket(state: BoardState, ticket: Ticket): BoardState | null // null = already on the board
export function markDone(state: BoardState, key: string): BoardState
export function reopen(state: BoardState, key: string): BoardState
export function dismiss(state: BoardState, key: string): BoardState
export function restore(state: BoardState, key: string): BoardState

export interface TicketTracker {
  validate(): Promise<
    { ok: true; displayName: string } | { ok: false; reason: 'rejected' | 'unreachable' }
  >
  getAssignedTickets(): Promise<Readonly<Record<string, Ticket>>> // throws on failure
  getTicket(key: string): Promise<Ticket | null> // null = missing or not visible; other failures throw
  ticketUrl(key: string): string
}
```

**Logic** (port từ `TicketPoller.PollAsync` và `TicketBoard`):

- Một bộ tên cho các list: `new`, `inProgress`, `done`, `dismissed` (khớp `BoardSection`). Hàm trả **chính object state cũ** khi không có gì đổi, để server so `!==` mà biết có cần lưu và broadcast không. "Đổi" giữa hai ticket là `ticketEquals` (so từng field, như record equality của C#).
- `applyAssignedPoll`, theo đúng thứ tự: (1) ticket ở `done` mà có trong `assigned` và `isSentBack(stored.status, live.status, flow)` thì chuyển sang `inProgress` với bản live; (2) cập nhật chi tiết mọi ticket đã lưu (cả `dismissed`) bằng bản live khi `!ticketEquals`; (3) `seenKeys === null` (lần đầu): chỉ lưu baseline; ngược lại key mới chưa nằm list nào thì vào `new`; (4) `seenKeys` = cũ + key mới. Bước (1) phải chạy trước (2) vì (2) ghi đè status mà (1) cần so.
- `offPollKeys`: key trong `new` + `inProgress`, chưa Done theo Jira, không có trong `assigned`, không trùng.
- `applyLiveTickets` (chạy trên state **hiện tại**, không phải state lúc bắt đầu poll): ticket ở `new` hoặc `inProgress` mà bản live đã Done thì chuyển sang `done` với bản live (giống `TrayApp.MarkTicketDone` của WPF, vì GĐ 1 chưa có Start nên ticket chủ yếu nằm ở `new`); còn lại cập nhật chi tiết như bước (2).
- Không trả danh sách ticket mới / xong / mở lại: GĐ 1 chưa có thông báo dùng tới; GĐ 5 thêm lại khi làm thông báo.
- `addTicket`: thêm vào `new`; key thêm vào `seenKeys` **chỉ khi** `seenKeys !== null` (thêm khi chưa có baseline sẽ giả ra một baseline, test `Add_DoesNotWriteSeen_WhenSeenFileMissing`).
- Giai đoạn này chưa có Start, nên `markDone` nhận ticket từ `new` hoặc `inProgress`; `reopen` đưa `done` về `inProgress`. `dismiss` ghi `origin` theo list nguồn, `restore` trả về đúng list đó. Key không có trong list nguồn thì trả state cũ, không lỗi. `dismiss` không xóa key khỏi `seenKeys`, để poll không thêm lại.
- `isStatusDone`: `statusCategory === "done"` (key của Jira, không phải tên hiển thị).
- `dueUrgency(ticket, today)`: ticket đã Done theo Jira luôn `"none"`; hạn < hôm nay `"overdue"`; hạn <= hôm nay + 2 ngày `"dueSoon"`.

**Tests** (port, giữ ý của test C#; tên tiếng Anh). Chọn test theo **hàm mà test gọi**, không theo tên file: chỉ port test của hàm có trong plan, test của hàm khác để giai đoạn của nó.

- `JiraTicketTests`: chỉ các test `IsStatusDone` và `GetDueUrgency` -> `ticket.test.ts` (bỏ `FormatTimeSpent` / `IsTimeLogMissing`: thuộc GĐ 2); thêm `ticketEquals detects a changed status`
- `TicketParserTests` phần `TryParseKey` -> `ticketKey.test.ts`, thêm `parses a key for another project key`
- `TicketSearchTests` phần `JiraTicket` -> `ticketSearch.test.ts`
- `JiraStatusFlowTests` phần `IsSentBack` -> `statusFlow.test.ts`, với `StatusFlow` dựng trong test bằng bộ status của MDP
- `TicketPollerTests` và các test `TicketBoardTests` gọi `Add` / `MarkDone` / `Reopen` / `Dismiss` / `Restore` / `ReopenSentBack` / `UpdateTicketDetails` -> `board.test.ts`; bỏ `Start_*`, work branch, epic; các test `AddFromJiraAsync_*` sang `boardService.test.ts` (Task 4). Thêm:
  - `markDone moves a new ticket to done`
  - `applyLiveTickets moves a new ticket Jira finished to done`
  - `applyLiveTickets judges against the current state, not the poll's start`
  - `a poll that changes nothing returns the same state object`
- `zonedDate.test.ts`: `todayIn returns the Ho Chi Minh date at 23:30 UTC`, `falls back to UTC+7 for an unknown zone`

### Task 3: Server: data dir, config, secret, store JSON và adapter Jira

**Files:**

- Create: `packages/server/src/dataDir.ts` -- thư mục dữ liệu: biến môi trường `WORKDAY_DATA_DIR` nếu có; Windows `%APPDATA%\Workday`; còn lại `$XDG_DATA_HOME/workday`, mặc định `~/.local/share/workday`
- Create: `packages/server/src/jsonFile.ts` -- `readJson(path, parse)` / `writeJsonAtomic(path, value)`
- Create: `packages/server/src/config.ts` -- đọc / lưu `config.json` và `secrets.json`
- Modify: `packages/core/src/api.ts` -- thêm `WorkdayConfig`, `JiraConfig` (Shape dưới; client cũng dùng)
- Create: `packages/server/src/boardStore.ts` -- đọc / lưu `BoardState` ở `board.json`
- Create: `packages/server/src/jira/jiraTracker.ts` -- `JiraTracker implements TicketTracker`
- Create: `packages/server/src/jira/parseJira.ts` -- JSON Jira -> `Ticket`
- Test: `jsonFile.test.ts`, `config.test.ts`, `boardStore.test.ts`, `jira/jiraTracker.test.ts`, fixture `jira/fixtures/*.json`

**Shape:**

```ts
export interface JiraConfig {
  readonly baseUrl: string
  readonly email: string
  readonly projectKey: string // required, no default
  readonly assignedJql: string // default "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
  readonly maxResults: number // default 50
  readonly etaFieldId: string | null
  readonly devPriorityFieldId: string | null
  readonly statusFlow: StatusFlow // default: both lists empty
}
export interface WorkdayConfig {
  readonly host: string // "127.0.0.1"
  readonly port: number // 4870
  readonly timeZone: string // "Asia/Ho_Chi_Minh"
  readonly pollMinutes: number // 5
  readonly theme: 'dark' | 'light'
  readonly language: 'en' | 'vi'
  readonly jira: JiraConfig | null
}
export interface Secrets {
  readonly jiraApiToken: string | null
}
```

**Logic:**

- Mọi file JSON đi qua `readJson` với một hàm `parse` kiểm tra kiểu ở runtime (không ép kiểu `as`). File thiếu thì trả giá trị mặc định. File không parse được hoặc sai kiểu thì đổi tên thành `<file>.bad` (ghi đè `.bad` cũ), ghi log một dòng, trả mặc định; không bao giờ throw lúc khởi động.
- `writeJsonAtomic`: ghi `<file>.tmp` rồi `rename`, tạo thư mục nếu chưa có.
- Config: giá trị thiếu hoặc sai kiểu lấy mặc định của trường đó; `jira` thiếu `baseUrl` / `email` / `projectKey` thì cả `jira` là `null` (chưa kết nối). `pollMinutes` dưới 1 hoặc trên 60 thì về 5.
- Secret: biến môi trường `WORKDAY_JIRA_API_TOKEN` thắng `secrets.json`. Trên Linux, ghi `secrets.json` với `mode: 0o600`. Không bao giờ log hay trả token qua API.
- `JiraTracker` dùng `fetch` toàn cục, Basic auth `email:token`, header `Accept: application/json`, timeout 30s (`AbortSignal.timeout`). `getAssignedTickets` gọi `POST /rest/api/3/search/jql` với `{ jql, maxResults, fields }`; `fields` = `summary, duedate, status, timespent, issuetype, updated, parent` cộng hai field id khi có. `getTicket`: 404 trả `null`, lỗi khác throw. `validate` gọi `/rest/api/3/myself`: 401 / 403 trả `{ ok: false, reason: "rejected" }`; lỗi mạng, timeout, 404 hay 5xx trả `{ ok: false, reason: "unreachable" }` (như `CredentialCheck` của C#; Settings vẫn cho lưu khi unreachable).
- Parse (theo `JiraClient.cs`): `statusCategory` lấy từ `fields.status.statusCategory.key` (không lấy `name`, vì tên bị bản địa hóa); `summary` thiếu thì `""`; chỉ bỏ issue thiếu `key`; `parentKey` chỉ đặt khi `fields.issuetype.subtask === true`; ETA và Dev priority đọc theo id trong config, field vắng thì `null`. Field lạ không làm hỏng cả trang kết quả.

**Tests:**

- Các test `JiraClientTests` gọi `ParseSearchResponse` / `ParseIssueResponse` (theo hàm được gọi, không theo tên file) -> `jiraTracker.test.ts`, chạy trên fixture JSON và `fetch` giả; các test `MyTicketsJql` / epic / transition để giai đoạn của chúng
- `getTicket returns null on 404 and throws on 500`
- `validate reports rejected credentials on 401`; `validate reports unreachable on a network error`
- `a config with a Jira URL but no project key loads as not connected`; `statusFlow defaults to empty lists`
- `uses the configured ETA field id`
- `readJson renames a corrupt file to .bad and returns the default`
- `writeJsonAtomic leaves the old file intact when the write fails`
- `the token from the environment wins over secrets.json`
- `a config without a Jira base URL loads as not connected`
- `boardStore round-trips a BoardState`; `a board.json of the wrong shape loads as empty and is kept as .bad`

### Task 4: Server: BoardService, lịch poll, REST và WebSocket

**Files:**

- Create: `packages/server/src/board/boardService.ts` -- giữ `BoardState` trong bộ nhớ, mọi thay đổi đi qua một hàng đợi tuần tự, lưu qua `boardStore`, phát event
- Create: `packages/server/src/board/pollScheduler.ts` -- poll lúc khởi động và mỗi `pollMinutes`
- Create: `packages/server/src/events.ts` -- `EventHub`: danh sách socket, `broadcast(event)`
- Create: `packages/server/src/routes/boardRoutes.ts`, `routes/settingsRoutes.ts`, `routes/eventsRoute.ts`
- Modify: `packages/server/src/app.ts` -- đăng ký các route, `@fastify/websocket`
- Modify: `packages/server/src/main.ts` -- dựng config, store, tracker (khi Jira đã cấu hình), service, scheduler
- Modify: `packages/core/src/api.ts` -- kiểu của các route dưới
- Test: `board/boardService.test.ts`, `board/pollScheduler.test.ts`, `routes/boardRoutes.test.ts`, `routes/settingsRoutes.test.ts`

**Shape** (route; body / response lấy kiểu từ `core/src/api.ts`):

```text
GET  /api/board                 -> BoardView { connected, lastPoll: { at, ok, error } | null, today, rows: BoardRow[] }
POST /api/board/check           -> BoardView (poll ngay, chờ xong)
POST /api/board/add   { input } -> { ok: true } | { ok: false, error: AppError }
POST /api/board/:key/:action    -> BoardView     action: done | reopen | dismiss | restore
GET  /api/settings              -> SettingsView
PUT  /api/settings              -> SettingsView   body: SettingsUpdate
POST /api/settings/jira/check   -> { ok: true, displayName } | { ok: false, error: AppError }  body: baseUrl, email, jiraApiToken?
GET  /api/events (WebSocket)    -> server gửi { type: "board.changed" } | { type: "settings.changed" }
```

```ts
// Server never sends display text; the client translates the code with t().
export type AppError =
  | {
      readonly code:
        'invalidKey' | 'notConnected' | 'jiraRejected' | 'jiraUnreachable' | 'pollFailed'
    }
  | { readonly code: 'notFound' | 'alreadyOnBoard'; readonly key: string }
export interface SettingsView {
  readonly config: Omit<WorkdayConfig, 'host'>
  readonly jiraTokenSource: 'env' | 'file' | null // never the token itself
}
// Replaces each top-level field it carries; jira: null disconnects; jiraApiToken omitted keeps the saved token.
export interface SettingsUpdate {
  readonly port?: number
  readonly timeZone?: string
  readonly pollMinutes?: number
  readonly theme?: 'dark' | 'light'
  readonly language?: 'en' | 'vi'
  readonly jira?: JiraConfig | null
  readonly jiraApiToken?: string
}
```

```ts
export interface BoardRow {
  readonly ticket: Ticket
  readonly section: BoardSection | 'dismissed'
  readonly dueUrgency: DueUrgency
  readonly url: string
}
```

**Logic:**

- Hàng đợi: mỗi thao tác (poll, add, action) chạy nối tiếp qua một `Promise` chain; lỗi của một thao tác không làm hỏng chuỗi. Poll gọi Jira **ngoài** hàng đợi, rồi xếp bước áp kết quả vào hàng đợi, để thao tác của người dùng không phải chờ mạng.
- `WorkdayConfig`, `JiraConfig`, `StatusFlow` khai báo trong `core/src/api.ts` (client cần), server import từ đó.
- Poll: `getAssignedTickets` lỗi thì giữ nguyên state, `lastPoll = { ok: false, error: { code: "pollFailed" } }` (chi tiết vào log), không throw. Sau đó lấy `offPollKeys`, gọi `getTicket` từng key (lỗi một key thì bỏ qua key đó, ghi log), rồi `applyLiveTickets` trên state **hiện tại**.
- Poll đang chạy mà có yêu cầu poll khác (lịch hoặc Check now) thì dùng chung lần đang chạy, không gọi Jira hai lần.
- Add: `parseTicketKey(input, jira.projectKey)` sai thì `invalidKey`; đã có trên board thì `alreadyOnBoard` (kiểm trước, không gọi Jira); `getTicket` trả null thì `notFound`.
- Mỗi lần state đổi (hàm core trả object khác) hoặc settings đổi thì lưu và `broadcast` một event; client tự gọi lại `GET`. Event không chứa dữ liệu, để không phải lo đồng bộ hai nơi.
- `PUT /api/settings` không có `host` (GĐ 1 luôn loopback, `host` chỉ sửa tay trong file); lưu config rồi dựng lại tracker và scheduler ngay; đổi `port` thì có hiệu lực sau khi restart, UI nói điều đó. Giá trị sai (port ngoài 1024-65535, `pollMinutes` ngoài 1-60, `timeZone` không hợp lệ) trả 400.
- `jira/check`: dùng token đã lưu **chỉ khi** `baseUrl` trong body trùng `baseUrl` đã lưu (so sau khi bỏ `/` cuối); khác thì bắt buộc có `jiraApiToken` trong body, thiếu thì 400. Không bao giờ gửi token đã lưu tới host khác.
- Chưa có Jira: `GET /api/board` trả `connected: false` và danh sách đang lưu; check, add trả 409 với `notConnected`.
- `today` trong `BoardView` là `todayIn(config.timeZone, new Date())`, client dùng nó, không tự tính ngày.

**Tests:**

- `a failing assigned query keeps the board and records the failure`
- `two poll requests during one poll call Jira once`
- `a dismiss queued during a poll is not undone by the poll's result`
- `add rejects a key Jira does not know`; `add rejects a key already on the board`
- `every board change broadcasts board.changed` (EventHub giả)
- `GET /api/settings never returns the token`; `PUT /api/settings with a token stores it and rebuilds the tracker`
- `jira check never sends the saved token to another base URL`
- `PUT /api/settings rejects an out-of-range port`; `PUT /api/settings with jira null disconnects`
- Các test `TicketBoardTests.AddFromJiraAsync_*` port sang đây
- `board check without Jira returns 409`
- `pollScheduler polls at start and every pollMinutes` (fake timers của Vitest)

### Task 5: Client: khung app, theme, ngôn ngữ, Settings

**Files:**

- Create: `packages/client/src/styles/tokens.css` -- biến CSS cho màu hai theme (`[data-theme="dark"|"light"]`), font, cỡ chữ, khoảng cách, bo góc; giá trị lấy theo `UI/Wpf/Tokens.xaml` và `Theme.cs` của app WPF
- Create: `packages/client/src/styles/controls.css` -- nút (primary, secondary, ghost, danger), ô nhập, segmented list, pill, divider
- Create: `packages/client/src/i18n.ts` -- `t(en, vi)` đọc ngôn ngữ hiện tại; `formatShortDate(date, language)`
- Create: `packages/client/src/api/client.ts` -- `fetch` có kiểu cho mọi route của Task 4; `api/useEvents.ts` -- hook WebSocket, tự nối lại sau 2s, gọi lại các query khi có event
- Create: `packages/client/src/shell/useNarrow.ts` -- `true` khi `window.matchMedia("(max-width: 719px)")` khớp, theo dõi `change`; component chọn layout bằng hook này (không chỉ bằng CSS), để test mock được `matchMedia`
- Create: `packages/client/src/shell/Shell.tsx`, `shell/Sidebar.tsx`, `shell/TabBar.tsx` -- sidebar 5 trang, tab bar dưới đáy khi `useNarrow()`; trang chưa làm hiện "Coming soon"
- Create: `packages/client/src/errors.ts` -- `errorText(error: AppError)` dịch từng `code` qua `t()`, hai ngôn ngữ
- Create: `packages/client/src/settings/SettingsPage.tsx`, `settings/GeneralSection.tsx`, `settings/ConnectionsSection.tsx`
- Modify: `packages/client/src/App.tsx` -- router theo hash (`#/tickets`, `#/settings`...), không thêm thư viện router
- Test: `shell/Shell.test.tsx`, `settings/ConnectionsSection.test.tsx`, `i18n.test.ts`

**Logic:**

- Dùng `@tanstack/react-query` cho dữ liệu từ server (cache, refetch khi có event). Không thêm thư viện state khác.
- Theme và ngôn ngữ đổi là `PUT /api/settings` rồi áp ngay; khi tải trang, `data-theme` và ngôn ngữ đặt từ `GET /api/settings` trước khi vẽ nội dung.
- Giao diện phẳng theo app WPF: khối không viền, không nền riêng; một đường divider giữa hai khối và giữa các dòng của danh sách; viền chỉ cho ô nhập, menu, popup, dialog. Mọi thứ bấm được là nút hoặc pill, không có chữ gạch chân (link chỉ nằm trong nội dung).
- Connections: các ô Jira URL, email, API token, Project key (bắt buộc); nhóm **Advanced** gập sẵn: id field ETA, id field Dev priority, JQL, hai danh sách status (pre-work, rework; mỗi dòng một tên). Ô token hiện 8 chấm khi đã có token cùng nút **Replace**; ô trống khi gửi thì không đổi token đã lưu. Token đang lấy từ biến môi trường (`jiraTokenSource === "env"`) thì ô token khóa, ghi "Set by WORKDAY_JIRA_API_TOKEN". **Check** gọi `/api/settings/jira/check` với giá trị đang gõ; **Save** gửi `PUT` với `jira` đầy đủ. Kết quả và lỗi (`errorText`) hiện trên dòng dưới các ô; `jiraUnreachable` vẫn cho Save.
- Giờ hiển thị theo kiểu 12 giờ có AM/PM ở cả hai ngôn ngữ, format bằng `Intl.DateTimeFormat` với `timeZone` từ settings (không theo múi giờ của trình duyệt).

**Tests:**

- `the sidebar shows the five pages and marks the current one`
- `below 720px the tab bar replaces the sidebar`
- `an unbuilt page shows Coming soon`
- `the token box shows a mask and Replace when a token is saved`
- `Save without a new token does not send jiraApiToken`
- `Save sends the project key and the advanced fields`
- `an env token locks the token box`
- `errorText gives the Vietnamese text for notFound with its key`
- `t returns the Vietnamese text when the language is vi`

### Task 6: Client: trang Tickets (board)

**Files:**

- Create: `packages/client/src/board/BoardPage.tsx` -- thanh trên (views, search, Add, Check now, dòng trạng thái poll), bảng hoặc danh sách thẻ
- Create: `packages/client/src/board/BoardTable.tsx`, `board/BoardCard.tsx` (màn hình hẹp), `board/RowMenu.tsx`, `board/KeyPill.tsx`
- Create: `packages/client/src/board/boardView.ts` -- hàm thuần: lọc theo view và search, đếm, sắp xếp
- Test: `board/boardView.test.ts`, `board/BoardPage.test.tsx`

**Logic:**

- Views là một segmented list: "Working (N)" (`new` + `inProgress`), "Done (N)", "Dismissed (N)"; số đếm tính **sau** khi lọc search. Đang search mà view đang chọn không có kết quả còn view khác có thì tự chuyển sang view có kết quả, trừ khi người dùng đã tự chọn view trong lần search đó (giống `TasksPage.PickView`).
- Search lọc bằng `matchesTicket` của core, debounce 200ms. Ô search chứa key hoặc link của ticket chưa có trong bất kỳ view nào thì hiện nút **Add <KEY>** bên phải; nút hoặc Enter gọi `/api/board/add`, thành công thì xóa ô, lỗi thì hiện message dưới ô.
- Cột: key (pill màu Accent, bấm mở Jira ở tab mới), summary, status, due (`formatShortDate`, màu theo `dueUrgency`: đỏ `overdue`, cam `dueSoon`), ETA, P (Dev priority). Sắp xếp Working theo due tăng dần, ticket không có due xuống cuối, rồi theo key; Done và Dismissed theo `updated` giảm dần, rồi theo key. Bảng hay thẻ chọn bằng `useNarrow()`.
- Menu dòng: Working -> **Done**, **Dismiss**; Done -> **Reopen**, **Dismiss**; Dismissed -> **Restore**. Không hỏi xác nhận (Dismiss hoàn tác được bằng Restore).
- Chưa kết nối Jira: thay bảng bằng "Jira is not connected - open Settings" và một nút mở Settings > Connections. `lastPoll.ok === false` thì dòng trạng thái màu đỏ kèm `errorText`; ngược lại "Checked at 9:05 AM" (giờ theo `timeZone` của settings). Lỗi Add cũng qua `errorText`.
- **Check now** tắt trong lúc đang chạy và hiện spinner nhỏ trong nút.

**Tests:**

- `boardView counts each view after the search filter`
- `boardView sorts Working by due date with undated tickets last`
- `the search switches to the view that has hits unless the user picked one`
- `typing a key not on the board shows Add KEY and Enter adds it`
- `an add error shows under the search box`
- `Dismiss in the row menu calls the dismiss action`
- `an overdue ticket's due cell uses the overdue color, a done ticket's never does`
- `without Jira the page links to Settings instead of a table`

---

## Kiểm tra cuối giai đoạn

Chạy tay sau Task 6, một lần trên Windows và (khi có máy) một lần trên Linux: `npm ci`, `npm run build`, `npm start`; nhập Jira thật ở Settings, **Check**, **Save**; board hiện ticket đang được giao; Dismiss / Restore / Done / Reopen; restart server thấy board giữ nguyên; mở tab thứ hai thấy cập nhật; thu cửa sổ < 720px thấy tab bar và thẻ.
