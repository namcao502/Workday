# WPF parity: 5 tính năng còn thiếu Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- packages/client của chính repo này

**Goal:** Port 5 tính năng của app WPF (`C:\Project\NoisWorkday`) mà web chưa có: Guide, dọn worktree, DB review, báo Jira đổi ticket, bug QC.

**Expected outcome (acceptance criteria):**
- [ ] Settings có mục Guide: cột mục lục từ các `##`, nội dung render theo ngôn ngữ đang chọn, không còn đoạn nói về tray / media player / LAN mobile.
- [ ] Workspace có nút mở danh sách dọn worktree: mỗi ticket một dòng với verdict Ready / Check / Keep / NoWorktree và lý do; Remove xóa worktree BE + `*-Angular`, Slim docs xóa file nặng trong `docs/<KEY>`.
- [ ] Remove không chạy khi còn commit chưa push, hoặc khi số file dirty đã đổi so với lúc dialog hiện; key không đúng dạng ticket bị từ chối.
- [ ] Teams watcher nhận ra "approve" của lead trong kênh Database Review: to-do "Copy SQL / Done" và một notice; Done ghi mốc nên to-do không quay lại; approve thứ hai của cùng SQL không hồi sinh to-do.
- [ ] Kênh Database Review lấy từ config (không hardcode); để trống thì tính năng tắt.
- [ ] Sau mỗi lần poll Jira, ticket New / In progress đổi summary, description, attachment, due, ETA hoặc P bởi người khác thì có notice và to-do "Jira updated"; thay đổi chỉ do chính mình thì không báo.
- [ ] "View changes" mở dialog so sánh cũ / mới theo từng field; "Seen" xóa to-do và notice.
- [ ] Bug (Defect / Bug) link tới ticket đang làm hoặc đã xong hiện thành to-do "QC bug"; Start / Fix mở tab ticket cha, gửi `jira-fetch-bug <BUG>` vào phiên Claude của cha, chuyển bug New sang In progress và xếp ticket cha (không phải bug) vào queue hôm nay.
- [ ] Bản nháp `docs/<PARENT>/bugs/<BUG>/teams-post.md` (không quá 14 ngày, bug chưa Done) thành to-do "Reply to QC" và một notice; trong thread của ticket cha có thẻ gợi ý câu trả lời tag đúng QC; khi đã trả lời (tin của mình sau bản nháp, có nhắc key bug) thì to-do và thẻ biến mất.
- [ ] Giờ của bug luôn log vào ticket cha: key bug trong queue được đổi thành key cha khi log.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` sạch; mỗi hàm thuần port từ C# có test port từ `tests/NoisWorkday.Tests`.

**Architecture:** Luật thuần vào `packages/core` (không I/O), I/O vào `packages/server`, UI vào `packages/client`. Mỗi tính năng là một lát dọc độc lập. Task 3 (DB review) và Task 5 (bug QC) cùng mở rộng `TeamsWatcher` và `buildTodos`, nên làm tuần tự, không song song.

**Assumptions:**
- Guide: copy `Assets/guide/guide.{en,vi}.md` vào client, bỏ các đoạn nói về tính năng đã bỏ (tray, media player, zoom, LAN mobile, terminal); đoạn khác để nguyên, người dùng sửa chữ sau.
- Vị trí UI chọn theo cấu trúc web hiện có: Guide là mục Settings, dọn worktree là nút ở Workspace, các to-do vào Board như các to-do khác. WPF đặt khác; kiểm bằng mắt sau.
- Dialog "View changes" hiện hai khối cũ / mới cho từng field đổi, không diff từng dòng như `TextDiff` của WPF.
- Không port việc đăng bài lên kênh Database Review từ `db-review.md` (`TeamsPost` isDbReview): chỉ phần nhận approve.
- Kênh Database Review (team + channel) thêm vào `config.teams.dbReviewChannel`, mặc định `null`; tên thật của WPF (`TeamsChat.DbReviewChannel`) nhập qua Settings, không vào code.
- Bug chỉ nhận khi `issueType` là Defect / Bug (so không phân biệt hoa thường) như `TicketBugs.IsBug`.

**Tech Stack:** Node 22, TypeScript strict, Fastify, React + HeroUI, Vitest.

---

### Task 1: Settings > Guide

**Files:**
- Create: `packages/client/src/guide/guide.en.md`, `guide.vi.md` -- copy từ `C:\Project\NoisWorkday\Assets\guide`, đã bỏ đoạn về tính năng không port
- Create: `packages/client/src/guide/guideSections.ts` + `guideSections.test.ts` -- tách markdown thành các mục theo `##`
- Create: `packages/client/src/settings/GuideSection.tsx` -- mục lục + nội dung
- Modify: `packages/client/src/settings/SettingsPage.tsx` -- thêm `<GuideSection />` cuối trang
- Modify: `packages/client/vite.config.ts` / `vitest.config.ts` chỉ khi `?raw` import chưa chạy (Vite hỗ trợ sẵn; vitest dùng cùng plugin)

