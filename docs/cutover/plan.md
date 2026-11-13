# Cutover: chuyển hẳn từ NoisWorkday sang Workday

**Ticket:** side project, slug `cutover` (GĐ 7 trong `docs/web-foundation/plan.md`)

**Goal:** Workday thay hẳn app WPF.
- Một lệnh nhập dữ liệu và secret của NoisWorkday.
- Server chạy như service: systemd user unit trên Linux, Task Scheduler lúc logon trên Windows.
- Tài liệu cài trên Linux và checklist bỏ WPF.

**Expected outcome (acceptance criteria):**
- [ ] Lệnh `npm run import-wpf -- --from <thư mục NoisWorkday> [--cred <file.nwcred>] [--dry-run]` in báo cáo từng mục: nhập bao nhiêu, giữ bao nhiêu, bỏ qua vì sao. Báo cáo không in giá trị secret hay nội dung tin nhắn.
- [ ] `--dry-run` không ghi file nào.
- [ ] Lệnh từ chối chạy khi server Workday đang trả lời ở `127.0.0.1:<port>`.
- [ ] Trước khi ghi, mỗi file đích có sẵn được copy sang `<file>.before-import-<yyyyMMddHHmmss>`.
- [ ] Chỉ điền chỗ trống / hợp nhất: giá trị Workday đã có không bị ghi đè; chạy lại lần hai không đổi gì (báo cáo toàn "giữ").
- [ ] `.nwcred` (định dạng `noisworkday-tokens` v1 của `TokensExport.cs`) mở được bằng password từ `WORKDAY_IMPORT_PASSWORD` hoặc nhập ẩn trên TTY. Sai password: báo lỗi, thoát mã 1, không ghi gì.
- [ ] Secret chỉ nhập khi config tương ứng đã có, và với Jira khi `JIRA_BASE_URL` trùng `jira.baseUrl` (luật "secret chỉ gửi tới URL nó được lưu cùng").
- [ ] `deploy/linux/workday.service` + `deploy/linux/install.sh` cài, enable và start user service; `deploy/windows/install-task.ps1` đăng ký task chạy lúc logon.
- [ ] `docs/cutover/deploy.md` (cài trên Linux) và `docs/cutover/retire-wpf.md` (so tính năng + các bước bỏ WPF) có đủ nội dung.
- [ ] `scripts/import-noisworkday-board.mjs` bị xóa, phần board được gộp vào lệnh mới.

**Assumptions:**
- Dùng CLI khi server tắt, không làm nút trên UI: service giữ state trong bộ nhớ và sẽ ghi đè file nếu ghi sau lưng nó; CLI cũng không mở thêm bề mặt tấn công qua tunnel.
- Secret chỉ lấy từ `.nwcred`. DPAPI của `tokens.env` chỉ mở được trên đúng máy Windows đó; `scripts/env-from-tokens.ps1` vẫn là đường tắt cho Windows.
- Không nhập: `notices.json`, `job-runs.json`, `claude-usage.json`, `mobile/` (thiết bị LAN + cert, web dùng Tunnel + ghép nối riêng), `tsc-written.json` (web không có store tương đương), prefs thông báo, theme / ngôn ngữ / chu kỳ poll (đặt lại trong Settings nhanh hơn map).
- Chuyển dữ liệu Workday từ Windows sang Linux: copy cả data dir, gồm `master.key`. Không làm lệnh export riêng.

---

### Task 1: Core: map dữ liệu WPF (hàm thuần)

**Files:**
- Create: `packages/core/src/wpfImport.ts` + `wpfImport.test.ts`; export từ `index.ts`

Hàm thuần, không I/O, không mutate input. Input là JSON thô đã parse (`unknown`), trả state mới cùng số đếm:

```ts
export interface MergeCount { readonly added: number; readonly kept: number }
export interface Merged<T> { readonly value: T; readonly count: MergeCount }
```

Luật từng phần. Key Teams / ticket giữ nguyên dạng, thời điểm chuẩn hóa về ISO UTC.

