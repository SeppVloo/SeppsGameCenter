using System.Text.Json;

namespace Patat.Model;

public class Snack
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string Emoji { get; set; } = "🍴";
    public string Name { get; set; } = "";
    public int Stock { get; set; }
    public int FryMinutes { get; set; } = 4;
    /// <summary>Snacks with the same (non-empty) group can go into the fryer together.</summary>
    public string FryGroup { get; set; } = "";
}

public class Order
{
    public string Person { get; set; } = "";
    public Dictionary<string, int> Items { get; set; } = [];
    public string Note { get; set; } = "";
    /// <summary>Unique per submit, so a client can see its latest version has arrived.</summary>
    public string Stamp { get; set; } = "";
    public DateTime Time { get; set; } = DateTime.UtcNow;
}

public class Batch
{
    public string Key { get; set; } = "";
    public DateTime? StartedUtc { get; set; }
    public bool Done { get; set; }
}

public class PatatState
{
    public bool Open { get; set; } = true;
    public List<Snack> Snacks { get; set; } = [];
    public List<Order> Orders { get; set; } = [];
    public List<Batch> Batches { get; set; } = [];
    /// <summary>Order stamp -> reason, so a remote device learns why its order was refused.</summary>
    public Dictionary<string, string> Rejected { get; set; } = [];
}

public record PlannedBatch(string Key, string Title, int Minutes, List<(Snack Snack, int Count)> Items);

public class PatatEngine
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public PatatState State { get; private set; } = new() { Snacks = DefaultSnacks() };

    public static List<Snack> DefaultSnacks() =>
    [
        new() { Id = "patat", Emoji = "🍟", Name = "Patat (portie)", Stock = 6, FryMinutes = 6, FryGroup = "Patat" },
        new() { Id = "frikandel", Emoji = "🌭", Name = "Frikandel", Stock = 10, FryMinutes = 4, FryGroup = "Vlees" },
        new() { Id = "kroket", Emoji = "🥖", Name = "Kroket", Stock = 6, FryMinutes = 4, FryGroup = "Vlees" },
        new() { Id = "kipcorn", Emoji = "🍗", Name = "Kipcorn", Stock = 4, FryMinutes = 5, FryGroup = "Vlees" },
        new() { Id = "kaassouffle", Emoji = "🧀", Name = "Kaassoufflé", Stock = 4, FryMinutes = 3, FryGroup = "Kaas" },
        new() { Id = "bitterbal", Emoji = "🟤", Name = "Bitterbal", Stock = 20, FryMinutes = 4, FryGroup = "" },
    ];

    public string ToJson() => JsonSerializer.Serialize(State, Json);

    public void Load(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return;
        try { State = JsonSerializer.Deserialize<PatatState>(json, Json) ?? State; } catch (JsonException) { }
    }

    public Snack? Find(string id) => State.Snacks.FirstOrDefault(s => s.Id == id);

    public Order? OrderOf(string person) =>
        State.Orders.FirstOrDefault(o => string.Equals(o.Person, person, StringComparison.OrdinalIgnoreCase));

    /// <summary>How many of a snack this person could order (stock plus what he already reserved).</summary>
    public int MaxFor(string snackId, string person) =>
        (Find(snackId)?.Stock ?? 0) + (OrderOf(person)?.Items.GetValueOrDefault(snackId) ?? 0);

    /// <summary>Places or replaces the order of a person. Stock is reserved immediately. Returns an error or null.</summary>
    public string? PlaceOrder(Order order)
    {
        if (!State.Open) return "De bestellingen zijn gesloten.";
        order.Person = order.Person.Trim();
        if (order.Person.Length == 0) return "Vul je naam in.";
        order.Items = order.Items.Where(kv => kv.Value > 0 && Find(kv.Key) is not null).ToDictionary();

        foreach (var (id, n) in order.Items)
            if (n > MaxFor(id, order.Person))
                return $"Niet genoeg {Find(id)!.Name} op voorraad (nog {MaxFor(id, order.Person)}).";

        Cancel(order.Person);
        if (order.Items.Count == 0) return null;
        foreach (var (id, n) in order.Items) Find(id)!.Stock -= n;
        order.Time = DateTime.UtcNow;
        State.Orders.Add(order);
        ResetBatchesFor(order.Items.Keys);
        return null;
    }

    public void Cancel(string person)
    {
        var old = OrderOf(person);
        if (old is null) return;
        foreach (var (id, n) in old.Items)
            if (Find(id) is { } s) s.Stock += n;
        State.Orders.Remove(old);
    }

    /// <summary>New round: orders are cleared, stock stays as it is (already used).</summary>
    public void Finish()
    {
        State.Orders.Clear();
        State.Batches.Clear();
        State.Rejected.Clear();
    }

    public Dictionary<string, int> Totals()
    {
        var t = new Dictionary<string, int>();
        foreach (var o in State.Orders)
            foreach (var (id, n) in o.Items)
                t[id] = t.GetValueOrDefault(id) + n;
        return t;
    }

    public static string GroupKey(Snack s) => string.IsNullOrWhiteSpace(s.FryGroup) ? "#" + s.Id : s.FryGroup.Trim().ToLowerInvariant();

    /// <summary>Batches for the fryer: snacks of the same group together, longest batch first.</summary>
    public List<PlannedBatch> Plan()
    {
        var totals = Totals();
        return State.Snacks
            .Where(s => totals.GetValueOrDefault(s.Id) > 0)
            .GroupBy(GroupKey)
            .Select(g => new PlannedBatch(
                g.Key,
                string.IsNullOrWhiteSpace(g.First().FryGroup) ? g.First().Name : g.First().FryGroup.Trim(),
                g.Max(s => s.FryMinutes),
                g.Select(s => (s, totals[s.Id])).ToList()))
            .OrderByDescending(b => b.Minutes)
            .ToList();
    }

    public Batch BatchState(string key)
    {
        var b = State.Batches.FirstOrDefault(x => x.Key == key);
        if (b is null) State.Batches.Add(b = new Batch { Key = key });
        return b;
    }

    private void ResetBatchesFor(IEnumerable<string> snackIds)
    {
        var keys = snackIds.Select(Find).OfType<Snack>().Select(GroupKey).ToHashSet();
        State.Batches.RemoveAll(b => keys.Contains(b.Key) && b.Done);
    }
}
