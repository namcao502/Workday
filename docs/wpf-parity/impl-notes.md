# Impl notes: wpf-parity

## Task 1: Settings > Guide
- **Lệch:** bỏ cả mục Terminal (kể cả bullet chat view vì nó viết quanh thanh Chat | Terminal) và mục Mobile; bỏ thêm "Start with Windows". Guide hiện không nói về chat trong Workspace.
- **Quyết định:** `splitGuide` coi đoạn trước `##` đầu là `intro` (id `intro`); slug bỏ dấu, `đ` thành `d`. Fence mở bằng ``` hoặc ~~~.
- **Còn mở:** vài đoạn vẫn WPF-specific (mục Ticket/Tickets, "Moving to another PC" nhắc `%AppData%\NoisWorkday`, `.nwcred`), một dấu ngoặc về terminal trong đoạn TO DO. Người dùng soát chữ sau.
- Build: test client 32/32 (guide + settings), typecheck, lint, convention lint sạch.

## Task 2: Dọn worktree (core + server)
- **Lệch:** Remove từ chối khi `dirtyFiles` khác số client gửi (C# chỉ từ chối khi cao hơn). Remove sync docs của ticket từ worktree BE về checkout chính trước khi xóa, như C#. Slim quét docs của checkout chính và mọi thư mục dưới `.claude/worktrees`, từ chối `hasWorktree` khi ticket còn worktree.
- **Quyết định:** đếm file dirty bỏ qua `config.workspace.localOnlyPaths` thay cho hai file hardcode; key tìm từ mọi `docs/*` qua `isCleanupKey`; `sessionRunning` gồm cả session không thuộc ticket mà cwd nằm trong worktree của nó. `WorkspaceService.runningTicketKeys()` mới.
- **Còn mở:** xóa worktree chưa đóng tab Workspace của ticket (C# có `PruneTicketTabs`); client phải refetch workspace hoặc service broadcast `workspace.changed`. Chưa port action Mine (`KnowledgeMiner.Mine`), plan không nêu.
- **Gate:** test cleanup lần đầu fail 2 test do timeout 5s mặc định (git thật, máy nguội); thêm `vi.setConfig({ testTimeout: 30_000 })` vào 2 file test. Core 9/9, server 14/14, typecheck, lint, convention lint sạch.

## Task 2: Dọn worktree (client)
- **Lệch:** không có nút "Remove all ready" / "Slim all mined" ở đầu dialog như WPF (plan không nêu). Test viết cùng lúc với code, không thấy đỏ trước.
- **Quyết định:** text lỗi của `CleanupOutcome` nằm trong `workspace/cleanupText.ts`, không vào `errors.ts` (file đó chỉ dịch `AppError`). Sau Remove / Slim, client invalidate cả key gốc `['workspace']`.
- **Còn mở:** server chưa đóng tab Workspace của ticket sau khi xóa worktree; cần kiểm bằng mắt, nếu tab còn thì server phải đóng.
- Gate: CleanupDialog + WorkspacePage test, typecheck, lint, convention lint.

## Task 3: DB review (core + server)
- **Lệch:** notice là tone info, topic `teams` như plan (WPF dùng topic TeamsMention, tone success). `isDbReviewChannel` so tên trim + không phân biệt hoa thường, không bỏ ký hiệu như `SameName` của C#. Route Done không `markReadAt` notice `teams:<key>`.
- **Quyết định:** kênh DB review phải nằm trong `watchedChannels` (`lookup.channels()` chỉ trả kênh đang watch, index bài chỉ dựng cho chúng), giống WPF. Đặt `dbReviewChannel` mà không watch thì không có approval. `dbReviewChannel` chỉ nhận khi cả hai tên không rỗng sau trim. To-do `dbReview` đứng sau `teamsMessage`, không "needed now". `teamsForm.ts` mang `dbReviewChannel` qua nguyên vẹn để lưu Settings không xóa nó.
- **Đánh đổi:** test viết cùng lúc với code, không thấy đỏ trước.
- **Còn mở:** client chưa có dòng to-do `dbReview` và ô cấu hình kênh (typecheck client đỏ tới khi xong phần client).

## Task 3: DB review (client)
- **Lệch:** nút Copy SQL hiện cả với thiết bị từ xa, chỉ Done bị khóa theo `canAct`. Thêm một test ngoài plan: không lưu khi chỉ điền một trong hai tên kênh.
- **Quyết định:** action Done nằm trong `useWorkActions` (tự refetch work), hàm gọi API nằm ở `teamsApi.ts`. To-do `dbReview` tone warning, icon `D`.
- Gate: test client toàn bộ, typecheck, lint toàn repo, convention lint sạch.

## Task 4: Báo ticket đổi trên Jira (A: core + đọc Jira)
- **Lệch:** `applyRead` nhận thêm tham số thứ sáu `fieldIds: TicketFieldIds` (ETA / dev priority), vì ánh xạ history -> field cần id cấu hình; `fieldOfId` dùng cùng kiểu, id có thể null (null không bao giờ khớp). `ChangeHistory.created` là ISO; `parseJiraTime` (export từ core) đổi `+0700` thành `+07:00`.
- **Quyết định:** changelog đọc trang đầu 100 dòng, nếu tổng lớn hơn thì đọc trang mới nhất, như C#. History không parse được giờ thì bị bỏ. Tên `adfToText`, `parseTicketContent`, `parseChangelogPage` do implementer đặt. Checker (đợt B) phải truyền cùng `{ eta, devPriority }` đã dùng cho tracker khi gọi `applyRead`.
- Gate: core 18, server jira 33, typecheck, lint, convention lint sạch.

## Task 4: Báo ticket đổi trên Jira (B: server, notice, to-do)
- **Lệch:** `afterPoll(tracker, jira)` là dep tùy chọn của `BoardService`, không được await: poll, `POST /api/board/check` và scheduler không chờ các lần đọc Jira của checker (checker tự tuần tự hóa). Lỗi hoặc throw của nó chỉ được log. `FakeTracker.getChangeHistories` nhận key và ghi `historyCalls`.
- **Quyết định:** to-do `jiraUpdated` đứng sau `dbReview`, trước `readyToTest`, sắp theo `changedAt` mới nhất trước; không có `changedAt` thì cuối. Notice topic `jira`, tone info, place `ticket-update:<key>`, target board. `keepOnly` loại cả ticket dismissed (đúng spec) nên update của ticket dismissed bị xóa ở lần check sau. Client: thêm icon `J` và `todoText` case cho `jiraUpdated`, `buttonsFor` trả `[]` tới khi có dialog (đợt C).
- **Đánh đổi:** checker đọc từng ticket một, board lớn thì nhiều call Jira tuần tự mỗi poll, chưa giới hạn song song. Một field đang chờ mà không "mới" thì không báo lại (như C#).
- Gate: core 21, server 333, client board 28, typecheck, lint, convention lint sạch.

## Task 4: Báo ticket đổi trên Jira (C: client)
- **Lệch:** test viết cùng lúc với code, không thấy đỏ trước. Thêm 2 test ngoài plan: dialog "Nothing changed", và Seen bị ẩn khi thiết bị chỉ có quyền view.
- **Quyết định:** hai action `ticketUpdateViewed` / `ticketUpdateSeen` nằm trong `WorkActions` (`useWork.ts`) để tự refetch work. Seen gọi GET rồi POST `current`, bỏ qua im lặng khi update null. Hook `useTicketUpdate` dùng `gcTime: 0` để mở lại dialog không hiện bản cũ. Dialog hai cột Before / After, không diff từng dòng (như plan).
- Gate: test client toàn bộ, typecheck, lint, convention lint sạch.

## Task 5: Bug QC (A: core + issuelinks)
- **Lệch:** `buildTodos` chỉ liệt kê `qcBug` cho bug còn ở `board.new`, và bỏ dòng overdue của bug đó để không hiện hai lần (như C#). Thêm file test `parseJira.test.ts`. Sửa tối thiểu ngoài danh sách: `todoText.ts` / `TodoView.tsx` (icon `Q`, nút rỗng), `workView.ts` truyền `qcBugs: []`, `bugFixes: []` (đợt B phải thay bằng dữ liệu thật).
- **Quyết định:** `Ticket.linkedKeys` lấy outward rồi inward, bỏ key sai dạng và trùng, giữ thứ tự Jira; `board.json` cũ thiếu field thì `[]`; `wpfImport` tách chuỗi `LinkedKeys` của WPF. `qcBugReply` đứng trước `qcBug` sau `dbReview`, cả hai needed-now, nhóm theo key bug.
- **Còn mở:** chip mention trong `buildReplyHtml` dùng `<span class="mention" data-mri>` như WPF, khác markup mention của `teamsCompose` (itemtype / itemscope / itemid) mà composer web dùng: đợt B/C phải kiểm và đổi cho khớp composer. Chưa có topic / place / target cho notice `qcBugFixed` (server chọn).
- Gate: core 558, server 684 (+1 skip), typecheck, lint, convention lint. Lần chạy đầy đủ đầu tiên của server fail rồi lần sau pass, chưa tìm ra test nào flaky.

## Task 5: Bug QC (B: server)
- **Lệch:** chip mention của `buildReplyHtml` đổi sang dạng composer web hiểu (`<span data-mention="0">@Name</span>` + mảng `mentions`), thêm `replyMention(qc)` và kiểu `BugReply`; thẻ `bugReplies` có thêm `mentions` ngoài `{fix, replyHtml}`. Web không có ánh xạ key nhánh làm việc về key Jira (`isTicketKey` đã loại key nhánh), nên chỉ port bug -> cha.
- **Quyết định:** bản nháp đọc mỗi lần Teams check (~2 phút), không theo sự kiện board như WPF. Bản nháp đổi giờ thì reset trạng thái replied / announced (thêm so với WPF). Notice `qcBugFixed` raise sau khi đọc hết thread của lần check để target là thread QC nói gần nhất; thread đang mở trên màn hình chỉ đánh dấu announced, không notice. Khi `minutes` là null thì dedupe key sau khi đổi bug về cha; có minutes thì chỉ đổi, không bỏ, để mảng minutes còn khớp.
- **Route:** `POST /api/work/bugs/:key/fix` -> 200 `{ok:true}`; 400 `invalidKey`; 404 `notABug`; 409 `busy`; 200 `{ok:false,error:{code:'parentWorktreeMissing',parentKey}}` hoặc `claudeWaiting` / `claudeNotRunning` / `sessionNotFound`. Bug chuyển started và cha vào queue chỉ sau khi prompt đã gửi.
- **Còn mở:** không cấu hình Teams chat thì `check()` thoát sớm nên không có to-do trả lời. Kết quả `queueToday` bị bỏ qua sau khi prompt gửi (như WPF).

## Task 5: Bug QC (C: client)
- **Lệch:** không có nút tạo lại worktree khi `parentWorktreeMissing`, chỉ có thông báo nêu key cha (board không có đường tạo lại cho dòng to-do ngoài nút Start của overdue). Nút Fix không bị khóa khi đang chạy (server có mã `busy`). Thẻ trả lời chỉ hiện ở trạng thái thread, không hiện ở `notPosted`.
- **Quyết định:** `fixBug` trả `{ok:false, error: AppError}` thay vì throw vì `ApiError` không mang `parentKey`. "Reply" đi tới `#/workspace/<parent>?teams=` (rỗng = hội thoại mặc định). "Use reply" nạp `replyHtml` + `mentions` vào ô trả lời bằng cách mount lại composer với id mới, không tự gửi.
- **Còn mở:** Reply giả định tab Workspace của cha mở được; nếu worktree cha đã bị xóa thì chưa kiểm.

## Kiểm tra cuối
- `npm test` (từng workspace): client 199, core 558, server 704 + 1 skip PASS. `npm run typecheck`, `npm run lint`, `npm run build`, convention lint sạch. Không chạy `npx vitest run` từ gốc repo cho client: môi trường jsdom của client chỉ đúng khi chạy theo workspace (từ gốc ra 168 lỗi giả).
- Chưa kiểm bằng mắt và chưa kiểm với Jira / Teams / Azure DevOps thật: Guide, dialog dọn worktree (và tab Workspace có đóng sau khi xóa không), to-do DB review, dialog View changes, nút Fix / thẻ trả lời QC.
- Chưa commit (người dùng commit tay).
