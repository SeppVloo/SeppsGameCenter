// Race: input, game-loop (requestAnimationFrame), tekenen (bovenaanzicht en cockpit) en localStorage.
// Alle spellogica zit in C# (RaceEngine); Tick wordt elk frame synchroon aangeroepen.
let dotnet = null, raf = 0, last = 0, view = "top", names = [], online = false, net = null, sendTimer = 0;
let canvases = [], frames = [];
const keys = new Set();
const pointers = new Map(); // canvas-index -> { id, x }
const skies = new Map();    // canvas-index -> horizon-verschuiving
const COLORS = ["#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#facc15", "#60a5fa"];
const PLAYER_COLORS = ["#22d3ee", "#f97316", "#a3e635", "#e879f9"];
const CAR_W = 0.16, CAR_H = 0.22, COIN_R = 0.035, LANES = 4, CURVE_STEP = 0.3, COCKPIT_CURVE = 0.06;
const GAME_KEYS = ["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"];

const busy = () => frames.some(f => f.status === "Running" || f.status === "Countdown");

function onKeyDown(e) {
    const k = e.key.toLowerCase();
    if (k === "v" && !(e.target instanceof HTMLInputElement)) { dotnet?.invokeMethodAsync("ToggleView"); return; }
    if (!GAME_KEYS.includes(k)) return;
    keys.add(k);
    if (busy()) e.preventDefault();
}
function onKeyUp(e) { keys.delete(e.key.toLowerCase()); }
function onBlur() { keys.clear(); }

function relX(c, e) { const r = c.getBoundingClientRect(); return (e.clientX - r.left) / r.width; }
function bindPointer(c, i) {
    const down = e => { pointers.set(i, { id: e.pointerId, x: relX(c, e) }); c.setPointerCapture?.(e.pointerId); };
    const move = e => { const p = pointers.get(i); if (p && p.id === e.pointerId) p.x = relX(c, e); };
    const up = e => { const p = pointers.get(i); if (p && p.id === e.pointerId) pointers.delete(i); };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c._raceUnbind = () => {
        c.removeEventListener("pointerdown", down);
        c.removeEventListener("pointermove", move);
        c.removeEventListener("pointerup", up);
        c.removeEventListener("pointercancel", up);
    };
}

function inputs(count) {
    const out = [];
    const has = (...k) => k.some(x => keys.has(x));
    for (let i = 0; i < count; i++) {
        const sets = count === 1 ? [["a", "arrowleft"], ["d", "arrowright"], ["w", "arrowup"], ["s", "arrowdown"]]
            : i === 0 ? [["a"], ["d"], ["w"], ["s"]] : [["arrowleft"], ["arrowright"], ["arrowup"], ["arrowdown"]];
        let steer = (has(...sets[1]) ? 1 : 0) - (has(...sets[0]) ? 1 : 0);
        const throttle = (has(...sets[2]) ? 1 : 0) - (has(...sets[3]) ? 1 : 0);
        const p = pointers.get(i), f = frames[i];
        if (p && f) {
            const target = view === "cockpit" ? f.x + (p.x - 0.5) * 1.2 : (p.x - 0.1) / 0.8;
            steer = Math.max(-1, Math.min(1, (target - f.x) * 10));
        }
        out.push(steer, throttle);
    }
    return out;
}

function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
    last = t;
    if (!dotnet) return;
    try {
        frames = dotnet.invokeMethod("Tick", dt, inputs(Math.max(1, canvases.length)));
    } catch (err) { console.error(err); return; }

    if (online && net && frames.length) {
        sendTimer += dt;
        if (sendTimer > 0.1) { sendTimer = 0; net.sendFrame(frames[0], frames[0].finishTime); }
    }
    const remote = online && net ? net.ghosts() : [];
    frames.forEach((f, i) => {
        const c = canvases[i];
        if (!c) return;
        const ghosts = frames.map((o, j) => ({ z: o.z, x: o.x, name: names[j] ?? "", color: PLAYER_COLORS[j % 4] }))
            .filter((_, j) => j !== i)
            .concat(remote.map((g, j) => ({ ...g, color: PLAYER_COLORS[(j + 1) % 4] })));
        const ctx = c.getContext("2d");
        const sky = (skies.get(i) ?? 0) + f.curves[0] * (f.kmh / 60) * dt * 0.4;
        skies.set(i, sky);
        if (view === "cockpit") drawCockpit(ctx, c.width, c.height, f, ghosts, sky);
        else drawTop(ctx, c.width, c.height, f, ghosts, PLAYER_COLORS[i % 4]);
        drawHud(ctx, c.width, c.height, f, canvases.length > 1 ? names[i] : "");
    });
}

