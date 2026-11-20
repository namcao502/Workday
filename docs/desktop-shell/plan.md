# Workday Desktop Shell Implementation Plan

> **For agentic workers:** Use impl-write to execute this plan task-by-task.

**Ticket:** side project, manual git

**Frontend repo:** none -- server/client không đổi

**Goal:** Thay cửa sổ PWA của Edge bằng app Windows riêng (WinForms + WebView2) mở Workday, để điều hướng/F5 không còn kéo cửa sổ Edge khác lên.

**Expected outcome (acceptance criteria):**
- [ ] Chạy `WorkdayDesktop.exe` mở Workday trong cửa sổ riêng (không phải Edge); bấm sidebar, tab Settings, F5 không kéo cửa sổ Edge nào lên.
- [ ] Server chưa chạy: shell tự chạy `node --env-file-if-exists=.env packages/server/dist/main.js` (không hiện console), đợi `/api/health` trả 200 rồi mới tải trang. Server đã chạy (vd Scheduled Task `Workday`): không chạy thêm.
- [ ] Server không lên sau 30 giây: cửa sổ hiện một trang báo lỗi kèm đường dẫn file log, không treo.
- [ ] Bấm X: cửa sổ ẩn xuống khay. Double-click icon khay mở lại. Menu khay: Mở Workday, Khởi động cùng Windows (có dấu tick), Thoát.
- [ ] Thoát: nếu chính shell đã chạy server thì dừng server (cả cây process); server do nơi khác chạy thì để nguyên.
- [ ] Bật "Khởi động cùng Windows": `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` có giá trị `Workday` = `"<exe>" --minimized`; tắt thì xoá. Chạy với `--minimized`: chỉ có icon khay, cửa sổ ẩn.
- [ ] Mở exe lần hai: không có instance mới, cửa sổ đang chạy hiện lên trước.
- [ ] Link `target="_blank"` / `window.open` (Jira, PR, Teams) mở bằng trình duyệt mặc định, không mở cửa sổ WebView mới.
- [ ] `new Notification(...)` của trang hiện thành thông báo Windows (balloon của icon khay); bấm vào thì cửa sổ hiện lên và trang chạy `onclick` của thông báo như trên web.
- [ ] Kích thước, vị trí, trạng thái maximize của cửa sổ được nhớ giữa các lần mở.
- [ ] Port: `WORKDAY_PORT` > `port` trong `config.json` > 4870, đúng thứ tự server dùng.
- [ ] Chữ của shell (menu khay, trang lỗi) theo `language` trong `config.json` (en/vi).

**Architecture:** Project .NET mới `desktop/WorkdayDesktop` (net10.0-windows, WinForms) chỉ là vỏ: một `WebView2` trỏ `http://localhost:<port>/`, `NotifyIcon` ở khay, và `ServerProcess` kiểm tra/khởi động server Node. Logic thuần (đường dẫn, port, settings, khởi động server) tách khỏi UI để test bằng xUnit. Client không đổi: trong WebView2 `display-mode` là `browser`, nên `appHash`/soft refresh tự quay về dùng URL và F5 thật.

**Assumptions:**
- Thư mục server: `serverDir` trong `desktop.json`; không có thì đi ngược lên từ thư mục exe tìm thư mục chứa `packages/server/dist/main.js`; vẫn không thấy thì trang lỗi nói cần đặt `serverDir`.
- `node` lấy từ PATH. Server do shell chạy ghi stdout/stderr vào `<dataDir>\desktop\server.log` (append).
- Data dir giống server: `WORKDAY_DATA_DIR`, nếu không có thì `%APPDATA%\Workday`. File của shell: `<dataDir>\desktop.json`, profile WebView2 ở `<dataDir>\desktop\webview`.
- Thoát shell dừng server do shell chạy, kể cả khi đang có phiên Claude: người dùng đã chủ động chọn Thoát.
- Thông báo dùng `CoreWebView2.NotificationReceived` (WebView2 SDK bản ổn định mới nhất, runtime trên máy là 157) + `NotifyIcon.ShowBalloonTip`; quyền Notifications được cho phép tự động. Web Push ("Notify even when Workday is closed") không hỗ trợ trong WebView2, chấp nhận vì shell đã nằm ở khay.
- Không làm installer: script `deploy/windows/install-desktop.ps1` publish ra `%LOCALAPPDATA%\Programs\Workday` và tạo shortcut Start Menu.

**Tech Stack:** .NET 10 (WinForms), Microsoft.Web.WebView2, xUnit.

---

### Task 1: Logic thuần + test

