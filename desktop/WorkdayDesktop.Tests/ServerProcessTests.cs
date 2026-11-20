namespace WorkdayDesktop.Tests;

public class ServerProcessTests
{
    private sealed class FakeRunningServer : IRunningServer
    {
        public bool HasExited { get; set; }

        public int KillCount { get; private set; }

        public void KillTree()
        {
            KillCount++;
        }
    }

    private sealed class FakeServerHost(int healthyAfterChecks) : IServerHost
    {
        private int _checkCount;

        public int StartCount { get; private set; }

        public FakeRunningServer Server { get; } = new();

        public Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
        {
            _checkCount++;
            return Task.FromResult(_checkCount > healthyAfterChecks);
        }

        public IRunningServer Start(string serverDir, string logPath)
        {
            StartCount++;
            return Server;
        }
    }

    private static ServerProcess Create(IServerHost host)
    {
        return new ServerProcess(host, TimeSpan.FromMilliseconds(200), TimeSpan.FromMilliseconds(10));
    }

    [Fact]
    public async Task EnsureRunning_DoesNotStart_WhenAlreadyHealthy()
    {
        var host = new FakeServerHost(0);

        var result = await Create(host).EnsureRunningAsync(@"C:\repo", "log", CancellationToken.None);

        Assert.Equal(ServerStartResult.AlreadyRunning, result);
        Assert.Equal(0, host.StartCount);
    }

    [Fact]
    public async Task EnsureRunning_StartsOnceAndWaits_UntilHealthy()
    {
        var host = new FakeServerHost(3);

        var result = await Create(host).EnsureRunningAsync(@"C:\repo", "log", CancellationToken.None);

        Assert.Equal(ServerStartResult.Started, result);
        Assert.Equal(1, host.StartCount);
    }

    [Fact]
    public async Task EnsureRunning_TimesOut_WhenNeverHealthy()
    {
        var host = new FakeServerHost(int.MaxValue);

        var result = await Create(host).EnsureRunningAsync(@"C:\repo", "log", CancellationToken.None);

        Assert.Equal(ServerStartResult.TimedOut, result);
        Assert.Equal(1, host.StartCount);
    }

    [Fact]
    public async Task EnsureRunning_ReturnsNoServerDir_WhenUnknown()
    {
        var host = new FakeServerHost(int.MaxValue);

        var result = await Create(host).EnsureRunningAsync(null, "log", CancellationToken.None);

        Assert.Equal(ServerStartResult.NoServerDir, result);
        Assert.Equal(0, host.StartCount);
    }

    [Fact]
    public async Task StopIfOwned_DoesNothing_WhenServerWasAlreadyRunning()
    {
        var host = new FakeServerHost(0);
        var serverProcess = Create(host);
        await serverProcess.EnsureRunningAsync(@"C:\repo", "log", CancellationToken.None);

        serverProcess.StopIfOwned();

        Assert.Equal(0, host.Server.KillCount);
    }

    [Fact]
    public async Task StopIfOwned_KillsOnlyServerItStarted_AndNotAfterExit()
    {
        var host = new FakeServerHost(1);
        var serverProcess = Create(host);
        await serverProcess.EnsureRunningAsync(@"C:\repo", "log", CancellationToken.None);

        serverProcess.StopIfOwned();
        Assert.Equal(1, host.Server.KillCount);

        host.Server.HasExited = true;
        serverProcess.StopIfOwned();
        Assert.Equal(1, host.Server.KillCount);
    }
}
