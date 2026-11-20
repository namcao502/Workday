using System.Diagnostics;

namespace WorkdayDesktop;

// The tray's "Update desktop app": the repo's install script republishes the shell once this process exits.
internal static class DesktopUpdate
{
    public static string? ScriptPath(string? serverDir)
    {
        if (serverDir == null)
        {
            return null;
        }

        var script = Path.Combine(serverDir, "deploy", "windows", "install-desktop.ps1");
        return File.Exists(script) ? script : null;
    }

    public static ProcessStartInfo StartInfo(string scriptPath, int processId, string logPath)
    {
        var info = new ProcessStartInfo("powershell.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true
        };
        string[] arguments =
        [
            "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
            "-WaitPid", processId.ToString(System.Globalization.CultureInfo.InvariantCulture), "-Relaunch", "-LogPath", logPath
        ];
        foreach (var argument in arguments)
        {
            info.ArgumentList.Add(argument);
        }

        return info;
    }
}
