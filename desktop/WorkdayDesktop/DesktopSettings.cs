using System.Text.Json;

namespace WorkdayDesktop;

internal sealed record WindowBounds(int X, int Y, int Width, int Height, bool Maximized);

internal sealed record DesktopSettings(string? ServerDir, WindowBounds? Window)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static DesktopSettings Load(string dataDir)
    {
        try
        {
            var json = File.ReadAllText(Path.Combine(dataDir, "desktop.json"));
            return JsonSerializer.Deserialize<DesktopSettings>(json, JsonOptions) ?? new DesktopSettings(null, null);
        }
        catch (Exception exception) when (exception is IOException or JsonException or UnauthorizedAccessException)
        {
            return new DesktopSettings(null, null);
        }
    }

    public void Save(string dataDir)
    {
        Directory.CreateDirectory(dataDir);
        var filePath = Path.Combine(dataDir, "desktop.json");
        var temporaryPath = filePath + ".tmp";
        File.WriteAllText(temporaryPath, JsonSerializer.Serialize(this, JsonOptions));
        File.Move(temporaryPath, filePath, overwrite: true);
    }
}
