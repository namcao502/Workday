# Desktop shell - implementation notes

## Task 1: Logic thuần + test
- **Lệch:** project dùng implicit usings, namespace `WorkdayDesktop`. `NodeServerHost` tách thành file riêng `NodeServerHost.cs` thay vì nằm trong `ServerProcess.cs`. Có thêm test `StopIfOwned_KillsOnlyServerItStarted_AndNotAfterExit` cho nhánh owned/`HasExited`.
- **Quyết định:** `ApplicationIcon` chỉ đặt khi có `app.ico`, để Task 2 thêm icon mà không phải sửa csproj. Pin `Microsoft.Web.WebView2` 1.0.4314.35, bản ổn định mới nhất. Test dùng xUnit với fake tự viết, không dùng Moq. Ngôn ngữ khác `"vi"` đều về `"en"`; port trong config ngoài khoảng 1-65535 thì về 4870. `EnsureRunningAsync` chờ một `pollInterval` trước lần health check đầu tiên sau khi start.
- Build PASS, 21/21 test PASS. Có cảnh báo MSB3277 từ assembly WPF của gói WebView2, vô hại với WinForms.

## Task 2: Cửa sổ, khay, thông báo, script cài
- **Lệch:** subagent khởi động bằng `Load`, nhưng với `--minimized` cửa sổ không bao giờ hiện nên `Load` không chạy: server không được bật, WebView2 không được tạo. Em đã kiểm tra lỗi này thật trên port 4871. Đã sửa: tạo sẵn handle của WebView, rồi `BeginInvoke(StartAsync)` trong constructor; kiểm tra lại thì server lên, health trả 200, có `server.log`, cửa sổ vẫn ẩn.
- **Quyết định:** dùng `SetVisibleCore` để giữ cửa sổ ẩn khi `--minimized`. Dấu tick của "Khởi động cùng Windows" đọc lại từ Run key mỗi lần mở menu. Trang lỗi gợi ý đặt `serverDir` trong `desktop.json` hoặc chạy `npm run build` (câu chữ do em tự viết). `app.ico` tạo bằng Pillow từ `icon-512.png`.
- **Đánh đổi:** lint còn 6 cảnh báo LSN-49 (tên bool không bắt đầu bằng is/has): ở `startMinimized`, `_allowVisible`, `_currentClicked`, và ở các tham số `value`/`disposing` mà override của framework bắt buộc phải giữ tên.
- Build PASS, 21/21 test PASS.
- Chưa kiểm tra: balloon thông báo khi trang gọi `new Notification`, menu khay, và chạy thật script cài. Anh sẽ test trực tiếp.
- **Lệch (script cài):** exe cài vào `%LOCALAPPDATA%\Programs\Workday`, nằm ngoài repo nên không dò ngược lên được thư mục server. `install-desktop.ps1` vì vậy ghi `serverDir` (repo) vào `desktop.json` nếu file chưa có giá trị này. Đã chạy thật: publish OK, có shortcut Start Menu, `desktop.json` có `serverDir`.
- Đổi tên bool: `_isStartMinimized`, `_isVisibleAllowed`, `_isCurrentClicked`. Lint 0 lỗi; còn 2 cảnh báo ở tham số override của framework.

## Task 3: Title bar riêng với 3 nút tròn như app WPF
- **Lệch:** có thêm `BorderlessFrameTests.cs` (test vùng bắt chuột ở viền và góc), plan không yêu cầu.
- **Quyết định:** icon restore dùng `Copy` của gravity-ui. Script `__workdayDesktop` được await trước lần điều hướng đầu tiên. Lint tự đổi các arrow handler sang thân có ngoặc.
- Vitest 3/3 PASS, toàn bộ client 401 test PASS, desktop 36/36 test PASS.
- Chưa xem trực tiếp được: bản cài của anh đang chạy, giữ mutex chỉ-một-bản nên bản debug thoát ngay.

## Task 4: Menu khay giống app
- **Lệch:** bảng màu tách thành file riêng `TrayMenuPalette.cs`. Dấu tick vẽ trong `OnRenderMenuItemBackground`, vì khi `ShowImageMargin = false` thì `OnRenderItemCheck` không có chỗ để vẽ. Mỗi dòng thụt trái 26px để dòng có tick và không tick thẳng hàng.
