# Teams Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- `packages/client` trong cùng repo

**Goal:** Workspace của mỗi ticket có view Teams: tìm bài post của ticket trong các kênh theo dõi và các group chat của ticket, đọc / trả lời / đăng bài / sửa / xóa / thả reaction như chính người dùng (API chat nội bộ của Teams web, token lấy bằng Playwright), và nhắc tin nhắn chưa trả lời qua chuông + to-do.

**Expected outcome (acceptance criteria):**
- [ ] Settings > Teams: danh sách kênh theo dõi (mỗi dòng `Team > Channel`, dòng đầu là kênh đăng bài mặc định), tên lead cho lời chào bài post, mẫu lời chào (`{lead}`), trạng thái phiên (đã đăng nhập / cần đăng nhập) và nút **Sign in to Teams** mở Chrome thấy được (profile riêng trong data dir, tối đa 270 giây) cho tới khi lấy được cả token chat và token aggregator.
- [ ] Đọc dùng token lấy headless từ profile đó; chỉ có token chat mà thiếu token aggregator thì coi là cần đăng nhập lại. Token không bao giờ vào log hay ra client.
- [ ] Workspace, tab ticket: view **Teams** cạnh Changes / Files. Chọn hội thoại ở một dropdown: mỗi kênh theo dõi (`(not posted)` khi ticket chưa có bài ở đó) rồi nhóm Chats (group chat có topic bắt đầu bằng key ticket, 300 hội thoại mới nhất, cache 10 phút).
- [ ] Tìm bài post: chỉ mục `teams-posts.json` giữ bài post theo key trong từng kênh theo dõi (200 ngày) và đã đọc tới trang nào. Mỗi lần đọc: trang mới nhất của mỗi kênh (tối đa mỗi phút một lần), rồi quét sâu tối đa 40 trang / kênh, 15 trang / lần đọc, lưu sau mỗi trang. Còn quét thì báo "Looking for an older post..." và đọc lại sau 5 giây.
- [ ] Thread hiện như Teams: tên, giờ, tiêu đề bài, nội dung HTML đã lọc (chỉ thẻ trong whitelist, link http(s), không script / style / thuộc tính lạ), ảnh AMS qua proxy của server (chỉ `*.asm.skype.com`), file đính kèm là nút mở link https, chip reaction (số, của mình viền đậm, tên người trong tooltip). Đang mở view thì đọc lại mỗi 10 giây, chỉ vẽ lại khi tin nhắn đổi.
- [ ] Trả lời (Enter gửi, Shift+Enter xuống dòng), đăng bài mới (tiêu đề + nội dung, Ctrl+Enter gửi), sửa / xóa tin của chính mình (xóa hỏi trước; chỉ sửa được tin không có file và chỉ có mention người), 6 reaction nhanh trên mỗi tin. Trình soạn có đậm, nghiêng, gạch chân, gạch ngang, danh sách, trích dẫn, link, "@" để tag người (tối đa 8 gợi ý, không dấu).
- [ ] Không gửi hai lần: request có thể đã tới Teams mà không có phản hồi thì báo "không chắc đã gửi", đọc lại ngay; lần bấm gửi kế tiếp với cùng nội dung chỉ cảnh báo, bấm lần nữa mới gửi.
- [ ] Bài post mới: nháp từ `docs/<KEY>/teams-post.md` (dev repo trước, rồi worktree) hoặc mẫu `<KEY> <summary>` + khối `[BE]` / `[FE ...]` của PR đang theo dõi; dòng đầu là tiêu đề, phần còn lại markdown; thêm lời chào lead theo mẫu. Ticket đã đăng thì lần Post đầu chỉ cảnh báo.
- [ ] **Ask Claude** trên mỗi tin: ghi thread (đánh dấu tin cần xem) ra file tạm và gửi một dòng nhắc file đó vào session Claude của tab; từ chối khi Claude đang chờ quyền / câu hỏi.
- [ ] Nhắc: mỗi 2 phút đọc bài post (đã có trong chỉ mục) và chat của ticket In progress (10 ticket gần hạn nhất) + tab ticket đang mở. Tin mới nhất của người khác, mới hơn tin cuối của mình và mốc "đã xem" -> notice (topic `teams`, hoặc `teamsMention` khi tag mình) một lần mỗi tin, to-do "Teams message" (tag mình là cần ngay), chấm trên view Teams. Lần kiểm đầu chỉ ghi mốc. Mở hội thoại đó thì thành đã xem.
- [ ] Phiên hết hạn: watcher dừng tới khi đăng nhập lại, view hiện panel "Sign in to Teams".
- [ ] Mọi route Teams là local-only (không `config.access`).
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, convention lint, `npm run build` sạch.

