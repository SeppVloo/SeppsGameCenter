// Serverless sync for the snack orders (same approach as Pong's net.js).
// Everybody with the same family code joins one Trystero room (signalling via public MQTT brokers).
// The snackbakker's device is the source of truth: it keeps the state in localStorage and broadcasts it.
// Other devices only send their order and show the state they receive.
import { joinRoom } from "https://esm.sh/trystero@0.21.8/mqtt";

const APP_ID = "sepp-patat-v1";
let room = null, dotnet = null, isHost = false;
let sendState, sendOrder, sendCancel, sendHello;

function peers() { return room ? Object.keys(room.getPeers()).length : 0; }
function call(name, ...args) { dotnet?.invokeMethodAsync(name, ...args).catch(() => { }); }

export function start(ref, code, host) {
    leave();
    dotnet = ref; isHost = host;
    room = joinRoom({ appId: APP_ID }, "fam-" + code.trim().toLowerCase());
    let onState, onOrder, onCancel, onHello;
    [sendState, onState] = room.makeAction("state");
    [sendOrder, onOrder] = room.makeAction("order");
    [sendCancel, onCancel] = room.makeAction("cancel");
    [sendHello, onHello] = room.makeAction("hello");

    onState(json => { if (!isHost) call("OnState", json); });
    onOrder(json => { if (isHost) call("OnOrder", json); });
    onCancel(person => { if (isHost) call("OnCancel", person); });
    onHello((_, peer) => { if (isHost) call("OnHello", peer); });

    room.onPeerJoin(peer => {
        if (isHost) call("OnHello", peer); else sendHello(1, peer);
        call("OnPeers", peers());
    });
    room.onPeerLeave(() => call("OnPeers", peers()));
}

export function setHost(host) {
    isHost = host;
    if (!host) sendHello?.(1);
}

export function broadcast(json, peer) { sendState?.(json, peer ?? null); }
export function order(json) { sendOrder?.(json); }
export function cancel(person) { sendCancel?.(person); }

export function leave() {
    try { room?.leave(); } catch { }
    room = null; sendState = sendOrder = sendCancel = sendHello = null;
}

export function load(key) { return localStorage.getItem(key); }
export function save(key, value) {
    if (value === null || value === undefined) localStorage.removeItem(key); else localStorage.setItem(key, value);
}
