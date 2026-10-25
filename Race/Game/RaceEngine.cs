namespace Race.Game;

public enum RaceStatus { Ready, Running, GameOver }

public sealed class TrafficCar
{
    public double X { get; set; }
    public double Y { get; set; }
    public double Speed { get; set; }
    public int Color { get; set; }
}

public sealed class Coin
{
    public double X { get; set; }
    public double Y { get; set; }
}

/// <summary>Snapshot voor de tekencode (JS). Cars: x,y,kleur per auto; Coins: x,y per munt.</summary>
public sealed record RaceFrame(
    double PlayerX, double PlayerY, bool Blink, double RoadOffset,
    double[] Cars, double[] Coins, int Score, int Lives, int Kmh, string Status);

/// <summary>Pure spellogica van de racegame. Wereld: weg loopt van x=0 tot 1, zicht van y=0 (boven) tot ViewH (onder).</summary>
public sealed class RaceEngine
{
    public const int Lanes = 4;
    public const double ViewH = 1.6;
    public const double CarW = 0.13;
    public const double CarH = 0.22;
    public const double CoinR = 0.035;
    public const int StartLives = 3;
    public const int CoinPoints = 50;
    public const double PlayerY = 1.3;

    private readonly Random _rng;
    private readonly List<TrafficCar> _cars = [];
    private readonly List<Coin> _coins = [];
    private double _spawn;

    public RaceEngine(int? seed = null) { _rng = seed is null ? new Random() : new Random(seed.Value); Reset(); }

    public RaceStatus Status { get; private set; }
    public double PlayerX { get; private set; }
    public double Speed { get; private set; }
    public double Distance { get; private set; }
    public double Time { get; private set; }
    public int Lives { get; private set; }
    public int CoinCount { get; private set; }
    public double Invulnerable { get; private set; }
    public IReadOnlyList<TrafficCar> Cars => _cars;
    public IReadOnlyList<Coin> Coins => _coins;

    public double BaseSpeed => Math.Min(1.0 + Time * 0.02, 2.6);
    public int Meters => (int)(Distance * 20);
    public int Score => Meters + CoinCount * CoinPoints;
    public int Kmh => (int)(Speed * 60);

    public void Reset()
    {
        _cars.Clear();
        _coins.Clear();
        Status = RaceStatus.Ready;
        PlayerX = LaneX(1);
        Speed = 0;
        Distance = 0;
        Time = 0;
        Lives = StartLives;
        CoinCount = 0;
        Invulnerable = 0;
        _spawn = 0.4;
    }

    public void Start()
    {
        Reset();
        Status = RaceStatus.Running;
        Speed = BaseSpeed * 0.6;
    }

    public static double LaneX(int lane) => (lane + 0.5) / Lanes;

    /// <param name="dt">Seconden sinds vorige tick.</param>
    /// <param name="steer">-1 (links) tot 1 (rechts).</param>
    /// <param name="throttle">-1 (remmen) tot 1 (gas).</param>
    public void Tick(double dt, double steer, double throttle)
    {
        if (Status != RaceStatus.Running) return;
        dt = Math.Clamp(dt, 0, 0.05);
        steer = Math.Clamp(steer, -1, 1);
        throttle = Math.Clamp(throttle, -1, 1);

        Time += dt;
        var target = BaseSpeed * (1 + 0.5 * throttle);
        Speed += Math.Clamp(target - Speed, -2.5 * dt, 1.2 * dt);
        Distance += Speed * dt;
        Invulnerable = Math.Max(0, Invulnerable - dt);

        PlayerX = Math.Clamp(PlayerX + steer * 1.3 * dt, CarW / 2, 1 - CarW / 2);

        foreach (var c in _cars) c.Y += (Speed - c.Speed) * dt;
        foreach (var c in _coins) c.Y += Speed * dt;
        _cars.RemoveAll(c => c.Y > ViewH + CarH || c.Y < -1);
        _coins.RemoveAll(c => c.Y > ViewH + CoinR);

        _spawn -= Speed * dt;
        if (_spawn <= 0) SpawnRow();

        CheckCollisions();
    }

    private void SpawnRow()
    {
        _spawn = (0.45 + _rng.NextDouble() * 0.45) / (1 + Time / 90);
        _spawn = Math.Max(_spawn, 0.28);

        var blocked = new bool[Lanes];
        foreach (var c in _cars)
            if (c.Y < 0.45) blocked[LaneOf(c.X)] = true;
        var free = Enumerable.Range(0, Lanes).Where(l => !blocked[l]).ToList();
        if (free.Count < 2) return; // altijd minstens één baan vrij laten

        var lane = free[_rng.Next(free.Count)];
        _cars.Add(new TrafficCar
        {
            X = LaneX(lane),
            Y = -CarH,
            Speed = BaseSpeed * (0.35 + _rng.NextDouble() * 0.25),
            Color = _rng.Next(6),
        });

        free.Remove(lane);
        if (_rng.NextDouble() < 0.35)
            _coins.Add(new Coin { X = LaneX(free[_rng.Next(free.Count)]), Y = -CarH });
    }

    private static int LaneOf(double x) => Math.Clamp((int)(x * Lanes), 0, Lanes - 1);

    private void CheckCollisions()
    {
        const double shrink = 0.8;
        for (int i = _coins.Count - 1; i >= 0; i--)
        {
            var c = _coins[i];
            if (Math.Abs(c.X - PlayerX) < CarW / 2 + CoinR && Math.Abs(c.Y - PlayerY) < CarH / 2 + CoinR)
            {
                CoinCount++;
                _coins.RemoveAt(i);
            }
        }

        if (Invulnerable > 0) return;
        foreach (var c in _cars)
        {
            if (Math.Abs(c.X - PlayerX) < CarW * shrink && Math.Abs(c.Y - PlayerY) < CarH * shrink)
            {
                Lives--;
                _cars.Remove(c);
                Speed *= 0.4;
                if (Lives <= 0) Status = RaceStatus.GameOver;
                else Invulnerable = 2;
                return;
            }
        }
    }

    public RaceFrame Frame()
    {
        var cars = new double[_cars.Count * 3];
        for (int i = 0; i < _cars.Count; i++)
        {
            cars[i * 3] = _cars[i].X; cars[i * 3 + 1] = _cars[i].Y; cars[i * 3 + 2] = _cars[i].Color;
        }
        var coins = new double[_coins.Count * 2];
        for (int i = 0; i < _coins.Count; i++)
        {
            coins[i * 2] = _coins[i].X; coins[i * 2 + 1] = _coins[i].Y;
        }
        var blink = Invulnerable > 0 && (int)(Invulnerable * 8) % 2 == 0;
        return new RaceFrame(PlayerX, PlayerY, blink, Distance % 1.0, cars, coins, Score, Lives, Kmh, Status.ToString());
    }
}
