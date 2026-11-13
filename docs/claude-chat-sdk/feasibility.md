# Claude chat qua Agent SDK: khả thi

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

**Chưa xác minh trên SDK:** `canUseTool` cho AskUserQuestion và ExitPlanMode (đáp án, duyệt / phản hồi plan),
`interrupt()`, `setPermissionMode()`, `setModel()`, streaming input, file checkpoint / rewind. Spike trước khi lên plan.

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
