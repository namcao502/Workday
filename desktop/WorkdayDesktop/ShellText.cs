namespace WorkdayDesktop;

internal sealed record ShellStrings(
    string OpenWorkday,
    string StartWithWindows,
    string Quit,
    string ErrorTitle,
    string ErrorNoServerDir,
    string ErrorTimedOut,
    string ErrorLogPath);

internal static class ShellText
{
    private static readonly ShellStrings English = new(
        "Open Workday",
        "Start with Windows",
        "Quit",
        "Workday could not start",
        "The Workday server folder was not found. Set serverDir in desktop.json or run npm run build.",
        "The Workday server did not answer in time.",
        "Server log");

    private static readonly ShellStrings Vietnamese = new(
        "Mở Workday",
        "Khởi động cùng Windows",
        "Thoát",
        "Workday không khởi động được",
        "Không tìm thấy thư mục server của Workday. Đặt serverDir trong desktop.json hoặc chạy npm run build.",
        "Server của Workday không phản hồi kịp.",
        "Nhật ký server");

    public static ShellStrings For(string language)
    {
        return language == "vi" ? Vietnamese : English;
    }

    public static string ErrorPage(ShellStrings text, ServerStartResult result, string logPath)
    {
        var message = result == ServerStartResult.NoServerDir ? text.ErrorNoServerDir : text.ErrorTimedOut;
        var encodedLog = System.Net.WebUtility.HtmlEncode(logPath);
        return "<!doctype html><html><head><meta charset=\"utf-8\"><style>" +
            "body{font-family:Segoe UI,sans-serif;margin:48px;color:#222}code{background:#eee;padding:2px 6px}" +
            "</style></head><body><h2>" + System.Net.WebUtility.HtmlEncode(text.ErrorTitle) + "</h2><p>" +
            System.Net.WebUtility.HtmlEncode(message) + "</p><p>" + System.Net.WebUtility.HtmlEncode(text.ErrorLogPath) +
            ": <code>" + encodedLog + "</code></p></body></html>";
    }
}
