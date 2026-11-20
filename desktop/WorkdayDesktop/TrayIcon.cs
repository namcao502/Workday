using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace WorkdayDesktop;

internal sealed class TrayIcon : IDisposable
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string BalloonTitle = "Workday";

    private readonly NotifyIcon _notifyIcon;
    private readonly ToolStripMenuItem _autoStartItem;
    private readonly ToolStripMenuItem _buildRestartItem;
    private readonly Font _menuFont;
    private readonly TrayMenuRenderer _renderer;
    private CoreWebView2Notification? _currentNotification;
    private bool _isCurrentClicked;

    public TrayIcon(string dataDir, ShellStrings text, Action showWindow, Action buildAndRestart, Action quit)
    {
        _autoStartItem = new ToolStripMenuItem(text.StartWithWindows) { CheckOnClick = false };
        _autoStartItem.Click += (_, _) => ToggleAutoStart();
        _buildRestartItem = new ToolStripMenuItem(text.BuildAndRestart);
        _buildRestartItem.Click += (_, _) => buildAndRestart();

        _menuFont = TrayMenuRenderer.CreateFont();
        _renderer = new TrayMenuRenderer(dataDir);
        var menu = new ContextMenuStrip
        {
            Renderer = _renderer,
            ShowImageMargin = false,
            Font = _menuFont
        };
        menu.Items.Add(text.OpenWorkday, null, (_, _) => showWindow());
        menu.Items.Add(_autoStartItem);
        menu.Items.Add(_buildRestartItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(text.Quit, null, (_, _) => quit());
        menu.SizeChanged += (_, _) => TrayMenuRenderer.ClipToRoundedCard(menu);
        menu.Opening += (_, _) =>
        {
            _renderer.Refresh();
            TrayMenuRenderer.ApplyLayout(menu);
            _autoStartItem.Checked = IsAutoStartEnabled();
        };

        _notifyIcon = new NotifyIcon
        {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath),
            Text = BalloonTitle,
            ContextMenuStrip = menu,
            Visible = true
        };
        _notifyIcon.DoubleClick += (_, _) => showWindow();
        _notifyIcon.BalloonTipClicked += (_, _) =>
        {
            _isCurrentClicked = true;
            showWindow();
            _currentNotification?.ReportClicked();
        };
        _notifyIcon.BalloonTipClosed += (_, _) =>
        {
            if (!_isCurrentClicked)
            {
                _currentNotification?.ReportClosed();
            }

            _currentNotification = null;
        };
    }

    public void ShowNotification(CoreWebView2Notification notification)
    {
        _currentNotification = notification;
        _isCurrentClicked = false;
        _notifyIcon.ShowBalloonTip(10000, BalloonTitle, notification.Body, ToolTipIcon.None);
        notification.ReportShown();
    }

    public bool IsBuildRestartEnabled
    {
        get
        {
            return _buildRestartItem.Enabled;
        }
        set
        {
            _buildRestartItem.Enabled = value;
        }
    }

    public void ShowMessage(string text)
    {
        // A plain balloon must not report a click or close to an older WebView2 notification.
        _currentNotification = null;
        _isCurrentClicked = false;
        _notifyIcon.ShowBalloonTip(10000, BalloonTitle, text, ToolTipIcon.None);
    }

    public void Hide()
    {
        _notifyIcon.Visible = false;
    }

    public void Dispose()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _menuFont.Dispose();
    }

    private static bool IsAutoStartEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath);
        return key?.GetValue(AutoStart.ValueName) != null;
    }

    private void ToggleAutoStart()
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath);
        if (key.GetValue(AutoStart.ValueName) != null)
        {
            key.DeleteValue(AutoStart.ValueName, throwOnMissingValue: false);
        }
        else
        {
            key.SetValue(AutoStart.ValueName, AutoStart.CommandLine(Application.ExecutablePath));
        }

        _autoStartItem.Checked = IsAutoStartEnabled();
    }
}
