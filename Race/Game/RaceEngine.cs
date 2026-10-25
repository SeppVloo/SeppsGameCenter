namespace Race.Game;

public enum RaceStatus { Ready, Countdown, Running, Finished, GameOver }

public sealed class TrafficCar
{
    public int Id { get; init; }
    public int Lane { get; init; }
    public double Z0 { get; init; }
    public int Color { get; init; }
    /// <summary>Doelbaan bij een baanwissel, of -1.</summary>
    public int Target { get; set; } = -1;
    /// <summary>Moment (speltijd) waarop de auto begint te verplaatsen; daarvoor knippert hij.</summary>
    public double MoveAt { get; set; } = double.MaxValue;
    public bool Decided { get; set; }
    public double Speed => Track.LaneSpeed(Lane);
    public double ZAt(double time) => Z0 + Speed * time;

    public const double SignalTime = 1.3, MoveTime = 0.9;

    public double XAt(double time)
    {
        if (Target < 0 || time <= MoveAt) return Track.LaneX(Lane);
        var p = Math.Min(1, (time - MoveAt) / MoveTime);
        p = p * p * (3 - 2 * p);
        return Track.LaneX(Lane) + (Track.LaneX(Target) - Track.LaneX(Lane)) * p;
    }

    /// <summary>-1 = knippert links, 1 = rechts, 0 = niet.</summary>
    public int Blinker(double time) =>
        Target >= 0 && time >= MoveAt - SignalTime && time < MoveAt + MoveTime ? Math.Sign(Target - Lane) : 0;
}

public enum PowerUpKind { Ghost, Boost, Heart, Magnet, Shield, Double, Shrink }

public sealed class PowerUp
{
    public int Id { get; init; }
    public double X { get; init; }
    public double Z { get; init; }
    public PowerUpKind Kind { get; init; }
}

public sealed class Coin
{
    public int Id { get; init; }
    public double X { get; init; }
    public double Z { get; init; }
}

