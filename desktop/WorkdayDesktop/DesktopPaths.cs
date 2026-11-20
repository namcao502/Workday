using System.Text.Json;

namespace WorkdayDesktop;

internal static class DesktopPaths
{
    private const int DefaultPort = 4870;

    public static string DataDir(IReadOnlyDictionary<string, string?> environment)
    {
        var dataDir = environment.GetValueOrDefault("WORKDAY_DATA_DIR");
        if (!string.IsNullOrEmpty(dataDir))
        {
            return dataDir;
        }

        return Path.Combine(environment.GetValueOrDefault("APPDATA") ?? string.Empty, "Workday");
    }

    public static int Port(string dataDir, IReadOnlyDictionary<string, string?> environment)
    {
        var isValidPort = int.TryParse(environment.GetValueOrDefault("WORKDAY_PORT"), out var environmentPort);
        if (isValidPort && environmentPort >= 1 && environmentPort <= 65535)
        {
            return environmentPort;
        }

        var config = ReadConfig(dataDir);
        if (config != null && config.Value.TryGetProperty("port", out var portElement) &&
            portElement.TryGetInt32(out var configPort) && configPort >= 1 && configPort <= 65535)
        {
            return configPort;
        }

        return DefaultPort;
    }

    public static string Language(string dataDir)
    {
        var config = ReadConfig(dataDir);
        if (config != null && config.Value.TryGetProperty("language", out var languageElement) &&
            languageElement.ValueKind == JsonValueKind.String && languageElement.GetString() == "vi")
        {
            return "vi";
        }

        return "en";
    }

    public static string Theme(string dataDir)
    {
        var config = ReadConfig(dataDir);
        if (config != null && config.Value.TryGetProperty("theme", out var themeElement) &&
            themeElement.ValueKind == JsonValueKind.String && themeElement.GetString() == "dark")
        {
            return "dark";
        }

        return "light";
    }

    public static string? FindServerDir(string startDir)
    {
        var directory = new DirectoryInfo(startDir);
        while (directory != null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "packages", "server", "dist", "main.js")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }

    private static JsonElement? ReadConfig(string dataDir)
    {
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(dataDir, "config.json")));
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            return document.RootElement.Clone();
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }
}