**Architecture:** Core thêm logic thuần port từ `TeamsChat`, `TeamsCompose`, `TeamsPost`, `TeamsPostIndex`, `TeamsAttention`. Server thêm `teams/`: `TeamsSniffer` (Playwright, profile riêng, khóa riêng như `tsc/tokenSniffer.ts`), `TeamsChatClient` (fetch API chat nội bộ), `TeamsService` (chỉ mục bài post, đọc / ghi hội thoại, proxy ảnh, hand-off) và `TeamsWatcher` (nhắc, 2 phút). Client thêm view Teams trong Workspace, trình soạn `contentEditable`, Settings > Teams.

**Assumptions:**
- API không công khai: Microsoft đổi là hỏng, như sniff TSC. Port sát `Services/TeamsChatClient.cs` + `Services/TeamsWebSniffer.cs` (URL, header, user agent Chrome thường).
- Bỏ khỏi giai đoạn này: Claude phân tích / gợi ý trả lời, luồng check comment, upload ảnh / file khi soạn, code block, avatar (chỉ chữ cái đầu), Teams trên điện thoại, kênh Database Review / DB review approval, trả lời QC bug, tự đăng "PR merged" lên Teams, đọc trước khi bấm notice, Ctrl+F.
- Trình soạn là `contentEditable` của trình duyệt; HTML gửi đi luôn qua `buildBody` (whitelist) ở server, không tin HTML client.
- Giá trị riêng công ty vào config, mặc định rỗng = tắt: kênh theo dõi, tên lead, mẫu lời chào.
- Dùng `marked` (server) đổi markdown của nháp bài post sang HTML trước khi qua whitelist; `dompurify` (client) lọc thêm lần nữa trước khi gắn HTML vào DOM.

**Tech Stack:** Playwright (đã có từ GĐ 2), `fetch`, `marked`, `dompurify`.

---

## File structure

```
packages/core/src/
  teamsChat.ts          parseChannels, parseMessages, safeHtml, watched, findTicketChats, conversationKey, canReact, ams url checks
  teamsAttention.ts     pendingMessage, shouldNotify, prunedMarks
  teamsCompose.ts       buildBody, paragraphsFromText, shortName, people, isPersonMri, isEditable
  teamsPost.ts          buildPostDraft, splitSubject, withGreeting, resolvePostLead, postedKey
  teamsPostIndex.ts     withPosts, withoutPost, findPost
packages/server/src/teams/
  teamsSniffer.ts, teamsChatClient.ts, teamsStore.ts (teams-posts.json, teams-marks.json)
  teamsService.ts, teamsPosts.ts (sync chỉ mục), teamsHandOff.ts, teamsWatcher.ts
packages/server/src/routes/teamsRoutes.ts
packages/client/src/workspace/teams/
  TeamsView.tsx, TeamsThread.tsx, TeamsMessageRow.tsx, TeamsComposer.tsx, TeamsPostCard.tsx, useTeams.ts, teams.css
packages/client/src/settings/TeamsSection.tsx, teamsForm.ts
```

Mỗi file mới < 300 dòng; tách thêm nếu vượt. Spec C# ở `C:\Project\NoisWorkday` (tài liệu kiến trúc: `.claude/rules/arch/teams-view.md`); port test C# tương ứng (`tests/NoisWorkday.Tests/Teams*Tests.cs`), bỏ case thuộc phần ngoài phạm vi.

---

### Task 1: Core: đọc Teams (parse, lọc HTML, kênh, chat, nhắc)

**Files:**
- Create: `packages/core/src/teamsChat.ts` (+ test, có thể tách `teamsHtml.ts` cho `safeHtml` / `toPlainText`) -- port `Helpers/TeamsChat.cs` trừ phần DB review, code block, file upload, deep link chat; test `TeamsChatTests`
- Create: `packages/core/src/teamsAttention.ts` (+ test) -- port `Helpers/TeamsAttention.cs` (`Pending`, `ShouldNotify`, `SameMarks`, `Pruned`; không `NoticeText`); test `TeamsAttentionTests`
- Modify: `packages/core/src/index.ts`

