using System.Diagnostics;

namespace WorkdayDesktop;

internal sealed class NodeServerHost(int port) : IServerHost
{
    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(2)
    };

    public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var response = await HttpClient.GetAsync($"http://127.0.0.1:{port}/api/health", cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            return false;
        }
    }

    public IRunningServer Start(string serverDir, string logPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(logPath) ?? serverDir);

        var startInfo = new ProcessStartInfo("node")
        {
            WorkingDirectory = serverDir,
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        startInfo.ArgumentList.Add("--env-file-if-exists=.env");
        startInfo.ArgumentList.Add("packages/server/dist/main.js");

        var process = new Process
        {
            StartInfo = startInfo,
            EnableRaisingEvents = true
        };
        var logWriter = OpenLog(logPath);
        AttachLog(process, logWriter);
        // The exit code is the one clue left when a server stops without printing anything.
        process.Exited += (_, _) =>
        {
            lock (logWriter)
            {
                logWriter.WriteLine(Stamped($"server exited with code {process.ExitCode}"));
            }
        };

        process.Start();
        lock (logWriter)
        {
            logWriter.WriteLine(Stamped($"server started, pid {process.Id}"));
        }

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return new RunningProcess(process);
    }

    public async Task<bool> BuildAsync(string serverDir, string logPath, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(logPath) ?? serverDir);

        var startInfo = new ProcessStartInfo("cmd.exe")
        {
            WorkingDirectory = serverDir,
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        startInfo.ArgumentList.Add("/c");
        startInfo.ArgumentList.Add("npm run build");

        using var logWriter = OpenLog(logPath);
        logWriter.WriteLine($"==== build {DateTime.Now:yyyy-MM-dd HH:mm:ss} ====");
        using var process = new Process
        {
            StartInfo = startInfo
        };
        AttachLog(process, logWriter);

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        await process.WaitForExitAsync(cancellationToken);
        return process.ExitCode == 0;
    }

    public void StopListener()
    {
        var startInfo = new ProcessStartInfo("netstat", "-ano -p TCP")
        {
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true
        };
        using var netstat = Process.Start(startInfo);
        if (netstat == null)
        {
            return;
        }

        var output = netstat.StandardOutput.ReadToEnd();
        netstat.WaitForExit();

        var localAddresses = new[] { $"127.0.0.1:{port}", $"0.0.0.0:{port}" };
        var listenerProcessIds = new HashSet<int>();
        foreach (var line in output.Split('\n'))
        {
            var columns = line.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (columns.Length >= 5 && columns[0] == "TCP" && columns[3] == "LISTENING" &&
                localAddresses.Contains(columns[1]) && int.TryParse(columns[4], out var processId))
            {
                listenerProcessIds.Add(processId);
            }
        }

        foreach (var processId in listenerProcessIds)
        {
            try
            {
                using var listener = Process.GetProcessById(processId);
                listener.Kill(entireProcessTree: true);
            }
            catch (Exception exception) when (exception is ArgumentException or InvalidOperationException)
            {
                // The process already exited between netstat and the kill.
            }
        }
    }

    public static void AppendLog(string logPath, string text)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(logPath) ?? ".");
            using var logWriter = OpenLog(logPath);
            logWriter.WriteLine(Stamped(text));
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // The log is a diagnostic; failing to write it must not stop the keep-alive.
        }
    }

    private static string Stamped(string text)
    {
        return $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {text}";
    }

    private static StreamWriter OpenLog(string logPath)
    {
        return new StreamWriter(new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
        {
            AutoFlush = true
        };
    }

    private static void AttachLog(Process process, StreamWriter logWriter)
    {
        DataReceivedEventHandler writeLine = (_, args) =>
        {
            lock (logWriter)
            {
                logWriter.WriteLine(args.Data);
            }
        };
        process.OutputDataReceived += writeLine;
        process.ErrorDataReceived += writeLine;
    }

    private sealed class RunningProcess(Process process) : IRunningServer
    {
        public bool HasExited
        {
            get
            {
                return process.HasExited;
            }
        }

        public void KillTree()
        {
            process.Kill(entireProcessTree: true);
        }
    }
}
