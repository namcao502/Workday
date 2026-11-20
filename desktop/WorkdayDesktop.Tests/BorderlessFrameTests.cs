using System.Drawing;

namespace WorkdayDesktop.Tests;

public class BorderlessFrameTests
{
    [Theory]
    [InlineData(2, 100, 10)]
    [InlineData(398, 100, 11)]
    [InlineData(200, 2, 12)]
    [InlineData(200, 298, 15)]
    [InlineData(2, 2, 13)]
    [InlineData(398, 298, 17)]
    [InlineData(200, 100, 0)]
    public void HitTest_ReturnsEdgeOrCorner_InsideTheGrip(int x, int y, int expected)
    {
        Assert.Equal(expected, BorderlessFrame.HitTest(new Point(x, y), new Size(400, 300), 6));
    }
}
