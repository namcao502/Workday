# Impl notes: workspace

Ghi lại chỗ code lệch plan, quyết định plan không nói, đánh đổi. Mỗi task một mục `## Task N`.

## Task 1: Core: kiểu Workspace và logic thuần
- **Lệch:** không có `getIdlePrompt` riêng: nhánh `--continue` nằm trong `sessionArgument` (`isMain && folderHasTranscripts`). Export thêm `afterEscape`, `clearsWhenSeen`, `isTerminalName`, `isClaudeSessionVariable`, `MAX_DIFF_CHARS`.
- **Lệch:** server `config.ts` có `DEFAULT_WORKSPACE` trong `DEFAULT_CONFIG`; `parseConfig` tạm luôn trả mặc định (Task 2 parse thật). `SettingsUpdate.workspace` chưa thêm (Task 2).
- **Quyết định:** `buildShellLaunch` / `bashRcText` throw khi argument có `"` hoặc ký tự điều khiển ở cả hai nền tảng, và khi `other` thiếu `rcFile`. `--resume <id>` viết id chữ thường. `closeSession` bỏ qua session chính. `openTicket` dùng `isTicketKey` của core (>= 2 ký tự trước dấu `-`, C# cho 1).
- **Đánh đổi:** test viết cùng lúc với code, không chạy đỏ trước.
- Test core 313 PASS; typecheck, lint, convention lint sạch.

## Task 2: Server: session PTY, hook, terminal WebSocket, tab
- **Lệch:** thêm `workspace/pty.ts` (kiểu + lỗi start), `nodePty.ts` (adapter thật), `launchEnvironment.ts` (tìm pwsh, đường dẫn claude, lọc env, kiểm transcript) để `workspaceService.ts` dưới 300 dòng. `node-pty` 1.1.0 dùng được trên máy này (prebuild), không cần `@lydell/node-pty`.
- **Lệch:** session lạ trên socket terminal: lỗi `sessionNotFound` gửi khi nhận message đầu tiên của client (gửi lúc upgrade bị mất trong `injectWS`). `maxPayload` 1 MB áp cho mọi WebSocket (plugin không có tùy chọn theo route).
- **Quyết định:** claude mặc định trên Windows là `claude.exe` (chữ `claude` trần trong hàm PowerShell sẽ gọi lại chính nó). `--continue` chỉ cho session chính của tab ticket; tab terminal chỉ `--resume`. Hook route có body parser riêng (chuỗi thô) để payload hỏng vẫn được `200 {}`. `closeSession` session chính -> 409 `{ error }` thường (không có AppError code). Thiếu dev repo -> `workspaceNotConfigured`.
- **Quyết định:** public thêm `attach(onOutput, onExited?)`, `hasSession`, `openTicketTab` (cho Task 3), `hookToken`, `currentDirectory`; `onHook` trả `Promise<boolean>` (false -> 404).
- **Review (task-reviewer opus, FAIL rồi sửa):** đã sửa: đóng tab khi còn socket mở có thể sinh PTY mồ côi -> `SessionHost.dispose()` (viewer nhận `exited`, start sau đó -> `sessionNotFound`), `directoryOf` không còn rơi về dev repo; lưu `workspace.json` lỗi trong hook không còn trả 500; lọc `sessionIds` khi load (key có `|`, value GUID); ghi bash rc lỗi không làm start ném lỗi; bỏ `onExited` không dùng; thêm test remote 403 cho terminal, lọc env, `\x1b` -> escape, `shutdown`, SessionEnd / exit xóa wait.
- Chưa kiểm được: `kill()` của node-pty khi PTY đã thoát trên ConPTY thật.
- **Đánh đổi:** test của hookSettings và ba route viết cùng / sau code.
- Test server 328 + 1 skipped PASS; typecheck, lint, convention lint sạch.

## Task 3: Server: worktree, Start / Open
- **Lệch:** Start / Open nằm trong `workspace/ticketLauncher.ts`; `workspaceService.ts` vẫn 438 dòng (dưới trần 800, trên mức 300 của plan). `StartOutcome` / `OpenOutcome` ở core `api.ts`. `createWorktree` tiêm qua `ServicesOptions.createWorktree` (test dùng fake).
- **Lệch:** Start / Open chỉ kiểm thư mục worktree BE có tồn tại; `findWorktrees` / `docsPath` mới dựng và test, chưa ai gọi (Task 4 dùng). `docsPath` đồng bộ; `findWorktrees` bỏ chính dev repo khi glob khớp nó.
- **Quyết định:** `shipPending` chỉ khi `created` (không khi `mainNotMerged`: nhánh cũ đã có lịch sử). Không có hook base thì prompt dùng một lần rồi xóa. Open với `recreate` cũng đánh dấu `starting` để hai lần recreate không chồng nhau. Route: chỉ `invalidKey` -> 400, mọi từ chối khác (kể cả `confirmRecreate`) -> 200 `ok: false`.
- **Quyết định:** `createWorktree` ghi `/.claude/worktrees/` vào `.git/info/exclude` trước `worktree add` (C# chỉ làm ở `AddForBranch`); stderr ghi log bỏ `//user:token@`. `runGit` có tham số thứ tư `executable` chỉ để test timeout.
- **Đánh đổi:** `board.start` / `queueToday` ném lỗi thì các bước sau (queue, mở tab) bị bỏ; `starting` luôn được xóa trong `finally`. Test `git.ts` viết sau code.
- Test server 354 + 1 skipped, core 315 PASS; typecheck, lint, convention lint sạch.

## Task 5: Client: trang Workspace, terminal, Start / Open, Settings > Workspace
- **Lệch:** thêm `api/workspaceApi.ts`, `workspace/selection.ts`, `board/useTicketLauncher.ts`; `pageFromHash` chỉ đọc đoạn đầu của hash (`#/workspace/<tab>/<session>`). `TerminalMessage.error.code` có kiểu `PlainCode` (kiểu `AppError['code']` làm `errorText` không biên dịch được vì các code có tham số). `ClientTerminalMessage` khai báo ở `terminalSocket.ts`.
- **Quyết định:** `openTerminalSocket` xếp hàng message gửi trước khi socket mở (để `attach` đi đầu). Cảnh báo `mainNotMerged` giữ trong cache query (`workspaceWarning`) vì Board chuyển trang, Workspace hiện thành banner đóng được. "+" thêm terminal không tự chuyển sang tab mới (POST không trả id). Màu terminal lấy biến CSS của theme, `MutationObserver` trên `data-theme` áp lại khi đổi theme. `useClaudeNotices` chạy trong `Shell`.
- **Đánh đổi:** `TerminalView` không có test (bị mock vì jsdom không có canvas); hành vi phím / resize chỉ kiểm khi chạy thật. Test không chạy đỏ trước.
- Test client 85 PASS; typecheck client, lint, `vite build` sạch.

## Task 4: Server: Changes, Files, VS Code
- **Lệch:** nhóm file dựng trong `workspace/fileGroups.ts` (`buildFileGroups`); `workspaceService` chỉ thêm `fileGroups`, `localOnlyPaths`, `openEditor`. `listChanges` trả null khi git lỗi, không ghi log (C# có log); route đổi thành group `error: gitFailed`. Thư mục docs không đọc được cũng báo `gitFailed` (không có code nào hợp hơn).
- **Quyết định:** `resolveInside` ném `PathOutsideError`; path chưa tồn tại qua được nếu chuỗi hợp lệ (realpath ENOENT), vì không đọc được gì qua nó. Diff: path ngoài gốc -> 400, file không có trong danh sách -> 404, listing lỗi -> 500 `gitFailed`. Ảnh raw > 10 MB -> 413.
- **Quyết định:** tab terminal: base = `merge-base HEAD origin/main` khi có `origin/main` (hiện cả commit chưa push), không có thì `HEAD` (bản đầu dùng `HEAD`, em yêu cầu sửa theo C#).
- **Quyết định:** VS Code dùng `spawn` detached (không shell, không chờ). `POST /api/workspace/vscode` không `group` mở nhóm worktree đầu tiên; có `group` nhận cả docs.
- **Đánh đổi:** test route viết sau code.
- Test server 396 + 1 skipped PASS; tsc, eslint, convention lint sạch.

## Task 6: Client: Changes và Files
- **Lệch:** module dựng cây tên `buildTree.ts` (không phải `fileTree.ts`: trùng tên không phân biệt hoa thường với `FileTree.tsx` trên Windows). Thêm `GroupTrees.tsx` (dùng chung Changes / Files) và `LeftPane.tsx` (Changes | Files, VS Code, ẩn pane).
- **Quyết định:** query file dùng key gốc `['workspace-files', tabId, ...]` để `workspace.changed` không đọc lại mọi file; refetch khi quay lại tab dựa vào refetch-on-focus của React Query; dữ liệu giống nhau giữ cùng tham chiếu nên giữ vị trí cuộn. Alt+Up / Alt+Down đi qua các group theo thứ tự cây. Ảnh http(s) trong markdown chỉ hiện alt text (không tải ảnh ngoài). Link tới file không có trong danh sách thành chữ thường.
- **Đánh đổi:** `ChangesView`, `FilesView`, `LeftPane` không có test riêng; test viết cùng lúc với code.
- Test client 104 PASS; tsc, eslint, `vite build`, convention lint sạch.

## Task 7: Chat Claude
- **Lệch:** thêm `workspace/chatReader.ts` (phân trang + parse) và `ChatRows.tsx` (gộp bước, markdown); `TerminalView` có prop `concealed`. `transcriptChat.ts` 408 dòng, `workspaceService.ts` ~500 dòng (dưới trần 800, chưa tách).
- **Lệch:** không port: dòng shell `!` (`<bash-input>` / `<bash-stdout>`), prompt đang xếp hàng, thông tin session, output Bash đang chạy, rewind giữ qua các lần chạy. Ngoài compaction, mọi dòng `system` có `content` là text thành notice (bỏ `local_command`: content là XML thô).
- **Quyết định:** `isAcceptedPath` từ chối thêm đoạn `..` (C# không). Query chat có key `['workspace','chat',session]` nên `workspace.changed` làm chat đang mở refetch ngay; poll 1 s chỉ khi Chat hiện. Chat / Terminal nhớ theo session trong một map cấp module, mặc định Chat.
- **Đánh đổi:** test viết cùng lúc với code; công tắc Chat | Terminal trong `ClaudePane` không có test; test prompt chờ ~250 ms thật cho `\r`.
- Test core 328, server 403 + 1 skipped, client 107 PASS; typecheck, lint, build, convention lint sạch.

## Kiểm tra cuối (luồng chính)
- `npm test` (core 328, server 403 + 1 skipped, client 107), typecheck, lint, convention lint, `npm run build` sạch.
- Chạy bản build với data dir tạm, cấu hình Workspace qua `PUT /api/settings`: thêm terminal `claude`; WebSocket `attach` -> PowerShell chạy claude thật trong dev repo (thấy màn hình Claude Code); gửi prompt qua `/prompt` -> hook đổi `working: true` rồi `wait: finished`; `/chat` trả prompt và câu trả lời; `workspace.json` lưu session id; Changes liệt kê file đổi; `path=../x` -> 400; request có `cf-ray` -> 403; đóng tab dừng session, không còn process sót.
- Chưa thử trên trình duyệt: hiển thị xterm, phím tắt, resize, thông báo Notification, giao diện Changes / Files / Chat; Start / Open trên repo backend thật (tạo worktree).
