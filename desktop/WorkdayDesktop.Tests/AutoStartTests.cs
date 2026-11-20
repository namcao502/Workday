namespace WorkdayDesktop.Tests;

public class AutoStartTests
{
    [Fact]
    public void CommandLine_QuotesExePathAndAddsMinimized()
    {
        var commandLine = AutoStart.CommandLine(@"C:\Program Files\Workday\WorkdayDesktop.exe");

        Assert.Equal("\"C:\\Program Files\\Workday\\WorkdayDesktop.exe\" --minimized", commandLine);
    }
}
