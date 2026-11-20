using System.Drawing.Drawing2D;

namespace WorkdayDesktop;

// Draws the tray menu as a rounded card like the app's own panels; Refresh re-reads the theme on each open.
internal sealed class TrayMenuRenderer : ToolStripProfessionalRenderer
{
    private const float BaseFontSize = 9.5F;

    private readonly string _dataDir;
    private readonly PaletteColorTable _colors;

    public TrayMenuRenderer(string dataDir) : this(dataDir, new PaletteColorTable())
    {
    }

    private TrayMenuRenderer(string dataDir, PaletteColorTable colors) : base(colors)
    {
        _dataDir = dataDir;
        _colors = colors;
        RoundedEdges = false;
        Refresh();
    }

    private TrayMenuPalette Palette
    {
        get
        {
            return _colors.Palette;
        }
    }

    public void Refresh()
    {
        _colors.Palette = TrayMenuPalette.For(DesktopPaths.Theme(_dataDir));
    }

    // Row and card metrics are written at 100% and scaled to the menu's DPI.
    public static int Scale(ToolStrip menu, int logical)
    {
        return (int)Math.Round(logical * menu.DeviceDpi / 96.0, MidpointRounding.AwayFromZero);
    }

    public static Font CreateFont()
    {
        return new Font("Segoe UI", BaseFontSize);
    }

    public static void ApplyLayout(ContextMenuStrip menu)
    {
        menu.Padding = new Padding(Scale(menu, 2), Scale(menu, 6), Scale(menu, 2), Scale(menu, 6));
        foreach (ToolStripItem item in menu.Items)
        {
            if (item is ToolStripMenuItem)
            {
                item.Padding = new Padding(Scale(menu, 2), Scale(menu, 5), Scale(menu, 10), Scale(menu, 5));
            }
        }
    }

    public static void ClipToRoundedCard(ContextMenuStrip menu)
    {
        var oldRegion = menu.Region;
        using (var path = RoundedPath(new Rectangle(0, 0, menu.Width, menu.Height), Scale(menu, 10)))
        {
            menu.Region = new Region(path);
        }

        oldRegion?.Dispose();
    }

    protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var bounds = new Rectangle(0, 0, e.ToolStrip.Width - 1, e.ToolStrip.Height - 1);
        using var path = RoundedPath(bounds, Scale(e.ToolStrip, 10));
        using var pen = new Pen(Palette.Border, 1F);
        e.Graphics.DrawPath(pen, path);
    }

    protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var item = e.Item;
        if (item.Selected && item.Enabled && item.Owner != null)
        {
            var inset = Scale(item.Owner, 4);
            var bounds = new Rectangle(inset, 0, item.Width - (2 * inset) - 1, item.Height - 1);
            using var path = RoundedPath(bounds, Scale(item.Owner, 5));
            using var brush = new SolidBrush(Palette.Hover);
            e.Graphics.FillPath(brush, path);
        }
    }

    // The check column (ShowCheckMargin) keeps the menu's own background, not the professional gradient.
    protected override void OnRenderImageMargin(ToolStripRenderEventArgs e)
    {
    }

    protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
    {
        if (e.Item is ToolStripMenuItem menuItem && e.Item.Owner != null)
        {
            DrawCheck(e.Graphics, menuItem, e.Item.Owner);
        }
    }

    protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
    {
        var inset = e.Item.Owner == null ? 10 : Scale(e.Item.Owner, 10);
        var y = e.Item.Height / 2;
        using var pen = new Pen(Palette.Divider);
        e.Graphics.DrawLine(pen, inset, y, e.Item.Width - inset, y);
    }

    protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
    {
        e.TextColor = e.Item.Enabled ? Palette.Text : Palette.TextDisabled;
        // The dropdown centers text in a height without the item padding, so re-center it in the full row.
        var text = e.TextRectangle;
        e.TextRectangle = new Rectangle(text.X, (e.Item.Height - text.Height) / 2, text.Width, text.Height);
        base.OnRenderItemText(e);
    }

    private void DrawCheck(Graphics graphics, ToolStripMenuItem item, ToolStrip owner)
    {
        var size = Scale(owner, 10);
        var left = Scale(owner, 8);
        var top = (item.Height - size) / 2;
        using var pen = new Pen(item.Enabled ? Palette.Text : Palette.TextDisabled, Math.Max(1.5F, Scale(owner, 2)))
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };
        graphics.DrawLines(pen, new[]
        {
            new Point(left, top + (size / 2)),
            new Point(left + (size * 2 / 5), top + size - 1),
            new Point(left + size, top)
        });
    }

    private static GraphicsPath RoundedPath(Rectangle bounds, int radius)
    {
        var diameter = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private sealed class PaletteColorTable : ProfessionalColorTable
    {
        public TrayMenuPalette Palette { get; set; } = TrayMenuPalette.For("light");

        public override Color ToolStripDropDownBackground
        {
            get { return Palette.Background; }
        }

        public override Color MenuBorder
        {
            get { return Palette.Border; }
        }

        public override Color MenuItemBorder
        {
            get { return Palette.Hover; }
        }

        public override Color MenuItemSelected
        {
            get { return Palette.Hover; }
        }

        public override Color SeparatorDark
        {
            get { return Palette.Divider; }
        }

        public override Color SeparatorLight
        {
            get { return Palette.Background; }
        }
    }
}
