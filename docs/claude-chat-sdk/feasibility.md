# Claude chat qua Agent SDK: khả thi

> Đã làm (2026-11-13): `docs/claude-sdk-chat/`. Terminal bị bỏ hẳn, không có chế độ Chat / Terminal song song.

**Kết luận (2026-11-13):** Làm chat Claude bằng `@anthropic-ai/claude-agent-sdk` (TS, SDK chính thức) là **khả thi** và
gọn hơn cách GĐ 4 đang làm (Claude trong `node-pty` + đọc transcript + gửi phím). Workday là Node/TS nên dùng thẳng
SDK, không phải tự nói giao thức control như bên C#. Chưa làm; ghi chú cho lúc lên kế hoạch GĐ 5.

## Đã xác minh (claude 2.1.322, chạy CLI `claude -p` mà SDK bọc)

`claude -p --input-format stream-json --output-format stream-json --verbose`, một message user qua stdin:
- Chạy bằng login subscription (`apiKeySource: none`), không cần API key.
- `system/init` có `slash_commands`, `skills`, `plugins`, `agents`, `mcp_servers`, `tools`, `permissionMode`, `model`,
  `session_id`.
- Hook trong settings vẫn chạy (`hook_started` / `hook_response`); có `rate_limit_event`; `result` có usage, cost.
- `--permission-prompts host`: câu hỏi xin quyền chuyển về host (SDK: callback `canUseTool`).

**Đã có trong tài liệu SDK (2026-11-13, `@anthropic-ai/claude-agent-sdk` 0.3.323, chưa chạy thử):**
- `canUseTool(toolName, input, { signal, suggestions, toolUseID, requestId, ... })` chạy khi tool cần duyệt và khi Claude
  gọi `AskUserQuestion`; trả `{ behavior: 'allow', updatedInput: { questions, answers } }` (có `response` cho câu trả lời
  tự gõ). `suggestions` trả lại trong `updatedPermissions` = "always allow" (ghi `.claude/settings.local.json`).
- Ở streaming input (prompt là async generator): `interrupt()`, `setPermissionMode()` (có `plan`, `acceptEdits`, `auto`),
  `setModel()`, `initializationResult()` (lệnh, model, tài khoản).
- `reinitialize()`: gắn lại sau khi mất kết nối, các yêu cầu quyền đang chờ được gửi lại cho `canUseTool`.
- `enableFileCheckpointing` + `rewindFiles(userMessageId, { dryRun })`; `resume: <session id>`.

**Spike (2026-11-13, SDK 0.3.323, `Backend-DotNet`, streaming input, một session 4 lượt): đạt.**
- AskUserQuestion: `canUseTool` nhận `questions`, trả `answers` -> Claude dùng đáp án ("Red").
- Plan mode: `setPermissionMode('plan')`; Claude ghi plan vào `~/.claude/plans/*.md` (Write / Edit không qua
  `canUseTool`, chỉ file plan), gọi `ExitPlanMode` với `input.plan`. Từ chối kèm `message` -> Claude sửa plan rồi gọi
  lại; duyệt -> mode tự về `default` (có message `system/status`), Write sau đó lại qua `canUseTool`.
- `interrupt()` giữa lúc chạy tool: lượt kết thúc `error_during_execution`, session vẫn sống, lượt sau trả lời bình thường.
- Hook chạy đủ (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`; thấy qua `includeHookEvents`); 54 skill, 87
  lệnh (có `ship`), MCP `context7` connected; đăng nhập subscription (`apiKeySource: none`).

**Phải làm trong plan:**
- CLI đóng gói trong SDK cũ hơn mức API nhận (`426 Outdated Claude Code version`): truyền
  `pathToClaudeCodeExecutable` = claude đã cài (`workspace.claudeExecutable` hoặc `~/.local/bin/claude(.exe)`).
- `~/.claude/settings.json` của người dùng đặt `defaultMode: bypassPermissions`: app luôn truyền `permissionMode` rõ ràng.
- Bash có thể tự chạy nền (`background_tasks_changed`, `task_started`): chat cần hiện task nền.
- Bỏ biến môi trường `CLAUDE*` / `ANTHROPIC*` của server khi spawn (như GĐ 4).

## Được gì

- Không port lớp gửi phím (`ClaudeDialogKeys`, `ClaudeRewindKeys`, `ClaudeModeSniffer`, `dialog-keys.md` bên C#):
  wait card (Allow / Deny, chọn đáp án, duyệt plan) trả lời bằng kết quả của `canUseTool`. Đây chính là phần GĐ 4
  đã dời sang GĐ 5.
- Gửi prompt là một message (không chữ + `\r` chờ ~250 ms); ngắt bằng `interrupt()` thay Esc; đổi mode / model bằng API
  thay Shift+Tab.
- Sự kiện đẩy tới ngay, có token đang stream (`includePartialMessages`); chat không cần poll transcript 1 s, trạng thái
  chạy / chờ không cần route hook.
- Không cần PTY cho session chat: chạy được trên Linux, hợp với hướng web.
- `transcriptChat.ts` vẫn dùng để đọc lịch sử khi resume.

## Mất gì

- **Một session không thể vừa là SDK vừa là terminal cùng lúc** (hai process ghi chung một transcript). Chuyển qua
  lại = dừng bên này, resume `<id>` bên kia.
- Phần chỉ có trong TUI phải tự làm hoặc bỏ: dialog rewind (SDK có file checkpoint + fork session), shell mode `!`,
  statusline, các picker (`/model`, `/resume`).
- Session chat cần process sống suốt (streaming input); `WorkspaceService` giữ nó thay cho `SessionHost` PTY.

## Hướng nếu làm

Session có hai loại: **Chat** (SDK) và **Terminal** (PTY như GĐ 4), chuyển bằng resume. Chat đọc transcript chỉ để
dựng lịch sử, phần trực tiếp đi từ luồng message của SDK.
