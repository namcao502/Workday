# Impl notes: web-foundation

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Scaffold repo và chuỗi dev / build / start
- **Lệch:** TypeScript `~6.0.3` chứ không phải 7, vì `typescript-eslint` 8.72 chỉ nhận `<6.1.0`.
- **Quyết định:** mỗi package có hai tsconfig: `tsconfig.json` (`noEmit`, gồm cả test, dùng cho typecheck và lint) và `tsconfig.build.json` (composite, bỏ test, có project reference). Script `typecheck` chạy theo từng workspace.
- **Quyết định:** cờ dev đặt bằng `--env-file=dev.env` (`WORKDAY_DEV=1`) thay vì `VAR=1 cmd`, vì cú pháp đó không chạy trên Windows. Port và host tạm lấy từ `WORKDAY_PORT` / `WORKDAY_HOST` cho tới Task 3.
- **Quyết định:** WebSocket không có header `Origin` thì cho qua (trình duyệt luôn gửi header này). Phần kiểm tra Host / Origin tách riêng ra `src/security/allowedHosts.ts` để Task 4 dùng lại.
- **Đánh đổi:** `prettier --write .` đã định dạng lại file trong `docs/` một lần, trước khi `.prettierignore` loại thư mục này ra. Chỉ đổi cách trình bày.
- Còn mở: `npm audit` báo lỗ hổng ở dependency gián tiếp; esbuild postinstall chưa nằm trong `allowScripts`. Cả hai chưa gây lỗi gì.
- Build PASS, 12/12 test PASS, typecheck và lint sạch.

## Task 2: Core: ticket, ngày theo múi giờ, parser, search, luật board
- **Lệch:** chưa tạo `api.ts`, vì Task 2 chưa có kiểu nào để đặt vào đó. Task 3 / 4 sẽ tạo.
- **Quyết định:** `applyLiveTickets` chỉ chuyển ticket sang `done` khi bản đang lưu chưa Done theo Jira, giống điều kiện `!storedTicket.IsStatusDone` của C#. Plan chỉ ghi "bản live đã Done".
- **Quyết định:** có thêm `TrackerValidation` (kiểu kết quả của `validate`) và `testing/ticketFixture.ts` (bộ dựng ticket cho test, không vào `dist`). Đã bỏ smoke test `CORE_NAME`.
- **Đánh đổi:** không port các test C# về poll lỗi, timeout, hủy và seen file hỏng / rỗng. Phía core, "chưa poll" chỉ là `seenKeys === null`; việc map file hỏng sang trạng thái đó thuộc store ở Task 3.
- Build PASS, 92/92 test core PASS (toàn repo 103), typecheck và lint sạch.

## Task 3: Server: data dir, config, secret, store JSON và adapter Jira
- **Lệch:** `readJson(path, parse, defaultValue)` có thêm tham số giá trị mặc định; `parse` trả `T | null` (null = không hợp lệ).
- **Quyết định:** `parentKey` chỉ nhận khi đúng dạng key (`^[A-Z][A-Z0-9]+-\d+$`). Nếu `/myself` không trả `displayName` thì `validate` dùng email thay vào.
- **Quyết định:** test của server tự dựng ticket, không import `makeTicket` từ core. Test quyền `0600` bị bỏ qua trên Windows (1 skipped).
- **Đánh đổi:** chỉ port các test parse search / issue; các test epic, changelog, transition, `MyTicketsJql` để giai đoạn của chúng.
- Hàm cho Task 4: `resolveDataDir`, `loadConfig` / `saveConfig`, `loadSecrets` / `saveSecrets`, `loadBoard` / `saveBoard`, `new JiraTracker(jiraConfig, token)`.
- Build PASS, test server 47 PASS + 1 skipped, typecheck và lint sạch.

