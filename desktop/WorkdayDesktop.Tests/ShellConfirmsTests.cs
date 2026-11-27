using System.Text.Json;

namespace WorkdayDesktop.Tests;

public class ShellConfirmsTests
{
    [Fact]
    public async Task Ask_ResolvesWithTheAnswer_ForItsId()
    {
        var confirms = new ShellConfirms();
        var (id, answer) = confirms.Ask();

        confirms.Answer("other", false);
        Assert.False(answer.IsCompleted);

        confirms.Answer(id, true);
        Assert.True(await answer);
    }

    [Fact]
    public async Task PageLeft_AnswersNo_AndIsNoLongerReady()
    {
        var confirms = new ShellConfirms();
        confirms.PageReady();
        Assert.True(confirms.IsPageReady);
        var (_, answer) = confirms.Ask();

        confirms.PageLeft();

        Assert.False(await answer);
        Assert.False(confirms.IsPageReady);
    }

    [Fact]
    public void Message_CarriesTheQuestion_AndANullCancelForANotice()
    {
        using var document = JsonDocument.Parse(ShellConfirms.Message("a1", "Title", "Sure?", "OK", null));
        var root = document.RootElement;

        Assert.Equal("confirm", root.GetProperty("type").GetString());
        Assert.Equal("a1", root.GetProperty("id").GetString());
        Assert.Equal("Title", root.GetProperty("title").GetString());
        Assert.Equal("Sure?", root.GetProperty("message").GetString());
        Assert.Equal("OK", root.GetProperty("confirmLabel").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("cancelLabel").ValueKind);
    }
}
