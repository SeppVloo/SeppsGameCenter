// Online multiplayer voor Race via publieke MQTT-brokers (geen WebRTC nodig, werkt dus ook achter strenge
// routers/firewalls en op 4G). Iedereen met dezelfde kamercode abonneert op hetzelfde topic. Elke speler stuurt
// ~10x per seconde zijn positie; tegenstanders worden als "spookauto" getekend (geen botsingen), geen host nodig.
// We verbinden met meerdere brokers tegelijk en sturen alles naar allemaal: valt er een uit, dan werkt het nog.
import mqtt from "https://esm.sh/mqtt@5.10.1";

const APP_ID = "sepp-race-v1";
const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
const TIMEOUT = 6000;
const selfId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

let clients = [], topic = "", dotnet = null, timer = 0, myName = "", lastStart = "", seq = 0;
const peers = new Map(); // peerId -> { name, z, x, lives, meters, score, status, ft, seen }

function list() {
    return [...peers.entries()].map(([id, p]) => ({ id, name: p.name ?? "?", meters: p.meters | 0, lives: p.lives | 0, status: p.status ?? "Ready", finishTime: typeof p.ft === "number" ? p.ft : -1 }));
}

/** Startbaan op basis van een vaste volgorde van alle peer-id's, zodat niemand op elkaar start. */
function myLane() {
    const ids = [selfId, ...peers.keys()].sort();
    return ids.indexOf(selfId) % 4;
}

function send(msg) {
    const data = JSON.stringify({ ...msg, id: selfId });
    for (const c of clients) if (c.connected) c.publish(topic, data);
}

function onMessage(_t, buf) {
    let m;
    try { m = JSON.parse(buf.toString()); } catch { return; }
    if (!m || typeof m.id !== "string" || m.id === selfId) return;
    if (m.t === "bye") { peers.delete(m.id); push(); return; }
    const isNew = !peers.has(m.id);
    const p = peers.get(m.id) ?? {};
    p.seen = Date.now();
    if (typeof m.name === "string") p.name = m.name.slice(0, 16);
    if (m.t === "state") {
        // Elk bericht komt via 2 brokers binnen, soms in de verkeerde volgorde: oude/dubbele negeren.
        if (typeof m.s === "number" && typeof p.seq === "number" && m.s <= p.seq && p.seq - m.s < 50) { peers.set(m.id, p); return; }
        p.seq = m.s;
        Object.assign(p, { lives: m.lives, meters: m.meters, score: m.score, status: m.status, ft: m.ft });
        p.tz = +m.z; p.tx = +m.x; p.vz = +m.v || 0; p.at = performance.now();
        if (typeof p.z !== "number" || isNaN(p.z) || Math.abs(p.z - p.tz) > 3) { p.z = p.tz; p.x = p.tx; }
    }
    peers.set(m.id, p);
    if (isNew) { send({ t: "hello", name: myName }); push(); }
    if (m.t === "start") {
        const key = m.id + ":" + m.seed;
        if (key === lastStart) return; // hetzelfde bericht komt via meerdere brokers binnen
        lastStart = key;
        for (const q of peers.values()) { q.z = q.tz = 0; q.vz = 0; q.meters = 0; q.status = "Countdown"; q.ft = -1; }
        dotnet?.invokeMethodAsync("OnNetStart", m.seed | 0, myLane());
    }
}

export function connect(code, name, ref) {
    leave();
    dotnet = ref; myName = name;
    topic = `${APP_ID}/${String(code ?? "").trim().toUpperCase()}`;
    clients = BROKERS.map(url => {
        const c = mqtt.connect(url, { clientId: "race_" + selfId + "_" + Math.random().toString(36).slice(2, 6), reconnectPeriod: 3000, connectTimeout: 8000, clean: true });
        c.on("connect", () => { c.subscribe(topic); c.publish(topic, JSON.stringify({ t: "hello", name: myName, id: selfId })); });
        c.on("message", onMessage);
        c.on("error", e => console.warn("Race MQTT", url, e?.message));
        return c;
    });
    let tick = 0;
    timer = setInterval(() => {
        if (++tick % 4 === 0) send({ t: "hello", name: myName });
        const now = Date.now();
        for (const [id, p] of peers) if (now - p.seen > TIMEOUT) peers.delete(id);
        push();
    }, 500);
}

function push() { dotnet?.invokeMethodAsync("OnPeers", list()); }

export function setName(name) { myName = name; send({ t: "hello", name }); }

/** Start de race voor iedereen in de kamer; geeft de eigen startbaan terug. */
export function start(seed) {
    for (const p of peers.values()) { p.z = p.tz = 0; p.vz = 0; p.meters = 0; p.status = "Countdown"; p.ft = -1; }
    send({ t: "start", seed, name: myName });
    return myLane();
}

export function sendFrame(f, finishTime) {
    send({ t: "state", s: ++seq, name: myName, z: f.z, x: f.x, v: f.status === "Running" ? f.kmh / 60 : 0, lives: f.lives, meters: f.meters, score: f.score, status: f.status, ft: finishTime });
}

let lastGhosts = 0;
/** Spookauto's vloeiend: voorspel de positie met de laatst bekende snelheid en schuif er zacht naartoe. */
export function ghosts() {
    const now = performance.now(), dt = lastGhosts ? Math.min(0.1, (now - lastGhosts) / 1000) : 0;
    lastGhosts = now;
    const k = 1 - Math.exp(-dt * 8);
    const out = [];
    for (const p of peers.values()) {
        if (typeof p.tz !== "number" || isNaN(p.tz) || p.status === "Ready") continue;
        const ahead = Math.min(0.5, (now - p.at) / 1000);
        const tz = p.tz + p.vz * ahead;
        p.z += p.vz * dt;
        p.z += (tz - p.z) * k;
        p.x += (p.tx - p.x) * k;
        out.push({ z: p.z, x: p.x, name: p.name ?? "?" });
    }
    return out;
}

export function leave() {
    clearInterval(timer);
    if (clients.length) { try { send({ t: "bye" }); } catch { } }
    for (const c of clients) { try { c.end(true); } catch { } }
    clients = []; peers.clear(); dotnet = null;
}