## Task 4: Server: BoardService, lịch poll, REST và WebSocket
- **Lệch:** thêm `settings/parseSettings.ts`, `settings/settingsService.ts`, `services.ts` (phần ghép dùng chung cho `main.ts` và test) và `testing/*` (không vào build); plan không liệt kê các file này.
- **Lệch:** `PUT /api/settings` đổi Jira sang `baseUrl` khác mà không kèm token mới thì trả 400, nếu token lấy từ file. Token lấy từ biến môi trường thì không chặn, vì đó là người dùng tự chọn. Lý do: nếu không chặn, lần poll sau sẽ gửi token cũ tới host mới.
- **Quyết định:** add bị từ chối (`invalidKey` / `notFound` / `alreadyOnBoard`) trả HTTP 200 kèm `{ ok: false }`; chỉ `notConnected` trả 409; Jira lỗi trong lúc add thì báo `jiraUnreachable`. `jira: null` vẫn giữ token đã lưu. Scheduler chỉ khởi động lại khi Jira, token hoặc `pollMinutes` đổi. Port lấy từ config, biến `WORKDAY_PORT` vẫn ghi đè được khi dev.
- **Sửa sau review (task-reviewer, 2 vòng):**
  - Poll chỉ dùng chung một lần poll đang chạy nếu cùng tracker; kết quả của tracker cũ bị bỏ.
  - `commit` lưu xong mới gán vào bộ nhớ và broadcast.
  - Cập nhật settings dựng config mới, lưu, rồi mới áp vào bộ nhớ. Lưu token thất bại thì ghi lại config cũ (rollback).
  - `add` kiểm lại tracker trước khi commit.
  - Thêm test cho route action, add qua HTTP, broadcast `settings.changed`, và trường hợp một key lỗi khi poll.
- Build PASS, test server PASS, typecheck và lint sạch.

## Task 5: Client: khung app, theme, ngôn ngữ, Settings
- **Lệch:** thêm `styles/shell.css`, `api/useSettings.ts`, `json.ts`, `testSupport.tsx` và các component con của Settings (`AdvancedFields`, `TokenField`, `Segmented`, `jiraForm.ts`). `formatShortDate` nhận thêm tham số `timeZone`.
- **Quyết định:** ngôn ngữ giữ trong một biến cấp module (`setLanguage`), vì `t()` là hàm thường, không phải hook. App chưa vẽ gì cho tới khi `GET /api/settings` trả về, để theme đúng ngay từ đầu. JQL để trống thì gửi `''` để server dùng mặc định. Client không gửi `timeZone` / `pollMinutes`, vì chưa có ô nhập cho hai giá trị này.
- **Quyết định:** `setupTests.ts` gọi `cleanup()` sau mỗi test, vì Vitest chạy không có globals.
- **Đánh đổi:** implementer viết test cùng lúc với code, nên không thấy test đỏ trước.
- Test client 10/10 PASS, typecheck và lint client sạch.

## Task 6: Client: trang Tickets (board)
- **Lệch:** thêm `formatDateOnly` và `formatClock` vào `i18n.ts`, vì `formatShortDate` luôn kèm giờ. Thêm `board/board.css`, trạng thái "Loading..." và "No tickets".
- **Quyết định:** nút mở Settings dẫn tới `#/settings`, vì trang Settings chưa có anchor cho từng mục. Dòng ở Done / Dismissed không bao giờ tô màu hạn, kể cả khi server gửi `dueUrgency` khác. Việc tự chuyển view được tính ngay lúc render; view người dùng tự chọn được nhớ theo chuỗi search đã debounce.
- **Quyết định:** Add lỗi vì Jira hỏng thì hiện `jiraUnreachable`; Check now lỗi thì hiện `pollFailed`.
- **Đánh đổi:** test debounce dùng timer thật cộng `waitFor`; không thấy test đỏ trước. Menu dòng đóng khi bấm ra ngoài, nhưng chưa đóng bằng Esc và chưa điều khiển được bằng bàn phím.
- Toàn repo: client 21, core 92, server 74 (+1 skipped) PASS; typecheck, lint, build sạch.

## Kiểm tra cuối
- `npm start` (thư mục dữ liệu tạm, port 4871): `/api/health` OK; board `connected:false`; `/tickets` trả `index.html`; Host lạ bị 403; PUT theme / language được lưu; port 80 bị 400; `board.json` hỏng được giữ thành `.bad`, board rỗng, server không crash.
- `npm run dev`: Vite trả 200 và proxy `/api/health` sang server OK.
- Chưa kiểm với Jira thật (cần token của người dùng) và chưa xem giao diện trong trình duyệt: người dùng test tay.

## Sau giai đoạn 1: nhãn Settings > Connections (theo yêu cầu người dùng)
- Đổi tên các ô cho dễ hiểu: Jira site URL, Jira account email, Jira API token, Ticket key prefix (là Project key cũ), ETA date field id, Assigned tickets query (JQL), Statuses before work starts, Statuses that mean sent back. Mỗi ô có thêm một dòng gợi ý (`TextField` mới, gợi ý gắn bằng `aria-describedby`) và placeholder ví dụ.
- `npm start` / `npm run dev` đọc `.env` ở gốc repo nếu có (`--env-file-if-exists`). `scripts/env-from-tokens.ps1` tạo `.env` từ `tokens.env` của app WPF.
- Client 22/22 PASS, typecheck, lint và build sạch.
