# Claude chat qua Agent SDK -- Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- client nằm trong repo này (`packages/client`)

**Goal:** Thay session Claude chạy trong PTY (node-pty + xterm + hook + gửi phím) bằng session `@anthropic-ai/claude-agent-sdk` sống lâu trong server, với khung chat HeroUI trả lời quyền / câu hỏi / plan trực tiếp; bỏ hẳn terminal.

**Expected outcome (acceptance criteria):**
- [ ] Mở tab Workspace: khung Claude là chat HeroUI (danh sách tin, ô soạn, chọn mode, nút Stop); không còn xterm, nút Chat / Terminal, `.legacy-page`.
- [ ] Gửi prompt lần đầu khởi động session SDK trong đúng thư mục (worktree ticket / folder tab); session có id đã lưu và transcript còn thì `resume`, ticket mới có `startPrompt` thì prompt đó là tin đầu tiên.
- [ ] Tool cần duyệt hiện thẻ Allow / Always allow / Deny; `AskUserQuestion` hiện thẻ chọn đáp án (cả câu tự gõ); `ExitPlanMode` hiện plan + Approve / Keep planning (kèm góp ý). Trả lời xong Claude chạy tiếp.
- [ ] Stop (`interrupt`) dừng lượt đang chạy, session vẫn sống; đổi mode (Default / Accept edits / Plan / Bypass) áp ngay cho session đang chạy.
- [ ] Chấm chờ / thông báo desktop khi Claude xin quyền, hỏi, hay xong lượt vẫn chạy như trước (giờ lấy từ luồng SDK, không từ hook).
- [ ] Teams hand-off (`prompt` / `promptState`) gửi được vào session SDK; đang có yêu cầu chờ thì trả `waiting` như trước.
- [ ] Đóng tab / phiên / tắt server thì process Claude của nó bị đóng; không còn `node-pty`, `@xterm/*`, route `/api/terminal/*`, `/api/hooks/*`.
- [ ] `npm test`, typecheck, lint, convention lint sạch; chạy thật một session với SDK (Task 5) qua được cả 4 luồng: prompt, permission, question, plan.

**Architecture:** Core có port `ClaudeAgent` (mở session, nhận sự kiện đã chuẩn hóa) và logic thuần cho yêu cầu chờ; server có adapter SDK + `AgentSession` (một process / phiên, hàng đợi input streaming, các `canUseTool` đang chờ) thay `SessionHost`. Lịch sử chat vẫn đọc từ transcript (`readChat`, SDK ghi transcript như CLI); server phát `chat.changed` khi có sự kiện để client refetch thay vì poll 1 s.