| Nguồn WPF | Đích Workday | Luật |
|---|---|---|
| `queue.json` `{entries:[{date,tickets}]}` | queue (`QueueEntry[]`) | Thêm ngày Workday chưa có, `minutes: null`. Ngày đã có thì giữ bản Workday. Bỏ entry sai dạng / ticket key sai. |
| `teams-posts.json` | `TeamsPostIndex` (cùng shape) | Kênh chưa có: lấy cả kênh. Kênh đã có: hợp `posts`, Workday thắng theo key. |
| `settings.teamsSeenAt` / `teamsNotifiedAt` | `TeamsState.seenAt` / `notifiedAt` | Theo key lấy thời điểm muộn hơn. |
| `settings.teamsPostedAt` | `TeamsState.postedAt` | Chỉ key đúng dạng `postedKey(ticket)` (bỏ `...|db-review`); Workday thắng. |
| `settings.teamsPeople` | `TeamsState.people` | Workday trước, rồi WPF; bỏ trùng theo `mri`, cắt ở `MAX_PEOPLE`. |
| `settings.teamsAttentionBaselineDone` | `TeamsState.baselineDone` | OR. |
| `settings.hiddenTicketSuggestions` | `SuggestionState.hiddenKeys` | Hợp, bỏ trùng. |
| `settings.openTicketTabs`, `ticketClaudeTabs`, `terminalTabs`, `terminalClaudeTabs` | `WorkspaceState.tabs` | Chỉ khi Workday chưa có tab nào. Ticket tab: `{id:key, kind:'ticket', folder:null, sessions:[key, ...extra]}`. Terminal tab: tên phải qua `isTerminalName`, `folder: directory`. |
| `settings.claudeSessionIds` | `WorkspaceState.sessionIds` | Hợp, Workday thắng. |
| `settings.recentClaudeDirectories` | `WorkspaceState.recentFolders` | Workday trước, bỏ trùng, cắt ở `MAX_RECENT_FOLDERS`. |
| `settings.config.DEV_REPO_PATH` | `config.workspace.devRepoPath` | Chỉ khi đang `null`. |
| `tasks/` (board) | `BoardState` | Port mapping của `scripts/import-noisworkday-board.mjs`; ticket đã có trên board Workday thì giữ. |

- Shape Workday nằm ở server (`TeamsState`, `SuggestionState`, `WorkspaceState`): đưa interface tối thiểu vào core, hoặc để hàm nhận / trả kiểu generic có các field cần. Không import server từ core.
- Field WPF viết camelCase (`System.Text.Json` web defaults). Đọc `settings.json` phải bỏ BOM.

**Tests:** mỗi dòng bảng một test cho trường hợp thêm và giữ. Thêm các test:
- `a second merge of the same input changes nothing`
- `a malformed WPF file yields no entries, never throws`
- `postedAt drops db-review keys`
- `tabs are imported only into an empty workspace`

### Task 2: Server: lệnh `import-wpf`

**Files:**
- Create: `packages/server/src/cli/importWpf.ts` (logic, nhận `dataDir`, `from`, `cred`, `password`, `dryRun`, `log`; trả báo cáo)
- Create: `packages/server/src/cli/importWpfMain.ts` (đọc argv / env, prompt password, gọi logic, exit code)
- Create: `packages/server/src/cli/nwcred.ts` (giải mã)
- Tests cạnh từng file.
- Modify: `packages/server/package.json` thêm script `import-wpf` (`tsx --conditions=development src/cli/importWpfMain.ts`); root `package.json` thêm `import-wpf` gọi qua workspace.
- Delete: `scripts/import-noisworkday-board.mjs`

`.nwcred`:
- JSON `{Format:"noisworkday-tokens", Version:1, Iterations, Salt, Nonce, Tag, Data}` (base64).
- Khóa: PBKDF2-SHA256(password UTF-8, salt, iterations, 32 byte). Giải mã AES-256-GCM (nonce 12, tag 16), plaintext là JSON `Record<string,string>`.
- Sai định dạng hoặc sai password ném lỗi có `code` (`notAnExport` / `wrongPassword`), không kèm nội dung.
- Test tự mã hóa fixture bằng `node:crypto` với `Iterations` nhỏ.

Secret từ `.nwcred`:

| Key | Đích | Nhập khi |
|---|---|---|
| `JIRA_API_TOKEN` | `jiraApiToken` | `config.jira` có, `JIRA_BASE_URL` trùng `jira.baseUrl` (bỏ `/` cuối, so host không phân biệt hoa thường), `JIRA_EMAIL` (nếu có) trùng `jira.email` |
| `HRM_API_KEY` | `hrmApiKey` | `timesheet.hrm` có |
| `AZURE_DEVOPS_PAT` | `adoPat` | `azureDevOps` có |

- Secret Workday đã có trong file: giữ, báo "kept".
- Biến môi trường tương ứng đang đặt: bỏ qua, báo "env".
- Lưu bằng `saveSecrets`, nên secret được mã hóa bằng `master.key` như mọi secret khác.