**Files:**
- Create: `desktop/WorkdayDesktop/WorkdayDesktop.csproj` -- `net10.0-windows`, `UseWindowsForms`, `Nullable enable`, `OutputType WinExe`, `ApplicationIcon app.ico`, package `Microsoft.Web.WebView2`; `InternalsVisibleTo WorkdayDesktop.Tests`.
- Create: `desktop/WorkdayDesktop/DesktopPaths.cs` -- data dir, port, language đọc từ env + `config.json`.
- Create: `desktop/WorkdayDesktop/DesktopSettings.cs` -- đọc/ghi `desktop.json` (serverDir, window bounds, maximized).
- Create: `desktop/WorkdayDesktop/ServerProcess.cs` -- kiểm tra health, khởi động, dừng server mình đã chạy.
- Create: `desktop/WorkdayDesktop/AutoStart.cs` -- giá trị Run key.
- Create: `desktop/WorkdayDesktop.Tests/WorkdayDesktop.Tests.csproj` + các file test bên dưới.
- Modify: `.gitignore` -- thêm `bin/`, `obj/`, `desktop/publish/`.

**Shape:**
```csharp
internal static class DesktopPaths
{
    public static string DataDir(IReadOnlyDictionary<string, string?> environment);
    public static int Port(string dataDir, IReadOnlyDictionary<string, string?> environment);
    public static string Language(string dataDir); // "en" | "vi", default "en"
    public static string? FindServerDir(string startDir); // walk up to the folder holding packages/server/dist/main.js
}

internal sealed record WindowBounds(int X, int Y, int Width, int Height, bool Maximized);
internal sealed record DesktopSettings(string? ServerDir, WindowBounds? Window)
{
    public static DesktopSettings Load(string dataDir);
    public void Save(string dataDir);
}

internal interface IRunningServer
{
    bool HasExited { get; }
    void KillTree();
}

internal interface IServerHost
{
    Task<bool> IsHealthyAsync(CancellationToken cancellationToken);
    IRunningServer Start(string serverDir, string logPath);
}

internal sealed class ServerProcess(IServerHost host, TimeSpan timeout, TimeSpan pollInterval)
{
    public Task<ServerStartResult> EnsureRunningAsync(string? serverDir, string logPath, CancellationToken cancellationToken);
    public void StopIfOwned();
}

internal enum ServerStartResult { AlreadyRunning, Started, NoServerDir, TimedOut }

internal static class AutoStart
{
    public const string ValueName = "Workday";
    public static string CommandLine(string exePath); // "\"<exePath>\" --minimized"
}
```

**Logic:**
- `Port`: `WORKDAY_PORT` hợp lệ (số nguyên 1-65535) thắng; không hợp lệ hoặc trống thì đọc `port` trong `config.json`; file thiếu/hỏng/không có `port` thì 4870. (Server ném lỗi khi `WORKDAY_PORT` sai; shell không chết vì thế, rơi về config.)
- `DesktopSettings.Load`: file thiếu hoặc JSON hỏng thì trả `new DesktopSettings(null, null)`, không ném. `Save` ghi vào file tạm rồi `File.Move(overwrite: true)`, giống `jsonFile.ts`.
- `EnsureRunningAsync`: healthy thì `AlreadyRunning`, không start. `serverDir` null thì `NoServerDir`. Còn lại start đúng một lần, poll health mỗi `pollInterval` đến `timeout`: lên thì `Started` và nhớ process (owned), hết giờ thì `TimedOut`.
- `StopIfOwned`: chỉ `KillTree()` server do chính nó start và chưa `HasExited`; `AlreadyRunning` thì không làm gì. Bản thật bọc `Process`, `KillTree` = `Kill(entireProcessTree: true)`.
- Health probe thật: `GET http://127.0.0.1:<port>/api/health`, timeout 2 giây, 200 = healthy, lỗi mạng = false.
- Start thật: `node --env-file-if-exists=.env packages/server/dist/main.js`, `WorkingDirectory = serverDir`, `CreateNoWindow = true`, `UseShellExecute = false`, stdout/stderr redirect và append vào `logPath`.

