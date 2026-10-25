namespace UltimateTtt.Game;

/// <summary>
/// Ultimate tic-tac-toe for 2-4 players. Pure logic, no UI (same approach as PongEngine/Game2048Engine).
/// The board has 9 small boards (b = 0..8) with 9 cells each (c = 0..8). Playing in cell c sends the next
/// player to small board c; if that board is already decided, the next player may choose any open board.
/// </summary>
public sealed class UltimateEngine
{
    public const int Empty = -1, Draw = -2;
    private static readonly int[][] Lines =
    [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6],
    ];

    public int Players { get; private set; } = 2;
    /// <summary>Cells[b*9+c] = player index or Empty.</summary>
    public int[] Cells { get; private set; } = new int[81];
    /// <summary>Owner of each small board: player index, Empty (still open) or Draw.</summary>
    public int[] Boards { get; private set; } = new int[9];
    public int Turn { get; private set; }
    /// <summary>Small board the current player must play in, or -1 for free choice.</summary>
    public int Forced { get; private set; } = -1;
    /// <summary>Winner player index, Draw, or Empty while playing.</summary>
    public int Winner { get; private set; } = Empty;
    public int LastMove { get; private set; } = -1;
    public int[]? WinLine { get; private set; }

    public bool Over => Winner != Empty;
    /// <summary>Standard tic-tac-toe: only small board 0 is used and winning it wins the game.</summary>
    public bool Classic { get; private set; }

    public void Reset(int players, int firstTurn = 0, bool classic = false)
    {
        Classic = classic;
        Players = Math.Clamp(players, 2, 4);
        Array.Fill(Cells, Empty);
        Array.Fill(Boards, Empty);
        Turn = firstTurn % Players;
        Forced = classic ? 0 : -1; Winner = Empty; LastMove = -1; WinLine = null;
    }

    public bool CanPlay(int b, int c) =>
        !Over && b is >= 0 and < 9 && c is >= 0 and < 9 &&
        Boards[b] == Empty && Cells[b * 9 + c] == Empty && (Forced == -1 || Forced == b);

    public bool Play(int b, int c)
    {
        if (!CanPlay(b, c)) return false;
        Cells[b * 9 + c] = Turn;
        LastMove = b * 9 + c;
        Boards[b] = SmallResult(b);

        if (Classic)
        {
            if (Boards[0] != Empty) { Winner = Boards[0]; WinLine = Boards[0] >= 0 ? Lines.First(l => l.All(x => Cells[x] == Winner)) : null; }
            else Turn = (Turn + 1) % Players;
            return true;
        }

        var (w, line) = BigResult();
        if (w != Empty) { Winner = w; WinLine = line; Forced = -1; return true; }

        Forced = Boards[c] == Empty ? c : -1;
        Turn = (Turn + 1) % Players;
        return true;
    }

    public IEnumerable<(int b, int c)> LegalMoves()
    {
        for (int b = 0; b < 9; b++)
            if (Boards[b] == Empty && (Forced == -1 || Forced == b))
                for (int c = 0; c < 9; c++)
                    if (Cells[b * 9 + c] == Empty) yield return (b, c);
    }

    private int SmallResult(int b)
    {
        foreach (var l in Lines)
        {
            var p = Cells[b * 9 + l[0]];
            if (p >= 0 && p == Cells[b * 9 + l[1]] && p == Cells[b * 9 + l[2]]) return p;
        }
        for (int c = 0; c < 9; c++) if (Cells[b * 9 + c] == Empty) return Empty;
        return Draw;
    }

    private (int, int[]?) BigResult()
    {
        foreach (var l in Lines)
        {
            var p = Boards[l[0]];
            if (p >= 0 && p == Boards[l[1]] && p == Boards[l[2]]) return (p, l);
        }
        if (Boards.Any(o => o == Empty)) return (Empty, null);
        // All boards decided without three in a row: whoever won the most boards wins.
        var counts = Enumerable.Range(0, Players).Select(p => Boards.Count(o => o == p)).ToArray();
        var best = counts.Max();
        return counts.Count(n => n == best) == 1 ? (Array.IndexOf(counts, best), null) : (Draw, null);
    }

    // ---------- Snapshot (sent from host to other devices) ----------
    public string Serialize() =>
        $"{Players};{Turn};{Forced};{Winner};{LastMove};{string.Join(',', Cells)};{string.Join(',', Boards)};{(WinLine is null ? "" : string.Join(',', WinLine))};{(Classic ? 1 : 0)}";

    public void Load(string s)
    {
        var p = s.Split(';');
        Players = int.Parse(p[0]); Turn = int.Parse(p[1]); Forced = int.Parse(p[2]);
        Winner = int.Parse(p[3]); LastMove = int.Parse(p[4]);
        Cells = p[5].Split(',').Select(int.Parse).ToArray();
        Boards = p[6].Split(',').Select(int.Parse).ToArray();
        WinLine = p[7].Length == 0 ? null : p[7].Split(',').Select(int.Parse).ToArray();
        Classic = p.Length > 8 && p[8] == "1";
    }

    public UltimateEngine Clone()
    {
        var e = new UltimateEngine();
        e.Load(Serialize());
        return e;
    }

    // ---------- Computer player ----------
    /// <summary>level 0 = makkelijk (random), 1 = normaal (heuristic), 2 = moeilijk (heuristic + look-ahead).</summary>
    public (int b, int c) BestMove(int level, Random rng)
    {
        var moves = LegalMoves().ToList();
        if (level == 0 || moves.Count == 1) return moves[rng.Next(moves.Count)];
        var me = Turn;
        var scored = moves.Select(m => (m, s: Score(this, m, me, level) + rng.NextDouble() * 0.5)).ToList();
        return scored.MaxBy(x => x.s).m;
    }

    private static double Score(UltimateEngine e, (int b, int c) m, int me, int level)
    {
        var sim = e.Clone();
        sim.Play(m.b, m.c);
        if (sim.Winner == me) return 10000;

        double s = 0;
        if (sim.Boards[m.b] == me) s += 120 + (m.b == 4 ? 40 : 0);
        s += BoardThreats(e, m.b, m.c, me) * 25;
        if (m.c == 4) s += 6; else if (m.c is 0 or 2 or 6 or 8) s += 3;

        // Blocking: would the next player have won this small board with this cell?
        foreach (var opp in Enumerable.Range(0, e.Players).Where(p => p != me))
            if (WouldWinSmall(e, m.b, m.c, opp)) s += 70;

        // Where do we send the next player?
        if (sim.Forced == -1) s -= 45;                      // free choice is a gift
        else
        {
            var next = sim.Turn;
            for (int c = 0; c < 9; c++)
                if (sim.Cells[sim.Forced * 9 + c] == Empty && WouldWinSmall(sim, sim.Forced, c, next)) { s -= 90; break; }
        }

        if (level >= 2 && !sim.Over)
        {
            // Look one move ahead for the next player: avoid moves that let them win the game or a key board.
            double worst = 0;
            foreach (var r in sim.LegalMoves())
            {
                var s2 = sim.Clone();
                var who = s2.Turn;
                s2.Play(r.b, r.c);
                double v = s2.Winner == who ? 5000 : s2.Boards[r.b] == who ? 80 : 0;
                worst = Math.Max(worst, v);
            }
            s -= worst;
        }
        return s;
    }

    private static bool WouldWinSmall(UltimateEngine e, int b, int c, int p)
    {
        if (e.Boards[b] != Empty || e.Cells[b * 9 + c] != Empty) return false;
        foreach (var l in Lines)
        {
            if (!l.Contains(c)) continue;
            if (l.Where(x => x != c).All(x => e.Cells[b * 9 + x] == p)) return true;
        }
        return false;
    }

    // Number of lines where this move makes two-of-mine with the third cell still open.
    private static int BoardThreats(UltimateEngine e, int b, int c, int p)
    {
        int n = 0;
        foreach (var l in Lines)
        {
            if (!l.Contains(c)) continue;
            var others = l.Where(x => x != c).Select(x => e.Cells[b * 9 + x]).ToArray();
            if (others.Count(v => v == p) == 1 && others.Count(v => v == Empty) == 1) n++;
        }
        return n;
    }
}
