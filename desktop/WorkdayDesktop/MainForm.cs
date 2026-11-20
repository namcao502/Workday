using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WorkdayDesktop;

internal sealed class MainForm : Form
{
    private const int DefaultWidth = 1280;
    private const int DefaultHeight = 800;
    private const int ResizeGripLogical = 6;

    private readonly bool _isStartMinimized;
    private readonly string _dataDir;
    private readonly int _port;
    private readonly string _logPath;
    private readonly ShellStrings _text;
    private readonly ServerProcess _server;
    private readonly TrayIcon _tray;
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private DesktopSettings _settings;
    private bool _isQuitting;
    private bool _isVisibleAllowed;
    private bool? _isLastPostedMaximized;

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
        _tray = new TrayIcon(_dataDir, _text, ShowWindow, async () => await BuildAndRestartAsync(), UpdateApp, Quit);

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
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            var isWindowMessage = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("type", out var type) &&
                type.ValueKind == JsonValueKind.String && type.GetString() == "window";
            action = isWindowMessage && root.TryGetProperty("action", out var actionElement) &&
                actionElement.ValueKind == JsonValueKind.String ? actionElement.GetString() : null;
        }
        catch (JsonException)
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

        _tray.IsBuildRestartEnabled = false;
        try
        {
            _tray.ShowMessage(_text.Building);
            var result = await _server.RestartAsync(ResolveServerDir(), _logPath, CancellationToken.None);
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
                Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
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

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _tray.Dispose();
            _webView.Dispose();
        }

        base.Dispose(disposing);
    }
}