**Shape:**
```ts
export interface GuideSection { readonly id: string; readonly title: string; readonly body: string }
export function splitGuide(markdown: string): readonly GuideSection[]
```

**Logic:**
- Phần trước `##` đầu tiên là `intro`, hiện trước mục lục; `id` là slug của title, trùng thì thêm `-2`.
- Dòng `##` nằm trong code fence không tách mục.
- Render bằng `react-markdown` + `remark-gfm` (đã có trong client), chọn file theo `t()` language; bấm mục lục cuộn tới mục.

**Tests:**
- `splitGuide splits on level-2 headings` -- 3 mục, thứ tự giữ nguyên.
- `splitGuide ignores headings inside a code fence`
- `splitGuide gives duplicate titles distinct ids`
- `GuideSection shows the Vietnamese guide when the language is vi` -- render, thấy tiêu đề mục đầu.

### Task 2: Dọn worktree

**Files:**
- Create: `packages/core/src/worktreeCleanup.ts` + `.test.ts` -- luật thuần, port `WorktreeCleanup.cs`; export từ `index.ts`
- Create: `packages/server/src/workspace/worktreeCleanup.ts` + `.test.ts` -- port `WorktreeCleanupService.cs`: đọc git / đĩa, Remove, Slim
- Create: `packages/server/src/routes/cleanupRoutes.ts` -- đăng ký trong `app.ts` cùng nhóm route workspace, `config.access` như route workspace ghi (Act)
- Modify: `packages/core/src/api.ts` -- `CleanupRow`, `CleanupVerdict`
- Create: `packages/client/src/workspace/CleanupDialog.tsx`, `api/cleanupApi.ts`; Modify `WorkspacePage.tsx` thêm nút

**Shape:**
```ts
export type CleanupVerdict = 'ready' | 'check' | 'keep' | 'noWorktree'
export interface WorktreeFacts {
  inspectFailed: boolean; sessionRunning: boolean; unpushedCommits: number; isBroken: boolean
  dirtyFiles: number; localConfigDiffs: number; inProgress: boolean; otherBranch: string | null
  hasTrackedPrs: boolean; allPrsClosed: boolean; anyPrCompleted: boolean
  branchMerged: boolean; mainPrMerged: boolean
}
export function classifyWorktree(facts: WorktreeFacts): { verdict: CleanupVerdict; reasons: readonly CleanupReason[] }
export function minedTickets(scanLog: string, retryFile: string): ReadonlySet<string>
export function mergedTickets(mergeSubjects: string): ReadonlySet<string>
export function isCleanupKey(key: string): boolean // ^[A-Z][A-Z0-9]*-[0-9]+(?:-[A-Za-z0-9]+)*$
// GET  /api/workspace/cleanup                     -> { rows: CleanupRow[] }
// POST /api/workspace/cleanup/:key/remove {dirtyFiles: number} -> { ok } | { ok:false, error:{code} }
// POST /api/workspace/cleanup/:key/slim
```
`CleanupReason` là mã (`unpushed` + count, `dirty` + count, `localConfig`, `inProgress`, `otherBranch` + name, `abandoned`, `mainMergedPrOpen`, `notMerged`, `broken`, `sessionRunning`, `inspectFailed`); server không gửi chữ hiển thị, client dịch bằng `t(en, vi)`.

