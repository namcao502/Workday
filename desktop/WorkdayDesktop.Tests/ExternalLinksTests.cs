namespace WorkdayDesktop.Tests;

public class ExternalLinksTests
{
    [Theory]
    [InlineData("https://jira.example.com/browse/AB-1")]
    [InlineData("http://localhost:5173/")]
    [InlineData("http://example.com:4870/")]
    public void IsExternal_ReturnsTrue_ForWebPagesOutsideTheApp(string url)
    {
        Assert.True(ExternalLinks.IsExternal(url, 4870));
    }

    [Theory]
    [InlineData("http://localhost:4870/")]
    [InlineData("http://127.0.0.1:4870/api/health")]
    [InlineData("data:text/html,error")]
    [InlineData("about:blank")]
    [InlineData("not a url")]
    public void IsExternal_ReturnsFalse_ForTheAppAndNonWebUrls(string url)
    {
        Assert.False(ExternalLinks.IsExternal(url, 4870));
    }
}
