namespace WorkdayDesktop;

internal sealed record TrayMenuPalette(Color Background, Color Border, Color Hover, Color Text, Color TextDisabled, Color Divider)
{
    private static readonly TrayMenuPalette Light = new(
        ColorTranslator.FromHtml("#ffffff"),
        ColorTranslator.FromHtml("#e4e4e7"),
        ColorTranslator.FromHtml("#f4f4f5"),
        ColorTranslator.FromHtml("#18181b"),
        ColorTranslator.FromHtml("#a1a1aa"),
        ColorTranslator.FromHtml("#e4e4e7"));

    private static readonly TrayMenuPalette Dark = new(
        ColorTranslator.FromHtml("#27272a"),
        ColorTranslator.FromHtml("#3f3f46"),
        ColorTranslator.FromHtml("#3f3f46"),
        ColorTranslator.FromHtml("#fafafa"),
        ColorTranslator.FromHtml("#71717a"),
        ColorTranslator.FromHtml("#3f3f46"));

    public static TrayMenuPalette For(string theme)
    {
        return theme == "dark" ? Dark : Light;
    }
}