**Tests:**
- `DataDir_UsesWorkdayDataDir_WhenSet`, `DataDir_FallsBackToAppDataWorkday`.
- `Port_PrefersValidEnvironmentPort`, `Port_ReadsConfigPort_WhenEnvironmentPortInvalid`, `Port_Defaults4870_WhenConfigMissingOrCorrupt`.
- `Language_ReadsConfigLanguage`, `Language_DefaultsEnglish`.
- `DesktopSettings_RoundTrips`, `DesktopSettings_Load_ReturnsEmpty_WhenFileCorrupt`.
- `EnsureRunning_DoesNotStart_WhenAlreadyHealthy`, `EnsureRunning_StartsOnceAndWaits_UntilHealthy`, `EnsureRunning_TimesOut_WhenNeverHealthy`, `EnsureRunning_ReturnsNoServerDir_WhenUnknown`, `StopIfOwned_DoesNothing_WhenServerWasAlreadyRunning`.
- `CommandLine_QuotesExePathAndAddsMinimized`, `FindServerDir_WalksUpToRepoRoot`, `FindServerDir_ReturnsNull_WhenNoServerBuild`.

### Task 2: Cửa sổ, khay, thông báo, script cài

**Files:**
- Create: `desktop/WorkdayDesktop/Program.cs` -- single instance (named `Mutex` `Workday.Desktop` + named `EventWaitHandle` để instance thứ hai báo instance đầu hiện cửa sổ rồi thoát), parse `--minimized`, chạy `MainForm`.
- Create: `desktop/WorkdayDesktop/MainForm.cs` -- WebView2, close-to-tray, nhớ bounds, trang lỗi.
- Create: `desktop/WorkdayDesktop/TrayIcon.cs` -- `NotifyIcon` + menu + balloon thông báo.
- Create: `desktop/WorkdayDesktop/ShellText.cs` -- chữ en/vi của menu khay và trang lỗi (một bảng hai ngôn ngữ, không viết câu inline ở chỗ khác).
- Create: `desktop/WorkdayDesktop/app.ico` -- tạo từ `packages/client/public/icons/icon-512.png` (16, 32, 48, 256).
- Create: `deploy/windows/install-desktop.ps1` -- `dotnet publish desktop/WorkdayDesktop -c Release -r win-x64 --self-contained false -o %LOCALAPPDATA%\Programs\Workday`, tạo shortcut Start Menu `Workday.lnk`; `-Remove` xoá cả hai và giá trị Run key. PowerShell 5.1 compatible, giống `install-task.ps1`.
- Modify: `CLAUDE.md` -- mục Layout thêm `desktop/` (một dòng), mục Commands thêm `dotnet test desktop/WorkdayDesktop.Tests` và script cài.

**Logic:**
- WebView2 dùng `CoreWebView2Environment.CreateAsync(userDataFolder: <dataDir>\desktop\webview)`; chỉ `Navigate("http://localhost:<port>/")` sau khi `EnsureRunningAsync` trả `AlreadyRunning`/`Started`; `NoServerDir`/`TimedOut` thì `NavigateToString` trang lỗi (chữ từ `ShellText`, có đường dẫn `server.log`).
- `NewWindowRequested`: `Handled = true`, mở `e.Uri` bằng `Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true })`, chỉ khi scheme là `http`/`https`.
- `PermissionRequested` kind `Notifications`: `Allow`. `NotificationReceived`: `Handled = true`, balloon với `Notification.Body` (title "Workday"); bấm balloon thì hiện cửa sổ rồi `notification.ReportClicked()`. Gọi `ReportShown()` khi hiện balloon, `ReportClosed()` khi balloon đóng mà không bấm.
- `FormClosing` với `CloseReason.UserClosing`: `Cancel = true`, `Hide()`. Thoát từ menu khay: lưu bounds, `ServerProcess.StopIfOwned()`, `NotifyIcon.Visible = false`, `Application.Exit()`.
- Bounds: lưu `RestoreBounds` + `Maximized` khi ẩn/thoát; lúc mở chỉ áp nếu hình chữ nhật còn giao với một `Screen.AllScreens` (màn hình phụ đã rút thì về mặc định 1280x800 giữa màn hình chính).
- Menu "Khởi động cùng Windows": tick theo việc Run key có giá trị `Workday`; bấm thì ghi `AutoStart.CommandLine(Application.ExecutablePath)` hoặc xoá giá trị.
- Title cửa sổ theo `CoreWebView2.DocumentTitle`.

**Tests:** UI không có test tự động; kiểm tra tay sau khi build (ghi kết quả vào `impl-notes.md`):
- Từng mục acceptance criteria ở trên, chạy bản `install-desktop.ps1` đã publish.
- Dừng server (`Stop-Process` node) rồi mở shell: server tự lên, log có trong `server.log`; Thoát: process node đó không còn.
- Chạy `WorkdayDesktop.exe --minimized` hai lần: chỉ một icon khay, lần hai làm cửa sổ hiện lên.

### Task 3: Title bar riêng với 3 nút tròn như app WPF