**Shape:**
```ts
export interface TeamsChannel { readonly id: string; readonly teamName: string; readonly channelName: string }
export interface TeamsReaction { readonly key: string; readonly userMris: readonly string[] }
export interface TeamsMessageFile { readonly fileName: string; readonly url: string }
export interface TeamsMessage {
  readonly id: string; readonly senderId: string; readonly senderName: string; readonly sentAt: string
  readonly content: string; readonly isPlainText: boolean; readonly subject: string | null; readonly editedAt: string | null
  readonly mentionMris: Readonly<Record<string, string>>; readonly hasFiles: boolean; readonly reactions: readonly TeamsReaction[]
  readonly rootMessageId: string | null; readonly files: readonly TeamsMessageFile[]
}
export interface TeamsMessagePage { readonly messages: readonly TeamsMessage[]; readonly backwardLink: string | null }
export interface TeamsThread { readonly conversationId: string; readonly rootId: string; readonly messages: readonly TeamsMessage[]; readonly isChat: boolean }
export interface TeamsGroupChat { readonly id: string; readonly topic: string }
export interface WatchedChannel { readonly team: string; readonly channel: string } // from config "Team > Channel"
export interface TeamsAttentionItem {
  readonly ticketKey: string; readonly conversationKey: string; readonly chatId: string | null; readonly title: string
  readonly senderName: string; readonly sentAt: string; readonly mentionsMe: boolean; readonly conversationId: string
}
export const QUICK_REACTION_KEYS: readonly string[] // like, heart, laugh, surprised, sad, angry
export function parseChannels(json: unknown): readonly TeamsChannel[]
export function parseMessages(json: unknown): TeamsMessagePage
export function safeHtml(content: string, isPlainText: boolean): string
export function toPlainText(content: string, isPlainText: boolean): string
export function watched(channels: readonly TeamsChannel[], watchList: readonly WatchedChannel[]): readonly TeamsChannel[] // watch-list order
export function parseWatchList(lines: readonly string[]): readonly WatchedChannel[] // "Team > Channel"
export function findTicketChats(chats: readonly TeamsGroupChat[], ticketKey: string): readonly TeamsGroupChat[]
export function conversationKey(ticketKey: string, conversationId: string, rootId: string | null): string
export function mentionsMe(message: TeamsMessage, myId: string): boolean
export function canReact(message: TeamsMessage, key: string): boolean
export function emojiUrl(key: string): string
export function isAmsImageUrl(url: string): boolean
export function fullSizeImageUrl(url: string): string | null
export function pendingMessage(thread: TeamsThread, ticketKey: string, title: string, chatId: string | null,
  myId: string, seenAt: string | null): TeamsAttentionItem | null
export function shouldNotify(item: TeamsAttentionItem, notifiedAt: string | null, baselineDone: boolean, isPost: boolean): boolean
```

**Logic:**
- Input JSON là `unknown`, kiểm từng trường như parser hiện có (`server/src/jira/parseJira.ts` làm mẫu cấu trúc); message hỏng bị bỏ, không làm hỏng cả trang.
- `safeHtml` giữ đúng whitelist thẻ / thuộc tính của C# (`TagPattern`, `DroppedWithContentTags`), link chỉ http(s), ảnh chỉ AMS; mọi text được escape. Đây là ranh giới bảo mật: thêm test cho `<script>`, `onerror=`, `javascript:` link, `<img src="https://evil">`, `<style>`.
- So tên kênh như `SameName` / `WithoutEmoji` của C# (trim, không phân biệt hoa thường, bỏ mọi ký hiệu và emoji).
- Thời gian là chuỗi ISO, so bằng `Date.parse`.

**Tests:** port `TeamsChatTests` và `TeamsAttentionTests` (bỏ case DB review, code block, file upload), thêm:
- `safeHtml drops scripts, event handlers, javascript links and non-AMS images`
- `watched keeps the watch-list order and matches names without emoji or case`
- `parseMessages skips a malformed message and keeps the rest`

---

### Task 2: Core: soạn tin, bài post, chỉ mục bài post

**Files:**
- Create: `packages/core/src/teamsCompose.ts` (+ test) -- port `Helpers/TeamsCompose.cs` (`BuildBody` không có ảnh / file / code block, `ParagraphsFromText`, `ShortName`, `People`, `IsPersonMri`, `IsEmptyHtml`) và `TeamsChat.IsEditable`; test `TeamsComposeTests` phần tương ứng
- Create: `packages/core/src/teamsPost.ts` (+ test) -- port `Helpers/TeamsPost.cs` (`Build`, `SectionHeader`, `PostedKey` không có db-review, `ResolvePostLead`, `WithGreeting` với mẫu lấy từ config, `SplitSubject`); test `TeamsPostTests`
- Create: `packages/core/src/teamsPostIndex.ts` (+ test) -- port `Helpers/TeamsPostIndex.cs`; test `TeamsPostIndexTests`

