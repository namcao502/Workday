namespace WorkdayDesktop.Tests;

public class DesktopSettingsTests
{
    [Fact]
    public void DesktopSettings_RoundTrips()
    {
        using var temp = new TempDirectory();
        var settings = new DesktopSettings(@"C:\Project\Workday", new WindowBounds(10, 20, 1200, 800, true));

        settings.Save(temp.Path);

        Assert.Equal(settings, DesktopSettings.Load(temp.Path));
    }

    [Fact]
    public void DesktopSettings_Load_ReturnsEmpty_WhenFileCorrupt()
    {
        using var temp = new TempDirectory();

        Assert.Equal(new DesktopSettings(null, null), DesktopSettings.Load(temp.Path));

        File.WriteAllText(Path.Combine(temp.Path, "desktop.json"), "{oops");
        Assert.Equal(new DesktopSettings(null, null), DesktopSettings.Load(temp.Path));
    }
}
