using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WorkdayDesktop;

internal sealed class MainForm : Form
{
    private const int DefaultWidth = 1280;
    private const int DefaultHeight = 800;
    private const int ResizeGripLogical = 6;
    private const int KeepAliveIntervalMilliseconds = 30_000;

    // ASFW_ANY: after this call any process may bring itself to the foreground.
    private const uint AllowAnyProcessForeground = 0xFFFFFFFF;
    private const int EditorRaiseDelayMilliseconds = 500;
    private const int ShowWindowRestore = 9; // SW_RESTORE

    private readonly bool _isStartMinimized;
    private readonly string _dataDir;
    private readonly int _port;
    private readonly string _logPath;
    private readonly ShellStrings _text;
    private readonly ServerProcess _server;
    private readonly TrayIcon _tray;
    private readonly PresenceReporter _presence;
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly System.Windows.Forms.Timer _keepAliveTimer = new() { Interval = KeepAliveIntervalMilliseconds };
    private DesktopSettings _settings;
    private bool _isQuitting;
    private bool _isVisibleAllowed;
    private bool? _isLastPostedMaximized;
    private bool _isServerBusy;
    private bool _isRestartFailureShown;

    public MainForm(bool isStartMinimized)
    {
        _isStartMinimized = isStartMinimized;
        var environment = Environment.GetEnvironmentVariables()
            .Cast<System.Collections.DictionaryEntry>()
            .ToDictionary(entry => (string)entry.Key, entry => (string?)entry.Value);
        _dataDir = DesktopPaths.DataDir(environment);
        _port = DesktopPaths.Port(_dataDir, environment);
        _text = ShellText.For(DesktopPaths.Language(_dataDir));
        _settings = DesktopSettings.Load(_dataDir);
        _logPath = Path.Combine(_dataDir, "desktop", "server.log");
        _server = new ServerProcess(new NodeServerHost(_port), TimeSpan.FromSeconds(30), TimeSpan.FromMilliseconds(500));

        Text = "Workday";
        BackColor = ColorTranslator.FromHtml(DesktopPaths.Theme(_dataDir) == "dark" ? "#18181b" : "#f4f4f5");
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        ApplyBounds();
        Controls.Add(_webView);
        _tray = new TrayIcon(
            _dataDir,
            _text,
            ShowWindow,
            async () => await BuildAndRestartAsync(),
            () => _settings.IsServerAutoRestartEnabled,
            ToggleServerAutoRestart,
            UpdateApp,
            Quit);
        _keepAliveTimer.Tick += async (_, _) => await KeepServerAliveAsync();
        _presence = new PresenceReporter(_port);

        // A --minimized start never raises Load, so create the handles now and start from the message loop.
        _ = Handle;
        _ = _webView.Handle;
        _isVisibleAllowed = !_isStartMinimized;
        BeginInvoke(async () => await StartAsync());
    }

    public void ShowWindow()
    {
        _isVisibleAllowed = true;
        Show();
        if (WindowState == FormWindowState.Minimized)
        {
            WindowState = FormWindowState.Normal;
        }

        Activate();
        BringToFront();
    }

    protected override void WndProc(ref Message message)
    {
        if (BorderlessFrame.TryHandle(ref message, this, ResizeGrip()))
        {
            return;
        }

        base.WndProc(ref message);
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        // The padding is the resize strip around the web view; a maximized window has no border to grab.
        Padding = WindowState == FormWindowState.Maximized ? Padding.Empty : new Padding(ResizeGrip());
        PostWindowState();
    }

    protected override void SetVisibleCore(bool value)
    {
        base.SetVisibleCore(value && _isVisibleAllowed);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing && !_isQuitting)
        {
            e.Cancel = true;
            SaveBounds();
            Hide();
            return;
        }

