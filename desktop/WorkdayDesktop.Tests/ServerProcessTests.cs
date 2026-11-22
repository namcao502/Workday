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

        public Task<bool> BuildAsync(string serverDir, string logPath, CancellationToken cancellationToken)
        {
            return Task.FromResult(true);
        }

        public void StopListener()
        {
        }
    }

    private sealed class RecordingRunningServer(List<string> calls) : IRunningServer
    {
        public bool HasExited { get; set; }

        public int KillCount { get; private set; }

        public void KillTree()
        {
            KillCount++;
            calls.Add("KillTree");
        }
    }

    private sealed class FakeRestartHost : IServerHost
    {
        private bool _isServerUp;

        public FakeRestartHost(bool isServerUp)
        {
            _isServerUp = isServerUp;
            Server = new RecordingRunningServer(Calls);
        }

        public List<string> Calls { get; } = [];

        public RecordingRunningServer Server { get; }

        public bool IsBuildSuccessful { get; set; } = true;

        public bool IsStopEffective { get; set; } = true;

        public bool IsStartEffective { get; set; } = true;

        public Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult(_isServerUp);
        }

        public Task<bool> BuildAsync(string serverDir, string logPath, CancellationToken cancellationToken)
        {
            Calls.Add("Build");
            return Task.FromResult(IsBuildSuccessful);
        }

        public void StopListener()
        {
            Calls.Add("StopListener");
            if (IsStopEffective)
            {
                _isServerUp = false;
            }
        }

        public IRunningServer Start(string serverDir, string logPath)
        {
            Calls.Add("Start");
            _isServerUp = IsStartEffective;
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

    [Fact]
    public async Task RestartAsync_ReturnsNoServerDir_WhenUnknown()
    {
        var host = new FakeRestartHost(true);

        var result = await Create(host).RestartAsync(null, "log", CancellationToken.None, true);

        Assert.Equal(ServerStartResult.NoServerDir, result);
        Assert.Empty(host.Calls);
    }

    [Fact]
    public async Task RestartAsync_ReturnsBuildFailed_AndLeavesServer_WhenBuildFails()
    {
        var host = new FakeRestartHost(true) { IsBuildSuccessful = false };

        var result = await Create(host).RestartAsync(@"C:\repo", "log", CancellationToken.None, true);

        Assert.Equal(ServerStartResult.BuildFailed, result);
        Assert.Equal(["Build"], host.Calls);
    }

    [Fact]
    public async Task RestartAsync_BuildsStopsAndStarts_InThatOrder_WhenBuildSucceeds()
    {
        var host = new FakeRestartHost(true);
        var serverProcess = Create(host);

        var result = await serverProcess.RestartAsync(@"C:\repo", "log", CancellationToken.None, true);

        Assert.Equal(ServerStartResult.Started, result);
        Assert.Equal(["Build", "StopListener", "Start"], host.Calls);
        serverProcess.StopIfOwned();
        Assert.Equal(1, host.Server.KillCount);
    }

    [Fact]
    public async Task RestartAsync_SkipsBuild_WhenNotNeeded()
    {
        var host = new FakeRestartHost(true);

        var result = await Create(host).RestartAsync(@"C:epo", "log", CancellationToken.None, false);

        Assert.Equal(ServerStartResult.Started, result);
        Assert.Equal(["StopListener", "Start"], host.Calls);
    }

    [Fact]
    public async Task RestartAsync_KillsOwnedServer_BeforeStoppingListener()
    {
        var host = new FakeRestartHost(false);
        var serverProcess = Create(host);
        await serverProcess.EnsureRunningAsync(@"C:\repo", "log", CancellationToken.None);
        host.Calls.Clear();

        var result = await serverProcess.RestartAsync(@"C:\repo", "log", CancellationToken.None, true);

        Assert.Equal(ServerStartResult.Started, result);
        Assert.Equal(["Build", "KillTree", "StopListener", "Start"], host.Calls);
    }

    [Fact]
    public async Task RestartAsync_TimesOut_WithoutStarting_WhenOldServerNeverStops()
    {
        var host = new FakeRestartHost(true) { IsStopEffective = false };

        var result = await Create(host).RestartAsync(@"C:\repo", "log", CancellationToken.None, true);

        Assert.Equal(ServerStartResult.TimedOut, result);
        Assert.Equal(["Build", "StopListener"], host.Calls);
    }

    [Fact]
    public async Task RestartAsync_TimesOut_WhenNewServerNeverHealthy()
    {
        var host = new FakeRestartHost(true) { IsStartEffective = false };

        var result = await Create(host).RestartAsync(@"C:\repo", "log", CancellationToken.None, true);

        Assert.Equal(ServerStartResult.TimedOut, result);
        Assert.Equal(["Build", "StopListener", "Start"], host.Calls);
    }

    private sealed class ScriptedHealthHost(params bool[] answers) : IServerHost
    {
        private int _checkCount;

        public int StartCount { get; private set; }

        public Task<bool> IsHealthyAsync(CancellationToken cancellationToken)
        {
            var answer = _checkCount < answers.Length ? answers[_checkCount] : true;
            _checkCount++;
            return Task.FromResult(answer);
        }

        public IRunningServer Start(string serverDir, string logPath)
        {
            StartCount++;
            return new FakeRunningServer();
        }

        public Task<bool> BuildAsync(string serverDir, string logPath, CancellationToken cancellationToken)
        {
            return Task.FromResult(true);
        }

        public void StopListener()
        {
        }
    }

    [Fact]
    public async Task KeepAliveAsync_DoesNothing_WhenHealthy()
    {
        var host = new ScriptedHealthHost(true);
        var server = new ServerProcess(host, TimeSpan.FromMilliseconds(200), TimeSpan.FromMilliseconds(10));

        var result = await server.KeepAliveAsync(@"C:\Workday", "server.log", CancellationToken.None);

        Assert.Null(result);
        Assert.Equal(0, host.StartCount);
    }

    [Fact]
    public async Task KeepAliveAsync_WaitsOneMoreCheck_WhenOneCheckFails()
    {
        var host = new ScriptedHealthHost(false);
        var server = new ServerProcess(host, TimeSpan.FromMilliseconds(200), TimeSpan.FromMilliseconds(10));

        var result = await server.KeepAliveAsync(@"C:\Workday", "server.log", CancellationToken.None);

        Assert.Null(result);
        Assert.Equal(0, host.StartCount);
    }

    [Fact]
    public async Task KeepAliveAsync_StartsServer_WhenTwoChecksInARowFail()
    {
        // Two failed keep-alive checks, then EnsureRunning's own check fails, then the started server answers.
        var host = new ScriptedHealthHost(false, false, false, true);
        var server = new ServerProcess(host, TimeSpan.FromMilliseconds(200), TimeSpan.FromMilliseconds(10));

        Assert.Null(await server.KeepAliveAsync(@"C:\Workday", "server.log", CancellationToken.None));
        var result = await server.KeepAliveAsync(@"C:\Workday", "server.log", CancellationToken.None);

        Assert.Equal(ServerStartResult.Started, result);
        Assert.Equal(1, host.StartCount);
    }

    [Fact]
    public async Task KeepAliveAsync_CountsAgain_AfterAHealthyCheck()
    {
        var host = new ScriptedHealthHost(false, true, false);
        var server = new ServerProcess(host, TimeSpan.FromMilliseconds(200), TimeSpan.FromMilliseconds(10));

        Assert.Null(await server.KeepAliveAsync(@"C:\Workday", "server.log", CancellationToken.None));
        Assert.Null(await server.KeepAliveAsync(@"C:\Workday", "server.log", CancellationToken.None));
        Assert.Null(await server.KeepAliveAsync(@"C:\Workday", "server.log", CancellationToken.None));
        Assert.Equal(0, host.StartCount);
    }
}