**Logic:**
- `classifyWorktree` giữ đúng thứ tự `Classify` của C#: `inspectFailed`, `sessionRunning`, `unpushedCommits > 0` trả `keep` ngay với một lý do; còn lại gom lý do, có lý do nào thì `check`, không thì `ready`. `shipped = hasTrackedPrs ? allPrsClosed && anyPrCompleted : branchMerged`.
- Server dùng `runGit` (read-only, `--no-optional-locks`): dirty count, commit không nằm trên remote nào, ancestor của `origin/main` / `origin/development`, `MergedKeys` từ merge commit subject, `MinedKeys` từ scan log + retry file của knowledge scan. Exit 1 của `merge-base --is-ancestor` là "không phải ancestor"; lỗi khác là `inspectFailed`, không phải câu trả lời.
- Remove: key phải qua `isCleanupKey` trước khi đụng đường dẫn; đọc lại facts và từ chối khi `unpushedCommits > 0` hoặc `dirtyFiles` khác số client gửi; gỡ junction `node_modules` trước khi `git worktree remove` (git có thể đi theo junction và xóa node_modules thật); worktree BE xóa cuối cùng để lỗi FE còn retry được; chỉ xóa thư mục khi git xác nhận nó không còn được đăng ký (`worktree list -z` đọc được).
- Slim: xóa `SlimTargets` (`attachments`, `.pr-scratch`, `sandbox`, `plan-review.md`, `impl-review.md`, `test-plan.md`, `.issue.json`, `teams-analysis.json`, `ticket.*.bak.md`, `.sql` / `.csv` trừ `migrate.sql`, `Translation.sql`, `Schema_Migrate.sql`, `revert.sql`; bỏ qua `local-test` và `bugs` ở gốc) trong docs của repo chính và của mọi worktree. `SlimTargets` ở server vì cần đọc đĩa.
- Dev repo và glob repo anh em (`*-Angular`) lấy từ `config.workspace` (đã có `devRepoPath`, `siblingRepoGlob`); chưa cấu hình thì `GET` trả danh sách rỗng và client nói cần đặt dev repo.

**Tests:**
- Core, port từ `WorktreeCleanupTests`: `classifyWorktree_keeps_when_a_session_runs`, `..._keeps_unpushed_commits`, `..._ready_when_shipped_and_clean`, `..._check_lists_every_reason`, `..._abandoned_pr_is_not_shipped`, `minedTickets_drops_given_up_and_retried_keys`, `mergedTickets_reads_keys_from_merge_subjects`, `isCleanupKey_rejects_paths`.
- Server (repo git tạm): `remove_refuses_a_key_that_is_not_a_ticket_key`, `remove_refuses_when_dirty_count_changed`, `remove_keeps_the_folder_when_git_cannot_list_worktrees`, `slim_keeps_migration_sql_and_local_test`.
- Client: `CleanupDialog shows Remove only for ready and check rows`, `CleanupDialog shows Slim only for noWorktree rows with slimBytes`.

### Task 3: DB review

**Files:**
- Create: `packages/core/src/dbReview.ts` + `.test.ts` -- port `DbReview.cs`; export từ `index.ts`
- Modify: `packages/core/src/todos.ts` -- kind `dbReview`; `core/src/notices.ts` -- event `dbReviewApproved`; `core/src/api.ts` -- `DbReviewApproval`, `config.teams.dbReviewChannel`
- Modify: `packages/server/src/config.ts`, `settings/parseSettings.ts` -- `teams.dbReviewChannel: { teamName, channelName } | null`
- Modify: `packages/server/src/teams/teamsStore.ts` -- `dbReviewNotifiedAt`, `dbReviewDoneAt` trong `TeamsState` (record conversationKey -> ISO, mặc định `{}`; parser vẫn đọc file cũ thiếu field)
- Modify: `packages/server/src/teams/teamsWatcher.ts` -- đánh dấu `isDbReview`, tính approvals, `dbReviewApprovals()`, `markDbReviewDone(conversationKey)`
- Modify: `packages/server/src/routes/teamsRoutes.ts` -- `POST /api/teams/db-review/done {conversationKey}`; `services.ts` đưa approvals vào `workView`
- Modify: `packages/client/src/board/TodoRow.tsx`, `todoText.ts` -- dòng to-do + nút Copy SQL / Done; `settings/TeamsSection.tsx` -- ô kênh Database Review

