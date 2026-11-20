namespace WorkdayDesktop;

internal enum ServerStartResult
{
    AlreadyRunning,
    Started,
    NoServerDir,
    TimedOut
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
    private IRunningServer? _ownedServer;

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

    public void StopIfOwned()
    {
        if (_ownedServer != null && !_ownedServer.HasExited)
        {
            _ownedServer.KillTree();
        }
    }
}