**Assumptions:**
- Không stream token từng phần (`includePartialMessages` tắt): tin assistant hiện khi transcript ghi xong khối đó, như chat view hiện tại.
- Mode khởi đầu lấy từ config mới `workspace.permissionMode` (mặc định `'default'`); `chatView` bị bỏ khỏi config (file cũ có trường này vẫn đọc được).
- Không có picker model / slash command trong GĐ này: gõ `/clear`, `/ship MDP-1`... như prompt thường (SDK nhận slash command trong prompt). Hiện tên model từ `system/init`.
- Rewind / fork session, statusline, shell mode `!` của TUI không làm.
- Session chỉ khởi động khi có prompt đầu tiên (người gõ, `startPrompt`, hoặc Teams hand-off); trước đó chat chỉ đọc lịch sử transcript.
- `ExitPlanMode` được duyệt: SDK tự đưa mode về `default` (đã thấy ở spike); app cập nhật mode theo `system/status`.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk` 0.3.323 (đã có trong server), Fastify, React 19 + HeroUI v3 + Tailwind 4, `@tanstack/react-query`, Vitest.

---

## Ghi chú từ spike (`docs/claude-chat-sdk/feasibility.md`)

- Truyền `pathToClaudeCodeExecutable` = `config.workspace.claudeExecutable ?? defaultClaudeExecutable(home)` (CLI đóng gói trong SDK bị API trả 426).
- Luôn truyền `permissionMode` (settings của người dùng đặt `defaultMode: bypassPermissions`); `bypassPermissions` cần thêm `allowDangerouslySkipPermissions: true`.
- `settingSources: ['user', 'project', 'local']` để hook / skill / MCP / CLAUDE.md chạy như CLI.
- `env` = `sessionEnvironment(process.env)` (bỏ biến `CLAUDE*` / `ANTHROPIC*` như GĐ 4).
- `interrupt()` giữa lúc chạy tool: lượt kết thúc `error_during_execution`, session sống tiếp.
- Bash có thể chạy nền (`task_started` / `background_tasks_changed`): transcript đã có `status: 'background'`, không cần thêm gì.

## File structure

- Create `packages/core/src/ports/claudeAgent.ts` (port), `packages/core/src/agentRequests.ts` (+ test).
- Modify `packages/core/src/api.ts`, `core/src/index.ts`, `core/src/claudeLaunch.ts` (bỏ phần shell), `core/src/claudeAttention.ts` (bỏ phần hook nếu không còn ai dùng).
- Create `packages/server/src/workspace/sdkAgent.ts` (adapter), `workspace/agentSession.ts` (+ test).
- Modify `workspace/workspaceService.ts`, `routes/chatRoute.ts`, `services.ts`, `main.ts`, `config.ts`, `app.ts`.
- Delete `workspace/sessionHost.ts`, `pty.ts`, `nodePty.ts`, `hookSettings.ts`, `routes/terminalRoute.ts`, `routes/hookRoute.ts` (+ test của chúng).
- Client: rewrite `workspace/ClaudePane.tsx`, `ChatView.tsx`, `ChatRows.tsx`; create `workspace/ChatRequestCard.tsx`, `workspace/ChatComposer.tsx`; delete `TerminalView.tsx`, `terminalSocket.ts`; modify `api/useWorkspace.ts`, `api/workspaceApi.ts`, `settings/WorkspaceSection.tsx`, `settings/workspaceForm.ts`, `events` handling; dọn `styles/*.css`, `workspace.css`.

### Task 1: Kiểu dữ liệu, port và logic thuần ở core

**Files:**
- Create: `packages/core/src/ports/claudeAgent.ts` -- port session agent
- Create: `packages/core/src/agentRequests.ts` -- canUseTool -> `ChatRequest`, câu trả lời -> kết quả cho SDK
- Modify: `packages/core/src/api.ts` -- `ChatView` thêm trường, `ServerEvent` thêm `chat.changed`, `WorkspaceConfig`
- Modify: `packages/core/src/index.ts` -- export
- Modify: `packages/server/src/config.ts` -- đọc / validate `permissionMode`, bỏ `chatView` (file cũ có `chatView` không lỗi)
- Test: `packages/core/src/agentRequests.test.ts`, `packages/server/src/config.test.ts`

**Shape:**
```ts
// ports/claudeAgent.ts
export type AgentMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export interface AgentToolCall {
  readonly id: string // unique per request, made by the adapter
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
  readonly canAlwaysAllow: boolean // the SDK sent permission suggestions
}

export type AgentDecision =
  | { readonly kind: 'allow'; readonly updatedInput?: Readonly<Record<string, unknown>>; readonly always?: boolean }
  | { readonly kind: 'deny'; readonly message: string }

export type AgentEvent =
  | { readonly type: 'init'; readonly sessionId: string; readonly model: string; readonly mode: AgentMode }
  | { readonly type: 'message' } // something was written to the transcript
  | { readonly type: 'mode'; readonly mode: AgentMode }
  | { readonly type: 'turnEnded'; readonly ok: boolean }
  | { readonly type: 'exited'; readonly error: string | null }

export interface AgentStartOptions {
  readonly cwd: string
  readonly mode: AgentMode
  readonly resume: string | null // session id
  readonly continueLatest: boolean
  readonly onEvent: (event: AgentEvent) => void
  // Resolves when the user answers; the adapter rejects the SDK call when the session closes.
  readonly onToolCall: (call: AgentToolCall) => Promise<AgentDecision>
}

export interface AgentSessionHandle {
  send(text: string): void
  interrupt(): Promise<void>
  setMode(mode: AgentMode): Promise<void>
  close(): void
}

export interface ClaudeAgent {
  start(options: AgentStartOptions): AgentSessionHandle
}

// agentRequests.ts
export type ChatRequestKind = 'permission' | 'question' | 'plan'
export interface ChatQuestion {
  readonly question: string
  readonly header: string
  readonly multiSelect: boolean
  readonly options: readonly { readonly label: string; readonly description: string }[]
}
export interface ChatRequest {
  readonly id: string
  readonly kind: ChatRequestKind
  readonly toolName: string
  readonly detail: string | null // permission: command / path / short JSON; plan: the plan markdown
  readonly questions: readonly ChatQuestion[] // question only
  readonly canAlwaysAllow: boolean
}
export type ChatAnswer =
  | { readonly kind: 'allow'; readonly always: boolean }
  | { readonly kind: 'deny'; readonly message: string }
  | { readonly kind: 'answers'; readonly answers: Readonly<Record<string, string>> } // question text -> label(s) or own text
  | { readonly kind: 'approvePlan' }
  | { readonly kind: 'revisePlan'; readonly feedback: string }

export function toChatRequest(call: AgentToolCall): ChatRequest
export function toDecision(request: ChatRequest, call: AgentToolCall, answer: ChatAnswer): AgentDecision | null // null: answer does not fit the request kind
export function waitOfRequests(requests: readonly ChatRequest[]): WaitReason | null
```
`api.ts`: `ChatView` thêm `requests: readonly ChatRequest[]`, `running: boolean`, `mode: AgentMode`, `model: string | null`; `ServerEvent` thêm `{ type: 'chat.changed' }`; `WorkspaceConfig`: bỏ `chatView`, thêm `permissionMode: AgentMode`.

**Logic:**
- `toChatRequest`: `AskUserQuestion` -> `question` (đọc `input.questions`; thiếu / sai kiểu thì mảng rỗng, không throw); `ExitPlanMode` -> `plan`, `detail` = `input.plan` (string) ; còn lại -> `permission`, `detail` = `input.command` (Bash) / `input.file_path` (Write / Edit / Read) / `input.url` / nếu không có thì JSON rút gọn của input, cắt 500 ký tự.
- `toDecision`:
  - `permission` + `allow` -> `{ kind: 'allow', always }` (`always` chỉ khi `canAlwaysAllow`); `deny` -> `{ kind: 'deny', message }` (message rỗng -> `'The user denied this.'`).
  - `question` + `answers` -> `{ kind: 'allow', updatedInput: { ...call.input, answers } }`; `deny` -> deny.
  - `plan` + `approvePlan` -> `{ kind: 'allow' }`; `revisePlan` -> `{ kind: 'deny', message: feedback }` (feedback rỗng -> `'Keep planning.'`).
  - Kết hợp không hợp kind -> `null` (route trả 400).
- `waitOfRequests`: có `permission` hoặc `plan` -> `'permission'`; chỉ có `question` -> `'question'`; rỗng -> `null`.

**Tests:**
- `toChatRequest maps AskUserQuestion, ExitPlanMode and a Bash call`
- `toChatRequest tolerates a malformed questions input`
- `toDecision answers a question with updatedInput.answers`
- `toDecision turns plan feedback into a deny message and approve into allow`
- `toDecision ignores always when the call cannot be always-allowed`
- `toDecision returns null for an answer of the wrong kind`
- `waitOfRequests prefers permission over question`
- (config.test) `a config file with chatView and no permissionMode loads with permissionMode default`

### Task 2: Adapter SDK + `AgentSession` ở server

**Files:**
- Create: `packages/server/src/workspace/sdkAgent.ts` -- `createSdkAgent(deps): ClaudeAgent` bọc `query()` của SDK
- Create: `packages/server/src/workspace/agentSession.ts` -- một phiên Claude: start lười, hàng đợi gửi, yêu cầu chờ, trạng thái
- Create: `packages/server/src/testing/fakeAgent.ts` -- `FakeClaudeAgent` cho test (ghi lại start / send / mode, cho test bắn `AgentEvent` và tool call)
- Test: `packages/server/src/workspace/agentSession.test.ts`

**Shape:**
```ts
// sdkAgent.ts
export interface SdkAgentDeps {
  readonly executable: () => string // pathToClaudeCodeExecutable, read at each start
  readonly env: () => Readonly<Record<string, string>>
  readonly logError: (message: string, error: unknown) => void
}
export function createSdkAgent(deps: SdkAgentDeps): ClaudeAgent

// agentSession.ts
export interface AgentSessionDeps {
  readonly name: string
  readonly agent: ClaudeAgent
  readonly directory: () => SessionDirectory // as today; may throw WorkspaceStartError
  readonly resumeId: (cwd: string) => string | null // saved id whose transcript still exists
  readonly continueLatest: (cwd: string) => boolean // main ticket session with transcripts in the folder
  readonly mode: () => AgentMode // config default for a new process
  readonly onChange: () => void // chat.changed
  readonly onAttention: () => void // workspace.changed: running / working / wait changed
  readonly onSessionId: (cwd: string, sessionId: string) => void
}

export interface AgentSessionState {
  readonly running: boolean
  readonly working: boolean
  readonly finished: boolean // a turn ended since the user last looked
  readonly mode: AgentMode
  readonly model: string | null
  readonly sessionId: string | null
  readonly cwd: string | null
  readonly requests: readonly ChatRequest[]
}

export class AgentSession {
  constructor(deps: AgentSessionDeps)
  get state(): AgentSessionState
  send(text: string): void // starts the process on first use; throws WorkspaceStartError
  answer(requestId: string, answer: ChatAnswer): 'ok' | 'notFound' | 'invalid'
  interrupt(): Promise<void>
  setMode(mode: AgentMode): Promise<void>
  seen(): void // clears finished
  dispose(): void // closes the process, denies open requests, never starts again
}
```
`SessionDirectory` / `isDirectory` chuyển từ `sessionHost.ts` sang `agentSession.ts`.

**Logic:**
- `sdkAgent.start`: input streaming là async generator đọc từ một hàng đợi (`send` đẩy `{ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' }`); `query({ prompt: generator, options })` với `cwd`, `permissionMode`, `allowDangerouslySkipPermissions: mode === 'bypassPermissions'`, `pathToClaudeCodeExecutable`, `env`, `settingSources: ['user', 'project', 'local']`, `resume` / `continue`, `canUseTool`, `stderr` -> `logError`. Vòng `for await` của message: `system/init` -> `init` (session_id, model, permissionMode); `system/status` có `permissionMode` -> `mode`; `result` -> `turnEnded` (`ok` = `subtype === 'success'`); mọi `user` / `assistant` / `system` khác -> `message`. Vòng kết thúc / throw -> `exited` (error = message lỗi hoặc null). Tra đúng tên trường trong `sdk.d.ts` (`SDKSystemMessage`, `SDKResultMessage`...), không đoán.
- `canUseTool(toolName, input, { signal, suggestions })`: tạo id (`randomUUID`), gọi `onToolCall`; `always` -> `updatedPermissions: suggestions`; `signal` abort -> hủy yêu cầu (AgentSession bỏ nó khỏi `requests`). Quyết định `allow` không có `updatedInput` thì trả `updatedInput: input` (SDK đòi input ở nhánh allow).
- `close()`: kết thúc generator + `query.close()` (hoặc abort controller nếu SDK không có `close`; tra d.ts).
- `AgentSession.send`: chưa có process -> `directory()` (worktree thiếu -> throw như cũ, fallback folder như cũ), `agent.start` với `resume: resumeId(cwd)`, `continueLatest: resumeId === null && continueLatest(cwd)`, `mode: mode()`; `running = true`, `onAttention()`. Rồi `handle.send(text)`, `working = true`, `finished = false`.
- `onToolCall`: thêm `ChatRequest` (qua `toChatRequest`) vào `requests`, `onAttention()` + `onChange()`, trả Promise; `answer` gọi `toDecision`, `null` -> `'invalid'`, id lạ -> `'notFound'`; resolve rồi xóa request.
- Sự kiện: `init` -> lưu `sessionId` / `model` / `mode`, gọi `onSessionId(cwd, id)`; `mode` -> cập nhật; `message` -> `onChange()`; `turnEnded` -> `working = false`, `finished = true`, `onAttention()` + `onChange()`; `exited` -> `running = false`, `working = false`, mọi request mở bị deny (`'Session ended.'`) và xóa, `onAttention()`. Lần `send` sau khởi động process mới (resume theo id vừa lưu).
- `dispose`: `close()` handle, deny request mở, đánh dấu disposed; `send` sau đó throw `WorkspaceStartError('sessionNotFound')`.
- `setMode` khi chưa chạy: chỉ ghi `mode` cho lần start tới; đang chạy: `handle.setMode` rồi cập nhật.
- Chỉ gọi `onAttention` khi `running` / `working` / `finished` / wait (`waitOfRequests`) thật sự đổi.

**Tests** (dùng `FakeClaudeAgent`, không chạy SDK thật):
- `the first send starts the agent in the session folder and later sends reuse it`
- `a saved session id resumes, otherwise the main ticket session continues the latest`
- `a missing worktree throws worktreeMissing and starts nothing`
- `a tool call becomes a request, and answering it resolves the agent call and clears it`
- `a wrong-kind answer is invalid and keeps the request open`
- `turnEnded clears working and sets finished until seen`
- `exited denies open requests and the next send starts a new process`
- `dispose closes the agent and refuses later sends`
- `setMode before the first start is used by the start; while running it calls the handle`

### Task 3: `WorkspaceService` + route dùng `AgentSession`; gỡ PTY, hook, terminal

**Files:**
- Modify: `packages/server/src/workspace/workspaceService.ts` -- `hosts: Map<string, SessionHost>` -> `sessions: Map<string, AgentSession>`; bỏ hook / launch shell / rc file / escape
- Modify: `packages/server/src/workspace/ticketLauncher.ts` -- `shipDone` gọi khi prompt khởi đầu đã gửi
- Modify: `packages/server/src/routes/chatRoute.ts` -- route mới (dưới)
- Modify: `packages/server/src/services.ts`, `main.ts`, `app.ts`, `testing/testApp.ts`, `testing/fakes.ts` -- `agent: ClaudeAgent` thay `spawnPty`; bỏ `setHookBase`, đăng ký route terminal / hook
- Modify: `packages/server/src/teams/teamsService.ts` (nếu kiểu đổi) -- `prompt` / `promptState` giữ chữ ký
- Delete: `workspace/sessionHost.ts`, `pty.ts`, `nodePty.ts`, `hookSettings.ts`, `routes/terminalRoute.ts`, `routes/hookRoute.ts` và test của chúng; phần shell của `core/src/claudeLaunch.ts` (`buildShellLaunch`, `bashRcText`, `sessionArgument`, `ShellLaunch`...) và phần hook của `core/src/claudeAttention.ts` (`parseHookEvent`, `nextWait`, `workingAfter`, `afterEscape`) cùng test, sau khi grep không còn ai dùng; `node-pty` khỏi `packages/server/package.json` (chạy `npm install` để cập nhật lock)
- Test: `workspace/workspaceService.test.ts`, `routes/chatRoute.test.ts`, `workspace/ticketLauncher` test nếu có, `teams/*` test liên quan

**Shape** -- route (đều local-only như hiện tại, không `config.access`):
```
GET  /api/workspace/sessions/:name/chat                 -> ChatView (messages + requests + running + mode + model)
POST /api/workspace/sessions/:name/prompt     { text }   -> { ok: true } | 404 | 400 | 409 { error: { code } }
POST /api/workspace/sessions/:name/interrupt             -> { ok: true } | 404
POST /api/workspace/sessions/:name/mode       { mode }   -> { ok: true } | 404 | 400
POST /api/workspace/sessions/:name/requests/:id  ChatAnswer -> { ok: true } | 404 | 400
```
`POST .../key` bị xóa. Lỗi khởi động (`WorkspaceStartError`: `worktreeMissing`, `workspaceNotConfigured`, `sessionNotFound`) trả 409 với `AppError` code như terminal route cũ trả.

**Logic:**
- `chat(name)`: `readChat(transcriptPath, cwd, working)` + `requests` / `running` / `mode` / `model` từ `AgentSession.state`. `transcriptPath`: có `sessionId` (từ `init` hoặc đã lưu) -> `projectFolder(projectsRoot, cwd)/<id>.jsonl` qua `isAcceptedPath`; `cwd` = cwd của session, chưa chạy thì `directoryOf(name).path` (fallback như cũ).
- `sessionView(name)`: `running`, `working`, `wait = waitOfRequests(requests) ?? (finished ? 'finished' : null)`. `onAttention` của session: tính wait mới, khác wait cũ và khác null -> `deps.onWait(...)` như bây giờ; broadcast `workspace.changed`. `onChange` -> broadcast `chat.changed`.
- `onSessionId(cwd, id)` -> `rememberSessionId` (giữ hàm hiện có). `resumeId(cwd)`: id đã lưu + `transcriptExists`; `continueLatest(cwd)`: tab ticket, phiên chính, `folderHasTranscripts`.
- `seen(name)`: `session.seen()` + `deps.onSeen`.
- `promptState(name)`: không có tab -> `notFound`; có request đang chờ -> `waiting`; còn lại `sent`. `prompt(name, text)`: `waiting` / `notFound` trả luôn; `send` throw `WorkspaceStartError` -> `notRunning` (log). Bỏ paste bracket / Enter trễ.
- Prompt khởi đầu: `openTicketTab(key)` xong (tab vừa mở) mà `launcher.pendingPrompt(key)` khác null -> `send` vào phiên chính rồi `shipDone(key)`; lỗi khởi động thì log, không throw.
- `closeSession` / `closeTab` / `shutdown`: `dispose()` các `AgentSession` (thay `dropHosts`).
- `services.ts`: `createSdkAgent({ executable: () => config.workspace.claudeExecutable ?? defaultClaudeExecutable(home, isWindows), env: () => sessionEnvironment(process.env), logError })`; test dùng `FakeClaudeAgent` qua option như `spawnPty` cũ.
- `addTerminal(folder)` giữ tên API (client đang gọi), chỉ là mở tab folder; không còn liên quan PTY.

**Tests:**
- `chat returns transcript messages plus the open requests and session state`
- `prompt starts the session and a second prompt reuses it`
- `prompt while a request is open returns waiting and sends nothing`
- `a worktree-missing start answers the prompt route with 409 worktreeMissing`
- `answering a request through the route resolves it; a wrong kind is 400, an unknown id 404`
- `interrupt and mode routes reach the session`
- `a new wait calls onWait once; seen clears finished`
- `Start of a new ticket sends the start prompt to its main session once`
- `closing a tab disposes its sessions`
- `the terminal and hook routes are gone (404)`
- Test Teams hand-off cũ vẫn pass (`prompt` / `promptState`).

### Task 4: Khung chat HeroUI ở client; gỡ terminal và CSS cũ

**Files:**
- Rewrite: `packages/client/src/workspace/ClaudePane.tsx` -- thanh phiên + đầu chat + `ChatView`, không còn `.legacy-page`, không còn Chat / Terminal
- Rewrite: `workspace/ChatView.tsx` (danh sách + trạng thái), `workspace/ChatRows.tsx` (dòng tin bằng Tailwind / HeroUI, giữ `react-markdown` + `remark-gfm`, không cho HTML thô)
- Create: `workspace/ChatComposer.tsx` -- ô soạn + nút Send / Stop
- Create: `workspace/ChatRequestCard.tsx` -- thẻ permission / question / plan
- Modify: `api/workspaceApi.ts` (bỏ `sendKey`; thêm `interruptSession`, `setSessionMode`, `answerRequest`), `api/useWorkspace.ts` (bỏ `useChatViewEnabled`; `useChat` không poll, refetch qua event), `api/useEvents.ts` (`chat.changed` -> invalidate chat queries)
- Modify: `settings/WorkspaceSection.tsx`, `settings/workspaceForm.ts` -- bỏ Switch "chat view", thêm chọn mode mặc định (`Select`: Default / Accept edits / Plan / Bypass permissions)
- Delete: `workspace/TerminalView.tsx`, `workspace/terminalSocket.ts` (+ test), `@xterm/xterm`, `@xterm/addon-fit` khỏi `packages/client/package.json` (`npm install`)
- Modify CSS: xóa luật `.legacy-page` (`styles/app.css` layer `legacy`, `controls.css`), `tokens.css`, `controls.css` nếu rỗng; `workspace.css` chỉ giữ luật nội dung render sẵn (`markdown-view`, `code-view`, `diff-*`, `teams-content`, `teams-mention`), xóa `claude-*`, `chat-*`, `terminal-*`, `segmented`, `workspace-tab-close`
- Test: `workspace/ChatView.test.tsx`, `workspace/ChatRequestCard.test.tsx`, `workspace/WorkspacePage.test.tsx`, `settings/WorkspaceSection.test.tsx`

**Shape:**
```tsx
export function ChatRequestCard(props: {
  readonly request: ChatRequest
  readonly onAnswer: (answer: ChatAnswer) => void
  readonly busy: boolean // the answer is being sent
}): React.JSX.Element
```

**Logic:**
- Bố cục pane: thanh phiên (tab `role="tab"` như hiện tại, nút `+` "New Claude session", nút đóng phiên phụ) -> dòng đầu chat: `Select` mode (`aria-label` "Permission mode" / "Chế độ quyền"), tên model `text-xs text-muted`, trạng thái (`Spinner` + "Working..." khi `working`) -> danh sách tin cuộn (dính đáy khi người đọc đang ở đáy, như bây giờ) -> các `ChatRequestCard` (sau tin cuối) -> `ChatComposer`.
- Mọi phiên của mọi tab vẫn mount sẵn và ẩn (như bây giờ) để giữ vị trí cuộn / chữ đang soạn; chỉ phiên đang hiện mới fetch chat (`enabled`).
- Dòng tin: user = bong bóng phải `bg-accent-soft`; assistant = markdown trái; tool = dòng gọn `font-mono text-xs` (tên tool + detail, lỗi `text-danger`, `running` có `Spinner`, `background` có `Chip` "Background"); notice = `text-xs text-muted` canh giữa.
- `ChatComposer`: `TextArea` tự cao 1-8 dòng; Enter gửi, Shift+Enter xuống dòng, đang IME composition không gửi; Stop (`variant="danger"`) thay Send khi `working`, gọi `interruptSession`; Esc trong ô soạn cũng là Stop khi `working`. Lỗi gửi (409 / mạng) -> `text-danger` dưới ô soạn, dùng `errorText` của `errors.ts` cho code (thêm code mới nếu thiếu, kèm `t(en, vi)`).
- `ChatRequestCard`:
  - permission: tiêu đề "Claude wants to use <tool>", `detail` trong khối `font-mono`; nút Allow (primary), Always allow (chỉ khi `canAlwaysAllow`), Deny (mở ô lý do tùy chọn, gửi `deny`).
  - question: mỗi câu là nhóm `RadioGroup` (hoặc `CheckboxGroup` khi `multiSelect`) theo `options` + lựa chọn "Other" có `Input`; nút Submit gửi `answers` (multiSelect nối nhãn bằng `', '`); Submit tắt khi còn câu chưa chọn.
  - plan: plan render markdown trong khung cuộn tối đa ~50vh; nút Approve (primary) và Keep planning (mở `TextArea` góp ý rồi gửi `revisePlan`).
  - `busy`: mọi nút tắt.
- Ticket mới (`starting` -> mở tab) không cần client làm gì: server tự gửi prompt khởi đầu.
- `useClaudeNotices` / chấm chờ ở tab giữ nguyên (dữ liệu vẫn là `SessionView.wait`).

**Tests:**
- `the chat shows transcript rows and a permission card that allows` -- bấm Allow gọi `POST .../requests/<id>` với `{ kind: 'allow', always: false }`.
- `a question card sends the picked labels and an Other text`
- `a plan card approves, and Keep planning sends the feedback`
- `Enter sends the prompt, Shift+Enter adds a line`
- `Stop shows while working and calls interrupt`
- `changing the mode posts it`
- `a 409 on send shows the start error text`
- `the workspace page renders no terminal and no .legacy-page` (WorkspacePage.test; bỏ mock `TerminalView`)
- `the workspace settings save the default permission mode` (WorkspaceSection.test)

### Task 5: Chạy thử với SDK thật + tài liệu

**Files:**
- Modify: `docs/claude-chat-sdk/feasibility.md` -- một dòng: đã làm ở `docs/claude-sdk-chat/`
- Modify: `CLAUDE.md` -- dòng "How the pieces fit": Claude trong Workspace là session Agent SDK (`AgentSession`), không còn PTY / hook
- Modify: `docs/test-plan.md` -- thêm mục test live cho chat SDK (prompt, Always allow, câu hỏi, plan, Stop, mode, resume sau restart server, Teams hand-off)

**Logic** (main thread làm, không phải subagent):
- `npm run build`, `npm start` (bản build trên 4870); mở Workspace ở một tab folder trỏ vào repo nháp (không phải repo thật của anh) và qua 4 luồng bằng playwright hoặc tay: prompt thường; prompt cần Bash (permission -> Allow); "dùng AskUserQuestion hỏi tôi màu" (question); chuyển mode Plan rồi xin plan (plan -> Keep planning -> Approve). Thêm: Stop giữa lượt; restart server rồi mở lại phiên (resume, lịch sử còn).
- Ghi kết quả một dòng vào `impl-notes.md`; lỗi nào thì sửa trước khi commit.

**Tests:** cả 3 workspace `npm test` pass; 4 luồng trên chạy được thật.