        base.OnFormClosing(e);
    }

    private int ResizeGrip()
    {
        return (int)Math.Round(ResizeGripLogical * DeviceDpi / 96.0, MidpointRounding.AwayFromZero);
    }

    private void PostWindowState()
    {
        var isMaximized = WindowState == FormWindowState.Maximized;
        if (_webView.CoreWebView2 == null || _isLastPostedMaximized == isMaximized)
        {
            return;
        }

        _isLastPostedMaximized = isMaximized;
        _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "windowState", maximized = isMaximized }));
    }

    private void HandleWebMessage(string json)
    {
        string? action;
        string? messageType = null;
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("type", out var type) &&
                type.ValueKind == JsonValueKind.String)
            {
                messageType = type.GetString();
            }

            action = messageType != null && root.TryGetProperty("action", out var actionElement) &&
                actionElement.ValueKind == JsonValueKind.String ? actionElement.GetString() : null;
        }
        catch (JsonException)
        {
            return;
        }

        if (messageType == "server")
        {
            if (action == "restart")
            {
                BeginInvoke(async () => await RestartServerAsync(false));
            }

            return;
        }

        if (messageType == "editor")
        {
            // Grant foreground to any process, then raise VS Code ourselves: the grant alone is too short-lived
            // for the server's open round-trip, so the delayed raise is the reliable path.
            if (action == "allowForeground")
            {
                AllowSetForegroundWindow(AllowAnyProcessForeground);
                RaiseEditorWindowSoon();
            }

            return;
        }

        if (messageType != "window")
        {
            return;
        }

        if (action == "minimize")
        {
            WindowState = FormWindowState.Minimized;
        }
        else if (action == "toggleMaximize")
        {
            WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
        }
        else if (action == "close")
        {
            Close();
        }
        else if (action == "queryState")
        {
            _isLastPostedMaximized = null;
            PostWindowState();
        }
    }

    [DllImport("user32.dll")]
    private static extern bool AllowSetForegroundWindow(uint dwProcessId);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr handle, IntPtr processId);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint attach, uint attachTo, bool join);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr handle);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr handle);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr handle, int command);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr handle);

    // Give VS Code a moment to open the file and surface its window, then force that window to the front.
    private void RaiseEditorWindowSoon()
    {
        var timer = new System.Windows.Forms.Timer { Interval = EditorRaiseDelayMilliseconds };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            timer.Dispose();
            var editorWindow = IntPtr.Zero;
            foreach (var process in Process.GetProcessesByName("Code"))
            {
                if (process.MainWindowHandle != IntPtr.Zero)
                {
                    editorWindow = process.MainWindowHandle;
                    break;
                }
            }

            if (editorWindow != IntPtr.Zero)
            {
                ForceForeground(editorWindow);
            }
        };
        timer.Start();
    }

    // Attach to the current foreground thread's input so Windows lets SetForegroundWindow through its block.
    private static void ForceForeground(IntPtr handle)
    {
        if (IsIconic(handle))
        {
            ShowWindow(handle, ShowWindowRestore);
        }

        var currentThread = GetCurrentThreadId();
        var foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        AttachThreadInput(currentThread, foregroundThread, true);
        SetForegroundWindow(handle);
        BringWindowToTop(handle);
        AttachThreadInput(currentThread, foregroundThread, false);
    }

    private void Quit()
    {
        _server.StopIfOwned();
        Exit();
    }

    private void Exit()
    {
        _isQuitting = true;
        SaveBounds();
        _tray.Hide();
        Application.Exit();
    }

    // The server is left running, so Claude sessions survive and the reopened app finds it.
    private void UpdateApp()
    {
        var owner = Visible ? this : null;
        var script = DesktopUpdate.ScriptPath(ResolveServerDir());
        if (script == null)
        {
            MessageBox.Show(owner, _text.UpdateAppNoScript, "Workday", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var answer = MessageBox.Show(owner, _text.UpdateAppConfirm, "Workday", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (answer != DialogResult.Yes)
        {
            return;
        }

        try
        {
            Process.Start(DesktopUpdate.StartInfo(script, Environment.ProcessId, Path.Combine(_dataDir, "desktop", "update.log")));
        }
        catch (System.ComponentModel.Win32Exception)
        {
            _tray.ShowMessage(_text.UpdateAppNoScript);
            return;
        }

        Exit();
    }

    private void ApplyBounds()
    {
        var saved = _settings.Window;
        var primary = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, DefaultWidth, DefaultHeight);
        var rectangle = saved == null ? Rectangle.Empty : new Rectangle(saved.X, saved.Y, saved.Width, saved.Height);
        var isVisibleOnScreen = saved != null && Screen.AllScreens.Any(screen => screen.WorkingArea.IntersectsWith(rectangle));

        StartPosition = FormStartPosition.Manual;
        if (isVisibleOnScreen && saved != null)
        {
            Bounds = rectangle;
            WindowState = saved.Maximized ? FormWindowState.Maximized : FormWindowState.Normal;
            return;
        }

        var width = Math.Min(DefaultWidth, primary.Width);
        var height = Math.Min(DefaultHeight, primary.Height);
        Bounds = new Rectangle(primary.X + ((primary.Width - width) / 2), primary.Y + ((primary.Height - height) / 2), width, height);
    }

    private void SaveBounds()
    {
        var bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        var window = new WindowBounds(bounds.X, bounds.Y, bounds.Width, bounds.Height, WindowState == FormWindowState.Maximized);
        _settings = _settings with { Window = window };
        try
        {
            _settings.Save(_dataDir);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Losing the window position is harmless; never block hiding or quitting on it.
        }
    }

    private async Task StartAsync()
    {
        var desktopDir = Path.Combine(_dataDir, "desktop");
        Directory.CreateDirectory(desktopDir);
        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(desktopDir, "webview"));
        await _webView.EnsureCoreWebView2Async(environment);
        ConfigureWebView(_webView.CoreWebView2);
        await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync("window.__workdayDesktop = true");

        var result = await _server.EnsureRunningAsync(ResolveServerDir(), _logPath, CancellationToken.None);
        _keepAliveTimer.Start();
        _presence.Start();
        if (result == ServerStartResult.AlreadyRunning || result == ServerStartResult.Started)
        {
            _webView.CoreWebView2.Navigate($"http://localhost:{_port}/");
            return;
        }

        _webView.CoreWebView2.NavigateToString(ShellText.ErrorPage(_text, result, _logPath));
    }

    private string? ResolveServerDir()
    {
        return _settings.ServerDir ?? DesktopPaths.FindServerDir(AppContext.BaseDirectory);
    }

    private async Task BuildAndRestartAsync()
    {
        var owner = Visible ? this : null;
        var answer = MessageBox.Show(owner, _text.BuildAndRestartConfirm, "Workday", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (answer != DialogResult.Yes)
        {
            return;
        }

        await RestartServerAsync(true);
    }

    private async Task RestartServerAsync(bool isBuildNeeded)
    {
        _tray.IsBuildRestartEnabled = false;
        _isServerBusy = true;
        try
        {
            if (isBuildNeeded)
            {
                _tray.ShowMessage(_text.Building);
            }

            var result = await _server.RestartAsync(ResolveServerDir(), _logPath, CancellationToken.None, isBuildNeeded);
            if (result == ServerStartResult.Started)
            {
                _webView.CoreWebView2.Navigate($"http://localhost:{_port}/");
                _tray.ShowMessage(_text.ServerRestarted);
            }
            else if (result == ServerStartResult.BuildFailed)
            {
                _tray.ShowMessage(_text.BuildFailed.Replace("{path}", _logPath));
            }
            else
            {
                _webView.CoreWebView2.NavigateToString(ShellText.ErrorPage(_text, result, _logPath));
            }
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException or IOException)
        {
            // npm or node could not be started at all; report it like a failed build instead of crashing the shell.
            _tray.ShowMessage(_text.BuildFailed.Replace("{path}", _logPath));
        }
        finally
        {
            _tray.IsBuildRestartEnabled = true;
            _isServerBusy = false;
        }
    }

    private async Task KeepServerAliveAsync()
    {
        // A build, restart or quit in progress takes the server down on purpose.
        if (!_settings.IsServerAutoRestartEnabled || _isServerBusy || _isQuitting)
        {
            return;
        }

        _isServerBusy = true;
        try
        {
            var result = await _server.KeepAliveAsync(ResolveServerDir(), _logPath, CancellationToken.None);
            if (result == ServerStartResult.Started)
            {
                NodeServerHost.AppendLog(_logPath, "server did not answer twice in a row; started it again");
                _isRestartFailureShown = false;
                _webView.CoreWebView2.Navigate($"http://localhost:{_port}/");
                _tray.ShowMessage(_text.ServerRestartedAutomatically);
            }
            else if (result == ServerStartResult.NoServerDir || result == ServerStartResult.TimedOut)
            {
                ReportRestartFailure($"server did not answer; starting it again failed: {result}");
            }
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException or IOException)
        {
            ReportRestartFailure($"server did not answer; node could not be started: {exception.Message}");
        }
        finally
        {
            _isServerBusy = false;
        }
    }

    private void ReportRestartFailure(string logText)
    {
        NodeServerHost.AppendLog(_logPath, logText);
        // The keep-alive retries every minute; one balloon is enough until a start succeeds.
        if (!_isRestartFailureShown)
        {
            _isRestartFailureShown = true;
            _tray.ShowMessage(_text.ServerRestartFailed.Replace("{path}", _logPath));
        }
    }

    private void ToggleServerAutoRestart()
    {
        _settings = _settings with { IsServerAutoRestartEnabled = !_settings.IsServerAutoRestartEnabled };
        try
        {
            _settings.Save(_dataDir);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // The choice still applies to this run; it only fails to persist.
        }
    }

    private void ConfigureWebView(CoreWebView2 core)
    {
        core.Settings.IsNonClientRegionSupportEnabled = true;
        core.WebMessageReceived += (_, e) => HandleWebMessage(e.WebMessageAsJson);
        core.NavigationCompleted += (_, _) =>
        {
            // A fresh page has not heard the state yet, so repeat it even when it did not change.
            _isLastPostedMaximized = null;
            PostWindowState();
        };
        core.DocumentTitleChanged += (_, _) => Text = string.IsNullOrEmpty(core.DocumentTitle) ? "Workday" : core.DocumentTitle;
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
            {
                OpenInBrowser(uri.AbsoluteUri);
            }
        };
        core.NavigationStarting += (_, e) =>
        {
            if (ExternalLinks.IsExternal(e.Uri, _port))
            {
                e.Cancel = true;
                OpenInBrowser(e.Uri);
            }
        };
        core.PermissionRequested += (_, e) =>
        {
            if (e.PermissionKind == CoreWebView2PermissionKind.Notifications)
            {
                e.State = CoreWebView2PermissionState.Allow;
            }
        };
        core.NotificationReceived += (_, e) =>
        {
            e.Handled = true;
            _tray.ShowNotification(e.Notification);
        };
    }

    private static void OpenInBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (System.ComponentModel.Win32Exception)
        {
            // No default browser is registered; staying on the app page is the safe fallback.
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _tray.Dispose();
            _presence.Dispose();
            _webView.Dispose();
        }

        base.Dispose(disposing);
    }
}
