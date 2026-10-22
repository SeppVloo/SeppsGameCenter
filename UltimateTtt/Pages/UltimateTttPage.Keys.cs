using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

namespace UltimateTtt.Pages;

// Keyboard: arrows/WASD move a cursor over the 9x9 grid, Enter/space plays, 1-9 picks a cell in the current board.
public partial class UltimateTttPage
{
    private static (int r, int c) ToRc(int i) => ((i / 9) / 3 * 3 + (i % 9) / 3, (i / 9) % 3 * 3 + (i % 9) % 3);
    private static int FromRc(int r, int c) => (r / 3 * 3 + c / 3) * 9 + (r % 3) * 3 + c % 3;

    private void SnapCursor()
    {
        if (_game is null || _game.Forced == -1 || _cursor / 9 == _game.Forced) return;
        var (r, c) = ToRc(_cursor);
        _cursor = _game.Forced * 9 + (r % 3) * 3 + c % 3;
    }

    private async Task OnKey(KeyboardEventArgs e)
    {
        if (_game is null) return;
        SnapCursor();
        var (r, c) = ToRc(_cursor);
        switch (e.Key)
        {
            case "ArrowUp" or "w" or "W": r = (r + 8) % 9; break;
            case "ArrowDown" or "s" or "S": r = (r + 1) % 9; break;
            case "ArrowLeft" or "a" or "A": c = (c + 8) % 9; break;
            case "ArrowRight" or "d" or "D": c = (c + 1) % 9; break;
            case "Enter" or " ":
                await ClickCell(_cursor / 9, _cursor % 9);
                SnapCursor();
                return;
            default:
                if (e.Key.Length == 1 && e.Key[0] is >= '1' and <= '9')
                {
                    await ClickCell(_cursor / 9, e.Key[0] - '1');
                    SnapCursor();
                }
                return;
        }
        var next = FromRc(r, c);
        if (_game.Forced == -1 || next / 9 == _game.Forced) _cursor = next;
    }

    private async Task FocusBoard()
    {
        if (_game is not null && !_boardFocused)
        {
            _boardFocused = true;
            try { await _boardRef.FocusAsync(); } catch (Exception ex) when (ex is InvalidOperationException or Microsoft.JSInterop.JSException) { }
        }
        if (_game is null) _boardFocused = false;
    }
}
