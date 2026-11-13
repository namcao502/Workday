# Workspace Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- `packages/client` trong cùng repo

**Goal:** Trang Workspace: mỗi ticket (và mỗi terminal tự do) có một tab với Claude chạy trong terminal thật (PTY), biết khi Claude chờ mình, xem Changes / Files của worktree và đọc Claude dưới dạng chat; Start / Open trên board tạo worktree và mở tab.

**Expected outcome (acceptance criteria):**
- [ ] Settings > Workspace: nhập `devRepoPath` (repo backend), glob repo anh em (vd `*-Angular`), prompt khi Start (vd `ship {key}`), đường dẫn claude (trống = tự tìm); Save áp dụng ngay, không cần restart.
- [ ] Chưa có `devRepoPath`: trang Workspace báo "Set the dev repo in Settings" thay vì lỗi; board không hiện Start / Open.
- [ ] Board, dòng Working: menu có **Start** (ticket chưa có worktree) và **Open**. Start chạy `git fetch origin`, `git worktree add <repo>/.claude/worktrees/<KEY> -b <KEY> origin/main` (sub-task: `origin/<parent>`, ghi `branch.<KEY>.parentTicket`; nhánh đã có thì checkout lại + merge base), chuyển ticket sang In progress, xếp vào queue timesheet hôm nay và mở tab; session đầu chạy prompt Start. Bấm Start hai lần liền chỉ tạo một worktree.
- [ ] Open với worktree đã có mở tab, Claude tiếp tục đúng hội thoại cũ (`--resume <id>` khi transcript còn, không thì `--continue` khi thư mục có transcript); worktree mất thì hỏi rồi tạo lại (không chạy prompt Start).
- [ ] Tab Workspace có terminal xterm.js chạy PowerShell (Windows) / bash (khác) gọi claude với `--settings <hook file>`; `/exit` về prompt shell, gõ `claude` ở đó vẫn có hook; `exit` kết thúc, Enter chạy lại. Đổi kích thước cửa sổ thì PTY đổi theo. Reload trang thấy lại màn hình cũ (replay 1 MB), session không bị khởi động lại.
- [ ] "+" ở thanh tab thêm terminal tự do (`claude`, `claude2`...) trong dev repo hoặc thư mục chọn; "+" trong dải Claude của một tab thêm session phụ (`<name>~2`...). Đóng tab đang chạy thì hỏi trước rồi dừng mọi session của nó. Danh sách tab và id hội thoại giữ sau restart server.
- [ ] Hook: Claude xong lượt -> chấm trên tab + số đếm trên mục Workspace ở sidebar, và một thông báo trình duyệt (Notification API, khi tab trình duyệt không focus hoặc đang ở tab khác); xin quyền / hỏi -> chấm tới khi trả lời hoặc Esc trong terminal; "xong" tự xóa khi mở đúng tab đó.
- [ ] Changes: cây file đổi của từng worktree (BE trước, rồi repo anh em có `.claude/worktrees/<KEY>`) so với `merge-base <KEY> origin/main` (sub-task: base của parent; nhánh bug `<BUG>` trong worktree cha thì hiện bug), có file untracked, A / M / D; bấm file xem diff inline có số dòng; file > 1 MB chỉ hiện các hunk.
- [ ] Files: nhóm `Docs - <KEY>` + mỗi worktree (`git ls-files` tracked + untracked không ignore); xem text, markdown (render, không chạy HTML thô), ảnh; mặc định mở `plan.md` rồi `ticket.md` của docs. Tab terminal tự do: một nhóm là thư mục của tab. Nút mở VS Code.
- [ ] Đọc file chỉ trong gốc của nhóm đã liệt kê: `..`, đường dẫn tuyệt đối, symlink ra ngoài -> 400.
- [ ] Chat (bật trong Settings > Workspace, mặc định tắt): mỗi session có **Chat | Terminal**; Chat hiện prompt của người dùng, câu trả lời (markdown), bước tool (tên + chi tiết, đỏ khi lỗi, "running" tới khi có kết quả), thông báo hệ thống; ô nhập gửi prompt vào session (Enter gửi, Shift+Enter xuống dòng), nút Esc; khi Claude chờ quyền / hỏi thì hiện dòng nhắc chuyển sang Terminal.
- [ ] Mọi route Workspace / terminal / hook là local-only (không khai báo `config.access`): request từ xa bị cổng GĐ 3 chặn; WebSocket terminal từ chối `Origin` lạ; hook URL có token ngẫu nhiên mỗi lần chạy, token sai -> 404.
- [ ] Claude và VS Code được spawn không mang biến môi trường `CLAUDE*` / `ANTHROPIC*` / `NO_COLOR` / `AI_AGENT` / `DISABLE_AUTOUPDATER` của server.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, convention lint, `npm run build` sạch.

**Architecture:** Core thêm logic thuần (luật chờ của hook, dựng lệnh shell, tên tab, parse git, parse transcript). Server thêm `workspace/`: `SessionHost` bọc `node-pty` (spawn tiêm vào để test), `WorkspaceService` giữ tab + session + trạng thái chờ theo chuỗi Promise như các service khác và lưu `workspace.json`, route hook nằm ngay trên Fastify (127.0.0.1), terminal là WebSocket riêng `/api/terminal/:session`. Client thêm trang Workspace (tab, xterm.js, Changes / Files / Chat).

**Assumptions:**
- Chỉ local: Workspace không có quyền remote ở GĐ 4 (trang đã ẩn với thiết bị từ xa); phone size / size owner của C# bỏ.
- Bỏ khỏi GĐ 4 (sang GĐ 5 hoặc sau): PR scope và comment Azure DevOps trong Changes, Teams view, rewind, gợi ý "/" "@", dán ảnh, wait card trả lời bằng phím (Allow / Deny / chọn đáp án), Ctrl+click link trong terminal, side-by-side diff, tự tạo worktree cho nhánh FE cũ, PTY capture, Ready to Test, QC bug (Fix trong worktree cha). Changes vẫn nhận ra nhánh bug có sẵn.
- Session sống trong process server; restart server thì session chết, tab mở lại và resume bằng id đã lưu.
- `node-pty` 1.1.0 (có prebuild win32 / linux; không cài được thì dùng `@lydell/node-pty` cùng API, ghi impl-notes). xterm: `@xterm/xterm` 6 + `@xterm/addon-fit`. Markdown: `react-markdown` + `remark-gfm` (mặc định không render HTML thô). Diff dòng trên client: `diff` (jsdiff).
- Giá trị riêng công ty vào config: glob repo anh em, prompt Start, `localOnlyPaths` (vd `src/docker-compose.yml`) mặc định rỗng.
- Thông báo "Claude xong" chỉ là Notification API của trình duyệt (xin quyền lần đầu bật trang); không gửi Web Push.

