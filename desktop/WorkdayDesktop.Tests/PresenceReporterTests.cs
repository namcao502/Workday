namespace WorkdayDesktop.Tests;

public class PresenceReporterTests
{
    [Fact]
    public void IdleSecondsBetween_ReturnsWholeSeconds_SinceTheLastInput()
    {
        Assert.Equal(12, PresenceReporter.IdleSecondsBetween(20_500, 8_000));
    }

    [Fact]
    public void IdleSecondsBetween_ReturnsTheRightValue_WhenTheTickCountWrapped()
    {
        Assert.Equal(3, PresenceReporter.IdleSecondsBetween(1_000, uint.MaxValue - 1_999));
    }
}
