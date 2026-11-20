namespace WorkdayDesktop;

// The window has no back button, so any web page outside the local server opens in the default browser.
internal static class ExternalLinks
{
    public static bool IsExternal(string url, int port)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return false;
        }

        var isAppHost = uri.Host == "localhost" || uri.Host == "127.0.0.1";
        return !isAppHost || uri.Port != port;
    }
}