**Tech Stack:** `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, `react-markdown`, `remark-gfm`, `diff`, git CLI qua `execFile`.

---

## File structure

```
packages/core/src/
  claudeAttention.ts        parseHookEvent, nextWait, afterEscape, clearsWhenSeen, workingAfter
  claudeLaunch.ts           claudeProjectDirName, buildShellLaunch, isClaudeSessionVariable, sessionArgument
  workspaceTabs.ts          tên tab / session, WorkspaceState + reducer thuần
  gitParse.ts               parseNameStatus, listedChanges, bugBranchOf, parseExcerpt
  transcriptChat.ts         parseTranscript (Task 7)
  api.ts                    WorkspaceConfig, WorkspaceView, ... (sửa)
packages/server/src/workspace/
  git.ts                    runGit (execFile, timeout, kết quả { ok, output, error, exitCode })
  sessionHost.ts            một PTY: replay, subscriber, start/stop/write/resize
  hookSettings.ts           file --settings của từng session
  workspaceStore.ts         workspace.json
  worktreeService.ts        createWorktree
  ticketWorktrees.ts        findWorktrees, docsPath
  workspaceService.ts       tab, session, chờ, Start / Open, nhóm file
  gitChanges.ts             listChanges, readSides, readExcerpt (Task 4)
  ticketFiles.ts            listDocs, listWorktree, readFile, resolveInside (Task 4)
  transcriptReader.ts       đọc JSONL (tail 20 MB) (Task 7)
packages/server/src/routes/
  workspaceRoutes.ts, terminalRoute.ts, hookRoute.ts, workspaceFilesRoutes.ts, chatRoute.ts
packages/client/src/workspace/
  WorkspacePage.tsx, WorkspaceTabs.tsx, ClaudePane.tsx, TerminalView.tsx, terminalSocket.ts,
  ChangesView.tsx, FilesView.tsx, FileTree.tsx, DiffView.tsx, FileViewer.tsx, ChatView.tsx, workspace.css
packages/client/src/api/useWorkspace.ts
packages/client/src/settings/WorkspaceSection.tsx, workspaceForm.ts
```

Mỗi file mới < 300 dòng; tách thêm nếu vượt.

---

### Task 1: Core: kiểu Workspace và logic thuần

**Files:**
- Create: `packages/core/src/claudeAttention.ts` (+ `.test.ts`) -- port `C:\Project\NoisWorkday\Helpers\ClaudeAttention.cs` và test `tests/NoisWorkday.Tests/ClaudeAttentionTests.cs`; `workingAfter` từ `ClaudeTranscriptChat.WorkingAfter`
- Create: `packages/core/src/claudeLaunch.ts` (+ test) -- port `ClaudeSessionHost.BuildCommandLine`, `TicketLauncher.GetClaudeProjectDirectoryName` / `IsClaudeSessionVariable` / `GetResumeArgument` / `GetIdlePrompt` (phần thuần; test C# `ClaudeSessionHostTests`, `TicketLauncherTests`)
- Create: `packages/core/src/workspaceTabs.ts` (+ test) -- port `Helpers/TerminalTabs.cs`, `TicketClaudeTabs.NextName` (test `TerminalTabsTests.cs`)
- Create: `packages/core/src/gitParse.ts` (+ test) -- port `GitChanges.ParseNameStatus`, `Listed`, `BugBranchOf`, `ParseExcerpt` (test `GitChangesParseTests.cs`)
- Modify: `packages/core/src/api.ts`, `packages/core/src/index.ts`

**Shape:**
```ts
export interface WorkspaceConfig {
  readonly devRepoPath: string | null
  readonly siblingRepoGlob: string | null      // "*-Angular"; null = only the dev repo
  readonly startPrompt: string | null          // "ship {key}"; null = plain claude
  readonly claudeExecutable: string | null     // null = ~/.local/bin/claude(.exe), else PATH
  readonly localOnlyPaths: readonly string[]   // never listed in Changes
  readonly chatView: boolean
}
// WorkspaceConfig.workspace on WorkdayConfig; default all null / [] / false.

export type WaitReason = 'finished' | 'permission' | 'question'
export interface HookEvent {
  readonly eventName: string
  readonly toolName: string | null
  readonly notificationType: string | null
  readonly agentId: string | null
  readonly sessionId: string | null
  readonly subagentsRunning: boolean
  readonly transcriptPath: string | null
  readonly reason: string | null
}
export function parseHookEvent(payload: unknown): HookEvent | null
export function nextWait(current: WaitReason | null, event: HookEvent): WaitReason | null

