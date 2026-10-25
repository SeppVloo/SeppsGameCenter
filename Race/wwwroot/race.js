let dotnet = null, canvas = null, ctx = null, raf = 0, last = 0;
let frame = null, pointerX = null, pointerId = null;
const keys = new Set();
const COLORS = ["#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#facc15", "#60a5fa"];
const VIEW_H = 1.6, CAR_W = 0.13, CAR_H = 0.22, COIN_R = 0.035, LANES = 4;
const GAME_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s", "A", "D", "W", "S"];

function onKeyDown(e) {
    if (!GAME_KEYS.includes(e.key)) return;
    keys.add(e.key.toLowerCase());
    if (frame?.status === "Running") e.preventDefault();
}
function onKeyUp(e) { keys.delete(e.key.toLowerCase()); }

function toX(e) { const r = canvas.getBoundingClientRect(); return (e.clientX - r.left) / r.width; }
function onDown(e) { pointerId = e.pointerId; pointerX = toX(e); canvas.setPointerCapture?.(e.pointerId); }
function onMove(e) { if (e.pointerId === pointerId) pointerX = toX(e); }
function onUp(e) { if (e.pointerId === pointerId) { pointerId = null; pointerX = null; } }

function input() {
    const has = (...k) => k.some(x => keys.has(x));
    let steer = (has("arrowright", "d") ? 1 : 0) - (has("arrowleft", "a") ? 1 : 0);
    if (pointerX !== null && frame) steer = Math.max(-1, Math.min(1, (pointerX - frame.playerX) * 10));
    const throttle = (has("arrowup", "w") ? 1 : 0) - (has("arrowdown", "s") ? 1 : 0);
    return [steer, throttle];
}

function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = last ? (t - last) / 1000 : 0;
    last = t;
    if (!dotnet) return;
    try {
        const [steer, throttle] = input();
        frame = dotnet.invokeMethod("Tick", dt, steer, throttle);
    } catch (err) { console.error(err); return; }
    draw();
}

function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.fill();
}

function drawCar(x, y, color, s, player) {
    const w = CAR_W * s, h = CAR_H * s, px = x * s - w / 2, py = y * s - h / 2;
    ctx.fillStyle = color;
    if (player) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
    roundRect(px, py, w, h, w * 0.25);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(11,16,38,.75)";
    const ws = player ? 0.22 : 0.62;  // voorruit: speler rijdt omhoog, verkeer ook
    roundRect(px + w * 0.15, py + h * ws, w * 0.7, h * 0.16, 3);
    roundRect(px + w * 0.15, py + h * (player ? 0.66 : 0.22), w * 0.7, h * 0.1, 3);
    ctx.fillStyle = "#111";
    const ww = w * 0.08, wh = h * 0.16;
    for (const oy of [0.15, 0.69]) {
        ctx.fillRect(px - ww, py + h * oy, ww, wh);
        ctx.fillRect(px + w, py + h * oy, ww, wh);
    }
}

function draw() {
    if (!ctx || !frame) return;
    const W = canvas.width, H = canvas.height, s = W;
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#facc15";
    ctx.fillRect(4, 0, 4, H);
    ctx.fillRect(W - 8, 0, 4, H);

    ctx.fillStyle = "rgba(255,255,255,.55)";
    const dash = 0.12 * s, gap = 0.12 * s, period = dash + gap;
    const off = (frame.roadOffset * s) % period;
    for (let l = 1; l < LANES; l++) {
        const x = (l / LANES) * W - 2;
        for (let y = -period + off; y < H; y += period) ctx.fillRect(x, y, 4, dash);
    }

    for (let i = 0; i < frame.coins.length; i += 2) {
        const x = frame.coins[i] * s, y = frame.coins[i + 1] * s;
        ctx.fillStyle = "#fde047";
        ctx.shadowColor = "#fde047"; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(x, y, COIN_R * s, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ca8a04";
        ctx.beginPath(); ctx.arc(x, y, COIN_R * s * 0.55, 0, Math.PI * 2); ctx.fill();
    }

    for (let i = 0; i < frame.cars.length; i += 3)
        drawCar(frame.cars[i], frame.cars[i + 1], COLORS[frame.cars[i + 2] % COLORS.length], s, false);

    if (!frame.blink) drawCar(frame.playerX, frame.playerY, "#22d3ee", s, true);

    ctx.fillStyle = "rgba(11,16,38,.6)";
    roundRect(10, 10, 150, 34, 8);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("❤️".repeat(Math.max(0, frame.lives)) + "  " + frame.kmh + " km/u", 18, 28);
}

export function init(ref, el) {
    dispose();
    dotnet = ref; canvas = el; ctx = el.getContext("2d");
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => keys.clear());
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    last = 0;
    raf = requestAnimationFrame(loop);
}

export function dispose() {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    canvas?.removeEventListener("pointerdown", onDown);
    canvas?.removeEventListener("pointermove", onMove);
    canvas?.removeEventListener("pointerup", onUp);
    canvas?.removeEventListener("pointercancel", onUp);
    keys.clear();
    dotnet = null; canvas = null; ctx = null; frame = null; pointerX = null; pointerId = null;
}

export function load(key) { return localStorage.getItem(key); }
export function save(key, value) { localStorage.setItem(key, value); }