**Shape:**
```ts
export interface TeamsMention { readonly text: string; readonly mri: string; readonly displayName: string }
export interface TeamsDraft { readonly html: string; readonly mentions: readonly TeamsMention[] } // html has <span data-mention="i">
export interface TeamsMessageBody { readonly html: string; readonly mentionsJson: string | null }
export interface TeamsPerson { readonly mri: string; readonly displayName: string }
export function buildBody(draft: TeamsDraft): TeamsMessageBody | null // null = empty after the whitelist
export function paragraphsFromText(text: string): string
export function isEditable(message: TeamsMessage): boolean
export function people(threads: readonly TeamsThread[], known: readonly TeamsPerson[], myId: string): readonly TeamsPerson[]
export function shortName(displayName: string): string
export function buildPostDraft(ticket: { readonly key: string; readonly summary: string }, prs: readonly TicketPr[],
  repoLabels: Readonly<Record<string, string>>): string // markdown, first line = title
export function splitSubject(draft: string): { readonly subject: string; readonly body: string }
export function withGreeting(body: string, lead: TeamsPerson | null, greeting: string | null): string // greeting "a {lead}, dạ "
export function resolvePostLead(known: readonly TeamsPerson[], leadName: string | null): TeamsPerson | null
export function postedKey(ticketKey: string): string
export interface TeamsIndexedPost { readonly rootId: string; readonly sentAt: string; readonly mine: boolean }
export interface TeamsChannelIndex {
  readonly syncedAt: string | null; readonly deepScanned: boolean; readonly deepScanPages: number
  readonly deepScanLink: string | null; readonly posts: Readonly<Record<string, TeamsIndexedPost>>
}
export type TeamsPostIndex = Readonly<Record<string, TeamsChannelIndex>> // channel id -> index
export function withPosts(index: TeamsChannelIndex, messages: readonly TeamsMessage[], myId: string, now: string): TeamsChannelIndex
export function withoutPost(index: TeamsChannelIndex, ticketKey: string): TeamsChannelIndex
```

**Logic:**
- `buildBody` là ranh giới bảo mật: HTML từ client chỉ giữ `EditableTags` của C#, link http(s), mention chỉ khi `data-mention` trỏ vào một mention có `isPersonMri`; mention dựng thành `<span itemtype="http://schema.skype.com/Mention" itemscope itemid="i">` + `mentionsJson` như C#.
- `withGreeting`: body đã bắt đầu bằng "a " / "dạ" thì giữ nguyên; `greeting` null thì không thêm; `{lead}` thay bằng tên đầy đủ (client dựng chip mention khi hiện).
- Chỉ mục giữ bài 200 ngày; bài của mình thắng bài của người khác cùng key, rồi bài mới hơn.

**Tests:** port các test C# đã nêu (bỏ ảnh, file, code block, db-review), thêm:
- `buildBody drops a mention whose index has no person mri`
- `buildBody keeps only http links and the editable tags`
- `buildPostDraft lists BE then FE blocks by the configured labels`

---

### Task 3: Server: sniff token Teams, client API chat, config

**Files:**
- Create: `packages/server/src/teams/teamsSniffer.ts` (+ test phần thuần) -- port `Services/TeamsWebSniffer.cs` bỏ token SharePoint / OneDrive và profile picture; cấu trúc theo `tsc/tokenSniffer.ts` (`launchPersistentContext`, `BrowserLock` riêng cho profile Teams)
- Create: `packages/server/src/teams/teamsChatClient.ts`, `parseTeams.ts` (+ test, `fixtures/`) -- port `Services/TeamsChatClient.cs` bỏ `UploadImageAsync`, `UploadFileAsync`, `GetProfilePictureAsync`; test `TeamsChatClientTests` phần tương ứng
- Create: `packages/core/src/ports/teamsChat.ts` -- interface `TeamsChat`
- Modify: `packages/core/src/api.ts` -- `TeamsConfig`, `WorkdayConfig.teams`, `SettingsUpdate.teams`, AppError `teamsSignedOut` | `teamsBusy` | `teamsNotConfigured` | `teamsUncertain` | `teamsFailed`
- Modify: `packages/server/src/config.ts` (`parseTeams`), `settings/parseSettings.ts`, `settingsService.ts`, `client/src/errors.ts` (dịch code mới)

