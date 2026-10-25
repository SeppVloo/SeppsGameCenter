// Online multiplayer voor Race: peer-to-peer via Trystero (zelfde techniek als Pong).
// Iedereen met dezelfde kamercode komt in dezelfde kamer. Elke speler stuurt ~10x per seconde zijn
// positie; tegenstanders worden als "spookauto" getekend (geen botsingen), dus er is geen host nodig.
import { joinRoom, selfId } from "https://esm.sh/trystero@0.21.8/mqtt";

const APP_ID = "sepp-race-v1";
let room = null, dotnet = null, timer = 0, myName = "";
let sendHello, sendState, sendStart;
const peers = new Map(); // peerId -> { name, z, x, lives, meters, score, status, ft }

function list() {
    return [...peers.entries()].map(([id, p]) => ({ id, name: p.name ?? "?", meters: p.meters ?? 0, lives: p.lives ?? 0, status: p.status ?? "Ready", finishTime: p.ft ?? -1 }));
}

/** Startbaan op basis van een vaste volgorde van alle peer-id's, zodat niemand op elkaar start. */
function myLane() {
    const ids = [selfId, ...peers.keys()].sort();
    return ids.indexOf(selfId) % 4;
}

export function connect(code, name, ref) {
    leave();
    dotnet = ref; myName = name;
    room = joinRoom({ appId: APP_ID }, "race-" + code.toUpperCase());
    let onHello, onState, onStart;
    [sendHello, onHello] = room.makeAction("hello");
    [sendState, onState] = room.makeAction("state");
    [sendStart, onStart] = room.makeAction("start");
    room.onPeerJoin(id => sendHello({ name: myName }, id));
    room.onPeerLeave(id => { peers.delete(id); push(); });
    onHello((m, id) => { peers.set(id, { ...(peers.get(id) ?? {}), name: String(m?.name ?? "?").slice(0, 16) }); push(); });
    onState((m, id) => { peers.set(id, { ...(peers.get(id) ?? {}), ...m }); });
    onStart((m) => dotnet?.invokeMethodAsync("OnNetStart", m.seed | 0, myLane()));
    timer = setInterval(push, 500);
}

function push() { dotnet?.invokeMethodAsync("OnPeers", list()); }

export function setName(name) { myName = name; sendHello?.({ name }); }

/** Start de race voor iedereen in de kamer; geeft de eigen startbaan terug. */
export function start(seed) {
    for (const p of peers.values()) { p.z = 0; p.meters = 0; p.status = "Countdown"; p.ft = -1; }
    sendStart?.({ seed });
    return myLane();
}

export function sendFrame(f, finishTime) {
    sendState?.({ z: f.z, x: f.x, lives: f.lives, meters: f.meters, score: f.score, status: f.status, ft: finishTime });
}

export function ghosts() {
    return [...peers.values()].filter(p => typeof p.z === "number" && p.status !== "Ready").map(p => ({ z: p.z, x: p.x, name: p.name ?? "?" }));
}

export function leave() {
    clearInterval(timer);
    try { room?.leave(); } catch { }
    room = null; peers.clear(); dotnet = null;
}
