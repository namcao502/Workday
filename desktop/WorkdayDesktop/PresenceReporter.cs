using System.Net.Http.Json;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace WorkdayDesktop;

// Tells the server whether the user is at this PC, so phone pushes wait while they are, as Teams does.
internal sealed class PresenceReporter : IDisposable
{
    private const int ReportIntervalMilliseconds = 30_000;

    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(2)
    };

    private readonly Uri _presenceUri;
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = ReportIntervalMilliseconds };
    private volatile bool _isLocked;

    public PresenceReporter(int port)
    {
        _presenceUri = new Uri($"http://127.0.0.1:{port}/api/presence");
        _timer.Tick += async (_, _) => await ReportAsync();
        SystemEvents.SessionSwitch += OnSessionSwitch;
    }

    public void Start()
    {
        _timer.Start();
        _ = ReportAsync();
    }

    // Handles the wrap of the 32-bit tick count after 49.7 days of uptime.
    public static int IdleSecondsBetween(uint tickCount, uint lastInputTick)
    {
        return (int)(unchecked(tickCount - lastInputTick) / 1000);
    }

    public void Dispose()
    {
        // SystemEvents is static: a handler left on it keeps this object alive.
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        _timer.Dispose();
    }

    private async void OnSessionSwitch(object? sender, SessionSwitchEventArgs e)
    {
        if (e.Reason == SessionSwitchReason.SessionLock)
        {
            _isLocked = true;
        }
        else if (e.Reason == SessionSwitchReason.SessionUnlock)
        {
            _isLocked = false;
        }
        else
        {
            return;
        }

        await ReportAsync();
    }

    private async Task ReportAsync()
    {
        try
        {
            var body = new { idleSeconds = IdleSeconds(), locked = _isLocked };
            using var response = await HttpClient.PostAsJsonAsync(_presenceUri, body);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            // The server is down or restarting; the next tick reports again.
        }
    }

    private static int IdleSeconds()
    {
        var info = new LastInputInfo { Size = (uint)Marshal.SizeOf<LastInputInfo>() };
        if (!GetLastInputInfo(ref info))
        {
            return 0;
        }

        return IdleSecondsBetween(unchecked((uint)Environment.TickCount), info.Time);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LastInputInfo
    {
        public uint Size;
        public uint Time;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LastInputInfo info);
}