**Shape:**
```ts
export interface TeamsConfig {
  readonly watchedChannels: readonly string[] // "Team > Channel"; first = default post channel; [] = Teams off
  readonly postLeadName: string | null
  readonly postGreeting: string | null // "a {lead}, dạ "
}
export interface TeamsSession { readonly chatToken: string; readonly chatUrl: string; readonly aggregatorToken: string
  readonly aggregatorUrl: string; readonly clientVersion: string | null; readonly userAgent: string }
export interface TeamsChat { // core/src/ports/teamsChat.ts
  myId(): Promise<string>
  listChannels(): Promise<readonly TeamsChannel[]>
  channelPage(channelId: string, backwardLink: string | null): Promise<TeamsMessagePage>
  thread(channelId: string, rootId: string): Promise<TeamsThread>
  listChats(): Promise<readonly TeamsGroupChat[]>
  chat(chatId: string): Promise<TeamsThread>
  postReply(channelId: string, rootId: string, body: TeamsMessageBody): Promise<string>
  postMessage(channelId: string, subject: string, body: TeamsMessageBody): Promise<string>
  postChatMessage(chatId: string, body: TeamsMessageBody): Promise<string>
  editMessage(conversationId: string, messageId: string, subject: string | null, body: TeamsMessageBody): Promise<void>
  deleteMessage(conversationId: string, messageId: string): Promise<void>
  setReaction(conversationId: string, messageId: string, key: string, add: boolean): Promise<void>
  image(url: string): Promise<{ readonly bytes: Buffer; readonly contentType: string }>
  invalidateSession(): void
}
export class TeamsSignedOut extends Error {}
export class TeamsUncertain extends Error {} // the write may have reached Teams
```

**Logic:**
- Profile: `<dataDir>/teams-browser` (không dùng profile Chrome của TSC). Sniff headless khi cần token (lần đầu, hoặc token sắp hết hạn theo `exp` của JWT -- dùng `tsc/jwt.ts`); chỉ có token chat mà không có aggregator -> `TeamsSignedOut`. `signIn()` mở Chrome thấy được, tối đa 270 giây, xong thì `invalidateSession()`. Một sniff / sign-in tại một thời điểm; lần thứ hai -> lỗi `teamsBusy`.
- Ghi (post / reply / edit / delete / reaction) không retry: lỗi mạng sau khi request đã đi, timeout, 5xx -> `TeamsUncertain`; 4xx -> lỗi thường. 401 -> `invalidateSession()` rồi `TeamsSignedOut`. GET được retry như `retry.ts`.
- `image(url)` chỉ nhận `isAmsImageUrl`, chỉ content type ảnh, tối đa 10 MB, không theo redirect.
- Không log token, header, nội dung tin nhắn.
- `parseTeams` (config): `watchedChannels` là mảng chuỗi chứa `>`; thiếu -> `[]`.

**Tests:** port `TeamsChatClientTests` phần đọc / ghi / reaction / ảnh / phân trang chat (fetch giả), thêm:
- `a write that times out throws TeamsUncertain and is not retried`
- `image refuses a non-AMS url and a non-image content type`
- `a session with a chat token but no aggregator token counts as signed out`
- `config drops a watched channel line without ">"`

---

### Task 4: Server: TeamsService (bài post, hội thoại, ghi, ảnh, hand-off) + route

**Files:**
- Create: `packages/server/src/teams/teamsStore.ts` -- `teams-posts.json` (chỉ mục), `teams-state.json` (mốc đã xem / đã báo, ngày đã đăng bài, người đã gặp)
- Create: `packages/server/src/teams/teamsPosts.ts` (+ test) -- sync chỉ mục: port phần index / sync / deep scan của `Services/TeamsThreadService.cs`
- Create: `packages/server/src/teams/teamsService.ts` (+ test) -- port `TeamsThreadService.cs` + `.Chats.cs` (đọc hội thoại, chats, post / reply / edit / delete / react, nháp bài post); bỏ analysis, comment flow, upload, avatar
- Create: `packages/server/src/teams/teamsHandOff.ts` (+ test) -- port `TeamsReply.BuildClaudeTask` + `Helpers/TeamsHandOff.cs` (chỉ đích "Claude đang chạy": gửi qua `WorkspaceService.prompt`)
- Create: `packages/server/src/routes/teamsRoutes.ts` (+ test)
- Modify: `services.ts`, `app.ts`, `settingsService.ts` (configure), `package.json` server (`marked`)

**Shape:**
```ts
export type TeamsConversationView =
  | { readonly state: 'signedOut' | 'notConfigured' }
  | { readonly state: 'searching'; readonly options: readonly TeamsOption[] } // read again in 5 s
  | { readonly state: 'notPosted'; readonly options: readonly TeamsOption[]; readonly channelId: string
      readonly draft: { readonly subject: string; readonly body: string; readonly bodyHtml: string }; readonly posted: boolean }
  | { readonly state: 'thread'; readonly options: readonly TeamsOption[]; readonly conversationId: string
      readonly thread: TeamsThread; readonly myId: string; readonly people: readonly TeamsPerson[]; readonly deepLink: string }
export interface TeamsOption { readonly id: string; readonly label: string; readonly kind: 'channel' | 'chat'; readonly posted: boolean }
export type TeamsWriteResult = { readonly ok: true; readonly id: string | null } | { readonly ok: false; readonly error: AppError }
```

