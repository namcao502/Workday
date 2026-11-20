namespace WorkdayDesktop.Tests;

public class DesktopPathsTests
{
    private static Dictionary<string, string?> Environment(params string[] pairs)
    {
        var environment = new Dictionary<string, string?>();
        for (var pairIndex = 0; pairIndex < pairs.Length; pairIndex += 2)
        {
            environment[pairs[pairIndex]] = pairs[pairIndex + 1];
        }

        return environment;
    }

    [Fact]
    public void DataDir_UsesWorkdayDataDir_WhenSet()
    {
        var environment = Environment("WORKDAY_DATA_DIR", @"D:\data", "APPDATA", @"C:\Roaming");

        Assert.Equal(@"D:\data", DesktopPaths.DataDir(environment));
    }

    [Fact]
    public void DataDir_FallsBackToAppDataWorkday()
    {
        var environment = Environment("WORKDAY_DATA_DIR", "", "APPDATA", @"C:\Roaming");

        Assert.Equal(Path.Combine(@"C:\Roaming", "Workday"), DesktopPaths.DataDir(environment));
    }

    [Fact]
    public void Port_PrefersValidEnvironmentPort()
    {
        using var temp = new TempDirectory();
        File.WriteAllText(Path.Combine(temp.Path, "config.json"), "{\"port\": 5000}");

        Assert.Equal(4999, DesktopPaths.Port(temp.Path, Environment("WORKDAY_PORT", "4999")));
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("0")]
    [InlineData("70000")]
    [InlineData("")]
    public void Port_ReadsConfigPort_WhenEnvironmentPortInvalid(string environmentPort)
    {
        using var temp = new TempDirectory();
        File.WriteAllText(Path.Combine(temp.Path, "config.json"), "{\"port\": 5000}");

        Assert.Equal(5000, DesktopPaths.Port(temp.Path, Environment("WORKDAY_PORT", environmentPort)));
    }

    [Fact]
    public void Port_Defaults4870_WhenConfigMissingOrCorrupt()
    {
        using var temp = new TempDirectory();
        var environment = Environment();

        Assert.Equal(4870, DesktopPaths.Port(temp.Path, environment));

        File.WriteAllText(Path.Combine(temp.Path, "config.json"), "{not json");
        Assert.Equal(4870, DesktopPaths.Port(temp.Path, environment));

        File.WriteAllText(Path.Combine(temp.Path, "config.json"), "{\"language\": \"vi\"}");
        Assert.Equal(4870, DesktopPaths.Port(temp.Path, environment));
    }

    [Fact]
    public void Language_ReadsConfigLanguage()
    {
        using var temp = new TempDirectory();
        File.WriteAllText(Path.Combine(temp.Path, "config.json"), "{\"language\": \"vi\"}");

        Assert.Equal("vi", DesktopPaths.Language(temp.Path));
    }

    [Fact]
    public void Language_DefaultsEnglish()
    {
        using var temp = new TempDirectory();

        Assert.Equal("en", DesktopPaths.Language(temp.Path));

        File.WriteAllText(Path.Combine(temp.Path, "config.json"), "{\"language\": \"fr\"}");
        Assert.Equal("en", DesktopPaths.Language(temp.Path));
    }

    [Fact]
    public void FindServerDir_WalksUpToRepoRoot()
    {
        using var temp = new TempDirectory();
        var distDir = Path.Combine(temp.Path, "packages", "server", "dist");
        Directory.CreateDirectory(distDir);
        File.WriteAllText(Path.Combine(distDir, "main.js"), "");
        var nested = Path.Combine(temp.Path, "desktop", "publish");
        Directory.CreateDirectory(nested);

        Assert.Equal(temp.Path, DesktopPaths.FindServerDir(nested));
    }

    [Fact]
    public void FindServerDir_ReturnsNull_WhenNoServerBuild()
    {
        using var temp = new TempDirectory();

        Assert.Null(DesktopPaths.FindServerDir(temp.Path));
    }
}
