# Impl notes: timesheet

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Core: ngày, chia giờ, hàng đợi
- **Quyết định:** `parseTicketKeys` với `projectKey` null vẫn nhận key đủ dạng (`isTicketKey` sau khi viết hoa); số trơn và link thì vào `invalid`. Có `projectKey` thì key của project khác là `invalid`.
- **Quyết định:** `moveBoundary` làm tròn nửa về số chẵn như `Math.Round` của C#, không theo `Math.round` của JS.
- **Quyết định:** `setMinutes` throw khi số ticket và số phút lệch nhau, giống `ArgumentException` của C#.
- Thêm vài test ngoài danh sách: `isTicketKey`, `zonedClock` lúc nửa đêm, `entryMinutes`, `isTodayDue`, không mutate input.
- 157/157 test core PASS, typecheck và lint sạch.

## Task 2: Core: ô TSC, tuần, rà soát, port và kiểu API
- **Quyết định:** `cellsForDate` không có cột thì trả `[]`, không tự về M/J (mặc định thuộc config).
- **Quyết định:** `hrmWeekTotal` lấy tuần theo ngày đầu của `coverage` (rỗng thì theo `today`); `weekTicketTotals` bỏ task có `workingSeconds <= 0`, làm tròn phút bằng `Math.round`.
- **Quyết định:** `tscStateFor` coi ngày có trong `cells` với giá trị `null` là `read`.
- **Đánh đổi:** các field bắt buộc mới (`WorkdayConfig.timesheet`, `JiraConfig.mineJql`, `SettingsView.hrmKeySource`, `TicketTracker.filterMine`, mã `AppError` mới) làm typecheck của server và client đỏ cho tới Task 3 / 5 / 6.
- 197/197 test core PASS, typecheck core và lint sạch.

## Task 3: Server: config / secret của Timesheet và adapter HRM (MCP)
- **Lệch:** `McpSession` có thêm `listTools()` để `validate` mở phiên rồi liệt kê tool. Timeout 30s của mỗi lần gọi tool nằm trong `connectMcp` (`AbortSignal.timeout` mới cho mỗi lần thử); timeout 20s của `validate` dùng `Promise.race`.
- **Lệch:** việc làm cho server typecheck lại (field mới của core) gồm: `JiraTracker.filterMine` bản tối thiểu theo luật của Task 5 kèm test, `SettingsService.view()` trả `timesheet` / `hrmKeySource`, `FakeTracker.filterMine`, fixture test.
- **Quyết định:** lưu token Jira thì ghi lại cả `hrmApiKey` đang có trong file, vì `saveSecrets` ghi đè cả file; key lấy từ env không bao giờ bị ghi xuống đĩa.
- **Quyết định:** lời gọi tool bị throw (không phải lỗi nghiệp vụ) trong `logTickets` kết thúc cả lượt với `{ ok: false, detail }`, giống catch-all của C#. Lỗi đọc được ghi `console.warn` một dòng.
- **Lệch (client, sửa ở luồng chính):** client cũng typecheck lại: `mineJql` trong `jiraForm.ts` (giữ giá trị đã lưu) và fixture; `errorText` có text hai ngôn ngữ cho 11 mã mới (phần này của Task 6 làm sớm).
- Chưa thử với MCP server thật (để phần kiểm tra cuối). `@modelcontextprotocol/sdk` 1.32.2.
- Test server 137 PASS + 1 skipped, client 23 PASS; typecheck và lint toàn repo sạch.

## Task 4: Server: adapter TSC (Graph Excel + Playwright)
- **Quyết định:** `pickBroadestToken` / `hasAllScope` đặt trong `jwt.ts` để test được mà không import Playwright. Đọc header của request bằng `request.allHeaders()`.
- **Quyết định:** `BrowserLock.tryAcquire()` trả hàm nhả (gọi nhiều lần không sao) hoặc `null` khi bận.
- **Lệch:** không port bước dò Chrome qua registry; thiếu Chrome nhận ra từ lỗi lúc khởi chạy (`chromeMissing`), như plan.
- **Đánh đổi:** `signIn()` xóa cache trong lúc một lần sniff đang chạy thì token của lần sniff đó vẫn được cache sau đó; coi là vô hại.
- Đã thử Chrome thật: `launchPersistentContext` với `channel: chrome`, headless, khởi động và đóng được. Sniff, kiểm phiên và Sign in với trang thật chưa thử (để phần kiểm tra cuối). `playwright-core` ^1.65.0.
- Test server 160 PASS + 1 skipped; typecheck và lint sạch.

## Task 5: Server: TimesheetService, lịch log, REST và Settings
- **Lệch:** tách `timesheetService.ts` thành thêm `logEntry.ts`, `ticketCheck.ts`, `weekReader.ts` để mỗi file dưới 400 dòng.
- **Lệch:** `log` / `drain` bị từ chối vì `hrmClosedForToday` trả HTTP 409 `{ ok: false, error }`, vì `EntryOutcome` / `RunSummary` không chứa được lời từ chối. Client (Task 7) phải xử lý.
- **Lệch:** `TscSessionResult` / `TscSignInResult` chuyển sang `@workday/core` và thêm `detail` (luồng chính sửa), để client hiện chuỗi gốc trong tooltip như Assumption.
- **Quyết định:** drain không có gì để log ghi `lastRun.kind = nothingDue`; drain có lượt chạy thêm thì chờ lượt đó xong mới trả; catch-up không làm gì khi chưa kết nối TSC lẫn HRM; `LogScheduler.start` / `setLogTime` nhận thêm `timeZone`.
- **Đánh đổi:** drain cả hàng đợi vẫn gồm ngày hôm nay trước 18:00 (HRM từ chối, ngày đó ở lại hàng đợi), giống C#. Chỉ `drain { date: hôm nay }` bị chặn trước.
- **Review (task-reviewer, PASS):** đã sửa: lưu một secret không còn xóa secret kia trong file khi secret kia lấy từ env; drain lỗi thì reset cờ chạy thêm; `filterMine` và route kiểm ticket bỏ chuỗi không phải key; dời `logTime` muộn hơn sau khi đã chạy hôm nay không chạy lần hai; `/log` chặn tổng > 8h, key sai và ngày không có thật. Không sửa: cờ `reading` có thể tắt sớm khi hai lần đọc cùng tuần chồng nhau; Log OFF chạy đúng lúc drain đang chạy có thể bị drain ghi đè (khe rất hẹp, plan không tính).
- Sửa 4 comment > 25 từ của Task 1 / 3 cho convention lint.