**Files:**
- Modify: `desktop/WorkdayDesktop/MainForm.cs` -- bỏ caption của Windows, giữ viền kéo giãn; bật vùng kéo từ web; nhận/gửi message cửa sổ.
- Create: `desktop/WorkdayDesktop/BorderlessFrame.cs` -- xử lý `WM_NCCALCSIZE` / `WM_NCHITTEST` (một chỗ cho Win32).
- Create: `packages/client/src/shell/desktopHost.ts` -- nhận biết đang chạy trong shell, gửi lệnh cửa sổ, nghe trạng thái maximize.
- Create: `packages/client/src/shell/WindowControls.tsx` -- 3 nút tròn (minimize, maximize/restore, close) đặt sau chuông trong `TopBar`.
- Modify: `packages/client/src/shell/TopBar.tsx`, `packages/client/src/styles/app.css` (vùng kéo), `packages/client/src/i18n/en.ts` + `vi.ts` (aria-label/tooltip 3 nút).
- Test: `packages/client/src/shell/WindowControls.test.tsx`.

**Shape** (hợp đồng giữa shell và web):
```ts
// shell -> page, injected before any page script
window.__workdayDesktop === true
// page -> shell: window.chrome.webview.postMessage(...)
{ type: 'window'; action: 'minimize' | 'toggleMaximize' | 'close' }
// shell -> page: CoreWebView2.PostWebMessageAsJson, on load and on every resize that changes it
{ type: 'windowState'; maximized: boolean }
```

**Logic:**
- Shell: `AddScriptToExecuteOnDocumentCreatedAsync("window.__workdayDesktop = true")`; `Settings.IsNonClientRegionSupportEnabled = true`. `close` = cùng đường với nút X cũ (ẩn xuống khay), không thoát.
- Khung: giữ `FormBorderStyle.Sizable` (còn Aero Snap, viền kéo, bóng); `WM_NCCALCSIZE` (wParam = 1) trả 0 để client phủ cả vùng caption; khi maximize thì thu rect vào bằng độ dày khung (`SM_CXFRAME` + `SM_CXPADDEDBORDER`, `SM_CYFRAME` + padded) để không tràn màn hình. Form có `Padding` 6px (đổi theo DPI) quanh WebView và `WM_NCHITTEST` trả HTLEFT/HTRIGHT/HTTOP/HTBOTTOM/các góc ở dải đó, để kéo giãn được dù WebView phủ client. Khi maximize thì Padding = 0. Màu nền form theo `theme` trong `config.json` (light `#f4f4f5`, dark `#18181b`).
- Web: chỉ khi `window.__workdayDesktop === true` thì `TopBar` có class `app-titlebar` (`app-region: drag`) và render `WindowControls`; mọi button/input/link trong header là `app-region: no-drag`. Ngoài shell (trình duyệt, điện thoại) không có gì thay đổi.
- Nút: cùng kiểu với nút menu tròn bên trái (`Button isIconOnly variant="secondary"`), icon từ `@gravity-ui/icons`; nút close hover nền đỏ (`bg-danger`, chữ trắng). Maximize đổi sang icon restore khi `maximized`.

**Tests:**
- `renders nothing outside the desktop shell`
- `posts minimize, toggleMaximize and close to the shell`
- `shows the restore glyph once the shell reports maximized`

### Task 4: Menu khay giống app

**Files:**
- Create: `desktop/WorkdayDesktop/TrayMenuRenderer.cs` -- `ToolStripProfessionalRenderer` dạng card: bo góc 10px, viền, hàng cao, hover bo 5px thụt 4px, separator thụt 10px, font Segoe UI 9.5 (theo `ThemedMenuRenderer` của app WPF, đổi theo DPI).
- Modify: `desktop/WorkdayDesktop/TrayIcon.cs` -- menu dùng renderer, `ShowImageMargin = false`; dấu tick của "Khởi động cùng Windows" vẽ gọn bên trái chữ.
- Modify: `desktop/WorkdayDesktop/DesktopPaths.cs` -- `Theme(dataDir)`: `"light"` | `"dark"` từ `config.json`, mặc định `"light"`.

**Logic:**
- Bảng màu đọc lúc vẽ (mỗi lần mở menu đọc lại `Theme`): light: nền `#ffffff`, viền `#e4e4e7`, hover `#f4f4f5`, chữ `#18181b`, chữ disabled `#a1a1aa`, divider `#e4e4e7`; dark: nền `#27272a`, viền `#3f3f46`, hover `#3f3f46`, chữ `#fafafa`, chữ disabled `#71717a`, divider `#3f3f46`.

**Tests:**
- `Theme_ReadsConfigTheme`, `Theme_DefaultsLight`.
