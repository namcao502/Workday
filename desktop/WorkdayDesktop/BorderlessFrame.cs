using System.Runtime.InteropServices;

namespace WorkdayDesktop;

// The Win32 side of a window with no native caption that keeps its resize border, snap and shadow.
internal static class BorderlessFrame
{
    private const int WmNcCalcSize = 0x0083;
    private const int WmNcHitTest = 0x0084;
    private const int HitLeft = 10;
    private const int HitRight = 11;
    private const int HitTop = 12;
    private const int HitTopLeft = 13;
    private const int HitTopRight = 14;
    private const int HitBottom = 15;
    private const int HitBottomLeft = 16;
    private const int HitBottomRight = 17;
    private const int SystemMetricFrameWidth = 32;
    private const int SystemMetricFrameHeight = 33;
    private const int SystemMetricPaddedBorder = 92;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern bool IsZoomed(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetricsForDpi(int index, uint dpi);

    // Returns true when the message was handled and message.Result is set.
    public static bool TryHandle(ref Message message, Form form, int gripThickness)
    {
        if (message.Msg == WmNcCalcSize && message.WParam != IntPtr.Zero)
        {
            ShrinkMaximizedClientToScreen(message.LParam, form);
            message.Result = IntPtr.Zero;
            return true;
        }

        if (message.Msg == WmNcHitTest && !IsZoomed(form.Handle))
        {
            var screenPoint = new Point(unchecked((short)(long)message.LParam), unchecked((short)((long)message.LParam >> 16)));
            var hit = HitTest(form.PointToClient(screenPoint), form.ClientSize, gripThickness);
            if (hit != 0)
            {
                message.Result = (IntPtr)hit;
                return true;
            }
        }

        return false;
    }

    public static int HitTest(Point clientPoint, Size clientSize, int gripThickness)
    {
        var isLeft = clientPoint.X < gripThickness;
        var isRight = clientPoint.X >= clientSize.Width - gripThickness;
        var isTop = clientPoint.Y < gripThickness;
        var isBottom = clientPoint.Y >= clientSize.Height - gripThickness;

        if (isTop && isLeft)
        {
            return HitTopLeft;
        }

        if (isTop && isRight)
        {
            return HitTopRight;
        }

        if (isBottom && isLeft)
        {
            return HitBottomLeft;
        }

        if (isBottom && isRight)
        {
            return HitBottomRight;
        }

        if (isLeft)
        {
            return HitLeft;
        }

        if (isRight)
        {
            return HitRight;
        }

        if (isTop)
        {
            return HitTop;
        }

        return isBottom ? HitBottom : 0;
    }

    // A maximized window is laid out beyond the screen by its frame thickness; pull the client back in.
    private static void ShrinkMaximizedClientToScreen(IntPtr parametersPointer, Form form)
    {
        if (!IsZoomed(form.Handle))
        {
            return;
        }

        var dpi = (uint)form.DeviceDpi;
        var paddedBorder = GetSystemMetricsForDpi(SystemMetricPaddedBorder, dpi);
        var horizontal = GetSystemMetricsForDpi(SystemMetricFrameWidth, dpi) + paddedBorder;
        var vertical = GetSystemMetricsForDpi(SystemMetricFrameHeight, dpi) + paddedBorder;
        var rectangle = Marshal.PtrToStructure<NativeRect>(parametersPointer);
        rectangle.Left += horizontal;
        rectangle.Right -= horizontal;
        rectangle.Top += vertical;
        rectangle.Bottom -= vertical;
        Marshal.StructureToPtr(rectangle, parametersPointer, false);
    }
}
