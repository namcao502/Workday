namespace WorkdayDesktop;

internal static class AutoStart
{
    public const string ValueName = "Workday";

    public static string CommandLine(string exePath)
    {
        return "\"" + exePath + "\" --minimized";
    }
}