/** Zijdelingse verschuiving van de weg op afstand d vooruit (dubbele integraal van de kromming). */
function offsets(curves) {
    const o = [0];
    let slope = 0;
    for (let i = 0; i < curves.length; i++) { slope += curves[i] * CURVE_STEP; o.push(o[i] + slope * CURVE_STEP); }
    const c0 = curves[0] ?? 0;
    const off = d => {
        if (d <= 0) return 0.5 * c0 * d * d;
        const fi = d / CURVE_STEP, i = Math.floor(fi);
        if (i >= o.length - 1) return o[o.length - 1];
        return o[i] + (o[i + 1] - o[i]) * (fi - i);
    };
    /** Richting (helling) van de weg op afstand d. */
    off.slope = d => (off(d + 0.02) - off(d - 0.02)) / 0.04;
    /** Kromming op afstand d. */
    off.curve = d => curves[Math.max(0, Math.min(curves.length - 1, Math.round(d / CURVE_STEP)))] ?? 0;
    return off;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    ctx.fill();
}

function quad(ctx, x1, y1, w1, x2, y2, w2) {
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1); ctx.lineTo(x1 + w1, y1);
    ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 - w2, y2);
    ctx.closePath(); ctx.fill();
}

// ---------- Bovenaanzicht ----------

/** angle = draaiing van de auto (radialen, + = rechtsom), wheel = stuurhoek van de voorwielen, blink = -1/0/1 knipperlicht. */
function drawCarTop(ctx, cx, cy, k, color, glow, angle = 0, wheel = 0, blink = 0) {
    const w = CAR_W * k, h = CAR_H * k, px = -w / 2, py = -h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const ww = w * 0.16, wh = h * 0.22;
    ctx.fillStyle = "#111";
    // Wielen steken buiten de carrosserie uit, zodat je de voorwielen ziet meedraaien.
    for (const [oy, a] of [[0.12, wheel], [0.68, 0]]) {
        for (const sx of [px - ww * 0.15, px + w + ww * 0.15]) {
            ctx.save();
            ctx.translate(sx, py + h * oy + wh / 2);
            ctx.rotate(a);
            ctx.fillRect(-ww / 2, -wh / 2, ww, wh);
            ctx.fillStyle = "#9ca3af";
            ctx.fillRect(-ww / 2, -wh * 0.08, ww, wh * 0.16);
            ctx.restore();
        }
    }
    ctx.fillStyle = color;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
    roundRect(ctx, px + ww * 0.3, py, w - ww * 0.6, h, w * 0.25);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(11,16,38,.75)";
    roundRect(ctx, px + w * 0.15, py + h * 0.22, w * 0.7, h * 0.16, 3);
    roundRect(ctx, px + w * 0.15, py + h * 0.66, w * 0.7, h * 0.1, 3);
    if (blink && blinkOn()) {
        ctx.fillStyle = "#fbbf24"; ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 10;
        const bx = blink < 0 ? px + w * 0.12 : px + w * 0.88;
        for (const by of [py + h * 0.04, py + h * 0.96]) { ctx.beginPath(); ctx.arc(bx, by, w * 0.1, 0, Math.PI * 2); ctx.fill(); }
        ctx.shadowBlur = 0;
    }
    ctx.restore();
}

const blinkOn = () => Math.floor(performance.now() / 250) % 2 === 0;
const PU_ICONS = ["👻", "⚡", "❤️"];
const PU_COLORS = ["#c4b5fd", "#fde047", "#fb7185"];