export type TabKind = 'ticket' | 'terminal'
export interface WorkspaceTab {
  readonly id: string                 // ticket key, or "claude" / "claude2"
  readonly kind: TabKind
  readonly folder: string | null      // terminal tab only; null = dev repo
  readonly sessions: readonly string[] // [id, "id~2", ...]; the first is the main one
}
export interface SessionView {
  readonly name: string
  readonly running: boolean
  readonly wait: WaitReason | null
  readonly working: boolean
}
export interface WorkspaceView {
  readonly configured: boolean        // devRepoPath set and the folder exists
  readonly tabs: readonly WorkspaceTab[]
  readonly sessions: readonly SessionView[]
  readonly starting: readonly string[] // keys whose worktree is being created
  readonly recentFolders: readonly string[]
}
export interface ShellLaunch { readonly file: string; readonly args: readonly string[] }
export function buildShellLaunch(options: {
  readonly platform: 'win32' | 'other'
  readonly powerShell7Path: string | null
  readonly claudeExecutable: string
  readonly settingsFile: string | null
  readonly argument: string | null
  readonly rcFile: string | null      // 'other' only: path the server wrote the bash rc to
}): ShellLaunch
export function bashRcText(claudeExecutable: string, settingsFile: string | null, argument: string | null): string
```
AppError mới: `workspaceNotConfigured`, `worktreeMissing`, `worktreeFailed`, `parentBranchMissing`, `mainNotMerged` (cảnh báo, worktree vẫn dùng), `sessionNotFound`, `pathOutside`, `gitFailed`. ServerEvent mới: `workspace.changed`.

**Logic:**
- `nextWait`: đúng bảng của `ClaudeAttention.Next` (tool event của subagent chỉ xóa `permission`; Stop giữ nguyên khi `subagentsRunning`; `permission_prompt` giữ `question`; `idle_prompt` không đổi). `parseHookEvent` nhận object đã parse JSON; `subagentsRunning` = `background_tasks` có phần tử `type: "subagent"`, `status: "running"`.
- `buildShellLaunch` win32: `file` = pwsh path hoặc `powershell.exe`, `args` = `['-NoLogo', '-NoExit', '-Command', script]` với script `function global:claude { & '<exe>' --settings '<file>' @args }; claude <arg>`; quote PowerShell `'` -> `''`; argument bắt đầu `--` đi trần, còn lại quote. Argument chứa `"` hoặc ký tự điều khiển -> throw (không bao giờ gửi vào dòng lệnh). other: `file` = `bash`, `args` = `['--rcfile', rcFile, '-i']`; `bashRcText` source `~/.bashrc` nếu có, định nghĩa `claude() { command '<exe>' --settings '<file>' "$@"; }`, rồi gọi `claude <arg>` (quote `'` -> `'\''`).
- `claudeProjectDirName`: bỏ separator cuối, mọi ký tự không phải `[a-zA-Z0-9]` -> `-`.
- `sessionArgument({ savedSessionId, transcriptExists, folderHasTranscripts, isMain, startPrompt })`: `startPrompt` (đã thay `{key}`) thắng khi có; rồi `--resume <id>` khi id là GUID và transcript tồn tại; rồi `--continue` chỉ cho session chính khi thư mục có transcript; else null.
- `workspaceTabs`: tên terminal `claude`, `claude2`... (`nextTerminalName`: số nhỏ nhất còn trống, khớp `^claude\d*$`); session phụ `<tab>~N` (`nextSessionName`, N >= 2 nhỏ nhất còn trống); `isTicketKey` cho tab ticket. Reducer thuần: `openTicket`, `addTerminal`, `addSession`, `closeSession`, `closeTab` trả cùng object khi không đổi.
- `parseExcerpt(unifiedDiff)` (bỏ hai tham số text của C#): hàng gap có text rỗng và số dòng 0 cả hai bên; vượt 1 MB thì dừng và trả `truncated: true`; client tự viết "N unchanged lines" / "(truncated)" để dịch được.
- `listedChanges(files, localOnlyPaths)`: bỏ path trong `localOnlyPaths` (không phân biệt hoa thường), gộp path trùng thành `M`, sort không phân biệt hoa thường.

**Tests** (port test C# tương ứng, thêm):
- `nextWait` -- mỗi dòng của bảng luật, gồm subagent và `background_tasks`.
- `buildShellLaunch` -- win32 có / không pwsh, flag trần, prompt có `'`, argument có `"` throw; other dùng `--rcfile`.
- `bashRcText` -- quote `'`, không settings thì không có `--settings`.
- `claudeProjectDirName` -- `C:\Project\Workday\` -> `C--Project-Workday`.
- `sessionArgument` -- thứ tự ưu tiên; id không phải GUID bị bỏ; session phụ không bao giờ `--continue`.
- `nextTerminalName` / `nextSessionName` -- lấp chỗ trống.
- `parseNameStatus`, `parseExcerpt` (hunk `,0`, gap, cắt ở 1 MB), `bugBranchOf` (`MDP-2-dev` trong ticket `MDP-1` -> `MDP-2`; cùng key -> null), `listedChanges`.

### Task 2: Server: session PTY, hook, terminal WebSocket, tab

**Files:**
- Modify: `packages/server/package.json` -- thêm `node-pty`
- Modify: `packages/server/src/config.ts` -- `parseWorkspace` (thiếu / sai -> mặc định); `SettingsUpdate.workspace`
- Create: `packages/server/src/workspace/sessionHost.ts` (+ test) -- port `Services/ClaudeSessionHost.cs` bỏ phone size / capture / mode sniffer
- Create: `packages/server/src/workspace/hookSettings.ts` (+ test) -- `hookSettingsJson(url)`, `writeHookSettings(dataDir, session, url)`; port `ClaudeHookServer.BuildSettingsJson`
- Create: `packages/server/src/workspace/workspaceStore.ts` (+ test) -- `workspace.json` qua `jsonFile.ts`
- Create: `packages/server/src/workspace/workspaceService.ts` (+ test) -- tab, session, trạng thái chờ, chuỗi Promise
- Create: `packages/server/src/routes/hookRoute.ts`, `terminalRoute.ts`, `workspaceRoutes.ts` (+ test)
- Modify: `packages/server/src/services.ts`, `app.ts`, `main.ts`, `settings/settingsService.ts` (gọi `workspace.configure`)
- Create: `packages/server/src/testing/fakePty.ts`

**Shape:**
```ts
export interface PtyProcess {
  onData(listener: (data: string) => void): void
  onExit(listener: (exitCode: number) => void): void
  write(data: string): void
  resize(columns: number, rows: number): void
  kill(): void
}
export type SpawnPty = (launch: ShellLaunch, options: {
  readonly cwd: string; readonly columns: number; readonly rows: number
  readonly env: Readonly<Record<string, string>>
}) => PtyProcess