## Task 6: Client: Settings > Timesheet
- **Lệch:** thêm `TscAdvancedFields.tsx`; `TokenField` nhận thêm `id`, `label`, `envText`, `helpText` để dùng cho key HRM. `toAppError` của `api/client.ts` nhận đủ mã mới (trước đó loại 11 mã này).
- **Quyết định:** nhóm HRM null khi URL và project id đều trống; nhóm TSC null khi share URL, mẫu sheet, cột và trang token đều trống. Server trả 400 không có mã, nên mọi 400 khi Save / Check HRM hiện "Enter the HRM key again for the new URL".
- **Đánh đổi:** test mới không được thấy đỏ trước (lỗi shell lúc ghi test lần đầu).
- Test client 33/33 PASS, typecheck và lint sạch.

## Task 7: Client: trang Timesheet
- **Lệch:** thêm file để mỗi file dưới ~300 dòng: `ActionMenu.tsx`, `TimesheetBanners.tsx`, `WeekTotals.tsx`, `useTimesheetActions.ts`, `useColumns.ts`, `timesheetState.ts`, `timesheetTestSupport.ts`. `Shell` gọi `useQuery` cho chấm ở mục Timesheet nên test của Shell cần QueryClient.
- **Quyết định:** cờ "lần đầu mở trang" nằm trong cache của QueryClient (`timesheetVisited`). Log now của thẻ ngày gọi `POST /drain { date }`; Log now của ô nhập gọi `/log` cả hai bên, TSC only / HRM only nằm trong menu "...". Từ chối của hàng đợi (200 `{ ok: false }`) và của `log` / `drain` (409) đều hiện qua `errorText` ở dòng trạng thái.
- **Quyết định:** chấm ở mục Timesheet hiện khi lời nhắc 18:00 hôm nay đã chạy mà hôm nay chưa xếp / chưa log, hoặc có ngày `due` trong hàng đợi. Thanh giờ có thêm phím mũi tên trái / phải (bước 30 phút).
- **Đánh đổi:** gõ dở key (ví dụ `MD`) hiện lỗi và tắt **+** cho tới khi key hợp lệ. Nếu lần `POST /week` đầu tiên lỗi thì lưới thẻ cứ mờ ("Reading...") cho tới khi có lần đọc mới (bấm đọc lại). Số cột của lưới (`ResizeObserver`) không có test vì jsdom không có.
- Test client 50/50 PASS.

## Kiểm tra cuối (luồng chính)
- `npm test` (core 197, server 197 + 1 skipped, client 50), typecheck, lint, convention lint, `npm run build` đều sạch.
- `npm start` với data dir tạm: `GET /api/timesheet` trả view rỗng, chưa kết nối; thêm `MDP-1, MDP-2` vào 2026-11-10 ghi `queue.json` cùng dạng WPF (không có `minutes`); thêm 300 phút vào ngày đó bị từ chối `overEightHours`; drain khi chưa kết nối giữ lại ngày đó với `timesheetNotConfigured`; `/timesheet` trả `index.html`.
- Chưa chạy với TSC / HRM thật (Sign in, sniff, ghi ô, log HRM, lịch 18:00): người dùng làm theo mục "Kiểm tra cuối giai đoạn" của plan.

## Sau giai đoạn 2: chép dữ liệu từ NOIS Workday (theo yêu cầu người dùng)
- `config.json` của Workday có thêm khối `timesheet`. URL HRM MCP, project id, share URL, URL các trang lấy token lấy thẳng từ code C#; `LOG_TIME 6:00 PM` -> `18:00`; cột `M, J` theo `TSC_GRAPH_COLUMNS`. `jira.mineJql` thêm `cf[11012]` (Contributor). Bản cũ giữ ở `config.json.before-timesheet`.
- `scripts/env-from-tokens.ps1` ghi thêm `WORKDAY_HRM_API_KEY` vào `.env` (từ `HRM_API_KEY` của `tokens.env`).
- Copy profile Chrome `~/.tsc-daily-log-browser` sang `<dataDir>/tsc-browser`, bỏ thư mục cache, nên không cần Sign in lại.
- Không copy `queue.json`: app WPF vẫn đang chạy và sẽ tự log hàng đợi của nó lúc 18:00; chép sang thì cả hai app cùng drain một ngày.
- **Sửa lỗi:** kiểm phiên TSC so `login` trên cả URL kể cả query string, nên báo "chưa đăng nhập" sai. Giờ chỉ xét host + path (`isSignedInUrl`, có test).
- Kiểm thật qua một instance tạm: Check HRM OK; Check TSC session `signedIn: true`; đọc tuần 2026-11-09 sniff ra token, đọc đúng TSC và HRM của T2-T5, rà soát không có mục nào.
