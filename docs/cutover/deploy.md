# Cài Workday trên Linux

Workday chạy như một systemd user service, nghe ở `127.0.0.1:4870`. Truy cập từ máy khác qua Cloudflare Tunnel (xem phần Remote access trong Settings).

## Gói cần có

- Node 22 (xem `.nvmrc`) và npm. Unit gọi `/usr/bin/env node` trong PATH của systemd user, không phải PATH của shell: node cài qua nvm không thấy được, khi đó sửa `ExecStart` thành đường dẫn đầy đủ (`which node`).
- Các lệnh tab Workspace gọi (`git`, `claude`) cũng phải có trong PATH của systemd user: đặt `Environment=PATH=...` trong unit nếu chúng nằm ở `~/.local/bin`.
- Build tools cho `node-pty`: `python3`, `make`, `g++` (Debian / Ubuntu: `sudo apt install build-essential python3`).
- Google Chrome hoặc Chromium do Playwright dùng: đăng nhập TSC và Teams mở Chrome có giao diện, nên cần một phiên desktop (X11 hoặc Wayland).
- `git` (worktree, commit, diff) và `claude` (CLI Claude Code) có trong `PATH`.

## Cài service

```sh
git clone <repo Workday> ~/workday
~/workday/deploy/linux/install.sh          # hoặc: install.sh /đường/dẫn/repo
```

Script kiểm Node >= 22, chạy `npm ci && npm run build`, ghi unit vào `~/.config/systemd/user/workday.service` (đúng `WorkingDirectory` của repo), rồi `systemctl --user enable --now workday`. Sau đó:

```sh
loginctl enable-linger $USER                                  # chạy cả khi chưa đăng nhập
systemctl --user import-environment DISPLAY WAYLAND_DISPLAY   # để sign-in TSC / Teams mở được Chrome
```

`import-environment` chỉ có hiệu lực cho phiên hiện tại: chạy lại sau khi đăng nhập desktop, rồi `systemctl --user restart workday`.

## Data dir

Dữ liệu từng người dùng nằm ở `$XDG_DATA_HOME/workday` (mặc định `~/.local/share/workday`); `WORKDAY_DATA_DIR` ghi đè. Gồm `config.json`, `secrets.json`, `board.json`, `master.key`...

Chuyển từ Windows (`%APPDATA%\Workday`): tắt server cả hai máy, copy **cả thư mục** kèm `master.key` sang data dir Linux. Thiếu `master.key` thì `secrets.json` không giải mã được. Không có lệnh export riêng.

## `.env`

Đặt `.env` ở gốc repo (đã bị gitignore, không commit). Service đọc file này khi khởi động:

```sh
WORKDAY_JIRA_API_TOKEN=<Jira API token>
WORKDAY_HRM_API_KEY=<HRM API key>
WORKDAY_MS_GRAPH_TOKEN=<tùy chọn: thay cho bước sniff token TSC trên máy không có màn hình>
```

Giá trị trong `.env` thắng giá trị lưu ở Settings. Sửa `.env` xong cần `systemctl --user restart workday`.

## Log, trạng thái, cập nhật

```sh
systemctl --user status workday
journalctl --user -u workday -f

cd ~/workday && git pull && npm ci && npm run build && systemctl --user restart workday
```

Gỡ: `systemctl --user disable --now workday && rm ~/.config/systemd/user/workday.service`.

## Windows

`deploy/windows/install-task.ps1` đăng ký Scheduled Task "Workday" chạy lúc logon (cửa sổ ẩn, khởi động lại 3 lần, mỗi lần cách 1 phút); `-Remove` để gỡ. Cần `npm run build` trước.