export class SessionHost {
  readonly name: string
  get running(): boolean
  attach(onOutput: (data: string) => void): { readonly replay: string; readonly detach: () => void }
  start(columns: number, rows: number): void   // throws WorkspaceStartError('worktreeMissing') when cwd is gone and no fallback
  write(data: string): void
  resize(columns: number, rows: number): void  // no-op when the size is unchanged
  stop(): void                                 // fires onEnded, never onExited
}
// WorkspaceService (public): view(), configure(config, dataDir), setHookBase(url),
// addTerminal(folder), addSession(tabId), closeSession(name), closeTab(id), seen(name),
// escape(name), onHook(session, token, payload), host(name): SessionHost | null, shutdown()
```

**Logic:**
- `SessionHost`: replay tối đa 1 MB ký tự (bỏ chunk cũ nhất); `attach` trả replay và đăng ký trong cùng một bước đồng bộ (không mất / lặp chunk). Output và exit của một PTY cũ (sau `start` mới hoặc `stop`) bị bỏ qua. `start` khi đang chạy thì `stop` trước. Lệnh: `buildShellLaunch`; pwsh tìm trên `PATH` (Windows), claude: `config.claudeExecutable` hoặc `~/.local/bin/claude.exe` / `claude` khi tồn tại, else `claude`. Bash rc ghi vào `<dataDir>/claude-hooks/<session>.rc` (chỉ non-Windows). Env = `process.env` bỏ mọi tên `isClaudeSessionVariable`, thêm `TERM=xterm-256color`.
- Trước mỗi `start`: argument = `sessionArgument` (transcript ở `~/.claude/projects/<claudeProjectDirName(cwd)>/<id>.jsonl`); hook file ghi lại với URL hiện tại; ghi file lỗi -> chạy không hook (log).
- Hook URL: `http://127.0.0.1:<port>/api/hooks/<token>/<encodeURIComponent(session)>`, `token` = 32 byte hex ngẫu nhiên mỗi lần chạy server; `main.ts` gọi `setHookBase` sau `listen` với port thật.
- `POST /api/hooks/:token/:session` (body limit 8 MB, không `config.access`): token so sánh `timingSafeEqual`, sai -> 404; luôn trả `200 {}` khi token đúng, kể cả payload lạ hoặc session không còn (bỏ qua). Không ghi log payload.
- `onHook`: wait = `nextWait`, working = `workingAfter`; `SessionEnd` / exit / stop xóa wait. Hook có `sessionId` GUID và `transcriptPath` nằm trong thư mục project của cwd session (so tên thư mục, không phân biệt hoa thường) -> lưu `sessionIds["<name>|<cwd>"]`. Chỉ broadcast `workspace.changed` khi wait / working / running đổi.
- `seen(name)` xóa wait `finished` (`clearsWhenSeen`); `escape(name)` = `afterEscape`.
- Thư mục chạy: tab ticket = `<devRepo>/.claude/worktrees/<KEY>`, không fallback (thiếu -> `worktreeMissing`); tab terminal = folder của nó, mất thì dev repo. Tên session: ticket `<KEY>`, `<KEY>~2`; terminal `claude`, `claude~2`.
- `workspace.json`: `{ tabs, sessionIds, recentFolders }` (recent tối đa 5); khi load chỉ giữ tab có id hợp lệ (`isTicketKey` hoặc `^claude\d*$`) và session `^<id>(~\d+)?$`. Mọi thay đổi: lưu file trước, rồi đổi bộ nhớ, rồi broadcast (như `BoardService`).
- `closeTab` / `closeSession`: dừng session, xóa id đã lưu của nó; session chính của tab không đóng riêng được (409); tên lạ -> 404 `sessionNotFound`.
- `configure` đổi `devRepoPath`: session đang chạy giữ nguyên; lần start sau dùng đường dẫn mới. `shutdown()` dừng mọi PTY (gọi khi tắt server).
- `GET /api/terminal/:session` (WebSocket, không `config.access`): kiểm `Origin` như `eventsRoute.ts`; `maxPayload` 1 MB. Client -> server JSON: `{type:'attach', columns, rows}` (đầu tiên: gửi replay rồi output; chưa chạy thì `start`), `{type:'input', data}`, `{type:'resize', columns, rows}`, `{type:'start', columns, rows}` (Enter sau khi exit). Input đúng bằng `"\x1b"` thì gọi `escape`. Server -> client JSON: `{type:'output', data}`, `{type:'exited'}`, `{type:'error', code}`. Session lạ -> gửi `error sessionNotFound` rồi đóng. Socket đóng -> detach.
- `columns` / `rows` ngoài 2..1000 -> bỏ message.