**Shape:**
```ts
export interface DbReviewApproval {
  readonly ticketKey: string; readonly conversationKey: string; readonly channelId: string
  readonly approverName: string; readonly approvedAt: string; readonly sql: string
}
export function isApproval(message: TeamsMessage): boolean
export function sqlOf(message: TeamsMessage): string | null
export function pendingApproval(thread: TeamsThread, ticketKey: string, conversationKey: string, myId: string): DbReviewApproval | null
export function dbReviewDue(approval: DbReviewApproval, notifiedAt: string | null, doneAt: string | null): { isTodo: boolean; isNotice: boolean }
export function endsWithApproval(thread: TeamsThread, myId: string): boolean
```

**Logic:**
- `isApproval`: văn bản thuần của tin bắt đầu bằng `[ok|oke|okay][,.! ]* appr(ove|oved|oves)?` không phân biệt hoa thường (cùng regex C#).
- `sqlOf`: nối nội dung các `<pre>` (đổi `<br>` thành xuống dòng, bỏ tag, giải mã entity, nbsp thành space) cách nhau một dòng trống; tin text thuần hoặc không có `<pre>` trả null.
- `pendingApproval`: chỉ khi bài gốc là của mình; tin SQL = bài gốc + tin của mình có `sqlOf`; approval = tin của người khác đầu tiên (theo `sentAt`) sau tin SQL mới nhất; SQL của approval chỉ tính từ sau approval trước đó; mỗi tin SQL lấy `sqlOf ?? văn bản thuần`.
- `dbReviewDue`: `doneAt >= approvedAt` thì không to-do; còn lại là to-do, và notice khi chưa từng notify hoặc `notifiedAt < approvedAt`.
- Watcher: conversation của bài trong kênh khớp `config.teams.dbReviewChannel` (so tên bỏ khoảng trắng, không phân biệt hoa thường) thì tính approval; ghi `dbReviewNotifiedAt` cùng lúc với marks khác (một `changeState`), notice chỉ sau khi lưu xong. Khi `endsWithApproval` thì không tạo to-do `teamsMessage` cho cùng thread (to-do approve thay cho nó).
- Notice: topic `teams`, target `teams` như tin Teams thường, place `teams:<conversationKey>`.

**Tests:**
- Core, port từ `DbReviewTests`: `isApproval_accepts_approve_appr_and_ok_prefix`, `isApproval_ignores_approve_in_the_middle`, `sqlOf_joins_code_blocks`, `sqlOf_returns_null_for_plain_text`, `pendingApproval_needs_my_root_post`, `pendingApproval_takes_the_first_approval_after_the_newest_sql`, `pendingApproval_covers_only_sql_since_the_previous_approval`, `dbReviewDue_false_once_done`, `dbReviewDue_notice_only_for_a_new_approval`, `endsWithApproval_false_when_i_spoke_last`.
- Server: `watcher raises one dbReviewApproved notice and one to-do for an approved thread`, `watcher does not notify twice for the same approval`, `markDbReviewDone removes the to-do and survives a restart`, `no dbReviewChannel configured means no approvals`.
- Client: `TodoRow dbReview copies the SQL to the clipboard`.

### Task 4: Báo ticket đổi trên Jira

**Files:**
- Create: `packages/core/src/ticketChanges.ts` + `.test.ts` -- port `JiraTicketChanges.cs`; `core/src/jiraAdf.ts` + `.test.ts` -- port `JiraAdf.cs` (ADF -> văn bản thuần)
- Modify: `packages/core/src/ports/ticketTracker.ts` -- `getTicketContent`, `getChangeHistories`, `myAccountId`
- Modify: `packages/server/src/jira/jiraTracker.ts`, `parseJira.ts` -- cài 3 method mới
- Create: `packages/server/src/jira/ticketUpdates.ts` + `.test.ts` -- port `JiraTicketUpdateChecker`; store `ticket-updates.json` qua `jsonFile.ts`
- Modify: `packages/server/src/board/boardService.ts` -- gọi checker sau poll thành công; `routes/boardRoutes.ts` -- `GET /api/tickets/:key/update`, `POST /api/tickets/:key/update/viewed`
- Modify: `packages/core/src/todos.ts` (kind `jiraUpdated`), `notices.ts` (event `ticketUpdated`, topic `jira`), `api.ts` (kiểu view)
- Create: `packages/client/src/board/TicketUpdateDialog.tsx`; Modify `TodoRow.tsx`, `todoText.ts`

**Shape:**
```ts
export interface TicketContent {
  readonly summary: string; readonly description: string; readonly attachments: string // tên file nối bằng \n
  readonly dueDate: string | null; readonly eta: string | null; readonly devPriority: number | null
}
export type TicketField = 'summary' | 'description' | 'attachments' | 'dueDate' | 'eta' | 'devPriority'
export interface TicketUpdate {
  readonly viewed: TicketContent; readonly current: TicketContent; readonly updated: string
  readonly changedBy: string | null; readonly changedAt: string | null
}
export interface ChangeHistory { readonly created: string; readonly authorAccountId: string | null; readonly authorName: string | null; readonly fieldIds: readonly string[] }
export function changedFields(before: TicketContent, after: TicketContent): readonly TicketField[]
export function pendingFields(update: TicketUpdate): readonly TicketField[]
export function applyRead(stored: TicketUpdate | null, current: TicketContent, updated: string,
  histories: readonly ChangeHistory[] | null, myAccountId: string | null): { update: TicketUpdate; isNewChange: boolean }
export function markViewed(update: TicketUpdate, shown: TicketContent): TicketUpdate
export function keepOnly(updates: Readonly<Record<string, TicketUpdate>>, boardKeys: ReadonlySet<string>): Record<string, TicketUpdate>
```

**Logic:**
- Checker, sau mỗi poll thành công: với mỗi ticket New / In progress có `updated` khác `stored.updated` (hoặc chưa có bản lưu) thì đọc content; đọc changelog và `myAccountId` chỉ khi đã có bản lưu và `changedFields(stored.current, content)` khác rỗng; changelog đọc sau content. Lỗi đọc một ticket thì log và bỏ qua ticket đó, không dừng poll.
- Đọc lại store ngay trước khi áp kết quả (người dùng có thể đã bấm Seen trong lúc chờ), áp `applyRead`, rồi `keepOnly` theo key còn trên board; chỉ ghi file khi nội dung đổi.
- `applyRead`: lần đầu (`stored` null) thì `viewed = current`, không báo. Với mỗi field đổi so với `stored.current`: nếu mọi history của field đó mới hơn `stored.updated` đều của mình (`histories` và `myAccountId` đều có) thì nuốt im lặng vào `viewed`, trừ field đã đang chờ từ trước; còn lại là "đổi bởi người khác". `isNewChange` khi có field đang chờ mà do người khác đổi trong lần đọc này. `changedBy` = tên các tác giả khác (gộp với `changedBy` cũ nếu đã có field chờ), `changedAt` = history mới nhất của người khác. `histories` null (không đọc được changelog) thì mọi field đổi tính là của người khác.
- `markViewed` đặt `viewed = shown` (không phải `current`, vì một lần đọc sau có thể đã vượt); hết field chờ thì xóa `changedBy` / `changedAt`.
- Notice: một cái cho mỗi ticket có `isNewChange`, text "KEY được cập nhật trên Jira: <field>" kèm "(bởi <tên>)", place `ticket-update:<key>`; Seen và mở dialog xong thì `markReadAt` place đó.
- `jiraAdf.ts`: giữ đúng các node mà C# xử lý (paragraph, heading, list, code block, mention, link, hardBreak); node lạ thì lấy text con.
- Jira field id của ETA và dev priority lấy từ cấu hình Jira đã có của `JiraTracker` (`fieldIds`), không hardcode.

**Tests:**
- Core, port từ `JiraTicketChangesTests`: `applyRead_first_read_reports_nothing`, `applyRead_swallows_a_change_made_only_by_me`, `applyRead_reports_a_change_by_someone_else`, `applyRead_keeps_a_field_that_already_waited`, `applyRead_treats_unreadable_changelog_as_others`, `applyRead_merges_editor_names`, `markViewed_clears_editor_when_nothing_pending`, `keepOnly_drops_tickets_off_the_board`, `jiraAdf` -- đoạn văn, list, code block, mention.
- Server: `checker_skips_tickets_whose_updated_did_not_move`, `checker_reads_changelog_only_when_a_field_changed`, `checker_keeps_going_when_one_ticket_fails`, `checker_does_not_overwrite_a_view_made_while_it_read`, `viewed route marks the shown content`.
- Client: `TicketUpdateDialog lists only the changed fields with old and new values`.

### Task 5: Bug QC

**Files:**
- Modify: `packages/core/src/ticket.ts` -- `linkedKeys: readonly string[]`; `server/src/jira/parseJira.ts` + `jiraTracker.ts` -- đọc `issuelinks` (inward / outward key, đúng dạng key, bỏ trùng), thêm `issuelinks` vào danh sách field; `core/src/testing/ticketFixture.ts`; `board.json` cũ thiếu field thì `[]`
- Create: `packages/core/src/ticketBugs.ts` + `.test.ts` -- port `TicketBugs.cs`; `core/src/bugReply.ts` + `.test.ts` -- port `TeamsBugReply.cs`
- Modify: `packages/core/src/todos.ts` -- kind `qcBug` và `qcBugReply`; `notices.ts` -- event `qcBugFixed`, topic `teams`
- Create: `packages/server/src/workspace/bugFixes.ts` + `.test.ts` -- đọc bản nháp, tính trạng thái
- Modify: `teams/teamsWatcher.ts` -- cập nhật trạng thái đã trả lời, đọc thêm thread của ticket cha có fix chờ; `routes/workRoutes.ts` -- `POST /api/work/bugs/:key/fix`; `timesheet/timesheetService.ts` -- đổi key bug thành key cha khi log
- Modify: `packages/client/src/board/TodoRow.tsx`, `todoText.ts`; `workspace/teams/TeamsThread.tsx` -- thẻ trả lời cho QC

**Shape:**
```ts
export interface BugFix {
  readonly bugKey: string; readonly parentKey: string; readonly summary: string; readonly description: string
  readonly pullRequests: readonly { block: string; branch: string; url: string }[]; readonly draftWrittenAt: string
}
export function isBug(ticket: Ticket): boolean
export function parentOf(bug: Ticket, startedKeys: ReadonlySet<string>, doneKeys: ReadonlySet<string>): string | null
export function parseBugFix(parentKey: string, bugKey: string, draft: string, writtenAt: string): BugFix
export function isFixCurrent(fix: BugFix, bugStatusCategory: string | null, now: Date): boolean
export function qcToTag(thread: TeamsThread, myId: string): TeamsPerson | null
export function isFixReplied(thread: TeamsThread, myId: string, fix: BugFix): boolean
export function buildReplyHtml(fix: BugFix, qc: TeamsPerson | null): string
```

**Logic:**
- `parentOf`: bug là issueType Defect / Bug; trong `linkedKeys` lấy key đang In progress trước, rồi key Done; ticket cha chỉ ở New hoặc Dismissed không tính. Bug là bug khi nằm ở bất kỳ mục board nào (New, In progress, Done).
- Bản nháp: `docs/<PARENT>/bugs/<BUG>/teams-post.md` trong dev repo và trong worktree của cha (`worktreePathOf`); bản mới hơn theo mtime thắng. Dòng đầu là tiêu đề, phần sau tới `[block]` đầu tiên là mô tả, dưới mỗi `[block]` là các dòng `<branch>: <url>`. `isFixCurrent`: không quá 14 ngày và bug chưa Done.
- `qcToTag`: người khác (mri bắt đầu `8:orgid:`) nói gần nhất có "QC" trong tên, không có thì người khác nói gần nhất. `isFixReplied`: có tin của mình mới hơn bản nháp và văn bản chứa key bug. `buildReplyHtml`: `<p>` có chip mention QC (nếu có), "dạ e fix bug KEY r nha", mỗi dòng mô tả một `<p>` với `` `code` ``, `**đậm**`, `*nghiêng*` đổi thành tag (đã escape trước), rồi mỗi block PR một `<p>[block]<br>branch: <a>`.
- Fix action (`POST /api/work/bugs/:key/fix`): tìm `parentKey` từ board, mở tab ticket cha (`workspace.openTicketTab`), nếu worktree của cha không có thì trả lỗi `parentWorktreeMissing` (client hỏi tạo lại như nút Open), rồi `workspace.prompt(<phiên chính của cha>, "jira-fetch-bug <BUG>")`. Chỉ khi prompt đã gửi đi mới `board.start(bug)` (nếu bug đang New) và `timesheet.queueToday([parentKey])`; prompt lỗi thì trả lỗi và không đổi gì.
- Trạng thái đã trả lời: mỗi lần watcher đọc thread của ticket cha (post hoặc chat) thì cập nhật; trả lời ở bất kỳ thread nào của ticket cha là đủ, một thread chưa có không xóa trạng thái của thread khác. Fix chưa đọc lần nào thì chưa hiện to-do (tránh hiện to-do cho câu đã trả lời). Notice `qcBugFixed` đúng một lần mỗi bug mỗi phiên server khi chưa trả lời.
- Log: key bug nào có `parentOf` thì đổi thành key cha (và bỏ trùng) ngay trước khi queue / log, ở `timesheetService` (bản WPF: `LoggableKeys`, cũng đổi key nhánh làm việc về key Jira; impl-write kiểm web đã có bước đó chưa).
- Thẻ trả lời trong `TeamsThread`: hiện cho thread của ticket cha khi có fix chưa trả lời, nút "Use reply" đổ `buildReplyHtml` vào composer; gửi qua đường gửi hiện có.

**Tests:**
- Core, port từ `TicketBugsTests` / `TeamsBugReplyTests`: `parentOf_prefers_in_progress_over_done`, `parentOf_ignores_new_and_dismissed_parents`, `isBug_accepts_defect_and_bug_ignoring_case`, `parseBugFix_reads_description_and_pr_blocks`, `isFixCurrent_false_after_14_days_or_when_bug_done`, `qcToTag_prefers_a_sender_with_QC_in_the_name`, `isFixReplied_needs_my_message_after_the_draft_naming_the_bug`, `buildReplyHtml_tags_qc_and_renders_inline_markdown`, `buildReplyHtml_escapes_html`.
- Server: `fix_sends_jira_fetch_bug_to_the_parent_session_then_starts_the_bug`, `fix_changes_nothing_when_the_prompt_fails`, `fix_reports_parentWorktreeMissing`, `bugFixes_picks_the_newer_draft_copy`, `watcher_marks_a_fix_replied_from_any_thread`, `log_maps_a_bug_key_to_its_parent`, `parseIssue_reads_issuelinks_without_duplicates`.
- Client: `TodoRow qcBug shows Start / Fix`, `TeamsThread shows the reply card and fills the composer`.

---

## Thứ tự và kiểm tra

Làm tuần tự Task 1 đến 5 (2 và 3 không phụ thuộc nhau, 3 và 5 cùng sửa `teamsWatcher.ts` và `todos.ts`). Mỗi task xong chạy test của đúng workspace chạm tới; cuối plan chạy `npm run typecheck`, `npm run lint`, `npm test`. Giao diện kiểm bằng mắt sau (người dùng tự chạy), kể cả Guide, dialog dọn worktree, dialog "View changes" và thẻ trả lời QC.
