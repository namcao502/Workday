# Impl notes: cutover

## Task 1: Core: map dữ liệu WPF
- **Lệch:** `MAX_PEOPLE` (teamsCompose) và `MAX_RECENT_FOLDERS` (workspaceTabs) chuyển vào core; server import lại. Thêm `parseWpfJson` (bỏ BOM, JSON hỏng -> null) và `MergedParts` cho merge nhiều phần. `mergeBoard` nhận 5 file của `tasks/` đã parse (null khi thiếu).
- **Quyết định:** entry sai dạng hoặc bị cắt vì giới hạn không tính vào added / kept, nên chạy lần hai luôn ra added 0. Đếm bài Teams theo bài, không theo kênh. Session phụ phải dạng `<id>~N`, session id cần `|` trong key và value là GUID (cùng luật parser server). Thời điểm chuẩn hóa ISO UTC; giá trị Workday có sẵn không bị viết lại.
- Gate: sửa comment đầu file quá 25 từ (convention lint). Test core 573 PASS; typecheck, lint sạch.

## Task 3: Service và tài liệu chuyển hẳn
- **Quyết định:** `install.sh` dùng `sed` thay `WorkingDirectory`; `.gitattributes` ép LF cho `deploy/**/*.sh`. `install-task.ps1` có `-RepoDir`, principal interactive, không giới hạn thời gian chạy, cảnh báo khi chưa build. Các dòng chưa chắc trong `retire-wpf.md` đánh "Cần kiểm".
- **Lưu ý:** `systemd-analyze verify` chưa chạy (không có máy Linux). Unit dùng `/usr/bin/env node`: node cài qua nvm không nằm trong PATH của systemd user, cần node hệ thống hoặc sửa `ExecStart` (đã ghi trong deploy.md).
- `bash -n` PASS; `install-task.ps1` chạy thật trên Windows, task đúng action / trigger / restart, rồi `-Remove` sạch.

## Task 2: Server: lệnh `import-wpf`
- **Lệch:** thêm `cli/password.ts` (env thắng, prompt ẩn trên TTY), `testing/nwcredFixture.ts`. `readPort` chuyển từ `main.ts` sang `config.ts` (dùng chung với lệnh import, tôn trọng `WORKDAY_PORT`). Thêm `peekFileSecrets` (chỉ đọc: không mã hóa lại, không tạo `master.key`), `isValidJsonFile`, `findMasterKey`; export parser của các store. Script server nạp thêm `../../.env`; `--from` / `--cred` tương đối tính theo `INIT_CWD`.
- **Quyết định:** kiểm mọi file đích trước khi load (file hỏng -> `workdayFileInvalid`, không để loader đổi thành `.bad`). `secrets.json` có giá trị không giải mã được thì không ghi file đó (báo `kept (cannot decrypt)`), để không mất `tunnelToken` / `vapidPrivateKey`. Thiếu `master.key` -> bỏ secret. Password hỏi sau cùng. Lỗi lưu giữa chừng báo file đã ghi / lỗi / backup, exit 1. Iterations của `.nwcred` giới hạn 1..10M.
- **Review (opus):** lần 1 PASS kèm 1 IMPORTANT (dry run vẫn có thể ghi qua loader) + 5 MINOR; sửa hết, re-review PASS.
- **Chưa kiểm:** giải mã một `.nwcred` thật do app WPF xuất (test tự mã hóa bằng Node theo đúng tham số C#). Kiểm khi chạy thật.
- Dry run trên `%APPDATA%\NoisWorkday` thật với data dir tạm: queue 1, bài Teams 1046, tab 5, board 11 / 31 / 5, không ghi file nào.
- Test client 145, core 573, server 644 + 1 skip PASS; typecheck, lint, build, convention lint sạch.

## Kiểm tra cuối
- Server build khởi động bình thường sau khi chuyển `readPort`; `/api/health` OK.
- Chưa test live: import thật (có `.nwcred`), service systemd trên Linux.
