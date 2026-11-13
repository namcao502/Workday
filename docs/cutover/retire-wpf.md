# Bỏ app WPF (NoisWorkday)

## So tính năng

Một dòng mỗi tính năng. "Cần kiểm" nghĩa là chưa đối chiếu được với code, kiểm trước khi bỏ WPF.

| Tính năng WPF | Workday | Ghi chú |
| --- | --- | --- |
| Bảng ticket Jira (Working / To take / Done / Dismissed) | Có | Trang Board / Work |
| To-do (Claude chờ, Teams, bug QC, PR bị chặn), gợi ý ticket | Có | Board |
| Theo dõi PR Azure DevOps, Ready to Test | Có | Board |
| Timesheet: queue, log TSC + HRM, tự log 18:00, Log OFF, tuần | Có | Trang Timesheet |
| Workspace: terminal PowerShell / `claude`, phiên Claude, Changes, Files | Có | Trang Workspace (`node-pty`) |
| Chat Claude view | Có | Workspace |
| Teams: đọc / trả lời thread, chat, bài đăng PR, nhắc | Có | Trang Teams |
| Insights: giờ HRM, token Claude, commit, xuất CSV / markdown | Có | Trang Insights |
| Schedules, knowledge scan, lịch sử job | Có | Trang Schedules |
| Chuông thông báo (notice) | Có | Notice bell |
| Tray icon, toast | Thay bằng notice + Web Push | Không còn icon khay |
| Mobile LAN server (HTTPS + PWA + cert) | Thay bằng Cloudflare Tunnel + ghép nối thiết bị + Web Push | Thiết bị phải ghép lại |
| Quyền thiết bị Off / View / Act | Có | `config.access` |
| Media player, âm lượng, giữ máy thức | Bỏ | Không port |
| UI zoom, theme, ngôn ngữ | Bỏ (trình duyệt tự zoom) | Đặt lại ngôn ngữ trong Settings |
| Dọn worktree (Worktree cleanup) | Cần kiểm | |
| DB review notice | Cần kiểm | |
| Dev deploys, rebuild / watchdog của app | Cần kiểm | Thay bằng systemd / Task Scheduler |
| Guide trong Settings | Cần kiểm | |
| Export / Import credentials `.nwcred` | Thay bằng `npm run import-wpf` | |

## Các bước

1. **Xuất credentials từ WPF**: Settings > Tools > Export credentials... đặt password, lưu file `.nwcred`.
2. **Tắt WPF** (Quit trong menu tray) và bỏ tự khởi động (Settings của WPF hoặc Task Scheduler / Startup).
3. **Tắt server Workday** nếu đang chạy: lệnh nhập từ chối chạy khi `127.0.0.1:<port>` còn trả lời.
4. **Chạy thử rồi chạy thật**:

   ```sh
   npm run import-wpf -- --from "%APPDATA%\NoisWorkday" --cred noisworkday-credentials.nwcred --dry-run
   npm run import-wpf -- --from "%APPDATA%\NoisWorkday" --cred noisworkday-credentials.nwcred
   ```

   Password `.nwcred` lấy từ biến `WORKDAY_IMPORT_PASSWORD` hoặc nhập ẩn trên TTY. Báo cáo liệt kê từng mục: nhập, giữ, bỏ qua vì sao (không in secret hay nội dung tin nhắn). Chỉ điền chỗ trống, không ghi đè giá trị Workday đã có; chạy lại lần hai không đổi gì. File đích có sẵn được copy sang `<file>.before-import-<yyyyMMddHHmmss>`.
5. **Cài service**: Windows `deploy\windows\install-task.ps1`; Linux `deploy/linux/install.sh` (xem `deploy.md`).
6. **Ghép lại thiết bị** điện thoại qua Tunnel, đăng nhập lại TSC / Teams trong Settings.
7. **Giữ nguyên `%APPDATA%\NoisWorkday`** để quay lại WPF nếu cần.

Không nhập: `notices.json`, `job-runs.json`, `claude-usage.json`, `mobile/`, `tsc-written.json`, prefs thông báo, theme / ngôn ngữ / chu kỳ poll.

## Cảnh báo

**Không chạy song song hai app.** Cả hai cùng log timesheet (ghi hai lần vào TSC / HRM) và cùng báo Teams (hai lần). Tắt WPF hẳn trước khi bật Workday, kể cả khi quay lại thì tắt Workday trước.
