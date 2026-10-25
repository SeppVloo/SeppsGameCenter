namespace Race.Game;

public enum RaceStatus { Ready, Countdown, Running, Finished, GameOver }

public sealed class TrafficCar
{
    public int Id { get; init; }
    public int Lane { get; init; }
    public double Z0 { get; init; }
    public int Color { get; init; }
    public double X => Track.LaneX(Lane);
    public double Speed => Track.LaneSpeed(Lane);
    public double ZAt(double time) => Z0 + Speed * time;
}

public sealed class Coin
{
    public int Id { get; init; }
    public double X { get; init; }
    public double Z { get; init; }
}

/// <summary>
/// Snapshot voor de tekencode (JS). Z = afgelegde afstand. Cars: dz,x,kleur per auto; Coins: dz,x per munt
/// (dz = afstand t.o.v. de speler). Curves: kromming vanaf de speler in stappen van <see cref="RaceEngine.CurveStep"/>.
/// </summary>
public sealed record RaceFrame(
    double X, double Z, double Steer, bool Blink, double[] Cars, double[] Coins, double[] Curves,
    double FinishDz, int Score, int Meters, int Lives, int Kmh, double Countdown, double FinishTime, string Status);

/// <summary>Pure spellogica van de racegame. Weg loopt van x=0 tot 1 (4 banen); z is de afstand langs de baan.</summary>
public sealed class RaceEngine
{
    public const double CarW = 0.16;
    public const double CarH = 0.22;
    public const double CoinR = 0.035;
    public const int StartLives = 3;
    public const int CoinPoints = 50;
    public const double MetersPerUnit = 20;
    public const double RaceUnits = 150; // 3 km
    public const double CurveStep = 0.3;
    public const int CurveSamples = 100;
    public const double Drift = 0.3;
    private const double ViewBehind = 1.5;

    private readonly List<TrafficCar> _cars = [];
    private readonly List<Coin> _coins = [];
    private int _lastHit = -1;
    private Track _track = new(1);

    public RaceEngine() => Reset();

    public RaceStatus Status { get; private set; }
    public double X { get; private set; }
    public double Z { get; private set; }
    public double Speed { get; private set; }
    public double Time { get; private set; }
    public double Countdown { get; private set; }
    public double Steer { get; private set; }
    public int Lives { get; private set; }
    public int CoinCount { get; private set; }
    public double Invulnerable { get; private set; }
    /// <summary>Afstand van de finish in baan-eenheden, of 0 voor eindeloos.</summary>
    public double FinishZ { get; private set; }
    public double? FinishTime { get; private set; }
    public IReadOnlyList<TrafficCar> Cars => _cars;
    public IReadOnlyList<Coin> Coins => _coins;
    public Track Track => _track;

    public double BaseSpeed => Math.Min(1.0 + Time * 0.02, 2.6);
    public bool OffRoad => X < 0 || X > 1;
    public int Meters => (int)(Math.Min(Z, FinishZ > 0 ? FinishZ : double.MaxValue) * MetersPerUnit);
    public int Score => Meters + CoinCount * CoinPoints;
    public int Kmh => (int)(Speed * 60);
    public bool Done => Status is RaceStatus.Finished or RaceStatus.GameOver;

    public void Reset()
    {
        _cars.Clear();
        _coins.Clear();
        Status = RaceStatus.Ready;
        X = Track.LaneX(1);
        Z = Speed = Time = Countdown = Steer = Invulnerable = 0;
        Lives = StartLives;
        CoinCount = 0;
        FinishTime = null;
        _lastHit = -1;
    }

    /// <param name="seed">Zelfde seed = zelfde baan (voor multiplayer).</param>
    /// <param name="finishZ">0 = eindeloos, anders lengte van de race.</param>
    /// <param name="lane">Startbaan (0-3).</param>
    /// <param name="countdown">Seconden aftellen voor de start.</param>
    public void Start(int seed, double finishZ = 0, int lane = 1, double countdown = 3)
    {
        Reset();
        _track = new Track(seed);
        FinishZ = finishZ;
        X = Track.LaneX(Math.Clamp(lane, 0, Track.Lanes - 1));
        Countdown = countdown;
        Status = countdown > 0 ? RaceStatus.Countdown : RaceStatus.Running;
    }

    /// <param name="dt">Seconden sinds vorige tick.</param>
    /// <param name="steer">-1 (links) tot 1 (rechts).</param>
    /// <param name="throttle">-1 (remmen) tot 1 (gas).</param>
    public void Tick(double dt, double steer, double throttle)
    {
        dt = Math.Clamp(dt, 0, 0.05);
        Steer += (Math.Clamp(steer, -1, 1) - Steer) * Math.Min(1, dt * 12);
        if (Status == RaceStatus.Countdown)
        {
            Countdown -= dt;
            if (Countdown <= 0) { Countdown = 0; Status = RaceStatus.Running; }
            _track.Generate(Z + 32, _cars, _coins);
            return;
        }
        if (Status != RaceStatus.Running) return;
        throttle = Math.Clamp(throttle, -1, 1);

        Time += dt;
        var target = BaseSpeed * (1 + 0.5 * throttle) * (OffRoad ? 0.45 : 1);
        Speed += Math.Clamp(target - Speed, -2.5 * dt, 1.2 * dt);
        Z += Speed * dt;
        Invulnerable = Math.Max(0, Invulnerable - dt);

        var curve = _track.Curve(Z);
        X = Math.Clamp(X + (Steer * 1.3 - curve * Speed * Speed * Drift) * dt, -0.2, 1.2);

        _track.Generate(Z + 32, _cars, _coins);
        _cars.RemoveAll(c => c.ZAt(Time) < Z - ViewBehind);
        _coins.RemoveAll(c => c.Z < Z - ViewBehind);

        CheckCollisions();

        if (Status == RaceStatus.Running && FinishZ > 0 && Z >= FinishZ)
        {
            FinishTime = Time;
            Status = RaceStatus.Finished;
        }
    }

    private void CheckCollisions()
    {
        for (int i = _coins.Count - 1; i >= 0; i--)
        {
            var c = _coins[i];
            if (Math.Abs(c.X - X) < CarW / 2 + CoinR && Math.Abs(c.Z - Z) < CarH / 2 + CoinR)
            {
                CoinCount++;
                _coins.RemoveAt(i);
            }
        }

        if (Invulnerable > 0) return;
        foreach (var c in _cars)
        {
            if (c.Id == _lastHit) continue;
            if (Math.Abs(c.X - X) < CarW * 0.92 && Math.Abs(c.ZAt(Time) - Z) < CarH * 0.8)
            {
                _lastHit = c.Id;
                Lives--;
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
            cars[i * 3] = _cars[i].ZAt(Time) - Z; cars[i * 3 + 1] = _cars[i].X; cars[i * 3 + 2] = _cars[i].Color;
        }
        var coins = new double[_coins.Count * 2];
        for (int i = 0; i < _coins.Count; i++)
        {
            coins[i * 2] = _coins[i].Z - Z; coins[i * 2 + 1] = _coins[i].X;
        }
        var curves = new double[CurveSamples];
        for (int i = 0; i < CurveSamples; i++) curves[i] = _track.Curve(Z + i * CurveStep);

        var blink = Invulnerable > 0 && (int)(Invulnerable * 8) % 2 == 0;
        var finishDz = FinishZ > 0 ? FinishZ - Z : -1;
        return new RaceFrame(X, Z, Steer, blink, cars, coins, curves, finishDz, Score, Meters, Lives, Kmh, Countdown, FinishTime ?? -1, Status.ToString());
    }
}
