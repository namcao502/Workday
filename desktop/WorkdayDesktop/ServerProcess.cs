namespace WorkdayDesktop;

internal enum ServerStartResult
{
    AlreadyRunning,
    Started,
    NoServerDir,
    TimedOut,
    BuildFailed
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

    Task<bool> BuildAsync(string serverDir, string logPath, CancellationToken cancellationToken);

    void StopListener();
}

internal sealed class ServerProcess(IServerHost host, TimeSpan timeout, TimeSpan pollInterval)
{
    // One missed check can be a busy event loop; two in a row means the server is gone.
    private const int MissedChecksBeforeRestart = 2;

    private IRunningServer? _ownedServer;
    private int _missedCheckCount;

    public async Task<ServerStartResult> EnsureRunningAsync(string? serverDir, string logPath, CancellationToken cancellationToken)
    {
        if (await host.IsHealthyAsync(cancellationToken))
        {
            return ServerStartResult.AlreadyRunning;
        }

        if (serverDir == null)
        {
            return ServerStartResult.NoServerDir;
        }

        _ownedServer = host.Start(serverDir, logPath);

        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(pollInterval, cancellationToken);
            if (await host.IsHealthyAsync(cancellationToken))
            {
                return ServerStartResult.Started;
            }
        }

        return ServerStartResult.TimedOut;
    }

    public async Task<ServerStartResult> RestartAsync(string? serverDir, string logPath, CancellationToken cancellationToken, bool isBuildNeeded)
    {
        if (serverDir == null)
        {
            return ServerStartResult.NoServerDir;
        }

        if (isBuildNeeded && !await host.BuildAsync(serverDir, logPath, cancellationToken))
        {
            return ServerStartResult.BuildFailed;
        }

        StopIfOwned();
        // A server started elsewhere (npm start, a scheduled task) listens on the port too.
        host.StopListener();
        if (!await WaitForHealthAsync(false, cancellationToken))
        {
            return ServerStartResult.TimedOut;
        }

        _ownedServer = host.Start(serverDir, logPath);
        return await WaitForHealthAsync(true, cancellationToken) ? ServerStartResult.Started : ServerStartResult.TimedOut;
    }

    // Null while the server answers, or after a single miss; otherwise the result of starting it again.
    public async Task<ServerStartResult?> KeepAliveAsync(string? serverDir, string logPath, CancellationToken cancellationToken)
    {
        if (await host.IsHealthyAsync(cancellationToken))
        {
            _missedCheckCount = 0;
            return null;
        }

        _missedCheckCount++;
        if (_missedCheckCount < MissedChecksBeforeRestart)
        {
            return null;
        }

        _missedCheckCount = 0;
        return await EnsureRunningAsync(serverDir, logPath, cancellationToken);
    }

    public void StopIfOwned()
    {
        if (_ownedServer != null && !_ownedServer.HasExited)
        {
            _ownedServer.KillTree();
        }
    }

    private async Task<bool> WaitForHealthAsync(bool isHealthyExpected, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (await host.IsHealthyAsync(cancellationToken) == isHealthyExpected)
            {
                return true;
            }

            await Task.Delay(pollInterval, cancellationToken);
        }

        return false;
    }
}
