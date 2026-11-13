# Impl notes: teams

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Core: đọc Teams (parse, lọc HTML, kênh, chat, nhắc)
- **Lệch:** tách thành `teamsChat.ts` (kiểu + thao tác), `teamsParse.ts` (parse), `teamsHtml.ts` (`safeHtml`, `toPlainText`, url AMS), `teamsTags.ts` (quét thẻ / thuộc tính). Regex thẻ của C# backtrack bậc hai trên chuỗi thiếu dấu nháy -> thay bằng bộ quét tuyến tính (O(n log n)), có test thời gian 200 ms cho 7 kiểu input xấu (case `<b>`/`</zz>` từng chậm khi máy bận, đã giảm cỡ).
- **Quyết định:** `conversationKey` = `<ticket>|<conversationId>[;messageid=<root>]` (có tiền tố ticket, khác C#). Ảnh không phải AMS thành chữ `[image]` (không có deep link). Bỏ nhánh code block / marker / highlight; `<pre>` là thẻ thường. `composetime` không có offset coi là UTC. Không port `parseChats` (chat đã parse đưa vào `findTicketChats`).
- **Đánh đổi:** test viết cùng lúc với code, không chạy đỏ trước.
- Test core 468 PASS; typecheck, lint, convention lint sạch.

## Task 2: Core: soạn tin, bài post, chỉ mục bài post
- **Lệch:** port thêm `toHtml` (markdown nháp -> HTML, `paragraphsFromText` cần); export `htmlDecode`, `escapeHtml`, `indexAfterClosingTag` từ `teamsHtml.ts` và helper `emptyChannelIndex()`. `withPosts` tự tỉa bài > 200 ngày (C# làm ở `Update`).
- **Quyết định:** `buildBody` dùng bộ quét của `teamsTags.ts`, không regex backtrack, có test thời gian; body chỉ còn `<br>` / `&nbsp;` -> null. `pre` / `code` là thẻ thường (không có code block). `isEditable` false khi có `img` hoặc span không phải mention. Nháp xuống dòng bằng `\n`. `resolvePostLead` so tiền tố không phân biệt hoa thường; không có lead thì bỏ `{lead}` và dấu phẩy / khoảng trắng đứng đầu phần còn lại. Code giữ ASCII (chữ Việt viết bằng `\u`).
- Test core 510 PASS; typecheck, lint, convention lint sạch.

## Task 3: Server: sniff token Teams, client API chat, config
- **Lệch:** tách `teamsSession.ts` (logic thuần của sniff), `teamsSniffer.ts` (Playwright, chưa có unit test), `teamsHttp.ts` (cache phiên, sniff dùng chung, timeout 20 s), `parseTeams.ts`; `parseChats` thêm vào core `teamsParse.ts`. Session mang thêm `myId`, `myName`, `expiresAt`. Thêm lỗi `TeamsBusy` ở core. `image` nhận cả url full-size AMS (như `IsLoadableAmsImageUrl` C#). 401 sniff lại một lần rồi gửi lại (như C#, kể cả ghi), 401 lần hai -> `TeamsSignedOut`. 4xx khác -> `TeamsHttpError`. `amsreferences` gửi `[]`.
- **Quyết định:** một `TeamsChatClient` sống suốt đời app (`options.teams` để test thay); `settings.teams()` null khi không có kênh theo dõi. `jwt.ts` thêm `jwtClaim`. Gate sửa tay: port core dùng `Uint8Array` thay `Buffer`.
- Chưa chạy sniff / sign-in thật trong trình duyệt.
- Test core 512, server 531 + 1 skip, client 120 PASS; typecheck, lint, convention lint sạch.

## Task 4: Server: TeamsService (bài post, hội thoại, ghi, ảnh, hand-off) + route
- **Lệch:** tách `teamsLookup.ts` (chỉ mục, danh sách cache, người, postedAt, dựng options), `teamsWrites.ts` (ghi), `teamsDraft.ts` (nháp); thêm `testing/fakeTeams.ts`, `testing/teamsServiceRig.ts`. Thêm AppError `claudeNotRunning` / `claudeWaiting`. `WorkspaceService` thêm `promptState` / `prompt` (bracketed paste, kiểm lại trước Enter sau 150 ms) và theo dõi "Claude đã thoát về shell" (`SessionEnd` không phải `clear`); hook settings đăng ký thêm `SessionStart` để xóa cờ đó khi claude chạy lại.
- **Quyết định:** edit / delete / react / reply / hand-off đọc lại thread từ server theo conversation id (phải là bài trong chỉ mục hoặc chat của ticket), không tin thread của client; sửa / xóa tin người khác -> `forbidden`; sửa root phải giữ key ticket trong tiêu đề. Lỗi ghi trả 200 `ok: false`, chỉ request sai dạng mới 400. `status().signedIn` theo lần đọc / sign-in gần nhất. Sync tối thiểu 3 trang mới nhất; link quét sâu bị từ chối thì quét lại từ đầu; kênh được chọn sync trước để có ngân sách trang.
- **Đánh đổi:** cờ "không chắc đã gửi" của reply nằm trong bộ nhớ (restart thì quên); `postedAt` của bài post lưu đĩa. Không broadcast event sau khi ghi, client tự đọc lại.
- **Review (task-reviewer opus): FAIL -> sửa -> PASS.** Đã sửa: hand-off từ chối khi Claude đã thoát về shell, Enter không còn có thể trả lời hộp quyền vừa mở, đăng xong mà lưu lỗi vẫn trả ok và chặn đăng lần hai, escape tên người gửi và dòng `>>>` trong file hand-off, dọn file hand-off không làm hỏng lần gửi khác, `withPosts` trả object cũ khi không đổi, `searching` chỉ xét kênh được chọn, xóa hàng đợi ghi đã xong.
- Gate sửa tay: `teamsParse.ts` bỏ `new URL` (build core không có kiểu `URL`).
- Test core 513, server 574 + 1 skip, client 120 PASS; typecheck, lint, build, convention lint sạch.

## Task 5: Server: nhắc tin Teams (watcher, notice, to-do, đã xem)
- **Lệch:** `PollScheduler` thêm `firstPollMinutes` tùy chọn (lần kiểm đầu sau 1 phút); `TeamsService.configure` trả có đổi hay không và có `onSignedIn` để watcher chạy lại sau đăng nhập; `teamsLookup` mở `changeState` / `marks`. Thêm `TeamsReadView` (view + `pending`) trong `api.ts`. Client chỉ sửa tối thiểu cho typecheck (`todoText.ts`, `TodoView.tsx`, `NoticesSection.tsx`); target `teams` tạm mở board tới Task 6.
- **Quyết định:** `seen` cho hội thoại không nằm trong danh sách chờ thì đọc live và dời cả mốc đã xem lẫn đã báo tới tin mới nhất, để tin vừa tới mà người dùng đã đọc không bị nhắc lại. Lỗi khác `TeamsSignedOut` chỉ log, lịch vẫn chạy. Notice chỉ thêm sau khi lưu mốc. Dòng `teamsMessage` sắp cũ nhất trước.
- Test core 513, server 580 + 1 skip, client 120 PASS; typecheck, lint, convention lint sạch.

## Task 6: Client: view Teams trong Workspace
- **Lệch:** thêm `TeamsPanels.tsx`, `TeamsEmoji.tsx`, `teamsContent.ts`, `api/teamsApi.ts`. Notice Teams mở `#/workspace/<KEY>?teams=<conversationId>` (selection bỏ qua phần query; `navigateToWorkspace` có tham số thứ ba) và hiện lại khung trái nếu đang ẩn. Chấm trên view Teams lấy từ to-do `teamsMessage` của `/api/work` (không đọc Teams nền), cộng `pending` của lần đọc khi view đang mở.
- **Quyết định:** server gửi nội dung thô; client chạy `safeHtml` (core) -> DOMPurify -> `DOMParser` trơ, gắn `src` proxy cho ảnh AMS từ `data-src`, link mở tab mới `noopener noreferrer`. Query key gồm hội thoại nên kết quả về muộn của hội thoại cũ không hiện. Hội thoại trong `pending` được đánh dấu đã xem khi mở và khi cửa sổ focus. Composer / bài post / sửa tại chỗ để chỗ cho Task 7 (`onEdit` tùy chọn). Mã lỗi Teams + `claudeNotRunning` / `claudeWaiting` thêm vào `PLAIN_CODES`.
- Test client 126 PASS; typecheck, lint, build, convention lint sạch.

## Task 7: Client: trình soạn, bài post, Settings > Teams, to-do
- **Lệch:** composer tách `TeamsComposer.tsx`, `TeamsComposerToolbar.tsx`, `teamsComposerDom.ts`, `TeamsComposeParts.tsx` (reply / edit box), `teamsSend.ts`. Bỏ prop `onEdit` tạm của Task 6, sửa tại chỗ do `TeamsView` quản. Chữ ký so dữ liệu của `notPosted` gồm cả nháp và `posted` để card theo được nháp server. `NoticesSection` thêm 2 dòng `teams` / `teamsMention` (trước đó có nhãn mà chưa có dòng).
- **Quyết định:** định dạng dùng `document.execCommand` (cách duy nhất cho `contentEditable`, tắt rule deprecated đúng khối đó). Link nhập bằng ô inline, chỉ http(s); dán chỉ text thuần. Mất kết nối khi gửi coi như `uncertain`, lần gửi sau kèm `confirm: true`. Card bài post không có danh sách người (view `notPosted` không trả `people`) nên chưa tag được ở đó.
- Chưa thử trong trình duyệt thật (Backspace trên chip, toolbar, chèn link chỉ test bằng jsdom).
- Test core 513, server 580 + 1 skip, client 135 PASS; typecheck, lint, build, convention lint sạch.

## Kiểm tra cuối (luồng chính)
- `npm test` (core 513, server 580 + 1 skip, client 135), typecheck, lint, convention lint, `npm run build` sạch.
- Bản build với data dir tạm: `/api/teams/status` -> `configured: false`; `GET /api/teams/ABC-1` -> `notConfigured`; request có `cf-ray` -> 403; proxy ảnh với host không phải AMS -> 400; key sai -> 400.
- Chưa thử với Teams thật (sign-in, sniff, đọc / ghi API nội bộ) và chưa xem giao diện trong trình duyệt: người dùng làm theo mục "Kiểm tra cuối giai đoạn" của plan.
