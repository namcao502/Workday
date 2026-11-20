# Backup & chuyển máy - plan

**Ticket:** side project (slug `backup-transfer`)
**Goal:** Settings có Export (đặt mật khẩu, tải một file) và Import (chọn file + nhập mật khẩu) để mang toàn bộ cấu hình, secrets và dữ liệu sang máy khác.
**Assumptions:**
- File backup chứa mọi file JSON ở gốc data dir + `master.key` (khóa thực đang dùng, kể cả khi lấy từ `WORKDAY_MASTER_KEY`). Mang theo khóa nên các giá trị `enc:v1:` (secrets.json, lan-tls.json, graph-token.json) mở được ở máy mới mà không phải giải mã từng trường.
- Không mang: `desktop.json` (vị trí cửa sổ, serverDir của máy cũ), thư mục con (profile trình duyệt Teams/TSC, webview, log, tmp), `*.bad`, `*.before-*`, file `.log`. Teams/TSC đăng nhập lại ở máy mới.
- Import không ghi đè lúc server đang chạy (state trong RAM sẽ lưu đè). Nó giải mã, kiểm tra, rồi đặt vào `import-pending/`; lần khởi động sau server áp dụng trước khi đọc bất kỳ file nào.
- Mật khẩu tối thiểu 8 ký tự. Sai mật khẩu và file hỏng là hai lỗi khác nhau.

**Expected outcome (acceptance criteria):**
- [ ] Export với mật khẩu tải về `workday-backup-YYYYMMDD.wdbackup`; không đọc được nếu không có mật khẩu.
- [ ] Import file đó với đúng mật khẩu ở một data dir khác, khởi động lại: config, secrets (token Jira/HRM/ADO...), board, thiết bị đã ghép đôi, CA của VPN đều như máy cũ.
- [ ] Sai mật khẩu báo `backupWrongPassword`; file không phải backup hoặc hỏng báo `backupInvalid`; không ghi gì.
- [ ] Bản cũ của mỗi file bị thay được giữ trong `before-import-<timestamp>/`.
- [ ] Trong app desktop có nút "Khởi động lại" sau Import (không build); ngoài app thì hiện lời nhắc khởi động lại Workday.
- [ ] Toàn bộ test, typecheck, lint sạch.

### Task 1: Server - định dạng backup, route, áp dụng lúc khởi động

**Files:** `packages/server/src/backup/backupFile.ts` (+ test), `packages/server/src/backup/pendingImport.ts` (+ test), `packages/server/src/routes/backupRoutes.ts` (+ test), `app.ts`, `main.ts`, core `api.ts` (AppError codes, kiểu response).

- Định dạng file (JSON, UTF-8):
  ```json
  { "format": "workday-backup", "version": 1, "createdAt": "...",
    "kdf": { "name": "scrypt", "N": 32768, "r": 8, "p": 1, "salt": "<b64 16B>" },
    "iv": "<b64 12B>", "tag": "<b64 16B>", "data": "<b64 ciphertext>" }
  ```
  Plaintext = JSON `{ "files": { "<name>": "<b64 bytes>" } }`. Khóa = scrypt(password, salt, 32, {N,r,p, maxmem đủ}); AES-256-GCM. GCM tag sai => `backupWrongPassword`; JSON/format/version/field sai => `backupInvalid`.
- `createBackup(dataDir, password, now)` và `openBackup(text, password)` thuần (chỉ đọc file cho create). Tên file chỉ nhận `^[A-Za-z0-9._-]+$`, không có `/`, `\`, `..` (chặn ghi ra ngoài data dir khi import).
- Routes (local và thiết bị đã ghép đôi đều gọi được, như mọi route):
  - `POST /api/backup/export` `{ password }` -> 200 `application/octet-stream`, `Content-Disposition: attachment; filename="workday-backup-YYYYMMDD.wdbackup"`. Mật khẩu < 8 ký tự -> 400 `backupPasswordTooShort`.
  - `POST /api/backup/import` `{ password, data }` (`data` = nội dung file dạng text) -> ghi vào `<dataDir>/import-pending/` (xóa pending cũ trước), trả `{ files: string[] }`. Giới hạn body đủ lớn (vd 20 MB) cho route này.
- `applyPendingImport(dataDir, now)` gọi ở đầu `main.ts`, trước `createServices`: nếu có `import-pending/`, với mỗi file chuyển bản hiện có vào `before-import-<yyyyMMdd-HHmmss>/` rồi đưa file mới vào, cuối cùng xóa `import-pending/`. Log một dòng số file đã áp dụng.
- Tests: `round trip restores every file and master.key`, `wrong password is backupWrongPassword`, `tampered data or wrong format is backupInvalid`, `desktop.json, folders, .bad and .before- files are left out`, `a name with a path separator is rejected`, `apply moves old files aside and installs the pending ones`, `no pending folder changes nothing`, route `export sends an attachment`, `short password is refused`, `import stages files and reports them`.

### Task 2: Client card + nút khởi động lại trong app desktop

**Files:** `packages/client/src/settings/BackupSection.tsx` (+ test), `settingsGroups.tsx` (entry `backup` trong nhóm general), API helper, `i18n/en.ts` + `vi.ts`, `errors.ts` (3 mã lỗi mới); `packages/client/src/shell/desktopHost.ts` (`requestServerRestart()` gửi `{ type: 'server', action: 'restart' }`); desktop `MainForm.cs`, `ServerProcess.cs` (`RestartAsync(..., bool isBuildNeeded)`; tray Build & restart truyền `true`, tin nhắn web truyền `false`) + test.

- Card "Sao lưu & chuyển máy": phần Export (mật khẩu + nhập lại, nút Export tải file qua blob + `<a download>`; hai ô không khớp thì nút tắt và báo); phần Import (chọn file `.wdbackup`, mật khẩu, nút Import). Import xong hiện danh sách file + "Khởi động lại để áp dụng": trong app desktop là nút gọi `requestServerRestart()`, ngoài app là câu nhắc.
- Shell: tin `{type:'server', action:'restart'}` -> `RestartAsync(serverDir, log, ct, isBuildNeeded: false)` rồi Navigate lại như Build & restart; lỗi hiện balloon như cũ.
- Tests: client `export downloads the file with the typed password`, `mismatched passwords block export`, `import shows the files and a restart hint`, `wrong password shows its message`; desktop `RestartAsync_SkipsBuild_WhenNotNeeded`.
