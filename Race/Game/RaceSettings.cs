namespace Race.Game;

/// <summary>Instelbare spelregels. Online stuurt degene die start zijn instellingen mee, zodat iedereen dezelfde baan heeft.</summary>
public sealed record RaceSettings
{
    /// <summary>Beginsnelheid (baan-eenheden per seconde).</summary>
    public double StartSpeed { get; set; } = 1.0;
    /// <summary>Maximale basissnelheid.</summary>
    public double MaxSpeed { get; set; } = 2.4;
    /// <summary>Hoe snel de basissnelheid oploopt (per seconde).</summary>
    public double SpeedUp { get; set; } = 0.02;
    /// <summary>Hoeveelheid verkeer (1 = normaal).</summary>
    public double Traffic { get; set; } = 0.75;
    /// <summary>Kans (procent) dat een auto van baan wisselt.</summary>
    public int LaneChange { get; set; } = 35;
    /// <summary>Scherpte van de bochten (0 = rechte weg).</summary>
    public double Curves { get; set; } = 1.0;
    /// <summary>Hoeveelheid munten (1 = normaal).</summary>
    public double Coins { get; set; } = 1.0;
    /// <summary>Hoeveelheid power-ups (1 = normaal, 0 = geen).</summary>
    public double PowerUps { get; set; } = 1.0;
    public int Lives { get; set; } = 3;
    /// <summary>Lengte van een race (Samen/Online) in km.</summary>
    public int RaceKm { get; set; } = 3;
    /// <summary>Spelers botsen tegen elkaar (Samen/Online): je duwt elkaar opzij, maar verliest geen leven.</summary>
    public bool PlayerCollision { get; set; } = true;

    public double RaceUnits => RaceKm * 1000 / RaceEngine.MetersPerUnit;

    public static RaceSettings Easy() => new() { StartSpeed = 0.8, MaxSpeed = 1.9, SpeedUp = 0.012, Traffic = 0.5, LaneChange = 20, Curves = 0.7, PowerUps = 1.5, Lives = 5 };
    public static RaceSettings Normal() => new();
    public static RaceSettings Hard() => new() { StartSpeed = 1.2, MaxSpeed = 2.9, SpeedUp = 0.03, Traffic = 1.2, LaneChange = 55, Curves = 1.3, PowerUps = 0.7, Lives = 3 };

    /// <summary>Begrenst alle waarden (ook die van andere spelers of uit localStorage).</summary>
    public RaceSettings Clamped() => this with
    {
        StartSpeed = Math.Clamp(StartSpeed, 0.5, 2),
        MaxSpeed = Math.Clamp(Math.Max(MaxSpeed, StartSpeed), 0.5, 3.5),
        SpeedUp = Math.Clamp(SpeedUp, 0, 0.1),
        Traffic = Math.Clamp(Traffic, 0.2, 2),
        LaneChange = Math.Clamp(LaneChange, 0, 90),
        Curves = Math.Clamp(Curves, 0, 2),
        Coins = Math.Clamp(Coins, 0, 2.5),
        PowerUps = Math.Clamp(PowerUps, 0, 4),
        Lives = Math.Clamp(Lives, 1, 9),
        RaceKm = Math.Clamp(RaceKm, 1, 10),
    };
}