function drawPowerUp(ctx, x, y, r, kind) {
    const pulse = 1 + Math.sin(performance.now() / 150) * 0.1;
    ctx.fillStyle = PU_COLORS[kind] ?? "#fff";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `${Math.max(8, Math.round(r * 1.3))}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(PU_ICONS[kind] ?? "?", x, y + 1);
    ctx.textAlign = "left";
}

function drawTop(ctx, W, H, f, ghosts, myColor) {
    const k = 0.8 * W, ox = 0.1 * W, py = H * 0.78;
    const off = offsets(f.curves);
    const sx = (u, dz) => ox + (u + off(dz)) * k;
    const sy = dz => py - dz * k;

    ctx.fillStyle = "#166534";
    ctx.fillRect(0, 0, W, H);
    const strip = 4;
    for (let y = 0; y < H; y += strip) {
        const dz = (py - y) / k, x0 = ox + off(dz) * k;
        ctx.fillStyle = "#374151";
        ctx.fillRect(x0, y, k, strip + 1);
        ctx.fillStyle = Math.floor((f.z + dz) / 0.12) % 2 === 0 ? "#ef4444" : "#f8fafc";
        ctx.fillRect(x0 - 6, y, 6, strip + 1);
        ctx.fillRect(x0 + k, y, 6, strip + 1);
        if (Math.floor((f.z + dz) / 0.12) % 2 === 0) {
            ctx.fillStyle = "rgba(255,255,255,.55)";
            for (let l = 1; l < LANES; l++) ctx.fillRect(x0 + (l / LANES) * k - 2, y, 4, strip + 1);
        }
    }

    if (f.finishDz >= -0.5 && f.finishDz < 2) {
        const y = sy(f.finishDz), x0 = sx(0, f.finishDz), n = 16, cw = k / n;
        for (let r = 0; r < 2; r++)
            for (let c = 0; c < n; c++) {
                ctx.fillStyle = (r + c) % 2 ? "#000" : "#fff";
                ctx.fillRect(x0 + c * cw, y - r * cw, cw, cw);
            }
    }

    for (let i = 0; i < f.coins.length; i += 2) {
        const dz = f.coins[i], x = sx(f.coins[i + 1], dz), y = sy(dz);
        ctx.fillStyle = "#fde047";
        ctx.shadowColor = "#fde047"; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(x, y, COIN_R * k, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ca8a04";
        ctx.beginPath(); ctx.arc(x, y, COIN_R * k * 0.55, 0, Math.PI * 2); ctx.fill();
    }

    for (let i = 0; i < f.powerUps.length; i += 3) {
        const dz = f.powerUps[i];
        drawPowerUp(ctx, sx(f.powerUps[i + 1], dz), sy(dz), COIN_R * k * 1.4, f.powerUps[i + 2]);
    }

    for (let i = 0; i < f.cars.length; i += 4) {
        const dz = f.cars[i];
        drawCarTop(ctx, sx(f.cars[i + 1], dz), sy(dz), k, COLORS[f.cars[i + 2] % COLORS.length], false,
            Math.atan(off.slope(dz)), Math.max(-0.5, Math.min(0.5, off.curve(dz) * 1.5)), f.cars[i + 3]);
    }

    for (const g of ghosts) {
        const dz = g.z - f.z;
        if (dz < -1 || dz > 2) continue;
        ctx.globalAlpha = 0.5;
        drawCarTop(ctx, sx(g.x, dz), sy(dz), k, g.color, true, Math.atan(off.slope(dz)));
        ctx.globalAlpha = 1;
        label(ctx, g.name, sx(g.x, dz), sy(dz) - CAR_H * k * 0.6);
    }

    if (!f.blink) {
        if (f.ghost > 0) ctx.globalAlpha = 0.45;
        if (f.boost > 0) {
            ctx.fillStyle = blinkOn() ? "#f97316" : "#fde047";
            ctx.beginPath(); ctx.arc(sx(f.x, 0), py + CAR_H * k * 0.6, CAR_W * k * 0.25, 0, Math.PI * 2); ctx.fill();
        }
        drawCarTop(ctx, sx(f.x, 0), py, k, myColor, true, f.steer * 0.2, f.steer * 0.6);
        ctx.globalAlpha = 1;
    }
}

// ---------- Cockpit (pseudo-3D) ----------

function drawCockpit(ctx, W, H, f, ghosts, sky) {
    // Camera zit iets achter en boven de bestuurder met een bredere blik, zodat je meer van de zijkant ziet.
    const hor = H * 0.4, fl = W * 0.62, camH = 0.26, BACK = 0.35;
    const offRaw = offsets(f.curves);
    const off = d => offRaw(d) * COCKPIT_CURVE;
    const px = (u, d) => W / 2 + (u + off(d) - f.x) * fl / (d + BACK);
    const py = d => hor + camH * fl / (d + BACK);

    const g = ctx.createLinearGradient(0, 0, 0, hor);
    g.addColorStop(0, "#0ea5e9"); g.addColorStop(1, "#bae6fd");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hor);
    ctx.fillStyle = "#64748b";
    const mw = W / 3, shift = ((-sky * W) % mw + mw) % mw;
    for (let x = -mw + shift; x < W + mw; x += mw) {
        ctx.beginPath();
        ctx.moveTo(x, hor); ctx.lineTo(x + mw * 0.5, hor - H * 0.08); ctx.lineTo(x + mw, hor);
        ctx.fill();
    }
    ctx.fillStyle = "#166534";
    ctx.fillRect(0, hor, W, H - hor);

    const ds = [];
    // Segmentgrenzen liggen vast in de wereld (niet t.o.v. de speler), zodat strepen vloeiend aankomen.
    // 3x fijner dan de bochtdata, zodat de weg 3x vaker "ververst" en vloeiender beweegt.
    const STEP = CURVE_STEP / 3, NEAR = -BACK + 0.12;
    const base = Math.ceil(f.z / STEP) * STEP - f.z;
    for (let i = (f.curves.length - 2) * 3; i >= -3; i--) { const d = base + i * STEP; if (d > NEAR) ds.push(d); }
    ds.push(NEAR);
    for (let j = 0; j < ds.length - 1; j++) {
        const d1 = ds[j], d2 = ds[j + 1];
        const y1 = py(d1), y2 = py(d2);
        if (y2 - y1 < 0.3 && j < ds.length - 2) continue;
        const c1 = px(0.5, d1), c2 = px(0.5, d2);
        const w1 = 0.5 * fl / (d1 + BACK), w2 = 0.5 * fl / (d2 + BACK);
        const band = Math.floor((f.z + (d1 + d2) / 2) / 0.6) % 2 === 0;
        ctx.fillStyle = band ? "#15803d" : "#166534";
        ctx.fillRect(0, y1, W, y2 - y1 + 1);
        ctx.fillStyle = band ? "#ef4444" : "#f8fafc";
        quad(ctx, c1, y1, w1 * 1.08, c2, y2, w2 * 1.08);
        ctx.fillStyle = band ? "#4b5563" : "#475569";
        quad(ctx, c1, y1, w1, c2, y2, w2);
        if (band) {
            ctx.fillStyle = "rgba(255,255,255,.7)";
            for (let l = 1; l < LANES; l++) {
                const u = l / LANES;
                quad(ctx, px(u, d1), y1, 0.008 * fl / (d1 + BACK), px(u, d2), y2, 0.008 * fl / (d2 + BACK));
            }
        }
        if (f.finishDz > 0 && f.finishDz >= d2 && f.finishDz < d1) {
            const n = 12;
            for (let c = 0; c < n; c++) {
                ctx.fillStyle = c % 2 ? "#000" : "#fff";
                const u = (c + 0.5) / n;
                quad(ctx, px(u, d1), y1, 0.5 / n * fl / (d1 + BACK), px(u, d2), y2, 0.5 / n * fl / (d2 + BACK));
            }
        }
    }

    const sprites = [];
    for (let i = 0; i < f.cars.length; i += 4)
        sprites.push({ d: f.cars[i], u: f.cars[i + 1], kind: "car", color: COLORS[f.cars[i + 2] % COLORS.length], blink: f.cars[i + 3] });
    for (let i = 0; i < f.coins.length; i += 2)
        sprites.push({ d: f.coins[i], u: f.coins[i + 1], kind: "coin" });
    for (let i = 0; i < f.powerUps.length; i += 3)
        sprites.push({ d: f.powerUps[i], u: f.powerUps[i + 1], kind: "pu", pu: f.powerUps[i + 2] });
    for (const gh of ghosts)
        sprites.push({ d: gh.z - f.z, u: gh.x, kind: "ghost", color: gh.color, name: gh.name });
    sprites.filter(s => s.d > NEAR + 0.1 && s.d < 30).sort((a, b) => b.d - a.d).forEach(s => {
        const x = px(s.u, s.d), y = py(s.d), scale = fl / (s.d + BACK);
        if (s.kind === "pu") { const r = COIN_R * 1.4 * scale; drawPowerUp(ctx, x, y - r * 1.6, r, s.pu); return; }
        if (s.kind === "coin") {
            const r = COIN_R * scale;
            ctx.fillStyle = "#fde047";
            ctx.beginPath(); ctx.arc(x, y - r * 1.6, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ca8a04";
            ctx.beginPath(); ctx.arc(x, y - r * 1.6, r * 0.55, 0, Math.PI * 2); ctx.fill();
            return;
        }
        if (s.kind === "ghost") ctx.globalAlpha = 0.55;
        const ang = Math.max(-0.5, Math.min(0.5, Math.atan(offRaw.slope(s.d)) * 0.6));
        drawCarBack(ctx, x, y, CAR_W * scale, s.color, ang, s.blink);
        ctx.globalAlpha = 1;
        if (s.kind === "ghost") label(ctx, s.name, x, y - CAR_W * scale);
    });

    // Dashboard en stuur
    ctx.fillStyle = "#0b1026";
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(0, H * 0.84);
    ctx.quadraticCurveTo(W / 2, H * 0.76, W, H * 0.84);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#22d3ee";
    ctx.font = `bold ${Math.round(W * 0.06)}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`${f.kmh} km/u`, W * 0.18, H * 0.9);
    ctx.fillText("❤️".repeat(Math.max(0, f.lives)), W * 0.82, H * 0.9);
    ctx.save();
    ctx.translate(W / 2, H * 1.0);
    ctx.rotate(f.steer * 0.9);
    ctx.strokeStyle = "#111827"; ctx.lineWidth = W * 0.05;
    ctx.beginPath(); ctx.arc(0, 0, W * 0.24, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = W * 0.035;
    ctx.beginPath(); ctx.moveTo(-W * 0.24, 0); ctx.lineTo(W * 0.24, 0); ctx.moveTo(0, 0); ctx.lineTo(0, -W * 0.24); ctx.stroke();
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath(); ctx.arc(0, -W * 0.24, W * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.textAlign = "left";

    if (f.blink) { ctx.fillStyle = "rgba(239,68,68,.25)"; ctx.fillRect(0, 0, W, H); }
    if (f.ghost > 0) { ctx.fillStyle = "rgba(196,181,253,.18)"; ctx.fillRect(0, 0, W, H); }
}

function drawCarBack(ctx, x, y, w, color, angle = 0, blink = 0) {
    const h = w * 0.7;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(x - w * 0.55, y - h * 0.08, w * 1.1, h * 0.12);
    if (angle) {
        // In een bocht zie je de zijkant van de auto: een stuk carrosserie aan de binnenkant van de bocht.
        const side = w * Math.abs(angle) * 0.9, dir = angle > 0 ? -1 : 1;
        ctx.fillStyle = color;
        ctx.globalAlpha *= 0.8;
        ctx.fillRect(dir < 0 ? x - w / 2 - side : x + w / 2, y - h * 0.75, side, h * 0.5);
        ctx.globalAlpha /= 0.8;
        ctx.fillStyle = "#111";
        ctx.fillRect(dir < 0 ? x - w / 2 - side * 0.8 : x + w / 2 + side * 0.3, y - h * 0.3, side * 0.5, h * 0.3);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle * 0.25);
    ctx.translate(-x, -y);
    ctx.fillStyle = "#111";
    ctx.fillRect(x - w * 0.5, y - h * 0.25, w * 0.16, h * 0.25);
    ctx.fillRect(x + w * 0.34, y - h * 0.25, w * 0.16, h * 0.25);
    ctx.fillStyle = color;
    roundRect(ctx, x - w / 2, y - h, w, h * 0.8, w * 0.1);
    ctx.fillStyle = "rgba(11,16,38,.75)";
    roundRect(ctx, x - w * 0.35, y - h * 0.95, w * 0.7, h * 0.3, w * 0.05);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(x - w * 0.45, y - h * 0.5, w * 0.15, h * 0.12);
    ctx.fillRect(x + w * 0.3, y - h * 0.5, w * 0.15, h * 0.12);
    if (blink && blinkOn()) {
        ctx.fillStyle = "#fbbf24"; ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 12;
        ctx.fillRect(blink < 0 ? x - w * 0.5 : x + w * 0.38, y - h * 0.68, w * 0.12, h * 0.14);
        ctx.shadowBlur = 0;
    }
    ctx.restore();
}

// ---------- HUD ----------

function label(ctx, text, x, y) {
    if (!text) return;
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
}

function drawHud(ctx, W, H, f, name) {
    ctx.textBaseline = "middle";
    ctx.font = "bold 18px system-ui, sans-serif";
    if (view !== "cockpit") {
        ctx.fillStyle = "rgba(11,16,38,.6)";
        roundRect(ctx, 10, 10, 150, 34, 8);
        ctx.fillStyle = "#fff";
        ctx.fillText("❤️".repeat(Math.max(0, f.lives)) + "  " + f.kmh + " km/u", 18, 28);
    }
    const right = f.finishDz >= 0 ? `${Math.max(0, Math.ceil(f.finishDz * 20))} m te gaan` : `${f.meters} m`;
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(11,16,38,.6)";
    roundRect(ctx, W - 160, 10, 150, 34, 8);
    ctx.fillStyle = "#fff";
    ctx.fillText(right, W - 18, 28);
    ctx.textAlign = "center";
    if (name) { ctx.fillStyle = "rgba(11,16,38,.6)"; roundRect(ctx, W / 2 - 60, 50, 120, 28, 8); ctx.fillStyle = "#fff"; ctx.fillText(name, W / 2, 64); }
    const pu = [f.ghost > 0 ? `👻 ${Math.ceil(f.ghost)}` : "", f.boost > 0 ? `⚡ ${Math.ceil(f.boost)}` : ""].filter(Boolean).join("  ");
    if (pu) { ctx.fillStyle = "rgba(11,16,38,.6)"; roundRect(ctx, W / 2 - 60, name ? 84 : 50, 120, 28, 8); ctx.fillStyle = "#fff"; ctx.fillText(pu, W / 2, name ? 98 : 64); }

    let big = "";
    if (f.status === "Countdown") big = String(Math.ceil(f.countdown));
    else if (f.status === "Finished") big = "🏁 FINISH!";
    else if (f.status === "GameOver" && f.finishDz >= 0) big = "💥 Uit de race";
    if (big) {
        ctx.font = `900 ${Math.round(W * (big.length > 2 ? 0.1 : 0.25))}px system-ui, sans-serif`;
        ctx.fillStyle = "#fde047";
        ctx.strokeStyle = "#0b1026"; ctx.lineWidth = 6;
        ctx.strokeText(big, W / 2, H * 0.3);
        ctx.fillText(big, W / 2, H * 0.3);
    }
    ctx.textAlign = "left";
}

// ---------- API voor C# ----------

export function init(ref) {
    dispose();
    dotnet = ref;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    last = 0;
    raf = requestAnimationFrame(loop);
}

export function setCanvases(list) {
    canvases.forEach(c => c?._raceUnbind?.());
    pointers.clear();
    canvases = (list ?? []).filter(Boolean);
    canvases.forEach(bindPointer);
}

export function setView(v) { view = v === "cockpit" ? "cockpit" : "top"; }
export function setPlayers(list) { names = list ?? []; }

export async function connect(code, name) {
    net ??= await import("./race-net.js");
    net.connect(code, name, dotnet);
    online = true;
}
export function setName(name) { net?.setName(name); }
export function netStart(seed) { return net ? net.start(seed) : 0; }
export function leave() { online = false; net?.leave(); }

export function dispose() {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    canvases.forEach(c => c?._raceUnbind?.());
    canvases = []; frames = []; keys.clear(); pointers.clear(); skies.clear();
    leave();
    dotnet = null;
}

export function load(key) { return localStorage.getItem(key); }
export function save(key, value) { localStorage.setItem(key, value); }
