namespace WorkdayDesktop.Tests;

public class DesktopUpdateTests
{
    [Fact]
    public void ScriptPath_ReturnsInstallScript_WhenRepoHasIt()
    {
        using var repo = new TempDirectory();
        var script = Path.Combine(repo.Path, "deploy", "windows", "install-desktop.ps1");
        Directory.CreateDirectory(Path.GetDirectoryName(script)!);
        File.WriteAllText(script, "");

        Assert.Equal(script, DesktopUpdate.ScriptPath(repo.Path));
    }

    [Fact]
    public void ScriptPath_ReturnsNull_WhenScriptOrRepoIsMissing()
    {
        using var repo = new TempDirectory();

        Assert.Null(DesktopUpdate.ScriptPath(repo.Path));
        Assert.Null(DesktopUpdate.ScriptPath(null));
    }

    [Fact]
    public void StartInfo_RunsHiddenScript_WithWaitRelaunchAndLog()
    {
        var info = DesktopUpdate.StartInfo(@"C:\repo dir\install-desktop.ps1", 1234, @"C:\data\update.log");

        Assert.Equal("powershell.exe", info.FileName);
        Assert.False(info.UseShellExecute);
        Assert.True(info.CreateNoWindow);
        Assert.Equal(
            new[]
            {
                "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", @"C:\repo dir\install-desktop.ps1",
                "-WaitPid", "1234", "-Relaunch", "-LogPath", @"C:\data\update.log"
            },
            info.ArgumentList);
    }
}
