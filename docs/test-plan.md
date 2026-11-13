# Test plan: test lại từng phase trên máy thật

Chạy bằng `npm run dev` (http://localhost:5173), app WPF đã tắt. Tick `[x]` khi xong, ghi lỗi vào mục "Phát hiện" cuối file.
Thứ tự đề xuất: 1, 2, 4, 5, 5b, 6, Desktop PWA, 3, 7 (GĐ 3 cần Cloudflare, GĐ 7 ghi đè data nên để cuối).

## 0. Chuẩn bị

- [ ] Backup `%APPDATA%\Workday` trước khi test.
- [ ] Tắt app WPF trong lúc test Timesheet và Teams (hai app cùng ghi một ô).

## GĐ 1: Nền móng + Board Jira

- [ ] Settings > Connections: **Check** với token đúng / sai / URL sai; **Save** -> board kết nối ngay.
- [ ] Settings > General: Theme và Language áp dụng ngay, giữ sau reload; ở tiếng Việt lỗi server cũng tiếng Việt.
- [ ] Board: **Check now**; view Working / Done / Dismissed có số đếm; search theo key và summary.
- [ ] Gõ key hoặc link chưa có trên board -> **Add <KEY>**; key không tồn tại -> báo lỗi, không thêm.
- [ ] Menu dòng Done / Dismiss / Restore / Reopen; restart server vẫn giữ.
- [ ] Màu hạn: quá hạn đỏ, còn <= 2 ngày cam, ticket Jira Done không tô.
- [ ] Hai tab trình duyệt: thao tác ở tab này, tab kia tự cập nhật.
- [ ] Cửa sổ < 720px: tab bar dưới đáy, bảng thành thẻ.

## GĐ 2: Timesheet (ghi thật lên TSC / HRM)

- [ ] Settings > Timesheet: **Check HRM**, **Sign in to TSC**, **Check TSC session**.
- [ ] Trang Timesheet đọc tuần hiện tại khớp app WPF; thẻ ngày Off / Queued / Logged / Empty / Future; tiêu đề `HRM xh / 40h`, `TSC n / 4`.
- [ ] Tuần trước / sau đọc được, không mở lại Chrome.
- [ ] Queue: `MDP-1, 2` + **+** chia đều 8h; thêm vào ngày đã có thì gộp; tổng > 8h bị từ chối.
- [ ] Sửa giờ (bước 30 phút, >= 30 phút / ticket), bỏ bằng [X], **Clear queue** hỏi trước.
- [ ] Ô ticket: chấm xanh / đỏ / vàng, "Not your ticket" kèm **Use <KEY>**.
- [ ] Xếp một ngày đã qua, **Log now** của thẻ -> kiểm Excel và HRM web; chạy lại không ghi đôi.
- [ ] Log hôm nay lên HRM trước 18:00 bị chặn; TSC only vẫn được.
- [ ] **Log OFF** một ngày thử (rồi sửa lại tay trên Excel).
- [ ] Đặt `logTime` sớm hơn giờ hiện tại vài phút -> lời nhắc (queue trống) hoặc drain (queue có mục).
- [ ] Restart server khi queue có ngày quá hạn -> drain bù.

## GĐ 4: Workspace

- [ ] Settings > Workspace: `devRepoPath` = `C:\Project\Backend-DotNet`, glob `*-Angular`, prompt `ship {key}`; Save.
- [ ] "+" > dev repo: gõ prompt đầu tiên thì Claude khởi động; Claude xong -> chấm tab + số ở sidebar + thông báo trình duyệt (khi ở tab khác).
- [ ] Board > **Open** ticket đã có worktree -> Claude tiếp tục hội thoại cũ.
- [ ] Board > **Start** ticket mới (bấm 2 lần chỉ tạo 1 worktree); ticket vào queue timesheet hôm nay.
- [ ] **Chat SDK**: prompt thường; Claude xin quyền -> thẻ Allow / Always allow / Deny; câu hỏi -> chọn đáp án hoặc tự gõ; mode Plan -> thẻ plan, Keep planning (kèm góp ý) rồi Approve.
- [ ] Stop giữa lượt (nút hoặc Esc): dừng ngay, prompt sau vẫn trả lời; đổi mode ở đầu chat áp ngay.
- [ ] Reload trình duyệt / restart server: lịch sử còn, prompt tiếp theo resume đúng hội thoại; đóng tab thì process claude tắt.
- [ ] Settings > Workspace: chọn mode mặc định (Bypass nếu muốn như CLI); Teams hand-off vẫn gửi vào chat.
- [ ] **Changes**: cây file A / M / D, diff inline có số dòng.
- [ ] **Files**: mặc định mở `plan.md`; markdown, ảnh xem được; nút VS Code.

## GĐ 5: Board đầy đủ + thông báo

- [ ] Settings > Azure DevOps: org `TeeShirtCentral`, project `MDP`, labels, pipeline `\Development-Pipelines`, PAT -> **Check** ra tên mình.
- [ ] Settings > Jira Advanced: `readyToTestPath`, `developerStatuses`, Suggestions (giá trị trong `docs/board-notices/plan.md`, mục cuối).
- [ ] Board: pill PR đúng repo + nhánh, bấm mở PR.
- [ ] View **To do**: dòng đúng, nhóm "cần ngay" lên đầu, sidebar có số đếm.
- [ ] Card **Available to take**: ticket epic tháng này, Show more, Hide (chưa **Take** thật nếu không muốn nhận).
- [ ] Chuông: Claude xong -> toast + chuông +1; mở tab session -> đã đọc; Mark all read; restart vẫn còn (đã đọc).
- [ ] Settings > Notices: bật / tắt từng kênh, Restore defaults.
- [ ] **Ready to Test**: chỉ thử trên ticket thật đã sẵn sàng (cả team thấy).

## GĐ 5b: Teams (thử ghi ở `Task-MDP > Alert` trước)

- [ ] Settings > Teams: kênh, lead `Minh Dinh`, lời chào `a {lead}, dạ `; **Sign in to Teams**.
- [ ] Workspace của ticket đã đăng bài: view Teams tìm ra bài, thread, ảnh, reaction.
- [ ] Reply / sửa / xóa / reaction; toolbar (đậm, list, link), "@" tag người, Backspace trên chip mention.
- [ ] Post bài mới: nháp từ `teams-post.md`, có lời chào lead; ticket đã đăng thì chỉ cảnh báo.
- [ ] **Ask Claude** trên một tin -> Claude nhận file thread.
- [ ] Có người nhắn vào bài: <= 2 phút có notice + to-do; mở hội thoại -> đã xem.

## GĐ 6: Insights + Schedules

- [ ] Insights: This week / Last month có giờ HRM, token Claude, commit khớp thực tế; bấm dòng xem chi tiết.
- [ ] **Copy markdown**, **Export CSV** mở được trong Excel.
- [ ] Schedules: lệnh `pwsh -NoProfile -File C:/Project/Backend-DotNet/docs/local-config/daily-knowledge-scan.ps1`, **Run now**, log tăng dần.
- [ ] Bật lịch ở đây thì tắt task Windows `DailyKnowledgeScan`.
- [ ] Card **App jobs**: lịch, lần chạy kế, kết quả lần cuối từng job.

## Desktop PWA

- [ ] Cài Workday làm app trên Edge / Chrome; chuột phải icon taskbar có Tickets / Workspace / Timesheet.
- [ ] Tắt server -> trang "Workday server is not running, retrying..."; bật lại tự tải lại.
- [ ] Settings > Notices: bật "thông báo cả khi đã đóng Workday", đóng cửa sổ, tạo notice -> hiện đúng một lần, bấm mở đúng chỗ.

## GĐ 3: Truy cập từ xa (Cloudflare + iPhone)

- [ ] `secrets.json` (nếu có) chỉ chứa `enc:v1:...`.
- [ ] Settings > Remote access: tunnel + Access, Save, tunnel `running`.
- [ ] iPhone: qua Access, nhập mã 6 ký tự, **Approve** trên PC -> vào app; sai mã 5 lần thì cửa sổ đóng.
- [ ] Add to Home Screen, bật thông báo, **Send test**.
- [ ] Tickets về View -> nút ghi biến mất; Off -> trang ẩn; thu hồi -> về màn ghép nối.
- [ ] Từ điện thoại `https://<host>/api/remote` -> 403; Settings chỉ dùng từ PC.
- [ ] Thao tác ghi từ điện thoại có trong nhật ký hoạt động.
- [ ] Đọc tuần Timesheet từ điện thoại không mở Chrome.

## GĐ 7: Cutover (Windows)

- [x] `npm run import-wpf -- --from <NoisWorkday> --cred <file.nwcred> --dry-run`: báo cáo không lộ secret, không ghi file.
- [x] Server đang chạy -> lệnh từ chối.
- [x] Tắt server, chạy thật: có `.before-import-*`; chạy lần hai báo cáo toàn "giữ" (13/11, chưa có `--cred`).
- [ ] Import secret bằng `--cred <file.nwcred>`; sai password -> thoát mã 1.
- [ ] `deploy/windows/install-task.ps1`: task được đăng ký, server chạy khi logon.

## Phát hiện

| # | Phase | Mô tả | Trạng thái |
| - | ----- | ----- | ---------- |
| 1 | GĐ 2 | Đọc tuần: TSC `failed` cả 5 ngày, log `shares/driveItem -> 403 accessDenied`. Một lần sniff lấy token dự phòng (không có `.All`) và token đó bị cache tới khi hết hạn (~1h). Sửa: Graph trả 401/403 thì bỏ token khỏi cache, lần sau sniff lại; thêm log lý do khi đọc TSC lỗi | Đã sửa, đọc lại OK (chưa commit) |
| 2 | Chung | File tạm Teams (Ask Claude) ghi vào `%TEMP%`; Jira token và HRM key nằm dạng rõ trong `.env`. Sửa: file tạm vào `%APPDATA%\Workday\tmp\teams-tasks`; secret chuyển vào `secrets.json` (mã hóa), bỏ `WORKDAY_*` khỏi `.env` | Đã sửa (chưa commit) |
| 3 | GĐ 4, 5, 5b, 6 | Giá trị WPF ghi cứng trong code đã chép vào `config.json`: glob `*-Angular`, prompt `ship {key}`, Azure DevOps (org, project, nhãn repo, `\Development-Pipelines`), Ready to Test path, developer statuses, Suggestions, kênh Teams + lead + lời chào, Knowledge scan (tắt, thứ Sáu 06:00, 3h). ADO PAT lấy từ `AZURE_DEVOPS_PAT` | Xong |
| 4 | GĐ 5 | Available to take là card trên view Working (lệch WPF). Sửa: view riêng `Working | Available | Done`, có số đếm, chấm đỏ khi có ticket gấp chưa xem (mở view thì mất), search lọc cả gợi ý | Đã sửa (chưa commit) |
| 5 | GĐ 4 | Chuyển qua lại giữa các tab Workspace: panel Changes / Files / Teams của tab cũ chồng lên nhau. Do `LeftPane` và `ClaudePane` dùng chung key `tab.id` | Đã sửa (chưa commit) |
| 6 | GĐ 4 | Chuyển tab ticket thì terminal Claude giật: mỗi lần chuyển tạo lại xterm, nối lại WebSocket, phát lại tới 1 MB. Sửa: Claude của mọi tab đang mở giữ mount, tab không chọn chỉ ẩn | Đã sửa (chưa commit) |
