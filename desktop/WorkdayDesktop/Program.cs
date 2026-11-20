namespace WorkdayDesktop;

internal static class Program
{
    private const string MutexName = "Workday.Desktop";
    private const string ShowEventName = "Workday.Desktop.Show";

    [STAThread]
    private static void Main(string[] args)
    {
        using var mutex = new Mutex(true, MutexName, out var isFirstInstance);
        using var showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
        if (!isFirstInstance)
        {
            showEvent.Set();
            return;
        }

        ApplicationConfiguration.Initialize();
        var isStartMinimized = args.Contains("--minimized");
        using var form = new MainForm(isStartMinimized);

        var registration = ThreadPool.RegisterWaitForSingleObject(
            showEvent, (_, _) => form.BeginInvoke(form.ShowWindow), null, Timeout.Infinite, false);
        try
        {
            Application.Run(form);
        }
        finally
        {
            registration.Unregister(null);
        }
    }
}
