namespace Race.Game;

/// <summary>Deterministische baan op basis van een seed: bochten en verkeer zijn voor iedereen met dezelfde seed gelijk.</summary>
public sealed class Track
{
    public const int Lanes = 4;
    public const double MaxCurve = 0.4;
    private static readonly double[] LaneSpeeds = [0.45, 0.55, 0.65, 0.75];

    private readonly Random _curveRng;
    private readonly Random _rowRng;
    private readonly List<(double Start, double Len, double Curve)> _segments = [];
    private double _segEnd;
    private double _rowNext = 3;
    private int _nextId;

    public Track(int seed)
    {
        Seed = seed;
        _curveRng = new Random(seed);
        _rowRng = new Random(seed ^ 0x5eed);
        _segments.Add((0, 6, 0));
        _segEnd = 6;
    }

    public int Seed { get; }

    public static double LaneX(int lane) => (lane + 0.5) / Lanes;
    public static double LaneSpeed(int lane) => LaneSpeeds[lane];

    /// <summary>Kromming op afstand z (positief = bocht naar rechts). Loopt zacht in en uit.</summary>
    public double Curve(double z)
    {
        if (z < 0) return 0;
        while (_segEnd <= z) AddSegment();
        int lo = 0, hi = _segments.Count - 1;
        while (lo < hi)
        {
            int mid = (lo + hi + 1) / 2;
            if (_segments[mid].Start <= z) lo = mid; else hi = mid - 1;
        }
        var (start, len, curve) = _segments[lo];
        var p = z - start;
        return curve * Math.Min(1, Math.Min(p, len - p) / 2.5);
    }

    private void AddSegment()
    {
        var len = 6 + _curveRng.NextDouble() * 10;
        var curve = _curveRng.NextDouble() < 0.4 ? 0 : (_curveRng.Next(2) == 0 ? -1 : 1) * (0.15 + _curveRng.NextDouble() * (MaxCurve - 0.15));
        _segments.Add((_segEnd, len, curve));
        _segEnd += len;
    }

    /// <summary>Genereert verkeer/munten met startpositie (op t=0) tot en met maxZ.</summary>
    public void Generate(double maxZ, List<TrafficCar> cars, List<Coin> coins)
    {
        while (_rowNext < maxZ)
        {
            var z = _rowNext;
            var free = Enumerable.Range(0, Lanes).ToList();
            int count = _rowRng.NextDouble() < 0.25 ? 2 : 1;
            for (int i = 0; i < count; i++)
            {
                var lane = free[_rowRng.Next(free.Count)];
                free.Remove(lane);
                cars.Add(new TrafficCar { Id = _nextId++, Lane = lane, Z0 = z, Color = _rowRng.Next(6) });
            }
            if (_rowRng.NextDouble() < 0.35)
                coins.Add(new Coin { Id = _nextId++, X = LaneX(free[_rowRng.Next(free.Count)]), Z = z + 0.3 });
            _rowNext += Math.Max(0.45, 1.1 - z / 200) * (0.8 + _rowRng.NextDouble() * 0.4);
        }
    }
}
