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
            StartInfo = startInfo
        };
        var logWriter = new StreamWriter(new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
        {
            AutoFlush = true
        };
        var logLock = new object();
        DataReceivedEventHandler writeLine = (_, args) =>
        {
            lock (logLock)
            {
                logWriter.WriteLine(args.Data);
            }
        };
        process.OutputDataReceived += writeLine;
        process.ErrorDataReceived += writeLine;

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return new RunningProcess(process);
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
