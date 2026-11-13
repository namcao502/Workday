# Impl notes: insights

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Core: đếm transcript Claude và số liệu theo ngày
- **Lệch:** không port `SavedSessions` / `ContextPercent` (không có trong shape). `combineAgentStats` nhận danh sách phẳng: bỏ trùng session live / đã lưu là việc của nơi gọi (Task 3). List rỗng -> stats rỗng thay vì null. `tallyTranscript` trả `subagents: []` (C# lấy subagent từ nguồn khác, Task 3 đọc).
- **Quyết định:** dòng không có timestamp (và chưa có timestamp trước đó) không vào ngày nào và không vào compact / skill / lỗi API. Múi giờ lạ rơi về UTC+7. Export thêm `AgentToolUsage`, `EMPTY_DAY_USAGE`, `addDayUsage`.
- Test core 527 PASS; typecheck, lint, build, convention lint sạch.
- Gate: 4 test "hostile input" của Teams (GĐ 5b) lỗi vì giới hạn 200 ms tuyệt đối khi máy bận. Đổi sang so độ tăng (thời gian ở 4n < 10 x thời gian ở n + 50 ms, và < 2 s): bậc hai vẫn bị bắt, máy chậm không làm đỏ.

## Task 2: Core: commit, dựng báo cáo, xuất, khoảng thời gian
- **Lệch:** `TicketReportInput` có thêm `timeZone?` (mặc định `Asia/Ho_Chi_Minh`) để biết ngày của `lastActivity` / skill / compact / lỗi API; server phải truyền `config.timeZone`. CSV gộp cột PR + Flow của C# thành một cột `Section`. Không có commit theo ngày (shape không có), test C# phần đó bỏ.
- **Quyết định:** `parseNumstat` nhận output một repo, cộng giữa repo bằng `addCommits`. Export thêm `agentInRange`, `totalTokens`. `hoursByDay` rỗng khi HRM không đọc được; `tokensByDay` có đủ mọi ngày trong khoảng. Regex key phân biệt hoa thường như C#, tiền tố được escape.
- Test core 544 PASS; typecheck, lint, build, convention lint sạch.

## Task 3: Server: đọc số liệu Claude, commit, gom báo cáo + route
- **Lệch:** thêm `insights/createInsights.ts` (nối các phần), `timesheetService.hrmTasks(from, to)`, export `matchesGlob` của `ticketWorktrees.ts`, `readTranscriptLinesAsync` trong `transcriptReader.ts`; AppError `insightsFailed`. Subagent đọc từ `<session>/subagents/agent-*.jsonl` + `.meta.json` (như C#), tool của subagent cộng vào session.
- **Quyết định:** cache theo file (size + mtime), chỉ tally lại khi đổi (C# đọc tăng dần theo offset). Đọc file bất đồng bộ, tối đa 4 session một lúc; tally vẫn tốn CPU giữa các await. Không chặn `contextWindow` theo `autoCompactWindow`. Custom `from > to` -> 400 (client tự đảo trước khi gửi). Không có `devRepoPath` hoặc Jira -> không đọc commit; repo anh em phải có `.git`.
- Test core 544, server 595 + 1 skip, client PASS; typecheck, lint, build, convention lint sạch.

## Task 4: Client: trang Insights
- **Lệch:** thêm `insights/insightsText.ts` (định dạng token 1.2k / 3.4M, giờ, thời gian Claude). Bỏ test "Coming soon" và placeholder của Shell vì không còn trang chưa làm. `pages.ts` / `errors.ts` đã có sẵn Insights và `insightsFailed`.
- **Quyết định:** biểu đồ theo ticket là thanh ngang (top 10 + Other), theo ngày là cột. Link Jira = `config.jira.baseUrl` + `/browse/<KEY>`. Đọc lỗi giữ báo cáo cũ + banner lỗi. Khoảng custom > 366 ngày chỉ hiện lỗi chung (server 400).
- Test client 140 PASS; typecheck, lint, build, convention lint sạch.

## Task 5: Core + server: quét knowledge theo lịch, lịch sử job
- **Lệch:** `KnowledgeScanConfig` thêm `logFile` (script chỉ ghi log vào file riêng `.daily-knowledge-scan.log`, không ra stdout): runner ghi kích thước lúc bắt đầu, mỗi 2 s và lúc thoát chép phần mới (chỉ dòng trọn) vào log của lần chạy; kết quả / đếm tính trên log gộp. Thêm `schedules/scanProcess.ts` (spawn thật, kill cả cây), `watchedLog.ts`, `schedulesView.ts`, `testing/fakeScan.ts`; event `schedules.changed`. `knowledgeScan` null = chưa cấu hình; cấu hình sai -> 400.
- **Sửa lỗi GĐ 5b:** danh sách topic trong `config.ts` / `noticeStore.ts` thiếu `teams` / `teamsMention` (và target `teams`) nên prefs / notice Teams đã lưu bị bỏ khi đọc lại; đã thêm + test.
- **Quyết định:** `stopped` chỉ khi quá giới hạn hoặc restart gặp run đang chạy (chưa có nút dừng tay). Job ghi bằng dep `recordJob` tiêm vào board / PR / Teams watcher / timesheet; timesheet chạy tay hoặc `joined` không ghi. `nextRunAt` chỉ có cho `timesheetRun`. Id run = thời điểm bắt đầu (`:`/`.` -> `-`); log route 404 cho id lạ, 400 cho `from` sai. Env của tiến trình quét dùng `sessionEnvironment` (có thêm `TERM`).
- Test core 554, server 617 + 1 skip, client 140 PASS; typecheck, lint, build, convention lint sạch.

## Task 6: Client: trang Schedules
- **Lệch:** thêm `api/schedulesApi.ts`, `schedules/scheduleFormat.ts`; form cấu hình quét tách `ScanForm.tsx`, danh sách lần chạy `ScanRuns.tsx`.
- **Quyết định:** dòng lịch của job dùng chu kỳ cố định của server (PR 5 phút, Teams 2 phút), chỉ Jira poll đọc từ config (sửa ở gate: agent ghi PR / Teams theo Jira poll). Tooltip mỗi job hiện 10 lần chạy gần nhất.
- **Lưu ý:** cấu hình `knowledgeScan` null thì form mở với giá trị mẫu `<path>`; lưu ngay mà không sửa sẽ ghi đúng placeholder đó (server kiểm tra đường dẫn tồn tại lúc chạy, không lúc lưu).
- Test client 145, core 554, server 617 + 1 skip PASS; typecheck, lint, build, convention lint sạch.

## Kiểm tra cuối (luồng chính)
- Server build chạy với data dir tạm: `/api/schedules` trả view rỗng (timesheetRun có `nextRunAt`), `/api/insights?kind=thisWeek` trả báo cáo rỗng có `tokensByDay` đủ ngày, custom `from > to` -> 400, request remote -> 403, log của run id lạ -> 404.
- Chưa test live: đọc transcript thật, commit thật, HRM giờ, chạy script quét thật trên máy.
