# Claude chat qua Agent SDK -- impl notes

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Kiểu dữ liệu, port và logic thuần ở core
- **Lệch:**
  - `ChatView` nằm trong `core/src/transcriptChat.ts`, không phải `api.ts`, nên 4 trường mới thêm ở đó.
  - Phần cầu nối tạm để build xanh: `chat()` điền `requests: []`, `mode` lấy từ config, `model: null`. Settings chưa có ô chọn mode, form giữ `permissionMode` đọc từ file.
  - `useChatViewEnabled` trả `true` cho tới Task 4.
- **Quyết định:**
  - `deny` trên request `plan` trả `null`: plan chỉ nhận `approvePlan` / `revisePlan`.
  - Câu hỏi thiếu `question` dạng string bị bỏ; option thiếu `label` bị bỏ.
  - Input rỗng `{}` cho `detail = null`.
- Core 580, server 661 (+1 skip), client 166 PASS; typecheck + lint sạch.

## Task 2: Adapter SDK + `AgentSession` ở server
- **Lệch:** port đổi thành `onToolCall(call, signal: AbortSignal)` (thêm tham số) để SDK hủy yêu cầu thì `AgentSession` bỏ nó; bị hủy thì deny `'Cancelled.'`.
- **Quyết định:**
  - Mỗi `canUseTool` đua với promise "ended": `close()` / hết vòng message thì deny `'Session ended.'`, nên không promise nào treo.
  - Handle cũ sau restart bị bỏ qua (tool call của nó bị deny ngay).
  - SDK có thêm mode `dontAsk` / `auto`: `init` gặp mode lạ thì giữ mode lúc start, `status` gặp mode lạ thì không phát sự kiện.
  - `onChange` cũng bắn khi đổi mode lúc chưa chạy và khi `exited` / `dispose` dọn request.
- **Lệch (sửa ở main thread):** process thoát rồi start lại thì giữ mode người dùng chọn lần cuối (`nextMode = runningMode`), không quay về mặc định config.
- `sdkAgent.ts` chưa có unit test (cần CLI thật), sẽ chạy live ở Task 5.
- Server 670 (+1 skip), core 580 PASS; typecheck + lint sạch.

## Task 3: `WorkspaceService` + route dùng `AgentSession`; gỡ PTY, hook, terminal
- **Lệch:**
  - `npm run build` của core không có kiểu DOM / Node, nên `AbortSignal` trong port đổi thành `AbortSignalLike` (chỉ `aborted` + `addEventListener`).
  - `WorkspaceStartError` chuyển sang `workspace/workspaceStartError.ts` (trước nằm trong `pty.ts`, đã xóa).
- **Quyết định:**
  - Route prompt trả 409 `claudeWaiting` khi còn request mở (khớp `prompt()` của Teams); request id lạ trả 404 kèm thông điệp.
  - Session id từ `init` chỉ lưu khi là GUID, lưu chữ thường.
  - Bỏ `findPowerShell7` / `isTranscriptOfFolder` (hết người dùng). `sessionEnvironment` vẫn thêm `TERM`.
- **Test:**
  - Viết lại theo agent: add / close session, tab, resume, continue, start / open, chat route, notice.
  - Xóa (hành vi không còn): hook, PTY prompt, key route, cả bộ test `sessionHost` / `terminalRoute` / `hookRoute` / `hookSettings`, test shell launch và hook trong core.
- Core 503, server 645 (+1 skip), client 166 PASS; build + typecheck + lint sạch. Client còn gọi `/key` và socket terminal (404) cho tới Task 4.

## Task 4: Khung chat HeroUI ở client; gỡ terminal và CSS cũ
- **Quyết định:**
  - Thêm `ModeSelect.tsx` dùng chung cho đầu chat và Settings.
  - Từ 4 dòng tool liên tiếp trở lên thì gộp vào `Disclosure` "N steps".
  - `ChatView` nhận `{ session, shown }` (bỏ `wait` / `onOpenTerminal`).
  - Gửi câu trả lời / đổi mode lỗi thì nuốt lỗi rồi refetch để thấy trạng thái thật; ô soạn tự hiện lỗi của nó.
  - Không cần thêm mã lỗi mới (`claudeWaiting`, `worktreeMissing`, `workspaceNotConfigured` đã có chữ).
- **Lệch:** xóa luôn `controls.css` và `tokens.css` (rỗng sau khi bỏ `.legacy-page`), cùng `@layer legacy` trong `app.css`.
- Client 172, core 503, server 645 (+1 skip) PASS; build + typecheck + lint sạch.

## Task 5: Chạy thử với SDK thật + tài liệu
- Live trên bản build (data dir tạm, repo nháp, cổng 4871), chạy bằng `claude-opus-5-5`:
  - Prompt thường OK.
  - Write xin quyền -> Allow -> file ghi ra.
  - `AskUserQuestion` -> trả "Blue" -> Claude dùng đúng.
  - Mode Plan -> Keep planning (plan rút gọn đúng góp ý) -> Approve -> mode tự về `default`, Write sau đó lại xin quyền.
  - Always allow OK.
  - Stop giữa lượt -> session sống, prompt sau trả lời.
  - Restart server -> lịch sử hiện trước khi start, resume nhớ đúng hội thoại.
  - Kill server thì process claude con thoát theo.
- **Lệch (sửa ở main thread):** dòng `[Request interrupted by user]` trong transcript hiện thành notice, không còn là bong bóng prompt (`transcriptChat.ts` + test).
- **Đã biết, chưa sửa:**
  - Sau resume, SDK có thể kết một lượt nền (task Bash nền của session trước) nên `working` tắt sớm vài giây trong khi lượt mới còn chạy.
  - "Always allow" không ghi `.claude/settings.local.json` (SDK gợi ý quyền theo session). Cần anh xem khi test live.
- Phát hiện phụ: một process spike SDK từ chiều 2026-11-13 còn chạy ngầm, đã tắt.

## Chưa test live (để anh test)
- Ticket thật: Start ticket mới -> `ship {key}` tự gửi; Open ticket cũ -> resume.
- Teams hand-off vào chat; thông báo desktop khi Claude chờ / xong; chấm tab.
- Mode Bypass mặc định trong Settings.