**Tests:**
- `sessionHost.test.ts` (fake PTY): replay giới hạn 1 MB; attach nhận replay rồi live, không lặp; output của PTY cũ sau restart bị bỏ; `stop` không phát `exited`; resize cùng cỡ không gọi PTY; cwd thiếu khi không fallback -> throw.
- `hookSettings.test.ts`: JSON có đủ 6 event (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SessionEnd`), type `http`, timeout 5.
- `workspaceStore.test.ts`: tab / session sai dạng bị lọc; file hỏng -> `.bad` và rỗng.
- `workspaceService.test.ts`: `addTerminal` đặt `claude2`; `addSession` đặt `~2`; `closeTab` dừng mọi session và xóa id; hook Stop -> `finished` + broadcast, PreToolUse lặp lại không broadcast; `seen` xóa `finished` không xóa `permission`; hook lưu session id chỉ khi transcript thuộc thư mục; argument start là `--resume <id>` khi transcript tồn tại (thư mục projects tạm).
- `hookRoute.test.ts`: token sai -> 404; token đúng, JSON rác -> 200 `{}`; request remote (header `cf-ray`) -> 403.
- `terminalRoute.test.ts`: attach nhận replay; input tới PTY; Origin lạ -> 403; session lạ -> `error`.
- `workspaceRoutes.test.ts`: GET view; POST terminals; DELETE tab; route remote -> 403.

### Task 3: Server: worktree, Start / Open

**Files:**
- Create: `packages/server/src/workspace/git.ts` (+ test với repo git tạm) -- `runGit(cwd, args, timeoutMs)`; reads truyền `--no-optional-locks`
- Create: `packages/server/src/workspace/worktreeService.ts` (+ test) -- port `Services/WorktreeService.Create` (test `WorktreeServiceTests.cs`)
- Create: `packages/server/src/workspace/ticketWorktrees.ts` (+ test) -- port `Services/TicketWorktrees.Find` và `TicketFiles.DocsPath`
- Modify: `packages/core/src/board.ts` (+ test) -- `startTicket(state, key)`: `new` -> `inProgress`; đã ở `inProgress` / không có -> trả cùng object
- Modify: `packages/server/src/board/boardService.ts` -- `start(key)`
- Modify: `packages/server/src/timesheet/timesheetService.ts` -- `queueToday(keys)` (dùng `addTickets` của core, ngày hôm nay theo `timeZone`)
- Modify: `packages/server/src/workspace/workspaceService.ts` -- `start(key)`, `open(key, recreate)`
- Modify: `packages/server/src/routes/workspaceRoutes.ts` -- `POST /api/workspace/start/:key`, `POST /api/workspace/open/:key`

**Shape:**
```ts
export type WorktreeResult = 'created' | 'failed' | 'parentBranchMissing' | 'mainNotMerged'
export function createWorktree(options: {
  readonly ticketKey: string
  readonly repoPath: string
  readonly worktreePath: string
  readonly parentKey: string | null
}): Promise<WorktreeResult>

export interface TicketWorktree { readonly repository: string; readonly path: string }
export function findWorktrees(devRepoPath: string, siblingRepoGlob: string | null, ticketKey: string): Promise<readonly TicketWorktree[]>

// POST /api/workspace/open/:key body { recreate?: boolean }
export type OpenOutcome =
  | { readonly ok: true; readonly warning: AppError | null }
  | { readonly ok: false; readonly error: AppError }
  | { readonly ok: false; readonly confirmRecreate: true }   // worktree missing and recreate not set
```

**Logic:**
- `createWorktree` đúng thứ tự C#: `fetch origin` -> (sub-task: `rev-parse --verify --quiet refs/remotes/origin/<parent>`, thiếu -> `parentBranchMissing`) -> nhánh `<KEY>` chưa có (local lẫn `origin/<KEY>`) thì `worktree add <path> -b <KEY> <base>`, có rồi thì `worktree add <path> <KEY>` rồi `merge --no-edit <base>` trong worktree (lỗi: có `MERGE_HEAD` thì `merge --abort`, trả `mainNotMerged`). Sub-task ghi `git config branch.<KEY>.parentTicket <parent>`. Trước `worktree add` thêm `/.claude/worktrees/` vào `.git/info/exclude` nếu chưa có `/.claude/` hoặc `/.claude/worktrees/`. Timeout git 2 phút. Lỗi git ghi log (`logError`) với stderr, không ghi token.
- `findWorktrees`: BE (`repository` = tên thư mục dev repo) trước, rồi mỗi thư mục anh em khớp glob (chỉ `*` ở dạng `prefix*suffix`, so không phân biệt hoa thường, sort theo tên) có `.claude/worktrees/<KEY>`. Glob null -> chỉ BE.
- `docsPath`: `<devRepo>/docs/<KEY>` nếu tồn tại, else `<worktree BE>/docs/<KEY>`, else null.
- `start(key)`: `isTicketKey` sai -> 400 `invalidKey`; chưa cấu hình -> `workspaceNotConfigured`; đang start key đó -> trả ngay `{ ok: true }` (single flight: đánh dấu `starting` trước mọi `await`, broadcast). Worktree đã có -> không tạo lại, không chạy prompt Start. Tạo mới thành công -> đánh dấu `shipPending` (bộ nhớ). Sau cùng (kể cả worktree lỗi): `board.start(key)`, `timesheet.queueToday([key])`; chỉ mở tab khi worktree sẵn sàng (`mainNotMerged` vẫn mở, kèm `warning`). Parent lấy từ `ticket.parentKey` của board.
- `shipPending` hết khi session của key nhận hook đầu tiên; session chạy mà không có file hook thì hết ngay lúc start. Prompt = `startPrompt` thay `{key}`.
- `open(key, recreate)`: đang start -> `{ ok: true }` không làm gì; worktree có -> mở tab; thiếu và `recreate` không bật -> `confirmRecreate`; `recreate` -> `createWorktree` rồi mở tab (không `shipPending`).
- Mở tab = `openTicket` của Task 1 + lưu; session chỉ start khi client attach.

**Tests:**
- `git.test.ts`: timeout giết process và trả `ok: false`; exit != 0 giữ stderr.
- `worktreeService.test.ts` (repo tạm có remote `origin` là một bare repo tạm): nhánh mới cắt từ `origin/main`; nhánh có sẵn được merge `origin/main`; xung đột -> `mainNotMerged` và không còn `MERGE_HEAD`; sub-task thiếu nhánh parent -> `parentBranchMissing`; sub-task ghi `parentTicket`; `.git/info/exclude` có `/.claude/worktrees/` một lần.
- `ticketWorktrees.test.ts`: BE trước, repo anh em theo tên, repo không có worktree bị bỏ, glob null.
- `board.test.ts`: `startTicket` chuyển `new` -> `inProgress`, key lạ trả cùng object.
- `workspaceService.test.ts`: hai `start` cùng lúc gọi `createWorktree` một lần; worktree có sẵn -> không `shipPending`; worktree lỗi vẫn `board.start` + `queueToday` nhưng không mở tab; `open` thiếu worktree -> `confirmRecreate`; argument session đầu = `ship MDP-1` rồi sau hook đầu tiên là `--resume`.

### Task 4: Server: Changes, Files, VS Code

**Files:**
- Create: `packages/server/src/workspace/gitChanges.ts` (+ test với repo tạm) -- port `Services/GitChanges.cs` trừ `ListPr` (test `GitChangesTests.cs`)
- Create: `packages/server/src/workspace/ticketFiles.ts` (+ test) -- port `Services/TicketFiles.cs` (test `TicketFilesTests.cs`) + `resolveInside`
- Create: `packages/server/src/workspace/openInEditor.ts` -- port `TicketLauncher.VsCodeStartInfo`
- Create: `packages/server/src/routes/workspaceFilesRoutes.ts` (+ test)
- Modify: `packages/server/src/workspace/workspaceService.ts` -- `fileGroups(tabId)`: nhóm của tab

**Shape:**
```ts
export interface FileGroup { readonly id: string; readonly label: string; readonly root: string; readonly kind: 'docs' | 'worktree' }
// api.ts
export type ChangeStatus = 'A' | 'M' | 'D'
export interface ChangeGroupView {
  readonly id: string
  readonly label: string            // "BE - Backend-DotNet", "FE - Portal-Angular", "(MDP-2)" suffix for a bug branch
  readonly files: readonly { readonly path: string; readonly status: ChangeStatus }[]
  readonly error: AppError | null
}
export type DiffView =
  | { readonly kind: 'full'; readonly original: string; readonly modified: string }
  | { readonly kind: 'excerpt'; readonly original: string; readonly modified: string
      readonly originalLines: readonly number[]; readonly modifiedLines: readonly number[]; readonly truncated: boolean }
  | { readonly kind: 'binary' }
export interface FilesGroupView { readonly id: string; readonly label: string; readonly paths: readonly string[]; readonly error: AppError | null }
export type FileContentView =
  | { readonly kind: 'text' | 'markdown'; readonly text: string }
  | { readonly kind: 'image' }      // the client loads .../files/raw
  | { readonly kind: 'binary' | 'tooLarge' }
```

**Logic:**
- Nhóm của tab ticket: `docs` (`Docs - <KEY>`, nếu `docsPath` có) rồi mỗi `findWorktrees` (`BE - <repo>` cho dev repo, `FE - <repo>` cho repo anh em); tab terminal: một nhóm `worktree`, label = tên thư mục. Id nhóm = `docs` / `wt0`, `wt1`... theo thứ tự; Changes chỉ dùng nhóm `worktree`.
- `listChanges(root, ticketKey | null, localOnlyPaths)`: đúng `GitChanges.List` (nhánh bug, parent của sub-task, working tree khi HEAD đang ở nhánh `<KEY>`, else chỉ commit `base..<KEY>`). Tab terminal: không có nhánh ticket -> tip `HEAD`, working tree. Mọi lệnh git có `--no-optional-locks`, timeout 30 s. Lỗi git -> group có `error: gitFailed`, các group khác vẫn trả.
- Diff: mỗi bên đọc theo `ReadOriginal` / `ReadModified` (blob: `cat-file -s` trước, > 1 MB -> không đọc); bên nào không hiện được (null) -> `readExcerpt` (`git diff --unified=3`, untracked dùng `--no-index /dev/null`, exit 1 là OK); excerpt null -> `binary`. CRLF -> LF.
- Files: docs = mọi file đệ quy (path dùng `/`, sort không phân biệt hoa thường); worktree = `ls-files -z --cached --others --exclude-standard` trừ `--deleted`, bỏ mục kết thúc `/`, bỏ trùng.
- `resolveInside(root, relative)`: từ chối rỗng, tuyệt đối, có NUL, có đoạn `..`; `realpath` của kết quả phải nằm trong `realpath(root)` (so không phân biệt hoa thường trên Windows) -> else `pathOutside` (400). Áp cho mọi route đọc file và cho path của diff đọc từ đĩa.
- Đọc file: ảnh theo đuôi (png, jpg, jpeg, gif, bmp, webp, svg) <= 10 MB -> `image`; > 1 MB -> `tooLarge`; có NUL -> `binary`; `.md` / `.markdown` -> `markdown`.
- `GET .../files/raw`: chỉ ảnh, đúng content type, header `x-content-type-options: nosniff`, `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `cache-control: no-store`.
- `POST /api/workspace/vscode` body `{ tabId, group?, path? }`: không path -> mở thư mục của tab (worktree BE, hoặc folder của tab terminal); có -> file đã qua `resolveInside`. Windows: `cmd.exe /c code "%WORKDAY_VSCODE_TARGET%"` với target qua biến môi trường; khác: `code <target>` (execFile, không shell). Env bỏ biến `isClaudeSessionVariable`. Lỗi spawn -> log, trả `{ ok: false }`.
- Route: `GET /api/workspace/tabs/:id/changes`, `.../changes/diff?group&path`, `.../files`, `.../files/content?group&path`, `.../files/raw?group&path`; tab lạ -> 404, group lạ -> 404. Không `config.access`.

**Tests:**
- `gitChanges.test.ts` (repo tạm + bare origin): working tree gồm untracked; HEAD ở `<KEY>-dev` -> chỉ commit; nhánh bug trong worktree cha; sub-task dùng base của parent; `localOnlyPaths` bị bỏ; blob > 1 MB -> excerpt; file nhị phân -> `binary`.
- `ticketFiles.test.ts`: list worktree bỏ file đã xóa và thư mục con lồng; đọc ảnh / markdown / binary / quá lớn; `resolveInside` chặn `..`, tuyệt đối, symlink (junction trên Windows) ra ngoài.
- `workspaceFilesRoutes.test.ts`: `path=../x` -> 400; tab lạ -> 404; raw của file không phải ảnh -> 400; header CSP có mặt; request remote -> 403.

### Task 5: Client: trang Workspace, terminal, Start / Open, Settings > Workspace

**Files:**
- Modify: `packages/client/package.json` -- `@xterm/xterm`, `@xterm/addon-fit`
- Create: `packages/client/src/api/useWorkspace.ts` -- `useWorkspace()` (query `/api/workspace`, refetch khi `workspace.changed`), mutation start / open / addTerminal / addSession / closeTab / closeSession / seen
- Create: `packages/client/src/workspace/WorkspacePage.tsx` (+ test), `WorkspaceTabs.tsx`, `ClaudePane.tsx`, `TerminalView.tsx`, `terminalSocket.ts` (+ test), `workspace.css`
- Create: `packages/client/src/workspace/useClaudeNotices.ts` -- Notification API
- Create: `packages/client/src/settings/WorkspaceSection.tsx` (+ test), `workspaceForm.ts`
- Modify: `packages/client/src/shell/Shell.tsx` / `Sidebar.tsx` / `TabBar.tsx` -- trang `workspace` thật, badge số session đang chờ
- Modify: `packages/client/src/board/RowMenu.tsx`, `BoardPage.tsx` -- Start / Open
- Modify: `packages/client/src/errors.ts` -- text cho các code mới

**Shape:**
```ts
// terminalSocket.ts: one socket per mounted TerminalView
export type TerminalMessage =
  | { readonly type: 'output'; readonly data: string }
  | { readonly type: 'exited' }
  | { readonly type: 'error'; readonly code: AppError['code'] }
export function parseTerminalMessage(raw: unknown): TerminalMessage | null
export function openTerminalSocket(session: string, handlers: {
  readonly onMessage: (message: TerminalMessage) => void
  readonly onClose: () => void
}): { send(message: ClientTerminalMessage): void; close(): void }
```

**Logic:**
- Bố cục: thanh tab trên cùng (tab ticket = key, tab terminal = tên thư mục, tooltip đường dẫn; chấm khi có session chờ; x đóng, hỏi trước khi có session đang chạy; "+" mở menu: dev repo, `recentFolders`, "Choose another folder..." là ô nhập đường dẫn). Dưới: hai pane chia đôi, trái để trống cho Task 6, phải là `ClaudePane`: dải session `Claude`, `Claude 2`... + "+", x trên session phụ, rồi `TerminalView` của session đang chọn. Tab / session đang chọn giữ trong URL hash (`#/workspace/<tab>/<session>`), không lưu server.
- `TerminalView`: một `Terminal` xterm + `FitAddon`; mount -> socket -> `attach` với cỡ sau `fit()`; `ResizeObserver` -> `fit()` -> gửi `resize` (debounce 100 ms, chỉ khi cỡ đổi). `onData` -> `input`. Nhận `exited` -> viết dòng xám "The terminal exited. Press Enter to start it again." và Enter kế tiếp gửi `start`. Unmount -> đóng socket (session vẫn chạy). Font `Cascadia Mono, Consolas, monospace`; màu nền / chữ lấy từ biến CSS của theme, đổi theme thì áp lại. Shift+Enter gửi `\n` (xterm `attachCustomKeyEventHandler`). Ctrl+C có vùng chọn thì copy, không thì để xterm gửi `^C`; Ctrl+V dán qua `navigator.clipboard.readText()`.
- Session không chọn vẫn giữ `TerminalView` mount nhưng ẩn (`display:none` giữ buffer) chỉ trong tab đang mở; đổi tab ticket thì unmount (replay lấy lại màn hình).
- Mở một session đang `finished` khi cửa sổ có focus -> `POST seen`.
- `useClaudeNotices`: so `sessions` mới với cũ; wait mới -> `new Notification(...)` ("MDP-1: Claude is done - your turn." / "needs your permission" / "is asking you something"; terminal: "Terminal <folder>"), trừ khi document có focus và đang xem đúng session đó. Xin quyền một lần khi trang Workspace mount. Không hỗ trợ -> bỏ qua.
- Board: menu dòng ở Working có **Start** (ẩn khi key nằm trong tab đang mở) và **Open**; chỉ hiện khi `workspace.configured` và đang local. Start -> `POST start` rồi chuyển tới tab đó; Open trả `confirmRecreate` -> `ConfirmDialog` ("Recreate the MDP-1 worktree?") -> `POST open` với `recreate: true`. `starting` của key -> nút disabled với chữ "Starting...". Warning `mainNotMerged` -> dòng cảnh báo trên trang.
- Chưa cấu hình: trang Workspace hiện "Set the dev repo in Settings" + link Settings.
- Settings > Workspace: các trường của `WorkspaceConfig` (localOnlyPaths là textarea mỗi dòng một path; chatView là toggle), Save gửi `SettingsUpdate.workspace`.
- Mọi chữ qua `t(en, vi)`.

**Tests:**
- `terminalSocket.test.ts`: `parseTerminalMessage` nhận đúng 3 dạng, bỏ dạng lạ.
- `WorkspacePage.test.tsx` (mock fetch, mock `TerminalView`): chưa cấu hình -> chữ Settings; hai tab hiện, tab có wait có chấm; đóng tab đang chạy hỏi trước; "+" thêm terminal gọi POST.
- `BoardPage.test.tsx`: Start hiện ở Working khi đã cấu hình, ẩn khi chưa; Open với `confirmRecreate` hỏi rồi gửi `recreate: true`.
- `WorkspaceSection.test.tsx`: Save gửi đúng `workspace`.
- `Shell.test.tsx`: badge Workspace = số session có wait.

### Task 6: Client: Changes và Files

**Files:**
- Modify: `packages/client/package.json` -- `react-markdown`, `remark-gfm`, `diff`
- Create: `packages/client/src/workspace/FileTree.tsx` (+ test), `fileTree.ts` (+ test) -- dựng cây từ danh sách path
- Create: `packages/client/src/workspace/ChangesView.tsx`, `DiffView.tsx`, `diffRows.ts` (+ test)
- Create: `packages/client/src/workspace/FilesView.tsx`, `FileViewer.tsx` (+ test)
- Modify: `packages/client/src/api/useWorkspace.ts` -- query changes / diff / files / content
- Modify: `packages/client/src/workspace/WorkspacePage.tsx` -- pane trái: Changes | Files (mặc định Files), nút VS Code, nút ẩn pane

**Shape:**
```ts
export interface TreeFolder { readonly name: string; readonly path: string; readonly folders: readonly TreeFolder[]; readonly files: readonly TreeFile[] }
export interface TreeFile { readonly name: string; readonly path: string }
export function buildTree(paths: readonly string[]): TreeFolder   // folders first, single-child folders merged ("src/app")

export interface DiffRow {
  readonly kind: 'context' | 'added' | 'removed' | 'gap'
  readonly text: string
  readonly oldLine: number | null
  readonly newLine: number | null
  readonly hiddenCount: number       // gap only
}
export function diffRows(view: Extract<DiffView, { kind: 'full' | 'excerpt' }>): readonly DiffRow[]
```

**Logic:**
- `buildTree`: thư mục trước file, mỗi mức sort không phân biệt hoa thường; thư mục chỉ có một thư mục con và không có file thì gộp tên (`a/b`). Cây chỉ render con của thư mục đang mở (worktree 10k file). Ô lọc trên cây: có chữ -> danh sách phẳng 500 path đầu khớp (không phân biệt hoa thường), debounce 150 ms.
- Changes: mỗi group một tiêu đề (label, lỗi hiện dòng đỏ), thư mục mặc định mở, trạng thái A / M / D màu success / caution / danger. Không chọn gì -> mở file đầu tiên theo thứ tự cây. Nút Refresh; tự refetch khi tab hiện lại. Alt+Up / Alt+Down sang file trước / sau.
- `diffRows`: `full` -> `diffLines` của jsdiff thành từng dòng, số dòng tăng dần mỗi bên; `excerpt` -> căn hai mảng theo `originalLines` / `modifiedLines`: dòng có số 0 là gap, `truncated` thêm một hàng "(truncated)" ở cuối, `hiddenCount` = khoảng cách số dòng của hai hàng context kề nhau; trong mỗi đoạn giữa hai gap chạy `diffLines` như `full` nhưng đánh số theo mảng. Hiện inline: cột số cũ, số mới, dấu, text; gap hiện "N unchanged lines" qua `t()`. `binary` -> "(binary or too large to show)".
- Files: nhóm như server trả; mặc định mở `plan.md` rồi `ticket.md` của nhóm docs; text trong `<pre>` có số dòng; markdown qua `react-markdown` + `remark-gfm` với Source | Rendered, link http(s) mở tab mới (`rel="noreferrer"`), link tương đối tới file đã liệt kê thì chọn file đó, còn lại bỏ; ảnh trong markdown và file ảnh dùng URL `.../files/raw`. `tooLarge` / `binary` -> ghi chú + nút VS Code.
- Đọc lại file đang mở chỉ khi refetch trả nội dung khác (giữ vị trí cuộn).

**Tests:**
- `fileTree.test.ts`: thư mục trước, gộp thư mục một con, sort.
- `diffRows.test.ts`: thêm / xóa / sửa giữa file; excerpt với gap đếm đúng `hiddenCount`; file mới (bên trái rỗng) toàn `added`.
- `FileTree.test.tsx`: lọc ra danh sách phẳng; mở / đóng thư mục.
- `FileViewer.test.tsx`: markdown không render `<script>` / HTML thô; link `../plan.md` chọn file đã liệt kê; ảnh dùng URL raw.

### Task 7: Chat Claude

**Files:**
- Create: `packages/core/src/transcriptChat.ts` (+ test) -- port `Helpers/ClaudeTranscriptChat.cs` `Parse`, `UserText`, `ToolDetail`, `OneLine`, `IsPrompt`, rewind theo `parentUuid`, `queued_command`, notice hệ thống và lỗi API (từ `ClaudeTranscriptChat.Notices.cs`: chỉ compaction, `system` có `content` text, lỗi API); test port từ `ClaudeTranscriptChatTests.cs` phần tương ứng
- Create: `packages/server/src/workspace/transcriptReader.ts` (+ test) -- port `ReadLines` (tail 4 MB khi file > 20 MB, offset tuyệt đối)
- Create: `packages/server/src/routes/chatRoute.ts` (+ test)
- Modify: `packages/server/src/workspace/workspaceService.ts` -- giữ `transcriptPath` mới nhất của mỗi session (từ hook, chỉ khi `isAcceptedPath`; không có thì từ id đã lưu)
- Create: `packages/client/src/workspace/ChatView.tsx` (+ test)
- Modify: `packages/client/src/workspace/ClaudePane.tsx` -- **Chat | Terminal** khi `chatView` bật

**Shape:**
```ts
export interface ChatMessage {
  readonly id: number                 // line byte offset * 100 + block index
  readonly role: 'user' | 'assistant' | 'tool' | 'notice'
  readonly text: string | null
  readonly toolName: string | null
  readonly toolDetail: string | null
  readonly isError: boolean
  readonly at: string | null
  readonly status: 'running' | 'background' | null
}
export function parseTranscript(lines: readonly string[], offsets: readonly number[], cwd: string | null): readonly ChatMessage[]
// True only for an absolute .jsonl path under projectsRoot (separators and case normalized on Windows).
export function isAcceptedPath(transcriptPath: string | null, projectsRoot: string, platform: 'win32' | 'other'): boolean
export interface ChatView { readonly messages: readonly ChatMessage[]; readonly hasMore: boolean; readonly working: boolean }
```

**Logic:**
- `GET /api/workspace/sessions/:name/chat`: 150 message cuối (`hasMore` khi còn), `working` của session; khi không working thì bỏ `status: 'running'`. Session lạ -> 404; chưa có transcript -> rỗng. Path chỉ đọc khi là `.jsonl` tuyệt đối nằm trong `~/.claude/projects` (`isAcceptedPath`).
- `POST /api/workspace/sessions/:name/prompt` `{ text }`: text NFC, `\r\n` -> `\n`, không rỗng, <= 100 000 ký tự; ghi text vào PTY rồi `\r` sau 150 ms. `POST .../key` `{ key: 'escape' | 'shiftTab' }` ghi `\x1b` / `\x1b[Z` (escape cũng gọi `escape(name)`).
- Client: refetch chat mỗi 1 s chỉ khi Chat đang hiện, và ngay khi `workspace.changed`. Tin nhắn người dùng bên phải, Claude là markdown (`react-markdown`, không HTML thô), tool là một dòng mờ `Tool  detail` (đỏ khi lỗi, hậu tố "running" / "background"), 4 tool liên tiếp trở lên gộp thành "N steps" mở được. Dòng working có spinner khi `working`. Danh sách dính đáy chỉ khi đang ở đáy. Wait `permission` / `question` -> thẻ "Claude needs your answer in the terminal" + nút chuyển sang Terminal. Ô nhập: Enter gửi, Shift+Enter xuống dòng, Esc gửi `escape`, Shift+Tab gửi `shiftTab`. Chọn Chat / Terminal giữ trong bộ nhớ theo session; terminal ẩn bằng `visibility: hidden` (không đổi cỡ PTY).

**Tests:**
- `transcriptChat.test.ts`: prompt chuỗi và mảng; `<command-name>` thành `/cmd args`; `<system-reminder>` bị ẩn; tool_use -> `running`, tool_result -> null / `isError`; `run_in_background` -> `background` tới task-notification; sidechain / meta bị bỏ; dòng JSON cuối viết dở bị bỏ; rewind (prompt có `parentUuid` cũ hơn prompt trước) cắt phần sau; `file_path` thành đường dẫn tương đối với `cwd`; chi tiết dài cắt 120 ký tự.
- `transcriptReader.test.ts`: file > 20 MB chỉ đọc tail, dòng đầu bị cắt bị bỏ, offset tuyệt đối.
- `chatRoute.test.ts`: prompt rỗng -> 400; prompt ghi text rồi `\r`; path ngoài `~/.claude/projects` không được đọc.
- `ChatView.test.tsx`: gộp "N steps"; Enter gửi, Shift+Enter không; thẻ wait hiện khi `permission`.

---

## Kiểm tra cuối giai đoạn (người dùng, trên máy thật)

1. Settings > Workspace: `devRepoPath` = `C:\Project\Backend-DotNet`, glob `*-Angular`, prompt `ship {key}`; Save.
2. Workspace > "+" > dev repo: terminal chạy claude; gõ một câu, Claude xong -> chấm + thông báo trình duyệt khi đang ở tab khác.
3. Board: Open một ticket có sẵn worktree -> tab, Claude tiếp tục hội thoại cũ; Changes / Files hiện đúng nhánh.
4. Reload trình duyệt: màn hình terminal còn nguyên, Claude không khởi động lại.
5. Bật Chat view: đọc được hội thoại, gửi một prompt từ ô nhập.