**Logic:**
- `read(ticketKey, conversationId | '')`:
  1. Đồng bộ chỉ mục: trang mới nhất mỗi kênh tối đa mỗi phút một lần, lùi tới lần sync trước trừ 1 ngày; rồi quét sâu 15 trang mỗi lần, tối đa 40 trang / kênh; lưu sau mỗi trang.
  2. `''` = bài post mặc định: bài của mình trước, rồi bài trong kênh đăng bài, rồi bài mới nhất. Không có bài và chưa quét xong -> `searching`. Quét xong mà không có -> `notPosted` với kênh mặc định, hoặc chat đầu tiên của ticket nếu có.
  3. Bài đã bị xóa thì bỏ khỏi chỉ mục. `thread()` chỉ trả root thì lấy reply (`rootMessageId`) từ trang mới nhất của kênh (như C#).
- Nháp bài: `docs/<KEY>/teams-post.md` trong `devRepoPath` rồi worktree của ticket (`ticketWorktrees.ts`), else `buildPostDraft`; `withGreeting` theo config; `bodyHtml` = `marked` -> `safeHtml`.
- Ghi:
  - Mọi ghi chạy tuần tự một hàng đợi theo ticket; body từ client đi qua `buildBody`, null -> 400.
  - Post bài: ticket đã có `postedAt` (hoặc lần trước `TeamsUncertain` với cùng nội dung) và client không gửi `confirm: true` -> `{ ok: false, error: { code: 'teamsUncertain' } }` không gửi. Thành công thì ghi `postedAt` (giữ 180 ngày) và thêm bài vào chỉ mục.
  - Reply / chat message: `TeamsUncertain` -> trả lỗi `teamsUncertain` và đọc lại; lần gửi lại cùng nội dung cần `confirm: true`.
  - Reaction chỉ nhận key `canReact`; add / remove theo việc mình đã có trong reactors.
  - Edit chỉ khi `isEditable`; xóa root -> bỏ khỏi chỉ mục.
- `image(url)` route: `GET /api/teams/image?url=` -> bytes với content type gốc, `cache-control: private, max-age=86400`, CSP `sandbox`.
- Hand-off: file `<tmp>/workday/teams-tasks/<KEY>-<stamp>.md` (thread dạng text, tin cần xem có dấu `>>>`), dòng gửi `Read <path> and look into the marked Teams message. Do not change code before I agree.`; từ chối khi session đang chờ quyền / câu hỏi (`wait` là `permission` | `question`) hoặc không chạy. Giữ 20 file mới nhất.
- Route (local-only, `invalidKey` cho key sai):
  - `GET /api/teams/:key?conversation=`.
  - `POST /api/teams/signin`.
  - `POST /api/teams/:key/reply` `{conversationId, rootId|null, draft, confirm?}`.
  - `POST /api/teams/:key/post` `{channelId, subject, draft, confirm?}`.
  - `POST /api/teams/:key/edit` `{conversationId, messageId, subject|null, draft}`.
  - `POST /api/teams/:key/delete` `{conversationId, messageId}`.
  - `POST /api/teams/:key/react` `{conversationId, messageId, key}`.
  - `POST /api/teams/:key/handoff` `{conversationId, messageId, session}`.
  - `GET /api/teams/image`.
  - `GET /api/teams/status` -> `{ configured, signedIn: boolean | null }`.

**Tests:**
- port `TeamsThreadServiceTests` phần sync / tìm bài / post / reply / edit / delete / react / chats (bỏ analysis, comment flow, upload)
- `read returns searching while the deep scan is unfinished`
- `a second post of a posted ticket only warns until confirm`
- `an uncertain reply asks for confirm before sending the same text again`
- `reply refuses a draft that is empty after the whitelist`
- `image route serves only AMS urls`
- `handoff writes the thread with the marker and sends one line to the session`
- `handoff refuses while the session waits for a permission`
- `teams routes are local-only` (remote request -> 403)

---

### Task 5: Server: nhắc tin Teams (watcher, notice, to-do, đã xem)

**Files:**
- Create: `packages/server/src/teams/teamsWatcher.ts` (+ test) -- port `UI/TrayApp.TeamsAttention.cs` + `Services/TeamsThreadService.Attention.cs` (`ReadConversationsAsync`)
- Modify: `packages/core/src/notices.ts` -- topic `teams` | `teamsMention` (kênh mặc định: toast + desktop bật cho cả hai, phone bật cho `teamsMention`); event `{ type: 'teamsMessage'; key; title; sender; mention: boolean }`; target `{ kind: 'teams'; key; conversationId }`; `noticeText` Anh / Việt
- Modify: `packages/core/src/todos.ts` -- kind `teamsMessage` `{ ticketKey; item: TeamsAttentionItem }` đứng sau `claudeWaiting`; `mentionsMe` -> cần ngay; `TodoInput.teams: readonly TeamsAttentionItem[]`
- Modify: `packages/server/src/work/workView.ts`, `services.ts` (watcher + `PollScheduler` 2 phút, dừng khi tắt), `routes/teamsRoutes.ts` (`POST /api/teams/:key/seen` `{conversationId}`), `GET /api/teams/:key` thêm `pending: readonly string[]` (conversation id có tin chờ)

**Logic:**
- Mỗi lượt (lần đầu sau 1 phút, rồi mỗi 2 phút; không cấu hình hoặc `TeamsSignedOut` -> dừng tới khi đăng nhập lại / configure lại):
  1. Ticket = 10 ticket In progress gần hạn nhất + ticket có tab Workspace đang mở.
  2. Mỗi ticket: bài post đã có trong chỉ mục ở mỗi kênh theo dõi (không sync, không search), tiêu đề `<Team> > <Channel>`; các chat của ticket.
  3. `pendingMessage` với mốc đã xem của hội thoại đó.
  4. `shouldNotify` -> notice, rồi ghi mốc đã báo. Bài đọc lần đầu (chưa có mốc) không báo. Lần kiểm đầu tiên chỉ ghi mốc.
- Mốc giữ theo `conversationKey`, tỉa sau 60 ngày trừ hội thoại vừa đọc hoặc vừa đánh dấu đã xem. Lưu `teams-state.json` khi đổi; broadcast `work.changed` khi danh sách chờ đổi.
- Notice: topic `teamsMention` khi tag mình, else `teams`; target `teams`; place `teams:<conversationKey>`.
- `seen(key, conversationId)`: mốc đã xem = tin mới nhất, bỏ khỏi danh sách chờ, `notices.markReadAt('teams:<conversationKey>')`. Client gọi khi view Teams đang hiện hội thoại đó và cửa sổ đang focus.

**Tests:**
- port `TeamsAttentionTests` phần còn lại (nếu Task 1 chưa port) và các case `ReadConversations` của `TeamsThreadServiceTests`
- `the first check only records marks and raises no notice`
- `a new message from someone else raises one notice and a teams to-do`
- `a mention makes the to-do needed now and uses the teamsMention topic`
- `seen clears the to-do and reads the notice`
- `a signed-out session stops the watcher until sign-in`

---

### Task 6: Client: view Teams trong Workspace

**Files:**
- Create: `packages/client/src/workspace/teams/useTeams.ts`, `TeamsView.tsx`, `TeamsThread.tsx`, `TeamsMessageRow.tsx`, `teams.css` (+ test cho view và message row)
- Modify: `packages/client/src/workspace/LeftPane.tsx` -- view thứ ba **Teams** (chỉ tab ticket), chấm khi `pending` có hội thoại; `api/client.ts` / `api/teamsApi.ts`; `notices/noticeTarget.ts` -- target `teams` mở `#/workspace/<KEY>` với view Teams và hội thoại đó; `package.json` client (`dompurify`)

**Logic:**
- Trên cùng:
  - Dropdown hội thoại: `options` nhóm theo kênh rồi "Chats", `(not posted)` khi chưa đăng; nhãn nút "Post: <Team> > <Channel>" / "New post: ..." / "Chat: <topic>".
  - Nút Open in Teams (`deepLink`), Refresh, dòng trạng thái.
  - Đổi hội thoại thì bỏ kết quả đọc cũ về muộn.
- Panel trạng thái:
  - `signedOut`: nút Sign in to Teams, gọi `/api/teams/signin`.
  - `notConfigured`: chỉ tới Settings > Teams.
  - `searching`: "Looking for an older post..." và đọc lại sau 5 giây.
- Thread:
  - Mỗi tin có chữ cái đầu tên (màu theo tên), tên, giờ (theo `timeZone`), tiêu đề (root).
  - Nội dung HTML qua `DOMPurify.sanitize` rồi `dangerouslySetInnerHTML`. Ảnh AMS đổi `src` sang `/api/teams/image?url=`; bấm ảnh mở bản full-size ở tab mới qua cùng proxy.
  - File là nút mở link (`noopener`). Chip reaction dùng `emojiUrl`, ảnh lỗi thì hiện key.
- Hover bar mỗi tin:
  - 6 reaction nhanh, khóa tới khi xong.
  - **Ask Claude**: gửi tới session đầu của tab; lỗi thì hiện một dòng.
  - Edit / Delete cho tin của mình; Delete hỏi xác nhận.
- Đọc lại:
  - Mỗi 10 giây khi view đang hiện và `document.hasFocus()`, không đọc khi đang ghi.
  - Chỉ vẽ lại khi id / số tin / thời điểm sửa / reaction đổi; cuộn xuống cuối khi số tin đổi.
- Đã xem: hội thoại đang hiện nằm trong `pending` và cửa sổ đang focus -> `POST seen`.

**Tests:**
- `teams view shows the sign-in panel when signed out`
- `teams view polls again while searching`
- `message row sanitizes html and routes AMS images through the proxy`
- `own message shows edit and delete; delete asks first`
- `a reaction press locks the reactions until the request ends`
- `opening a pending conversation marks it seen`

---

### Task 7: Client: trình soạn, bài post, Settings > Teams, to-do

**Files:**
- Create: `packages/client/src/workspace/teams/TeamsComposer.tsx` (+ test), `TeamsPostCard.tsx` (+ test) -- port hành vi của `UI/TeamsComposer*.cs` (bỏ ảnh, file, code block) và `UI/TeamsPage.Post.cs`
- Create: `packages/client/src/settings/TeamsSection.tsx`, `teamsForm.ts` (+ test)
- Modify: `TeamsView.tsx`, `TeamsMessageRow.tsx` (edit tại chỗ), `board/TodoRow.tsx` + `board/todoText.ts` (kind `teamsMessage`: tiêu đề hội thoại, người gửi, giờ; nút Open -> view Teams của ticket, ẩn trên thiết bị từ xa), `settings/SettingsPage.tsx`, `notices/NoticesSection.tsx` (2 topic mới)

**Logic:**
- Composer: `contentEditable`; toolbar đậm / nghiêng / gạch chân / gạch ngang / danh sách / trích dẫn / link (chỉ http(s), prompt riêng) / Ctrl+B I U.
  - "@" ở đầu từ (hoặc nút @) mở danh sách tối đa 8 người (`people` từ server, so không dấu, `shortName`). Chọn -> chip `<span data-mention="i" contenteditable="false">`; Backspace ngay sau chip xóa chip.
  - Dán: chỉ giữ text thuần (bỏ HTML dán vào).
  - Gửi `TeamsDraft {html, mentions}`.
  - Chế độ Reply: Enter gửi, Shift+Enter xuống dòng. Chế độ Post / Edit: Enter xuống dòng, Ctrl+Enter gửi.
  - Chỉ xóa nội dung sau khi gửi thành công.
- `teamsUncertain`: hiện "Có thể đã gửi - kiểm tra thread trước khi gửi lại"; lần bấm gửi tiếp theo gửi `confirm: true`.
- Post card (`notPosted`):
  - Tiêu đề và nội dung lấy từ `draft`; nội dung nạp bằng `bodyHtml` đã qua DOMPurify. Nháp theo server cho tới khi người dùng sửa; có nút Reload draft.
  - `posted: true` thì lần Post đầu chỉ cảnh báo.
  - Gửi xong thì đọc lại để hiện thread.
- Edit: tin của mình đổi thành composer tại chỗ (root có thêm ô tiêu đề), Cancel / Esc, Save.
- Settings > Teams:
  - Textarea kênh theo dõi (mỗi dòng `Team > Channel`), tên lead, mẫu lời chào; Save qua `PUT /api/settings`.
  - Trạng thái `GET /api/teams/status` và nút Sign in to Teams.

**Tests:**
- `composer sends html with mention markers and clears only after success`
- `typing @ lists at most eight people matched without accents`
- `pasting html inserts plain text`
- `reply sends on Enter, post sends on Ctrl+Enter`
- `post card warns first when the ticket was posted`
- `an uncertain send asks before sending again with confirm`
- `teams section saves watched channels in order`
- `a teams to-do opens the ticket's Teams view`

---

## Kiểm tra cuối giai đoạn

1. `npm test`, `npm run typecheck`, `npm run lint`, convention lint, `npm run build` sạch.
2. Người dùng thử thật:
   1. Settings > Teams: kênh `MDP (Monster Digital Platform) > PR in the hole`, `MDP (Monster Digital Platform) > Database Review`, `TSC Miami > General`, `Task-MDP > Alert`; lead `Minh Dinh`; lời chào `a {lead}, dạ `; Sign in to Teams.
   2. Mở tab Workspace của một ticket đã đăng bài: view Teams tìm ra bài, hiện thread và reaction.
   3. Thử reply / sửa / xóa / reaction trong kênh test (Task-MDP > Alert) trước.
   4. Có người nhắn vào bài: sau tối đa 2 phút có notice + to-do; mở hội thoại thì thành đã xem.
