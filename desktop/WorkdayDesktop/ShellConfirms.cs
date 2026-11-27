using System.Text.Json;

namespace WorkdayDesktop;

// The shell's questions asked in the page (the app's own dialog) instead of a Windows message box.
internal sealed class ShellConfirms
{
    private readonly Dictionary<string, TaskCompletionSource<bool>> _pending = new();

    // Set once the loaded page said it shows questions; a page that did not gets a message box.
    public bool IsPageReady { get; private set; }

    public void PageReady()
    {
        IsPageReady = true;
    }

    // The page is going away, so nothing it showed can be answered any more.
    public void PageLeft()
    {
        IsPageReady = false;
        foreach (var pending in _pending.Values)
        {
            pending.TrySetResult(false);
        }

        _pending.Clear();
    }

    public (string Id, Task<bool> Answer) Ask()
    {
        var id = Guid.NewGuid().ToString("N");
        var pending = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = pending;
        return (id, pending.Task);
    }

    public void Answer(string id, bool answer)
    {
        if (_pending.Remove(id, out var pending))
        {
            pending.TrySetResult(answer);
        }
    }

    public static string Message(string id, string title, string message, string confirmLabel, string? cancelLabel)
    {
        return JsonSerializer.Serialize(new { type = "confirm", id, title, message, confirmLabel, cancelLabel });
    }
}
