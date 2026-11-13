# Board + Notices Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- `packages/client` trong cùng repo

**Goal:** Board biết PR Azure DevOps của từng ticket, tự / bấm tay đưa ticket sang Ready to Test, gợi ý ticket nên nhận (Available to take), có view To do gom việc cần làm, và một chuông thông báo chung (toast, thông báo desktop, push về điện thoại) thay cho thông báo Claude riêng lẻ của GĐ 4.

**Expected outcome (acceptance criteria):**
- [ ] Settings > Azure DevOps: organization, project, nhãn repo (`Backend-DotNet=BE`, `Portal-Angular=FE Portal`...), thư mục pipeline dev, PAT (mật khẩu, mã hóa như secret khác, env `WORKDAY_ADO_PAT` ghi đè), nút Check báo tên người dùng hoặc lỗi. Save áp dụng ngay.
- [ ] Mỗi 5 phút (và nút Check now) server đọc PR của ticket In progress + Done chưa đóng hết PR: nhánh `<KEY>`, `<KEY>-dev` và `<KEY>-<label>` khác, chỉ PR do chính chủ PAT tạo. Lần đọc đầu (hoặc chưa đọc trọn) chỉ ghi baseline, không thông báo.
- [ ] Dòng ticket trên board có pill PR theo repo + nhánh (PR mới nhất mỗi repo + nhánh; BE trước theo thứ tự nhãn trong config, main trước nhánh khác): trạng thái (mở / merge / bỏ), build lỗi, conflict, vote; bấm mở PR.
- [ ] Thông báo khi PR merge, có comment mới (cộng dồn số comment chưa xem theo ticket), build vừa lỗi, vừa conflict, vừa có vote approve / waiting / reject; khi tất cả PR dev (mọi repo, trừ PR bỏ) đã merge và ticket còn bước tới Ready to Test.
- [ ] Ready to Test bấm tay (menu dòng, chỉ khi ticket In progress / Done, mọi PR dev đã merge, status Jira còn bước): hỏi xác nhận, đọc status Jira **live**, đi từng bước theo `readyToTestPath` (vd `PR & Code Review -> Deployed to Dev -> Ready to Test`), không bao giờ đi lùi; không có transition -> dừng và thông báo; xong đọc lại ticket để board hiện status thật. Bấm hai lần liền chỉ chạy một lần.
- [ ] Tự động sau merge dev: theo dõi các lần chạy pipeline trong thư mục pipeline dev trên `development` (7 ngày từ lần merge); vừa merge -> tự chuyển tới bước trước Ready to Test, pipeline xong hết -> Ready to Test; pipeline lỗi -> thông báo kèm link build. Mỗi bước lỗi chỉ báo một lần mỗi phiên server.
- [ ] View **To do** trên board (cạnh Working / Done / Dismissed) gom theo ticket: Claude đang chờ, Ready to Test, PR nhờ mình review, PR bị chặn (build lỗi / conflict / waiting / reject), comment PR mới, ticket Jira đã Done mà còn ở In progress, ticket quá hạn còn ở phía dev; nhóm có việc "cần ngay" (Claude chờ, PR bị chặn, quá hạn) lên trước. Sidebar Board có số đếm việc cần ngay. Mỗi dòng có hành động (mở tab Claude, Ready to Test, mở PR, ẩn review, đánh dấu Done, Start / Open).
- [ ] Available to take (card trên view Working): ticket chưa ai nhận trong epic tháng này (epic tháng trước khi chưa có), xếp theo điểm (hạn, priority, dev priority, status ưu tiên, giống ticket của mình), 10 dòng + Show more; Take hỏi xác nhận rồi gán cho mình trên Jira (ai đó đã nhận thì báo tên, không giành) và poll board; Hide ẩn khỏi card. Ticket gấp mới -> một thông báo mỗi ngày.
- [ ] Chuông ở thanh trên: số chưa đọc, danh sách mới nhất trước (giờ, nội dung theo ngôn ngữ đang chọn, chấm chưa đọc), bấm -> đi tới đích (dòng board / tab Workspace / PR) và đánh dấu đã đọc, nút Mark all read. Lưu `notices.json` (tối đa 100; đã đọc giữ 1 ngày, chưa đọc 7 ngày); restart server thì các thông báo cũ quay lại ở trạng thái đã đọc.
- [ ] Mỗi thông báo mới hiện toast trong app, thông báo desktop (Notification API) và push về thiết bị đã ghép nối có quyền board, theo lựa chọn từng chủ đề trong Settings > Notices (Restore defaults). Claude chờ (hook GĐ 4) đi qua chuông này; mở đúng tab session thì thông báo của nó thành đã đọc.
- [ ] Route GET mới có quyền `board: view`, route ghi có `board: act`; thiết bị từ xa không thấy hành động mở Workspace.
- [ ] Thiếu cấu hình (không ADO / không `readyToTestPath` / không `suggestions`) thì phần đó tắt yên lặng, không lỗi.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, convention lint, `npm run build` sạch.

**Architecture:** Core thêm logic thuần (theo dõi PR, các bước Ready to Test, trạng thái deploy dev, to-do, xếp hạng gợi ý, danh sách thông báo + chữ hiển thị). Server thêm port `PullRequests` + adapter Azure DevOps, `NoticeService` (notices.json), `PrService` (prs.json, chu kỳ 5 phút, đi bước Jira) và `SuggestionService` (suggestions.json, chạy sau mỗi poll board thành công); `GET /api/work` ghép board + PR + chờ Claude + gợi ý thành một view. Client thêm view To do, pill PR, card gợi ý, chuông + toast, hai mục Settings.