Luồng:
1. Kiểm `GET http://127.0.0.1:<config.port>/api/health` (timeout 1 s, Host `127.0.0.1:<port>`). Có trả lời: lỗi "stop the Workday server first", exit 1.
2. `--from` không có `settings.json`: lỗi, exit 1.
3. `<from>/running` tồn tại: in cảnh báo app WPF có thể đang chạy (không chặn).
4. Đọc file WPF và file Workday qua các hàm load sẵn có, gọi core merge, gom báo cáo.
5. Không phải `--dry-run`: backup file đích sắp đổi, rồi ghi bằng các hàm save sẵn có (atomic). File không đổi thì không backup, không ghi.

Báo cáo:
- Mỗi mục một dòng: `queue: 3 added, 1 kept`, `secrets: jiraApiToken added, adoPat skipped (no Azure DevOps config)`.
- Không in secret, password, nội dung tin nhắn, đường dẫn trong `.nwcred`.

**Tests:**
- `dry run writes nothing`
- `refuses while the server answers on the port`
- `backs up only the files it changes`
- `a second run reports everything kept`
- `the Jira token is skipped when the base URL differs`
- `a wrong password exits without writing`
- `decrypts an export made with the C# parameters`
- `the report never contains a secret value`

Mọi test dùng thư mục tạm.

### Task 3: Service và tài liệu chuyển hẳn

**Files:**
- Create: `deploy/linux/workday.service`
  - user unit, `WorkingDirectory=%h/workday` (thay được bằng biến trong install).
  - `ExecStart=/usr/bin/env node --env-file-if-exists=.env packages/server/dist/main.js`, `Restart=on-failure`, `RestartSec=5`, `KillMode=control-group`, `WantedBy=default.target`.
- Create: `deploy/linux/install.sh`
  - `set -eu`. Tham số là thư mục repo (mặc định thư mục cha của script).
  - Kiểm `node -v` >= 22, rồi `npm ci && npm run build`.
  - Ghi unit vào `~/.config/systemd/user/` với đúng `WorkingDirectory`, `systemctl --user daemon-reload`, `enable --now workday`.
  - In gợi ý `loginctl enable-linger $USER`, `systemctl --user import-environment DISPLAY WAYLAND_DISPLAY` (sign-in TSC / Teams mở Chrome có giao diện) và `journalctl --user -u workday -f`.
- Create: `deploy/windows/install-task.ps1`
  - Đăng ký Scheduled Task "Workday" lúc logon của user hiện tại: chạy `node --env-file-if-exists=.env packages/server/dist/main.js` trong thư mục repo, cửa sổ ẩn, khởi động lại khi lỗi (3 lần, mỗi 1 phút).
  - Tham số `-Remove` để gỡ.
  - Có sẵn task cùng tên thì thay.
- Create: `docs/cutover/deploy.md`: cài trên Linux.
  - Gói cần: Node 22, build tools cho `node-pty` (python3, make, g++), Chrome / Playwright cho TSC / Teams, `git`, `claude`.
  - Data dir `$XDG_DATA_HOME/workday`; chuyển từ Windows bằng copy cả data dir kèm `master.key`.
  - `.env`, cách cài service, xem log, cập nhật bản mới (`git pull && npm ci && npm run build && systemctl --user restart workday`).
- Create: `docs/cutover/retire-wpf.md`
  - Bảng tính năng WPF -> Workday (có / thay bằng / bỏ): media player, UI zoom, mobile LAN server -> Tunnel, tray icon -> notice + Web Push, DB review notice, ...
  - Các bước: export `.nwcred` từ WPF; tắt WPF và bỏ tự khởi động; `npm run import-wpf -- --dry-run` rồi chạy thật; cài service; giữ nguyên `%APPDATA%\NoisWorkday` để quay lại nếu cần.
  - Cảnh báo không chạy song song hai app (log timesheet hai lần, báo Teams hai lần).
- Modify: `README.md`: mục "Run as a service" trỏ tới hai file trên.
- Modify: `docs/web-foundation/plan.md`: dòng GĐ 7 trỏ tới `docs/cutover/`.

Test: `bash -n deploy/linux/install.sh`; `systemd-analyze verify` nếu có máy Linux (không có thì ghi vào impl-notes). Chạy `install-task.ps1` thật trên Windows, kiểm task tồn tại, rồi `-Remove`.