/// <summary>
/// Snapshot voor de tekencode (JS). Z = afgelegde afstand. Cars: dz,x,kleur,knipperlicht per auto; Coins: dz,x per munt;
/// PowerUps: dz,x,soort; Ghost/Boost: resterende seconden van die power-up
/// (dz = afstand t.o.v. de speler). Curves: kromming vanaf de speler in stappen van <see cref="RaceEngine.CurveStep"/>.
/// </summary>
public sealed record RaceFrame(
    double X, double Z, double Steer, bool Blink, double[] Cars, double[] Coins, double[] Curves,
    double FinishDz, int Score, int Meters, int Lives, int Kmh, double Countdown, double FinishTime, string Status,
    double[] PowerUps, double Ghost, double Boost, double Magnet, double Shield, double Double, double Shrink, int[] Picks);

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
    public const int MaxLives = 5;
    public const double GhostSeconds = 5;
    public const double BoostSeconds = 4;
    public const double MagnetSeconds = 8;
    public const double DoubleSeconds = 10;
    public const double ShrinkSeconds = 7;
    private const double ViewBehind = 1.5;

    private readonly List<TrafficCar> _cars = [];
    private readonly List<Coin> _coins = [];
    private readonly List<PowerUp> _powerUps = [];
    private readonly List<int> _picks = [];
    private int _lastHit = -1;
    private Track _track = new(1);

    public RaceSettings Settings { get; private set; } = new();
    /// <summary>Gedeelde set van al gepakte power-ups (multiplayer): wie het eerst is krijgt hem, de rest niet meer.</summary>
    public ISet<int>? Claimed { get; set; }

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
    public double GhostLeft { get; private set; }
    public double BoostLeft { get; private set; }
    public double MagnetLeft { get; private set; }
    public double DoubleLeft { get; private set; }
    public double ShrinkLeft { get; private set; }
    /// <summary>Schild vangt de volgende botsing op.</summary>
    public bool Shield { get; private set; }
    public IReadOnlyList<PowerUp> PowerUps => _powerUps;
    /// <summary>Afstand van de finish in baan-eenheden, of 0 voor eindeloos.</summary>
    public double FinishZ { get; private set; }
    public double? FinishTime { get; private set; }
    public IReadOnlyList<TrafficCar> Cars => _cars;
    public IReadOnlyList<Coin> Coins => _coins;
    public Track Track => _track;

    public double BaseSpeed => Math.Min(Settings.StartSpeed + Time * Settings.SpeedUp, Settings.MaxSpeed);
    public bool OffRoad => X < 0 || X > 1;
    public int Meters => (int)(Math.Min(Z, FinishZ > 0 ? FinishZ : double.MaxValue) * MetersPerUnit);
    public int Score => Meters + CoinCount * CoinPoints;
    public int Kmh => (int)(Speed * 60);
    public bool Done => Status is RaceStatus.Finished or RaceStatus.GameOver;

    public void Reset()
    {
        _cars.Clear();
        _coins.Clear();
        _powerUps.Clear();
        GhostLeft = BoostLeft = MagnetLeft = DoubleLeft = ShrinkLeft = 0;
        Shield = false;
        Status = RaceStatus.Ready;
        X = Track.LaneX(1);
        Z = Speed = Time = Countdown = Steer = Invulnerable = Bumped = 0;
        Lives = Settings.Lives;
        CoinCount = 0;
        _picks.Clear();
        FinishTime = null;
        _lastHit = -1;
    }

    /// <param name="seed">Zelfde seed = zelfde baan (voor multiplayer).</param>
    /// <param name="finishZ">0 = eindeloos, anders lengte van de race.</param>
    /// <param name="lane">Startbaan (0-3).</param>
    /// <param name="countdown">Seconden aftellen voor de start.</param>
    public void Start(int seed, double finishZ = 0, int lane = 1, double countdown = 3, RaceSettings? settings = null)
    {
        Settings = (settings ?? new RaceSettings()).Clamped();
        Reset();
        _track = new Track(seed, Settings);
        FinishZ = finishZ;
        X = Track.LaneX(Math.Clamp(lane, 0, Track.Lanes - 1));
        Countdown = countdown;
        Status = countdown > 0 ? RaceStatus.Countdown : RaceStatus.Running;
    }

    /// <param name="dt">Seconden sinds vorige tick.</param>
    /// <param name="steer">-1 (links) tot 1 (rechts).</param>
    /// <param name="throttle">-1 (remmen) tot 1 (gas).</param>
    /// <param name="others">Posities (z,x) van andere spelers waar je tegenaan kunt botsen.</param>
    public void Tick(double dt, double steer, double throttle, IReadOnlyList<(double Z, double X)>? others = null)
    {
        _picks.Clear();
        dt = Math.Clamp(dt, 0, 0.05);
        Steer += (Math.Clamp(steer, -1, 1) - Steer) * Math.Min(1, dt * 12);
        if (Status == RaceStatus.Countdown)
        {
            Countdown -= dt;
            if (Countdown <= 0) { Countdown = 0; Status = RaceStatus.Running; }
            _track.Generate(Z + 32, _cars, _coins, _powerUps);
            return;
        }
        if (Status != RaceStatus.Running) return;
        throttle = Math.Clamp(throttle, -1, 1);

        Time += dt;
        GhostLeft = Math.Max(0, GhostLeft - dt);
        BoostLeft = Math.Max(0, BoostLeft - dt);
        MagnetLeft = Math.Max(0, MagnetLeft - dt);
        DoubleLeft = Math.Max(0, DoubleLeft - dt);
        ShrinkLeft = Math.Max(0, ShrinkLeft - dt);
        var target = BaseSpeed * (1 + 0.5 * throttle) * (OffRoad ? 0.45 : 1) * (BoostLeft > 0 ? 1.5 : 1);
        Speed += Math.Clamp(target - Speed, -2.5 * dt, 1.2 * dt);
        Z += Speed * dt;
        Invulnerable = Math.Max(0, Invulnerable - dt);
        Bumped = Math.Max(0, Bumped - dt);

        var curve = _track.Curve(Z);
        X = Math.Clamp(X + (Steer * 1.3 - curve * Speed * Speed * Drift) * dt, -0.2, 1.2);

        _track.Generate(Z + 32, _cars, _coins, _powerUps);
        _cars.RemoveAll(c => c.ZAt(Time) < Z - ViewBehind);
        _coins.RemoveAll(c => c.Z < Z - ViewBehind);
        _powerUps.RemoveAll(p => p.Z < Z - ViewBehind);
        PlanLaneChanges();

        if (Claimed is not null) _powerUps.RemoveAll(p => Claimed.Contains(p.Id));
        CheckCollisions();
        if (Status == RaceStatus.Running && others is not null && Settings.PlayerCollision) CheckPlayers(others);

        if (Status == RaceStatus.Running && FinishZ > 0 && Z >= FinishZ)
        {
            FinishTime = Time;
            Status = RaceStatus.Finished;
        }
    }

    /// <summary>
    /// Sommige auto's wisselen van baan: eerst knipperen, dan opschuiven. Alleen als de doelbaan vrij is.
    /// Beslissing is deterministisch (op auto-id), dus gelijk voor alle spelers met dezelfde seed.
    /// </summary>
    private void PlanLaneChanges()
    {
        foreach (var c in _cars)
        {
            if (c.Decided) continue;
            var dz = c.ZAt(Time) - Z;
            if (dz < 0) { c.Decided = true; continue; }
            // Beslis als de speler er over ~2 s is: dan zie je het knipperen en de wissel ook in het bovenaanzicht.
            var closing = Math.Max(0.3, Speed - c.Speed);
            if (dz / closing > 2.2 && dz > 1.4) continue;
            c.Decided = true;
            var h = (uint)(c.Id * 2654435761u);
            if (h % 100 >= (uint)Settings.LaneChange) continue;
            var first = (h >> 8) % 2 == 0 ? -1 : 1;
            var moveAt = Time + TrafficCar.SignalTime;
            var end = moveAt + TrafficCar.MoveTime + 0.5;
            foreach (var dir in new[] { first, -first })
            {
                var target = c.Lane + dir;
                if (target is < 0 or >= Track.Lanes) continue;
                var blocked = _cars.Any(o => o != c && (o.Lane == target || o.Target == target) &&
                    (Math.Abs(o.ZAt(moveAt) - c.ZAt(moveAt)) < 0.5 || Math.Abs(o.ZAt(end) - c.ZAt(end)) < 0.5));
                if (blocked) continue;
                c.Target = target;
                c.MoveAt = moveAt;
                break;
            }
        }
    }

    private void CheckCollisions()
    {
        for (int i = _powerUps.Count - 1; i >= 0; i--)
        {
            var p = _powerUps[i];
            if (Math.Abs(p.X - X) < CarW / 2 + CoinR * 1.3 && Math.Abs(p.Z - Z) < CarH / 2 + CoinR * 1.3)
            {
                switch (p.Kind)
                {
                    case PowerUpKind.Ghost: GhostLeft = GhostSeconds; break;
                    case PowerUpKind.Boost: BoostLeft = BoostSeconds; break;
                    case PowerUpKind.Heart: Lives = Math.Min(MaxLives, Lives + 1); break;
                    case PowerUpKind.Magnet: MagnetLeft = MagnetSeconds; break;
                    case PowerUpKind.Shield: Shield = true; break;
                    case PowerUpKind.Double: DoubleLeft = DoubleSeconds; break;
                    case PowerUpKind.Shrink: ShrinkLeft = ShrinkSeconds; break;
                }
                _powerUps.RemoveAt(i);
                _picks.Add(p.Id);
                Claimed?.Add(p.Id);
            }
        }

        for (int i = _coins.Count - 1; i >= 0; i--)
        {
            var c = _coins[i];
            var reach = MagnetLeft > 0 ? (0.45, 0.6) : (CarW / 2 + CoinR, CarH / 2 + CoinR);
            if (Math.Abs(c.X - X) < reach.Item1 && Math.Abs(c.Z - Z) < reach.Item2)
            {
                CoinCount += DoubleLeft > 0 ? 2 : 1;
                _coins.RemoveAt(i);
            }
        }

        if (Invulnerable > 0 || GhostLeft > 0) return;
        var size = ShrinkLeft > 0 ? 0.55 : 1;
        foreach (var c in _cars)
        {
            if (c.Id == _lastHit) continue;
            if (Math.Abs(c.XAt(Time) - X) < CarW * (0.5 + 0.42 * size) && Math.Abs(c.ZAt(Time) - Z) < CarH * (0.4 + 0.4 * size))
            {
                _lastHit = c.Id;
                Crash();
                return;
            }
        }
    }

    private void Crash()
    {
        if (Shield) { Shield = false; Invulnerable = 1; return; }
        Lives--;
        Speed *= 0.4;
        if (Lives <= 0) Status = RaceStatus.GameOver;
        else Invulnerable = 2;
    }

    /// <summary>Botsing met een andere speler: je wordt opzij geduwd en remt wat af, maar verliest geen leven.</summary>
    private void CheckPlayers(IReadOnlyList<(double Z, double X)> others)
    {
        foreach (var (oz, ox) in others)
        {
            if (GhostLeft > 0) return;
            if (Math.Abs(ox - X) >= CarW * 0.9 || Math.Abs(oz - Z) >= CarH * 0.85) continue;
            var side = X - ox == 0 ? (oz < Z ? 1 : -1) : Math.Sign(X - ox);
            X = Math.Clamp(ox + side * CarW * 0.9, -0.2, 1.2);
            if (oz > Z) Speed *= 0.85;
            Bumped = 0.3;
        }
    }

    /// <summary>Seconden dat de "bonk" van een spelersbotsing nog zichtbaar is.</summary>
    public double Bumped { get; private set; }

    public RaceFrame Frame()
    {
        var cars = new double[_cars.Count * 4];
        for (int i = 0; i < _cars.Count; i++)
        {
            var c = _cars[i];
            cars[i * 4] = c.ZAt(Time) - Z; cars[i * 4 + 1] = c.XAt(Time); cars[i * 4 + 2] = c.Color; cars[i * 4 + 3] = c.Blinker(Time);
        }
        var pu = new double[_powerUps.Count * 3];
        for (int i = 0; i < _powerUps.Count; i++)
        {
            pu[i * 3] = _powerUps[i].Z - Z; pu[i * 3 + 1] = _powerUps[i].X; pu[i * 3 + 2] = (int)_powerUps[i].Kind;
        }
        var coins = new double[_coins.Count * 2];
        for (int i = 0; i < _coins.Count; i++)
        {
            coins[i * 2] = _coins[i].Z - Z; coins[i * 2 + 1] = _coins[i].X;
        }
        var curves = new double[CurveSamples];
        for (int i = 0; i < CurveSamples; i++) curves[i] = _track.Curve(Z + i * CurveStep);

        var blink = (Invulnerable > 0 && (int)(Invulnerable * 8) % 2 == 0) || (Bumped > 0 && (int)(Bumped * 20) % 2 == 0);
        var finishDz = FinishZ > 0 ? FinishZ - Z : -1;
        return new RaceFrame(X, Z, Steer, blink, cars, coins, curves, finishDz, Score, Meters, Lives, Kmh, Countdown, FinishTime ?? -1, Status.ToString(),
            pu, GhostLeft, BoostLeft, MagnetLeft, Shield ? 1 : 0, DoubleLeft, ShrinkLeft, [.. _picks]);
    }
}