**Assumptions:**
- Teams (đọc / trả lời / bài đăng PR) tách thành giai đoạn riêng sau GĐ 5 (C# ~15k dòng); roadmap trong `docs/web-foundation/plan.md` cập nhật ở Task 8.
- Bỏ khỏi GĐ 5: QC bug (to-do QcBug / QcBugReply, PR bug bị bỏ lại), JiraUpdated (đọc changelog), dọn worktree, DB review, comment PR trong Changes / cửa sổ thread PR, "auto line" giao prompt cho Claude, thông báo kết quả timesheet vào chuông (push timesheet của GĐ 3 giữ nguyên).
- Giá trị riêng công ty vào config, mặc định rỗng = tắt: `readyToTestPath`, `developerStatuses`, nhãn repo, thư mục pipeline, JQL epic / ứng viên / của mình, tiền tố tiêu đề epic, status ưu tiên.
- Kênh mặc định theo chủ đề: toast bật hết; desktop bật cho `claude`, `other`; phone bật cho `pr`, `jira` (phone không mở được Workspace nên `claude` tắt).
- Server dựng chữ cho push bằng `noticeText` trong core (như `runNotification.ts` của GĐ 3); API chuông vẫn trả event có cấu trúc, client tự dịch bằng cùng hàm.
- Ticket Jira `Ticket` không đổi; gợi ý dùng kiểu riêng `EpicTicket` (có `priority`).

**Tech Stack:** `fetch` (Azure DevOps REST 7.1, Basic auth PAT), không thêm thư viện.

---

## File structure

```
packages/core/src/
  prTracking.ts        PrRead, TrackedPr, detectChanges, latestPrs, isBlocked, isDevPrMerged, areAllPrsClosed, repoLabel
  readyToTest.ts       stepsToReadyToTest, autoSteps, readyToTestSteps, isWithDeveloper
  devDeploys.ts        repoState, ticketState, mergesToWatch, shouldNotifyDeploy
  todos.ts             TodoItem, buildTodos, groupByTicket, isNeededNow, attentionKeys
  ticketSuggestions.ts EpicTicket, pickMonthEpic, rankSuggestions, isUrgentSuggestion, suggestionNotice
  notices.ts           Notice, NoticeEvent, addNotice, removeExpired, markRead*, noticeChannels, noticeText
  ports/pullRequests.ts
packages/server/src/
  azureDevOps/adoClient.ts, parseAdo.ts (+ fixtures/)
  notices/noticeStore.ts, noticeService.ts
  prs/prStore.ts, prService.ts, readyToTestWalker.ts
  suggestions/suggestionStore.ts, suggestionService.ts
  work/workView.ts
  routes/workRoutes.ts, noticeRoutes.ts
packages/client/src/
  board/TodoView.tsx, TodoRow.tsx, PrPills.tsx, SuggestionsCard.tsx
  notices/NoticeBell.tsx, NoticeToasts.tsx, useNotices.ts, noticeTarget.ts, notices.css
  settings/AzureDevOpsSection.tsx, NoticesSection.tsx
  api/workApi.ts, useWork.ts, noticeApi.ts
```

Mỗi file mới < 300 dòng; tách thêm nếu vượt. Spec C# nằm ở `C:\Project\NoisWorkday`; implementer đọc file C# được nêu trong task và port test C# tương ứng (`tests/NoisWorkday.Tests/<Name>Tests.cs`) sang Vitest, bỏ các case thuộc phần ngoài phạm vi (QC bug, Teams, legacy key, JiraUpdated, WorktreeCleanup, DbReview).

---

### Task 1: Core: theo dõi PR, các bước Ready to Test, deploy dev

**Files:**
- Create: `packages/core/src/prTracking.ts` (+ test) -- port `Services/PrTracker.cs` (`DetectChanges`, `IsDevPrMerged`, `AreAllPrsClosed`, `TargetSuffix`), `Helpers/DashboardDataBuilder.cs` (`IsBlocked`, `LatestPrs`, `ShippedKeys`, `RepoLabel`/`RepoName` thay bằng nhãn từ config), `Helpers/PrReviews.cs`, `Helpers/PrCommentAlerts.cs`; test `PrTrackerTests`, `PrReviewsTests`, `PrCommentAlertsTests`, phần PR của `DashboardDataBuilderTests`
- Create: `packages/core/src/readyToTest.ts` (+ test) -- port `Services/JiraStatusFlow.cs` (`GetStepsToReadyToTest`, `AutoSteps`, `IsWithDeveloper`, `ReadyToTestLabel`); test `JiraStatusFlowTests`
- Create: `packages/core/src/devDeploys.ts` (+ test) -- port `Helpers/DevDeploys.cs`; test `DevDeploysTests`
- Create: `packages/core/src/ports/pullRequests.ts`
- Modify: `packages/core/src/statusFlow.ts` -- thêm 2 trường; `packages/core/src/index.ts` -- export

**Shape:**
```ts
export type PrStatus = 'active' | 'completed' | 'abandoned'
export type PrBuild = 'unknown' | 'running' | 'succeeded' | 'failed'
export type PrMerge = 'unknown' | 'clean' | 'conflicts'
export type PrVote = 'unknown' | 'noVote' | 'approved' | 'waitingForAuthor' | 'rejected'

// One PR as Azure DevOps returns it; branch is the label: "main" for <KEY>, "dev" for <KEY>-dev, "<x>" for <KEY>-<x>.
export interface PrRead {
  readonly pullRequestId: number
  readonly repository: string
  readonly branch: string
  readonly status: PrStatus
  readonly url: string
  readonly commentCount: number
  readonly openThreadCount: number | null
  readonly build: PrBuild // read for an active PR only
  readonly merge: PrMerge
  readonly vote: PrVote
  readonly mergeCommit: string | null // completed PR only
  readonly mergedAt: string | null // ISO instant
  readonly targetBranch: string | null // without "refs/heads/"
}
export interface TrackedPr {
  readonly status: PrStatus
  readonly repository: string
  readonly url: string
  readonly commentCount: number
  readonly openThreadCount: number | null
  readonly build: PrBuild | null // null = never read: the next read is a baseline, never a change
  readonly merge: PrMerge | null
  readonly vote: PrVote | null
  readonly mergeCommit: string | null
  readonly mergedAt: string | null
  readonly targetBranch: string | null
}
export type PrTracking = Readonly<Record<string, TrackedPr>> // "<ticket>|<branch>|<pullRequestId>"
export interface PrChange {
  readonly pr: PrRead
  readonly merged: boolean
  readonly newComments: number
  readonly buildFailed: boolean
  readonly conflicted: boolean
  readonly newVote: PrVote | null // approved / waitingForAuthor / rejected only
}
export interface TicketPr { readonly key: string /* tracking key */; readonly branch: string; readonly pullRequestId: number; readonly pr: TrackedPr }
export interface PrReviewRequest {
  readonly repository: string
  readonly pullRequestId: number
  readonly title: string
  readonly authorName: string
  readonly ticketKey: string | null
  readonly isRequired: boolean
  readonly url: string
  readonly seen: boolean // the user hid its to-do; stays hidden until it leaves the list
}
export interface CommentAlert { readonly count: number; readonly url: string; readonly at: string }

export function detectChanges(tracking: PrTracking, ticketKey: string, prs: readonly PrRead[]):
  { readonly tracking: PrTracking; readonly changes: readonly PrChange[] }
export function latestPrs(ticketKey: string, tracking: PrTracking, repoLabels: Readonly<Record<string, string>>): readonly TicketPr[]
export function repoLabel(repository: string, repoLabels: Readonly<Record<string, string>>): string // label, else the repo name
export function isBlocked(pr: TrackedPr): boolean
export function isDevPrMerged(tracking: PrTracking, ticketKey: string): boolean
export function areAllPrsClosed(tracking: PrTracking, ticketKey: string): boolean
export function mergeReviewRequests(previous: Readonly<Record<string, PrReviewRequest>>, current: readonly PrReviewRequest[],
  isBaseline: boolean): { readonly saved: Readonly<Record<string, PrReviewRequest>>; readonly added: readonly PrReviewRequest[] }
export function addCommentAlert(alerts: Readonly<Record<string, CommentAlert>>, ticketKey: string, count: number, url: string,
  at: string): Readonly<Record<string, CommentAlert>>

// statusFlow.ts: two new fields, both default [] (= the feature is off).
readonly readyToTestPath: readonly string[] // ["PR & Code Review", "Deployed to Dev", "Ready to Test"]; last = Ready to Test
readonly developerStatuses: readonly string[] // statuses whose next move is the developer's (overdue to-do)

// readyToTest.ts
export function stepsToReadyToTest(status: string | null, path: readonly string[]): readonly string[]
export function autoSteps(status: string | null, path: readonly string[], deploy: DeployState): readonly string[]
export function readyToTestSteps(section: BoardSection, status: string | null, devPrMerged: boolean,
  path: readonly string[]): readonly string[] | null
export function isWithDeveloper(status: string | null, developerStatuses: readonly string[]): boolean

// devDeploys.ts
export type DeployState = 'deploying' | 'deployed' | 'failed'
export interface DeployBuild { readonly buildId: number; readonly pipelineName: string; readonly repository: string
  readonly sourceVersion: string; readonly queuedAt: string; readonly completed: boolean; readonly succeeded: boolean; readonly url: string }
export interface DevMerge { readonly repository: string; readonly mergeCommit: string; readonly mergedAt: string }
export interface DevDeploy { readonly state: DeployState; readonly mergedAt: string; readonly failedBuild: DeployBuild | null }

// ports/pullRequests.ts
export type PullRequestsValidation =
  | { readonly ok: true; readonly displayName: string }
  | { readonly ok: false; readonly reason: 'rejected' | 'unreachable' }
export interface PrLookup { readonly prs: readonly PrRead[]; readonly complete: boolean }
export interface PullRequests {
  validate(): Promise<PullRequestsValidation>
  ticketPrs(ticketKey: string): Promise<PrLookup> // throws NetworkFailure when there is no response at all
  reviewRequests(): Promise<readonly PrReviewRequest[]> // seen: false
  devDeployBuilds(since: string): Promise<readonly DeployBuild[]>
}
export class NetworkFailure extends Error {}
```

**Logic:**
- Mọi hàm trả object mới, không sửa input; không đổi gì thì trả lại đúng object cũ (`detectChanges` trả `tracking` cũ khi không entry nào khác) để service so `!==`.
- `detectChanges` giữ đúng luật C#: PR đóng không đọc build / merge / vote; giá trị `unknown` vừa đọc giữ giá trị đã lưu; entry chưa có (`undefined`) chỉ ghi baseline; giá trị lưu `null` không tạo thay đổi.
- `stepsToReadyToTest`: status (so không phân biệt hoa thường) ở vị trí `i < path.length - 1` trong `path` -> `path.slice(i + 1)`; không có trong path hoặc là bước cuối -> `[]`. `autoSteps`: chưa `deployed` thì bỏ bước cuối.
- `readyToTestSteps`: chỉ `inProgress` / `done`, cần `devPrMerged`, trả `null` khi không còn bước.
- `isWithDeveloper`: status rỗng / null -> true; `developerStatuses` rỗng -> true (không biết thì vẫn tính là của dev).
- `latestPrs` sắp: repo theo thứ tự key trong `repoLabels` (repo lạ sau, theo tên), trong repo `main` trước rồi tên nhánh.
- `devDeploys`: thời gian là ISO string, so bằng `Date.parse`; `now` là tham số. Hằng số giữ như C# (grace 10 phút, cửa sổ 7 ngày, thông báo 24 giờ, slack 30 phút -- export `BUILD_READ_SLACK_MS`).

**Tests:** port các test C# đã nêu (đổi tên theo kiểu `it('...')` hiện có), thêm:
- `detectChanges returns the same tracking when nothing changed`
- `stepsToReadyToTest walks the configured path and never backward`
- `stepsToReadyToTest is empty when the path is not configured`
- `latestPrs orders repos by the configured labels`

---

### Task 2: Core: to-do, gợi ý ticket, thông báo và kiểu API

**Files:**
- Create: `packages/core/src/todos.ts` (+ test) -- port `Helpers/DashboardTodos.cs` (`Build`, `TicketKeyOf`, `GroupByTicket`, `IsUrgent`, `IsNeededNow`, `SplitByUrgency`, `AttentionKeys`) và phần to-do của `DashboardDataBuilder.Build`; test `DashboardTodosTests`, phần to-do của `DashboardDataBuilderTests`
- Create: `packages/core/src/ticketSuggestions.ts` (+ test) -- port `Helpers/TicketSuggestions.cs`; test `TicketSuggestionsTests`
- Create: `packages/core/src/notices.ts` (+ test) -- port `Helpers/NoticeLog.cs`, `Helpers/NoticeRules.cs`; test `NoticeLogTests`, `NoticeRulesTests`
- Modify: `packages/core/src/api.ts`, `packages/core/src/index.ts`

**Shape:**
```ts
// todos.ts -- order of the union = order on screen (C# TodoKind minus the out-of-scope kinds)
export type TodoItem =
  | { readonly kind: 'claudeWaiting'; readonly session: string; readonly tab: string; readonly ticketKey: string | null; readonly wait: WaitReason }
  | { readonly kind: 'readyToTest'; readonly ticketKey: string; readonly steps: readonly string[]; readonly deploy: DevDeploy | null }
  | { readonly kind: 'prReview'; readonly review: PrReviewRequest }
  | { readonly kind: 'prBlocked'; readonly ticketKey: string; readonly pr: TicketPr }
  | { readonly kind: 'prComments'; readonly ticketKey: string; readonly count: number; readonly url: string }
  | { readonly kind: 'jiraDone'; readonly ticketKey: string }
  | { readonly kind: 'overdue'; readonly ticketKey: string; readonly section: 'new' | 'inProgress' }
export type TodoKind = TodoItem['kind']
export interface TodoInput {
  readonly board: BoardState
  readonly today: string
  readonly flow: StatusFlow
  readonly tracking: PrTracking
  readonly repoLabels: Readonly<Record<string, string>>
  readonly commentAlerts: Readonly<Record<string, CommentAlert>>
  readonly reviews: Readonly<Record<string, PrReviewRequest>>
  readonly deploys: Readonly<Record<string, DevDeploy>>
  readonly waits: readonly { readonly session: string; readonly tab: string; readonly ticketKey: string | null; readonly wait: WaitReason }[]
}
export interface TodoGroup { readonly ticketKey: string | null; readonly items: readonly TodoItem[]; readonly neededNow: boolean }
export function buildTodos(input: TodoInput): readonly TodoItem[]
export function groupTodos(todos: readonly TodoItem[]): readonly TodoGroup[] // needed-now groups first, each half keeps order
export function attentionKeys(groups: readonly TodoGroup[]): readonly string[] // "<ticket or session>|<kind>", distinct

// ticketSuggestions.ts
export interface EpicTicket {
  readonly key: string; readonly summary: string; readonly status: string | null; readonly issueType: string | null
  readonly priority: string | null; readonly devPriority: number | null; readonly dueDate: string | null
}
export interface Suggestion { readonly ticket: EpicTicket; readonly score: number; readonly similarKey: string | null; readonly urgent: boolean }
export function pickMonthEpic(epics: readonly EpicTicket[], today: string, titlePrefix: string): EpicTicket | null
export function rankSuggestions(candidates: readonly EpicTicket[], mine: readonly EpicTicket[], excludedKeys: ReadonlySet<string>,
  today: string, options: { readonly selectedStatus: string | null; readonly stopWords: readonly string[] }): readonly Suggestion[]
export function suggestionNotice(ranked: readonly Suggestion[], notifiedKeys: readonly string[], notifiedOn: string | null,
  baselineDone: boolean, today: string): { readonly noticeKeys: readonly string[]; readonly notifiedKeys: readonly string[] }

// notices.ts
export type NoticeTopic = 'claude' | 'pr' | 'jira' | 'suggestions' | 'other'
export type NoticeTone = 'info' | 'success' | 'error'
export type NoticeEvent =
  | { readonly type: 'claudeWait'; readonly subject: string; readonly wait: WaitReason }
  | { readonly type: 'prMerged' | 'prBuildFailed' | 'prConflicted'; readonly key: string; readonly branch: string }
  | { readonly type: 'prComments'; readonly key: string; readonly branch: string; readonly count: number }
  | { readonly type: 'prVote'; readonly key: string; readonly branch: string; readonly vote: PrVote }
  | { readonly type: 'prReviewRequested'; readonly author: string; readonly title: string }
  | { readonly type: 'devMerged'; readonly key: string }
  | { readonly type: 'deployed'; readonly key: string; readonly moved: boolean }
  | { readonly type: 'deployFailed'; readonly key: string; readonly pipeline: string }
  | { readonly type: 'movedToReadyToTest' | 'alreadyPastReadyToTest' | 'ticketMissing'; readonly key: string }
  | { readonly type: 'transitionFailed'; readonly key: string; readonly status: string }
  | { readonly type: 'suggestionsUrgent'; readonly keys: readonly string[] }
export type NoticeTarget =
  | { readonly kind: 'board'; readonly key: string | null }
  | { readonly kind: 'workspace'; readonly tab: string; readonly session: string }
  | { readonly kind: 'url'; readonly url: string }
export interface Notice {
  readonly id: number; readonly at: string; readonly topic: NoticeTopic; readonly tone: NoticeTone
  readonly event: NoticeEvent; readonly target: NoticeTarget | null; readonly place: string | null; readonly read: boolean
}
export interface NoticeChannels { readonly toast: boolean; readonly desktop: boolean; readonly phone: boolean }
export type NoticePrefs = Readonly<Partial<Record<NoticeTopic, Partial<NoticeChannels>>>>
export const NOTICE_CAP = 100
export function addNotice(notices: readonly Notice[], notice: Notice): readonly Notice[]
export function removeExpired(notices: readonly Notice[], now: string): readonly Notice[]
export function markRead(notices: readonly Notice[], id: number): readonly Notice[]
export function markReadAt(notices: readonly Notice[], place: string): readonly Notice[]
export function markAllRead(notices: readonly Notice[]): readonly Notice[]
export function noticeChannels(topic: NoticeTopic, prefs: NoticePrefs): NoticeChannels
export function noticeText(event: NoticeEvent, language: 'en' | 'vi'): string
```

**api.ts** -- thêm:
```ts
export interface AzureDevOpsConfig {
  readonly organization: string
  readonly project: string
  readonly repoLabels: Readonly<Record<string, string>> // insertion order = display order
  readonly devPipelineFolder: string | null // "\\Development-Pipelines"; null = no deploy watch
}
export interface SuggestionsConfig {
  readonly epicJql: string
  readonly epicTitlePrefix: string // "MDP Issues - "
  readonly candidatesJql: string // "{epic}" is replaced
  readonly mineJql: string // "{epic}" is replaced
  readonly selectedStatus: string | null
}
// JiraConfig += readonly suggestions: SuggestionsConfig | null
// WorkdayConfig += readonly azureDevOps: AzureDevOpsConfig | null; readonly notices: NoticePrefs
// SettingsUpdate += azureDevOps?: AzureDevOpsConfig | null; adoPat?: string; notices?: NoticePrefs
// SettingsView += adoPatSource: 'env' | 'file' | null
export interface WorkView {
  readonly adoConnected: boolean
  readonly lastPrCheck: { readonly at: string; readonly ok: boolean } | null
  readonly groups: readonly TodoGroup[]
  readonly attention: number // attentionKeys(groups).length
  readonly prs: Readonly<Record<string, readonly TicketPr[]>> // per board ticket
  readonly readyToTest: Readonly<Record<string, readonly string[]>> // keys with steps left
  readonly suggestions: { readonly epicKey: string | null; readonly items: readonly Suggestion[] } | null // null = not configured
}
export interface NoticesView { readonly notices: readonly Notice[]; readonly unread: number; readonly prefs: NoticePrefs }
export type ReadyToTestOutcome = { readonly status: 'moved' | 'alreadyPast' | 'notFound' | 'busy' } | { readonly status: 'failed'; readonly step: string }
export type TakeOutcome = { readonly ok: true } | { readonly ok: false; readonly holder: string }
// ServerEvent += { type: 'work.changed' } | { type: 'notices.changed' }
// AppError code += 'adoRejected' | 'adoUnreachable' | 'adoNotConfigured'
```

**Logic:**
- `buildTodos` lấy từ board: `readyToTest` (inProgress + done, theo `readyToTestSteps`), `jiraDone` (inProgress mà `isStatusDone`), `overdue` (inProgress quá hạn và `isWithDeveloper`; new quá hạn), `prBlocked` (PR mới nhất của inProgress + done mà `isBlocked`, mỗi PR một dòng), `prReview` (`seen === false`, PR id tăng dần), `prComments` (ticket còn trên board, mới nhất trước), `claudeWaiting` (`finished` sau `permission` / `question`, rồi theo tên session). Ngày so bằng `dueUrgency` có sẵn.
- `isNeededNow`: `claudeWaiting`, `prBlocked`, `overdue`. Một nhóm cần ngay khi có ít nhất một dòng cần ngay; key nhóm = ticket, else session, else kind.
- Gợi ý: `today` là `"YYYY-MM-DD"`; điểm và hằng số giữ như C#; tiêu đề có `placeholder` bị loại; stop words = danh sách C# (bỏ `mdp`) + `options.stopWords` (server truyền `projectKey` viết thường). `urgent` = `IsUrgent` của C#. Chi tiết dòng (loại, hạn, priority, P<n>, status, "giống X") để client dựng, không có `DetailText` ở core.
- `noticeText`: một câu Anh / Việt cho mỗi event, cùng nghĩa với chữ trong `UI/TrayApp.TicketCheck.cs` / `UI/TrayApp.cs` (vd `prMerged`: `"MDP-1: PR (FE Portal dev) merged."` / `"MDP-1: PR (FE Portal dev) đã merge."`). `claudeWait` dùng lại câu của `useClaudeNotices.ts` (GĐ 4) kèm subject.
- `noticeChannels` mặc định: toast luôn bật; desktop bật cho `claude`, `other`; phone bật cho `pr`, `jira`; giá trị trong `prefs` đè từng kênh.
- `removeExpired`: đã đọc > 1 ngày, chưa đọc > 7 ngày (tính từ `at`); trả lại mảng cũ khi không bỏ gì.

**Tests:** port các test C# đã nêu, thêm:
- `buildTodos lists a ready-to-test ticket only when every dev PR merged`
- `groupTodos puts a group first when any of its rows is needed now`
- `rankSuggestions skips placeholders and keys already on the board`
- `pickMonthEpic falls back to last month and never picks a future month`
- `noticeChannels lets a saved choice override one channel`
- `noticeText has an English and a Vietnamese sentence for every event type`

---

### Task 3: Server: config, PAT, adapter Azure DevOps, Jira ghi

**Files:**
- Modify: `packages/server/src/config.ts` -- `parseAzureDevOps`, `parseSuggestions`, `parseNotices`, 2 trường mới của `parseStatusFlow`; `Secrets.adoPat`; `loadAdoPat(dataDir)` (env `WORKDAY_ADO_PAT` trước, rồi file)
- Modify: `packages/server/src/settings/parseSettings.ts`, `settingsService.ts` -- nhận `azureDevOps`, `adoPat`, `notices`; `apply` dựng lại adapter ADO; `POST /api/settings/ado/check` trong `routes/settingsRoutes.ts` (như Jira check)
- Create: `packages/server/src/azureDevOps/adoClient.ts` -- `class AzureDevOpsClient implements PullRequests`
- Create: `packages/server/src/azureDevOps/parseAdo.ts` (+ test, `fixtures/*.json`) -- port các hàm `Parse*`, `CountComments`, `IsRealComment`, `ClassifyValidation`, `ParseExtraBranchLabels` của `Services/AzureDevOpsClient.cs`; test `AzureDevOpsClientTests`
- Modify: `packages/core/src/ports/ticketTracker.ts`, `packages/server/src/jira/jiraTracker.ts`, `parseJira.ts` (+ test) -- 3 method mới, port `JiraClient.TransitionAsync` / `FindTransitionId` / `AssignToMeAsync` / `SearchEpicTicketsAsync`; test phần tương ứng của `JiraClientTests`
- Modify: `packages/server/src/testing/fakes.ts` -- fake `PullRequests`, fake tracker có 3 method mới

**Shape:**
```ts
// TicketTracker += (core/src/ports/ticketTracker.ts)
transition(key: string, status: string): Promise<boolean> // false = no transition leads there; HTTP failure throws
assignToMe(key: string): Promise<string | null> // null = assigned to me now (or already); else the holder's name
searchEpicTickets(jql: string, maxResults: number): Promise<readonly EpicTicket[]>

export class AzureDevOpsClient implements PullRequests {
  constructor(config: AzureDevOpsConfig, pat: string, fetchImpl?: typeof fetch)
}
```

**Logic:**
- URL: `https://dev.azure.com/<org>/<project>/_apis/git|policy|build`, `connectionData` cho validate và id người dùng (cache sau lần đầu đọc được), Basic `base64(":" + pat)`, `api-version=7.1`, timeout 15 s mỗi request (`AbortSignal.timeout`). Không ghi PAT hay header vào log.
- `ticketPrs`: nhánh `<KEY>`, `<KEY>-dev`, rồi các nhánh `<KEY>-<label>` đọc từ refs của các repo đã có PR của ticket (`ParseExtraBranchLabels`); chỉ PR `creatorId` = chính mình (đọc creatorId lỗi -> throw, không chạy không lọc). Một nhánh lỗi -> bỏ nhánh đó, `complete: false`; không có response (DNS, connect, timeout) -> throw `NetworkFailure`. PR active đọc build (policy evaluations, `BuildPolicyTypeId` như C#; lỗi -> `unknown`), merge, vote (vote xấu nhất của reviewer khác tác giả); PR completed đọc `mergeCommit` + `closedDate`.
- `devDeployBuilds(since)`: build trên `refs/heads/development` từ `since`, chỉ definition trong `devPipelineFolder`; `devPipelineFolder` null -> `[]`. `url` của build như `BuildUrl` C#.
- Validate: 401 / 403, hoặc 200 / 203 mà không phải JSON -> `rejected`; không có response -> `unreachable`.
- Config ADO null khi thiếu `organization` hoặc `project`; `repoLabels` giữ thứ tự key của file; không có PAT -> service coi như chưa kết nối (`adoConnected: false`), không gọi mạng.
- `assignToMe`: đọc accountId (`/rest/api/3/myself`), đọc assignee; người khác giữ -> trả tên (hoặc id); trống -> `PUT .../assignee`. `transition`: chỉ GET được retry (dùng `retry.ts` có sẵn), POST không retry.
- `searchEpicTickets`: `POST /rest/api/3/search/jql`, field `summary,status,issuetype,priority,duedate` + `devPriorityFieldId` khi có.
- Đổi PAT / org / project giống đổi token Jira: PAT đã lưu chỉ gửi tới org đã lưu cùng nó (`saveSecretsOrRollBack` như hiện có).

**Tests:**
- port các test parse của `AzureDevOpsClientTests` (vote, merge, build, comment đếm, review request, dev deploy build, extra branch labels, classify validation)
- `ticketPrs keeps only my PRs and marks a failed branch incomplete` (fetch giả)
- `ticketPrs throws NetworkFailure when fetch rejects`
- `transition posts the id of the transition to the target status` / `transition returns false when no transition leads there`
- `assignToMe returns the holder when someone else has the ticket`
- `config drops azureDevOps without organization or project`
- `settings never write the ADO PAT into config.json`
- `loadAdoPat prefers WORKDAY_ADO_PAT`

---

### Task 4: Server: NoticeService, route chuông, thông báo Claude chờ

**Files:**
- Create: `packages/server/src/notices/noticeStore.ts` -- `notices.json` qua `jsonFile.ts` (parse kiểm runtime, ghi atomic, hỏng -> `.bad`)
- Create: `packages/server/src/notices/noticeService.ts` (+ test) -- port `Services/NoticeCenter.cs`; test `NoticeCenterTests`
- Create: `packages/server/src/routes/noticeRoutes.ts` (+ test)
- Modify: `packages/server/src/workspace/workspaceService.ts` -- dep `onWait(session, tab, wait)` gọi khi một session vừa có wait mới; `seen(name)` gọi thêm dep `onSeen(name)`
- Modify: `packages/server/src/services.ts`, `app.ts` -- tạo `NoticeService`, nối workspace -> notices, đăng ký route; `settingsService` báo `notices` khi prefs / language đổi
- Modify: `packages/client/src/api/useEvents.ts` chỉ thêm type event mới nếu typecheck đòi (UI ở Task 8)

**Shape:**
```ts
export interface NoticeInput {
  readonly topic: NoticeTopic
  readonly tone: NoticeTone
  readonly event: NoticeEvent
  readonly target: NoticeTarget | null
  readonly place: string | null // "session:<name>", "pr-comments:<KEY>", "board"
}
export interface NoticeServiceDeps {
  readonly initial: readonly Notice[]
  readonly save: (notices: readonly Notice[]) => Promise<void>
  readonly events: EventSink
  readonly now: () => Date
  readonly push: (area: RemoteArea, message: PushMessage) => Promise<void>
  readonly settings: () => { readonly prefs: NoticePrefs; readonly language: 'en' | 'vi' }
  readonly logError: (message: string, error: unknown) => void
}
export class NoticeService {
  add(input: NoticeInput): Promise<Notice>
  view(): NoticesView
  markRead(id: number): Promise<void>
  markReadAt(place: string): Promise<void>
  markAllRead(): Promise<void>
}
```

**Logic:**
- Chuỗi Promise nối tiếp như các service khác: lưu trước, rồi đổi bộ nhớ, rồi broadcast `notices.changed`. Lưu lỗi thì log, vẫn giữ trong bộ nhớ và vẫn trả notice (chuông không bao giờ làm hỏng việc gọi nó, như C#).
- Khởi tạo: bỏ hết hạn, đánh dấu mọi notice đã đọc, giữ 100 cuối; id tiếp theo = max id + 1. `add` bỏ hết hạn trước khi thêm. `view()` cũng bỏ hết hạn theo `now` (không lưu).
- `add` với `noticeChannels(topic, prefs).phone` bật -> `push('board', { title: 'Workday', body: noticeText(event, language), url, tag: 'notice-<id>' })`, không await trong chuỗi, lỗi chỉ log. `url`: target board -> `/#/board`, url -> chính url đó, workspace -> `/#/board` (phone không mở Workspace).
- Claude: `onWait` chỉ gọi khi wait chuyển từ khác sang `finished` / `permission` / `question` (giống `newWaits` của client GĐ 4); notice `topic: 'claude'`, tone `info`, subject = key ticket của tab, else `Terminal <tên thư mục>`; target workspace; place `session:<name>`. `onSeen(name)` -> `markReadAt('session:<name>')`.
- Route: `GET /api/notices` (board view) -> `NoticesView`; `POST /api/notices/:id/read`, `POST /api/notices/read-all`, `POST /api/notices/read-place` body `{ place: string }` (board view; id không phải số nguyên dương / place rỗng -> 400).

**Tests:**
- port `NoticeCenterTests` (cap, hết hạn, đọc lại sau restart thành đã đọc, mark read / at / all)
- `add pushes to the board area only when the topic's phone channel is on`
- `a failed save still returns the notice and broadcasts`
- `a new finished wait adds one claude notice and seeing the session reads it`
- `notice routes reject a non-numeric id and an empty place with 400`
- `a remote device without board view gets 403 on GET /api/notices` (dùng `remoteTestApp`)

---

### Task 5: Server: PrService (kiểm PR, Ready to Test, deploy dev)

**Files:**
- Create: `packages/server/src/prs/prStore.ts` -- `prs.json` qua `jsonFile.ts`
- Create: `packages/server/src/prs/prService.ts` (+ test) -- port `Services/PrUpdateChecker.cs` (bỏ phần bug cha / stranded), `UI/TrayApp.TicketCheck.cs` (`CheckPrsAsync`, `NotifyPrState`, `CheckReviewRequestsAsync`, `CheckDevDeploysAsync`, `NotifyDevDeploy`); test `PrUpdateCheckerTests` trừ case QC bug
- Create: `packages/server/src/prs/readyToTestWalker.ts` (+ test) -- port `TrayApp.WalkToReadyToTestAsync` và `AutoMoveAfterDevMergeAsync`
- Modify: `packages/server/src/board/boardService.ts` -- `snapshot(): BoardState`; `refreshTicket(key): Promise<void>` (đọc ticket live qua tracker, cập nhật chi tiết nếu ticket còn trên board, lưu + broadcast; lỗi chỉ log)
- Modify: `packages/server/src/settings/settingsService.ts` -- `apply` gọi `prs.configure(...)`; `services.ts` -- tạo `PrService`, `PrScheduler` (một `PollScheduler` thứ hai, 5 phút); `main.ts` -- dừng scheduler khi tắt; `routes/boardRoutes.ts` -- Check now chạy thêm `prs.check()`

**Shape:**
```ts
export interface PrState {
  readonly tracking: PrTracking
  readonly baselineDone: boolean
  readonly reviews: Readonly<Record<string, PrReviewRequest>> // "<repo>|<id>"
  readonly reviewBaselineDone: boolean
  readonly commentAlerts: Readonly<Record<string, CommentAlert>>
  readonly deploys: Readonly<Record<string, DevDeploy>>
}
export interface PrSettings {
  readonly pullRequests: PullRequests | null
  readonly tracker: TicketTracker | null
  readonly flow: StatusFlow
  readonly repoLabels: Readonly<Record<string, string>>
}
export class PrService {
  configure(settings: PrSettings): void
  check(): Promise<void> // a check asked for while one runs shares it
  state(): PrState
  lastCheck(): { readonly at: string; readonly ok: boolean } | null
  readyToTest(key: string): Promise<ReadyToTestOutcome>
  markCommentsSeen(key: string): Promise<void>
  hideReview(reviewKey: string): Promise<void>
}
```

**Logic:**
- `check()`:
  1. Không có `pullRequests` -> không làm gì.
  2. Key được theo dõi = `inProgress` + `done` chưa `areAllPrsClosed`. Nhánh `<KEY>-<x>` mà `<KEY>-<x>` (hoặc tiền tố của nó) cũng là ticket trên board thì để ticket đó giữ (luật `workBranchKeys` của C#).
  3. Đọc tuần tự từng key; `NetworkFailure` -> dừng lượt, `ok: false`; lỗi khác -> log, bỏ key đó, lượt không trọn.
  4. `baselineDone === false` -> chỉ ghi tracking; đánh `baselineDone` khi lượt trọn vẹn.
- Thông báo (`branch` = `repoLabel + ' ' + branch + targetSuffix`):
  - Merge: topic `pr`, tone `success`, target board key, place `board`.
  - Comment mới: topic `pr`, target url, place `pr-comments:<KEY>`; cộng `commentAlerts`.
  - Build lỗi / conflict / vote: topic `pr`, tone `error`, trừ vote approved là `success`.
  - Mọi PR dev đã merge và còn bước: `devMerged`, topic `jira`.
- Review request: `mergeReviewRequests`, request mới (sau baseline) -> `prReviewRequested`, topic `pr`, target url. Đọc lỗi giữ list cũ, không làm hỏng lượt.
- Deploy dev:
  1. Có `devPipelineFolder` (adapter trả `[]` khi không có) và `mergesToWatch` không rỗng -> một lần `devDeployBuilds(min mergedAt - BUILD_READ_SLACK_MS)`.
  2. Mỗi ticket: `ticketState`, rồi `walker.auto(key, deploy)`.
  3. `shouldNotifyDeploy` -> `deployed{moved}` (tone `success`, topic `jira`) hoặc `deployFailed` (tone `error`, target url build).
  4. Đọc lỗi giữ `deploys` cũ.
- Lưu `prs.json` chỉ khi state đổi (`!==` từng phần), rồi broadcast `work.changed`.
- `readyToTestWalker`:
  - Bước luôn lấy từ status **live** (`tracker.getTicket`), không dùng status đã lưu.
  - Mỗi key chỉ một lần đi tại một thời điểm (`Set` key đang chạy): bấm tay lúc đang chạy -> `busy`; auto lúc đang chạy -> bỏ qua.
  - Thông báo:
    - `transition` trả false -> `transitionFailed`, topic `jira`. Lỗi auto báo một lần cho mỗi `key|step` trong đời process.
    - Bấm tay thì báo cả `movedToReadyToTest` / `alreadyPastReadyToTest` / `ticketMissing`.
  - Sau khi đi (kể cả đi dở) -> `board.refreshTicket(key)`.
  - `auto` trả `true` khi ticket đã đứng ở bước cuối và deploy `deployed`.
- `markCommentsSeen(key)` xóa alert và gọi `notices.markReadAt('pr-comments:<key>')`; `hideReview(key)` đặt `seen: true`.
- `PrScheduler` chạy `check()` ngay khi configure có `pullRequests`, rồi mỗi 5 phút; `POST /api/board/check` (Check now) chạy cả `prs.check()` sau poll board.

**Tests:**
- port `PrUpdateCheckerTests` (baseline, lượt không trọn không baseline, nhánh của work branch, network failure dừng lượt)
- `check notifies a merge, new comments and a failed build after the baseline`
- `check adds comment alerts and markCommentsSeen clears them and reads the notices`
- `check sends devMerged once every dev PR merged`
- `readyToTest walks the live status, refreshes the ticket and reports moved`
- `readyToTest stops at a missing transition and reports failed with the step`
- `readyToTest twice at once runs once and answers busy`
- `auto walk stops before the last step until the deploy is deployed`
- `auto walk failure is noticed once per key and step`
- `check does nothing without an Azure DevOps client`

---

### Task 6: Server: gợi ý ticket, `GET /api/work` và route ghi

**Files:**
- Create: `packages/server/src/suggestions/suggestionStore.ts` -- `suggestions.json`
- Create: `packages/server/src/suggestions/suggestionService.ts` (+ test) -- port `UI/TrayApp.TicketSuggestions.cs` (`RefreshTicketSuggestionsAsync`, phần hidden / notice, `TakeTicketAsync` / `AssignTicketAsync`)
- Create: `packages/server/src/work/workView.ts` (+ test) -- dựng `WorkView`
- Create: `packages/server/src/routes/workRoutes.ts` (+ test)
- Modify: `packages/server/src/services.ts` -- scheduler board chạy `board.poll()` rồi `suggestions.refresh()` khi poll ok; `app.ts` đăng ký route; `settingsService.ts` -- `suggestions.configure(...)`

**Shape:**
```ts
export interface SuggestionState {
  readonly epic: EpicTicket | null
  readonly epicMonth: string | null // "YYYY-MM" the epic was picked for
  readonly items: readonly Suggestion[] // last ranking, kept when a read fails
  readonly hiddenKeys: readonly string[]
  readonly notifiedKeys: readonly string[]
  readonly notifiedOn: string | null
  readonly baselineDone: boolean
}
export class SuggestionService {
  configure(settings: { readonly tracker: TicketTracker | null; readonly config: SuggestionsConfig | null;
    readonly projectKey: string | null; readonly timeZone: string }): void
  refresh(): Promise<void>
  view(): { readonly epicKey: string | null; readonly items: readonly Suggestion[] } | null
  take(key: string): Promise<TakeOutcome>
  hide(key: string): Promise<void>
}
export function buildWorkView(input: {
  readonly board: BoardState; readonly today: string; readonly jira: JiraConfig | null
  readonly ado: AzureDevOpsConfig | null; readonly adoConnected: boolean
  readonly prs: PrState; readonly lastPrCheck: { readonly at: string; readonly ok: boolean } | null
  readonly sessions: readonly SessionView[]; readonly tabs: readonly WorkspaceTab[]
  readonly suggestions: { readonly epicKey: string | null; readonly items: readonly Suggestion[] } | null
}): WorkView
```

**Logic:**
- `refresh`:
  1. Không config / tracker -> không làm gì.
  2. Epic giữ lại khi `epicMonth` là tháng này; không thì tìm lại bằng `epicJql` (10 kết quả) + `pickMonthEpic`.
  3. Đọc song song candidates (100) và mine (50); `{epic}` trong JQL thay bằng key epic (key đã qua `pickMonthEpic` nên có dạng key).
  4. Loại key đã có trên board (kể cả dismissed) và `hiddenKeys`. Bỏ khỏi `hiddenKeys` các key không còn trong candidates.
  5. Gọi `suggestionNotice`: có key mới -> `suggestionsUrgent`, topic `suggestions`, target board.
  6. Đọc lỗi -> log, giữ items cũ.
  7. Lưu và broadcast `work.changed` khi đổi.
- `take`:
  - `tracker.assignToMe(key)` trả tên người khác -> `{ ok: false, holder }`. Cả hai trường hợp đều bỏ key khỏi items.
  - Thành công -> `board.poll()` (không chờ kết quả cho response).
  - Lỗi Jira -> AppError `jiraUnreachable` qua route (500 có code).
- `buildWorkView`:
  - `groups = groupTodos(buildTodos(...))`, `attention = attentionKeys(groups).length`.
  - `prs` chỉ cho key trên board (`latestPrs`), `readyToTest` = key có `readyToTestSteps` khác null.
  - Waits lấy từ `SessionView.wait` + tab chứa session (`ticketKey` = id tab ticket).
  - `suggestions` null khi `jira.suggestions` null.
  - `today` theo `config.timeZone` (dùng `zonedDate.ts`).
- Route (đều có `config.access`):
  - `GET /api/work` (board view).
  - Board act:
    - `POST /api/work/ready-to-test/:key` -> `ReadyToTestOutcome`.
    - `POST /api/work/comments/:key/seen`.
    - `POST /api/work/reviews/:repo/:id/hide`.
    - `POST /api/work/suggestions/:key/take` -> `TakeOutcome`.
    - `POST /api/work/suggestions/:key/hide`.
  - Key sai dạng (`ticketKey.ts`) -> 400 `invalidKey`. ADO chưa cấu hình ở route cần ADO -> 409 `adoNotConfigured`.

**Tests:**
- `refresh ranks this month's epic candidates without board keys or hidden keys`
- `refresh keeps the last items when Jira fails`
- `refresh notices new urgent suggestions once a day`
- `take reports the holder and drops the suggestion`
- `take assigns, drops the suggestion and polls the board`
- `buildWorkView counts needed-now rows and lists PRs only for board tickets`
- `buildWorkView has null suggestions when they are not configured`
- `work routes reject a malformed key with 400 and need board act for writes` (remote device `view` -> 403 khi POST)

---

### Task 7: Client: view To do, pill PR, Ready to Test, Available to take

**Files:**
- Create: `packages/client/src/api/workApi.ts`, `useWork.ts` -- query `/api/work`, refetch khi `work.changed` / `board.changed` / `workspace.changed`; mutation cho các route ghi
- Create: `packages/client/src/board/TodoView.tsx`, `TodoRow.tsx` (+ test) -- port bố cục và chữ của `UI/TasksPage.Todos.cs`, `UI/TodoRow.cs`, `Helpers/TodoText.cs` (chỉ các kind trong phạm vi)
- Create: `packages/client/src/board/PrPills.tsx` (+ test) -- pill như `UI/TaskRow` của C# (repo + nhánh, glyph trạng thái, dấu build lỗi / conflict / vote)
- Create: `packages/client/src/board/SuggestionsCard.tsx` (+ test) -- port `UI/TasksPage.Suggestions.cs`
- Modify: `packages/client/src/board/boardView.ts` -- `BoardViewId` thêm `'todo'` (đứng đầu); `BoardPage.tsx`, `BoardTable.tsx`, `RowMenu.tsx` -- pill PR trong dòng, mục **Ready to Test** trong menu; `shell/Sidebar.tsx` -- số `attention` trên mục Board
- Modify: `packages/client/src/errors.ts` -- dịch 3 code mới

**Logic:**
- View `todo`:
  - Hiện các nhóm của `WorkView.groups` theo thứ tự server trả. Nhóm có ticket thì có pill key + summary (lấy từ rows của board), các dòng to-do bên dưới. Nhóm cần ngay có viền nhấn.
  - Search của board lọc theo key, summary, tiêu đề review (giữ nguyên nhóm).
  - Số đếm trên nút view = số nhóm.
- Hành động mỗi kind:
  - `claudeWaiting`: mở `#/workspace/<tab>/<session>`; ẩn với thiết bị từ xa (`useAccess`).
  - `readyToTest`:
    - Nút "-> Deployed to Dev -> Ready to Test" (nối `steps`), hỏi xác nhận (dialog có sẵn của board) rồi gọi route.
    - Outcome hiện một dòng: `moved` / `alreadyPast` / `notFound` / `busy` / `failed` + step.
    - Có `deploy` thì kèm trạng thái: đang deploy, đã lên dev, lỗi + link build.
  - `prReview`: mở PR (tab mới) + Hide.
  - `prBlocked`: mở PR, lý do (build lỗi / conflict / waiting / reject).
  - `prComments`: mở PR và gọi `comments/:key/seen`.
  - `jiraDone`: "Mark done" (board act `done` có sẵn).
  - `overdue`: Start / Open qua `useTicketLauncher` (chỉ khi Workspace đã cấu hình).
- Pill PR: trên dòng Working / Done từ `WorkView.prs[key]`; bấm mở `url` tab mới (`rel="noopener noreferrer"`).
- Mục Ready to Test trong menu chỉ khi `WorkView.readyToTest[key]` có.
- `SuggestionsCard`:
  - Ở đầu view Working khi `suggestions` khác null và có item.
  - Dòng: key, summary, chi tiết (loại · hạn / trễ hạn · priority cao · P<n> · status ưu tiên · "giống X") dựng ở client bằng `t()`, đánh dấu gấp.
  - Hiện 10, mỗi lần Show more thêm 10.
  - Take hỏi xác nhận; `ok: false` -> "Đã có <holder> nhận". Hide gọi route.
  - Thiết bị từ xa không có `act` thì không có nút.
- Mọi chữ qua `t(en, vi)`.

**Tests:**
- `todo view lists needed-now groups first with their actions`
- `ready to test asks first and shows the outcome`
- `a remote device sees no workspace action on a Claude to-do`
- `pr pills show a failed build and open the PR in a new tab`
- `suggestions card shows ten and Show more adds ten`
- `take shows the holder when someone else has the ticket`
- `sidebar shows the attention count on Board`

---

### Task 8: Client: chuông, toast, thông báo desktop, Settings Azure DevOps / Notices / trạng thái

**Files:**
- Create: `packages/client/src/api/noticeApi.ts`; `packages/client/src/notices/useNotices.ts` (+ test), `NoticeBell.tsx` (+ test), `NoticeToasts.tsx`, `noticeTarget.ts`, `notices.css` -- port `UI/NoticeHistoryView*.cs`, `UI/NoticeToast.cs`, `UI/ShellWindow.Notices.cs`
- Create: `packages/client/src/settings/AzureDevOpsSection.tsx` (+ test), `adoForm.ts`, `NoticesSection.tsx` (+ test) -- port `UI/SettingsNoticesPanel.cs`
- Modify: `packages/client/src/settings/AdvancedFields.tsx`, `jiraForm.ts` -- ô `readyToTestPath`, `developerStatuses` (như `preWorkStatuses`), nhóm Suggestions (epic JQL, tiền tố, candidates JQL, mine JQL, status ưu tiên)
- Modify: `packages/client/src/shell/Shell.tsx`, `TabBar.tsx` -- gắn chuông + toast; bỏ `useClaudeNotices` (xóa phần thông báo desktop trong `workspace/useClaudeNotices.ts`, giữ `requestNoticePermission`); `api/useEvents.ts` -- `notices.changed`
- Modify: `docs/web-foundation/plan.md` -- roadmap: GĐ 5 không còn Teams, thêm dòng Teams thành giai đoạn riêng trước Insights

**Logic:**
- `useNotices`: query `/api/notices`, refetch trên `notices.changed`. Notice "mới" = id lớn hơn id lớn nhất thấy lần trước trong phiên trình duyệt; lần tải đầu chỉ ghi mốc, không bật gì.
- Với mỗi notice mới, theo `noticeChannels(topic, prefs)`:
  - Toast (góc dưới phải, 6 giây, tối đa 3, tone đổi màu; bấm -> đi tới đích + `read`; nút đóng -> `read`).
  - Desktop `Notification` khi đã được cấp quyền và `document.hidden || !document.hasFocus()`; bấm -> focus cửa sổ + đi tới đích.
  - Chữ = `noticeText(event, language)` của core.
- `noticeTarget`:
  - `board` -> `#/board`, có key thì cuộn tới dòng nếu thấy.
  - `workspace` -> `#/workspace/<tab>/<session>`; thiết bị từ xa đi `#/board`.
  - `url` -> `window.open(url, '_blank', 'noopener')`.
- Chuông (thanh trên, cả PC lẫn điện thoại):
  - Số chưa đọc (99+); bảng mới nhất trước: giờ theo `timeZone`, chữ, chấm chưa đọc.
  - Bấm -> đi + `read`; nút Mark all read. Mở bảng không đánh dấu đọc.
  - Trang Board đang mở -> `read-place` `board` một lần mỗi khi có notice mới ở place đó.
- `NoticesSection`: bảng chủ đề (Claude, PR, Jira, Suggestions, Other) x 3 cột Toast / Desktop / Phone (checkbox); chỉ lưu giá trị khác mặc định (`PUT /api/settings` `notices`); Restore defaults gửi `{}`. Nút xin quyền thông báo desktop khi `Notification.permission === 'default'`.
- `AzureDevOpsSection`:
  - Ô organization, project, repo labels (textarea mỗi dòng `Repo=Label`, giữ thứ tự), dev pipeline folder, PAT qua `TokenField` có sẵn (nguồn env / file).
  - Nút Check gọi `/api/settings/ado/check`, kết quả một dòng.
  - Save qua `PUT /api/settings`.

**Tests:**
- `useNotices raises nothing for the notices of the first load`
- `a new notice shows a toast and a desktop notification only on the channels its topic allows`
- `clicking a toast navigates to its target and marks it read`
- `bell shows the unread count and Mark all read clears it`
- `notices section saves only the channels that differ from the default`
- `azure devops section keeps the repo label order and never shows the saved PAT`

---

## Kiểm tra cuối giai đoạn

1. `npm test`, `npm run typecheck`, `npm run lint`, convention lint, `npm run build` sạch.
2. Chạy bản build với data dir tạm, fetch ADO / Jira giả qua test là chính; smoke thật (người dùng làm):
   1. Settings > Azure DevOps: org `TeeShirtCentral`, project `MDP`, labels `Backend-DotNet=BE`, `Portal-Angular=FE Portal`, `ExternalPortal-Angular=FE External`..., pipeline `\Development-Pipelines`, PAT -> Check ra tên mình.
   2. Settings > Jira (Advanced):
      - `readyToTestPath` = `PR & Code Review, Deployed to Dev, Ready to Test`.
      - `developerStatuses` = `Backlog, Selected for Development, In Progress, QA Failed, Reopened, To Do`.
      - Suggestions:
        - Epic JQL: `project = MDP AND issuetype = Epic AND summary ~ "MDP Issues" ORDER BY created DESC`.
        - Tiền tố epic: `MDP Issues - `.
        - Candidates JQL: `parent = {epic} AND assignee is EMPTY AND statusCategory = "To Do" ORDER BY created DESC`.
        - Mine JQL: `parent = {epic} AND assignee = currentUser() ORDER BY created DESC`.
        - Status ưu tiên: `Selected for Development`.
   3. Board: pill PR hiện cho ticket đang làm; view To do có các dòng đúng; card Available to take có ticket của epic tháng này.
   4. Chuông: chạy một session Claude tới khi xong -> toast + chuông +1; mở tab session -> thành đã đọc.
   5. Ready to Test chỉ thử trên ticket thật khi đã sẵn sàng (cả team thấy).
