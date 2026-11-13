# Impl notes: board-notices

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Core: theo dõi PR, các bước Ready to Test, deploy dev
- **Lệch:** sửa thêm `client/src/settings/jiraForm.ts` để Save settings không xóa `readyToTestPath` / `developerStatuses` (chưa có ô nhập; Task 8 thêm).
- **Quyết định:** `now` của `devDeploys` là chuỗi ISO như các thời điểm khác; export thêm `reviewRequestKey` (`repo|id`), `shippedKeys`, `targetSuffix`. Không port `MarkSeen` / `Remove` / `KeepOnly` / `AreSame` / `StatusGlyph` / tên app FE.
- Test core 399 PASS; typecheck, lint, convention lint sạch.

## Task 2: Core: to-do, gợi ý ticket, thông báo và kiểu API
- **Lệch:** để typecheck qua, server `config.ts` / `settingsService.ts` / fixtures chỉ nhận giá trị mặc định (`azureDevOps: null`, `notices: {}`, `suggestions: null`, `adoPatSource: null`); parse thật ở Task 3. Client `errors.ts` dịch 3 code mới; `jiraForm.ts` giữ `suggestions` đã lưu.
- **Quyết định:** dòng `prReview` không có ticket nên thành nhóm riêng (key `prReview|prReview`); export thêm `TodoWait`, `RankOptions`; epic tháng parse bằng regex + bảng tên tháng tiếng Anh; câu `movedToReadyToTest` / `suggestionsUrgent` tự viết (C# không có câu tương ứng).
- Test core 428, server 403 + 1 skip, client 107 PASS; typecheck, lint, convention lint sạch.

## Task 3: Server: config, PAT, adapter Azure DevOps, Jira ghi
- **Lệch:** bỏ mặc định repo `Backend-DotNet` của C# (riêng công ty): refs của nhánh phụ đọc trong các repo đã có PR của ticket + các key của `repoLabels`; PR / build không có tên repo bị bỏ. Ticket key của review request = `KEY-123` viết hoa đầu tiên trong tên nhánh. Chưa port `ParseThreads` / `GetThreadsAsync` (ngoài phạm vi).
- **Quyết định:** thêm `AdoCheckRequest` / `AdoCheckResult` vào `api.ts`; `export type *` cho `notices` / `ticketSuggestions` trong core index; `suggestions` chỉ khác null khi đủ 4 JQL / tiền tố. `PUT` đổi org mà không gửi PAT mới -> 400. `SettingsService.pullRequests` là getter cho các task sau; `createPullRequests` tiêm được trong `services.ts`.
- Adapter ADO và Jira ghi chỉ test với fetch giả, chưa gọi thật.
- Test server 452 + 1 skip, client 107 PASS; typecheck, lint, convention lint sạch.

## Task 4: Server: NoticeService, route chuông, thông báo Claude chờ
- **Lệch:** thêm `notices/claudeWaitNotice.ts` (dựng notice Claude; subject `Dev repo` khi tab terminal không có thư mục). `notices.js` / `ticketSuggestions.js` trong core index thành export giá trị.
- **Quyết định:** `onWait` / `onSeen` là dep tùy chọn của `WorkspaceService`; `onSeen` chạy mỗi lần `seen()`, không có gì để đọc thì không lưu / broadcast. Settings broadcast `notices.changed` khi prefs hoặc ngôn ngữ đổi. Notice đã đọc từ trước restart quá 1 ngày biến mất ở lần `view()` đầu (đúng luật hết hạn).
- Test server 464 + 1 skip, client 107, core 428 PASS; typecheck, lint, convention lint sạch.

## Task 5: Server: PrService (kiểm PR, Ready to Test, deploy dev)
- **Lệch:** tách thêm `prs/prPass.ts` (đọc PR, luật work branch, áp lượt), `prs/prNotices.ts` (dựng notice) và `prs/prTestSupport.ts` để mỗi file < 300 dòng. `commentAlerts` chỉ giữ key còn trên board (như `KeepOnly` C#, plan không nói).
- **Quyết định:** `refreshTicket` dùng `applyLiveTickets` nên cũng chuyển ticket sang Done nếu Jira đã Done. Walk tay không có tracker -> `notFound`, không notice; walk tay ném lỗi -> notice `transitionFailed` (bước đang đi, hoặc bước cuối nếu lỗi lúc đọc ticket) rồi ném lại để route xử lý. Conflict trỏ về board, build lỗi / vote trỏ URL PR; mọi notice trừ comment có place `board`. `lastCheck().ok` false chỉ khi lỗi mạng / lỗi bất ngờ.
- **Đánh đổi:** test viết sau code. Khi một walk tay đang chạy, `auto` trả false nên notice `deployed` có thể là `moved: false` (hiếm, vô hại).
- **Review (task-reviewer opus, PASS):** đã thêm test cho check dùng chung, client đổi giữa lượt, `hideReview`, notice review / deploy, `refreshTicket`, scheduler start / stop; thêm notice khi walk tay lỗi; tỉa comment alert.
- Test server 491 + 1 skip PASS; typecheck, lint, convention lint sạch.
- Một lần chạy gate có 9 test lỗi (hook, remote, gitChanges: các test có timeout) rồi 3 lần chạy lại đều PASS; nhiều khả năng do agent còn chạy test cùng lúc. Theo dõi tiếp ở gate cuối.

## Task 6: Server: gợi ý ticket, `GET /api/work` và route ghi
- **Lệch:** export thêm `epicMonth` (core) để biết epic đã lưu là của tháng nào; core index export giá trị `todos.js`. Take / Ready to Test khi Jira chưa kết nối -> 409 `notConnected`; Jira lỗi -> 500 `jiraUnreachable`. Route comment seen / hide review cần ADO -> 409 `adoNotConfigured`. Lỗi trả `{ ok: false, error: { code } }` như `boardRoutes`.
- **Quyết định:** hide / take bỏ key khỏi `items` trực tiếp, không xếp hạng lại; không thêm notice cho take / hide. Notice `suggestionsUrgent` target board, place `board`. Gate sửa tay: `stopWords` truyền `projectKey` viết thường như plan (implementer để `[]`).
- Test server 499 + 1 skip PASS; typecheck, lint, convention lint sạch.

## Task 7: Client: view To do, pill PR, Ready to Test, Available to take
- **Lệch:** view mặc định vẫn là Working (To do đứng đầu danh sách nhưng không chọn sẵn). Số `attention` gắn lên mục Tickets của sidebar (trang board). Thêm `board/todoText.ts`, `useReadyToTest.tsx` (dialog xác nhận + dòng kết quả dùng chung cho to-do và menu dòng), `workTestSupport.ts`.
- **Quyết định:** `prComments` chỉ có một nút View PR (mở PR + gọi seen). Nhãn repo và status ưu tiên đọc từ query settings (chỉ local); thiết bị từ xa thấy tên repo thô và không có chi tiết status ưu tiên. Tiêu đề Claude chờ không có nhãn session phụ / terminal như C#. Không có nút "Show hidden" (server không có route).
- Test client 114 PASS; typecheck, lint, convention lint sạch.

## Task 8: Client: chuông, toast, thông báo desktop, Settings Azure DevOps / Notices / trạng thái
- **Lệch:** đích board là `#/tickets` (không có trang `board`). Chuông nằm trong thanh `shell-topbar` mới ở đầu `<main>` (không sửa `TabBar.tsx`), hiện cả trên PC và điện thoại. Dòng board có `data-ticket-key` để cuộn tới. `i18n.ts` export `getLanguage()`; bỏ export `newWaits` (không còn ai dùng).
- **Quyết định:** Notices lưu ngay mỗi lần đổi checkbox (như panel C#), chỉ gửi kênh khác mặc định; Restore defaults gửi `{}`. Xóa cả organization và project -> `azureDevOps: null`; dòng nhãn repo không có `=` thì nhãn là tên repo. Suggestions lưu null khi cả 3 JQL / tiền tố trống.
- **Gate sửa tay:** `npm run build` lỗi TS6307 vì `prs/prTestSupport.ts` (Task 5) import `testing/fakes.ts` ngoài build; chuyển thành `testing/prHarness.ts`.
- Chưa xem layout thanh trên trong trình duyệt.
- Test client 120 PASS; typecheck, lint, convention lint, build sạch.

## Kiểm tra cuối (luồng chính)
- `npm test` (core 428, server 499 + 1 skip, client 120), typecheck, lint, convention lint, `npm run build` sạch.
- Chạy bản build với data dir tạm: `/api/work` và `/api/notices` trả view rỗng đúng dạng (`suggestions: null`, `adoConnected: false`); request có `cf-ray` -> 403; key sai -> 400; Ready to Test khi chưa nối Jira -> 409 `notConnected`; ADO check với PAT giả -> `adoRejected`; client phục vụ 200.
- Chưa thử với Azure DevOps / Jira thật, chưa xem giao diện trong trình duyệt.
