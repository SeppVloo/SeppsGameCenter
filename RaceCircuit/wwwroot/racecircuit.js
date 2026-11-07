let canvas;
let ctx;
let dotnet;
let raf = 0;
let running = false;
let width = 0;
let height = 0;
let last = 0;
let humanPlayers = 1;
let karts = [];
let trafficCars = [];
let boostPads = [];
let statusTimer = 0;

const keyDown = new Set();
const colors = ["#ff4d4d", "#4d9dff", "#ffd24d", "#7dff9a"];
const names = ["Speler 1", "Speler 2", "Speler 3", "Speler 4"];
const aiNames = ["Bot A", "Bot B", "Bot C", "Bot D"];

const controls = [
    { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
    { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
    { up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL" },
    { up: "KeyT", down: "KeyG", left: "KeyF", right: "KeyH" }
];

function onKeyDown(e) {
    keyDown.add(e.code);
}

function onKeyUp(e) {
    keyDown.delete(e.code);
}

function resize() {
    if (!canvas) return;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function createKart(index, isHuman) {
    return {
        id: index,
        name: isHuman ? names[index] : aiNames[index],
        isHuman,
        progress: index * -0.04,
        lane: index,
        laneTarget: index,
        speed: 0,
        topSpeed: isHuman ? 0.26 : 0.24 + Math.random() * 0.04,
        accel: isHuman ? 0.52 : 0.44,
        lap: 0,
        finished: false,
        finishOrder: 0,
        aiTimer: 0,
        aiSkill: 0.7 + Math.random() * 0.3
    };
}

function buildRace() {
    karts = [];
    for (let i = 0; i < 4; i++) {
        karts.push(createKart(i, i < humanPlayers));
    }
    spawnArcadeElements();
}

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

function phase(progress) {
    const p = progress % 1;
    return p < 0 ? p + 1 : p;
}

function deltaOnLoop(a, b) {
    let d = phase(a) - phase(b);
    if (d < -0.5) d += 1;
    if (d > 0.5) d -= 1;
    return d;
}

function spawnArcadeElements() {
    trafficCars = [];
    for (let i = 0; i < 10; i++) {
        trafficCars.push({
            lane: Math.floor(Math.random() * 4),
            progress: Math.random(),
            speed: 0.08 + Math.random() * 0.06
        });
    }

    boostPads = [];
    for (let lane = 0; lane < 4; lane++) {
        boostPads.push({ lane, progress: (0.1 + lane * 0.23) % 1 });
        boostPads.push({ lane, progress: (0.58 + lane * 0.17) % 1 });
    }
}

function updateHuman(kart, dt) {
    const map = controls[kart.id];
    const throttle = keyDown.has(map.up) ? 1 : keyDown.has(map.down) ? -0.85 : 0;
    const steer = (keyDown.has(map.right) ? 1 : 0) - (keyDown.has(map.left) ? 1 : 0);

    kart.laneTarget = clamp(kart.laneTarget + steer * dt * 2.7, 0, 3);
    const targetSpeed = kart.topSpeed * (0.52 + throttle * 0.5);
    kart.speed += (targetSpeed - kart.speed) * dt * kart.accel * 5.4;
    kart.speed = clamp(kart.speed, 0.04, kart.topSpeed * 1.1);
}

function isLaneBusy(kart, lane) {
    for (const other of karts) {
        if (other.id === kart.id) continue;
        const d = deltaOnLoop(other.progress, kart.progress);
        if (Math.abs(other.lane - lane) < 0.45 && d > -0.06 && d < 0.12) return true;
    }

    for (const t of trafficCars) {
        const d = deltaOnLoop(t.progress, kart.progress);
        if (Math.abs(t.lane - lane) < 0.42 && d > -0.05 && d < 0.11) return true;
    }
    return false;
}

function updateAi(kart, dt) {
    kart.aiTimer -= dt;
    if (kart.aiTimer <= 0) {
        kart.aiTimer = 0.22 + Math.random() * 0.45;
        const currentLane = Math.round(kart.laneTarget);
        if (isLaneBusy(kart, currentLane)) {
            const options = [currentLane - 1, currentLane + 1].filter(l => l >= 0 && l <= 3 && !isLaneBusy(kart, l));
            if (options.length > 0) kart.laneTarget = options[Math.floor(Math.random() * options.length)];
        } else if (Math.random() < 0.26) {
            const drift = currentLane + (Math.random() < 0.5 ? -1 : 1);
            if (drift >= 0 && drift <= 3 && !isLaneBusy(kart, drift)) kart.laneTarget = drift;
        }
    }

    const target = kart.topSpeed * (0.65 + kart.aiSkill * 0.5);
    const trafficSlow = isLaneBusy(kart, Math.round(kart.laneTarget)) ? 0.75 : 1;
    kart.speed += (target * trafficSlow - kart.speed) * dt * 3.4;
    kart.speed = clamp(kart.speed, 0.04, kart.topSpeed * 1.1);
}

function updateRace(dt) {
    for (const t of trafficCars) {
        t.progress += t.speed * dt;
        if (t.progress > 1) t.progress -= 1;
    }

    let finishedCount = 0;
    for (const kart of karts) {
        if (kart.finished) {
            finishedCount++;
            continue;
        }

        if (kart.isHuman) updateHuman(kart, dt);
        else updateAi(kart, dt);

        kart.lane += (kart.laneTarget - kart.lane) * dt * 8;
        const laneFactor = 1 - kart.lane * 0.018;
        kart.progress += kart.speed * laneFactor * dt;
        applyArcadeEffects(kart);

        const newLap = Math.floor(kart.progress);
        if (newLap > kart.lap) {
            kart.lap = newLap;
            if (kart.lap >= 3) {
                kart.finished = true;
                kart.finishOrder = 1 + karts.filter(x => x.finished).length;
                finishedCount++;
            }
        }
    }

    if (statusTimer <= 0) {
        publishStatus(finishedCount === 4);
        statusTimer = 0.25;
    } else {
        statusTimer -= dt;
    }

    if (finishedCount === 4) running = false;
}

function applyArcadeEffects(kart) {
    for (const pad of boostPads) {
        if (Math.abs(kart.lane - pad.lane) < 0.42 && Math.abs(deltaOnLoop(kart.progress, pad.progress)) < 0.018) {
            kart.speed = Math.min(kart.topSpeed * 1.26, kart.speed + 0.04);
        }
    }

    for (const traffic of trafficCars) {
        const d = deltaOnLoop(traffic.progress, kart.progress);
        if (Math.abs(kart.lane - traffic.lane) < 0.42 && d > -0.016 && d < 0.016) {
            kart.speed *= 0.72;
            kart.laneTarget = clamp(kart.laneTarget + (Math.random() < 0.5 ? -0.42 : 0.42), 0, 3);
            traffic.progress = phase(kart.progress + 0.32 + Math.random() * 0.2);
            traffic.lane = Math.floor(Math.random() * 4);
        }
    }

    for (const other of karts) {
        if (other.id === kart.id || other.finished) continue;
        const d = deltaOnLoop(other.progress, kart.progress);
        if (Math.abs(kart.lane - other.lane) < 0.35 && d > -0.012 && d < 0.012) {
            const push = Math.sign(kart.id - other.id) || (Math.random() < 0.5 ? -1 : 1);
            kart.laneTarget = clamp(kart.laneTarget + push * 0.25, 0, 3);
            kart.speed *= 0.92;
        }
    }
}

function kartPose(kart, rxOuter, ryOuter, laneWidth, cx, cy) {
    const theta = kart.progress * Math.PI * 2 - Math.PI / 2;
    const offset = laneWidth * (kart.lane + 0.5);
    const rx = rxOuter - offset;
    const ry = ryOuter - offset;
    const x = cx + Math.cos(theta) * rx;
    const y = cy + Math.sin(theta) * ry;
    const tx = -Math.sin(theta) * rx;
    const ty = Math.cos(theta) * ry;
    const angle = Math.atan2(ty, tx);
    return { x, y, angle };
}

function drawTrack() {
    const cx = width / 2;
    const cy = height / 2;
    const laneWidth = Math.min(width, height) * 0.045;
    const trackWidth = laneWidth * 4;
    const rxOuter = width * 0.46;
    const ryOuter = height * 0.4;
    const rxInner = rxOuter - trackWidth;
    const ryInner = ryOuter - trackWidth;

    ctx.fillStyle = "#2a7f3b";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#2f2f2f";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rxOuter, ryOuter, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy, rxInner, ryInner, 0, 0, Math.PI * 2, true);
    ctx.fill("evenodd");

    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.setLineDash([10, 10]);
    for (let i = 1; i < 4; i++) {
        const rx = rxOuter - laneWidth * i;
        const ry = ryOuter - laneWidth * i;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    const startX = cx;
    const startTop = cy - ryOuter;
    const startBottom = cy - ryInner;
    ctx.beginPath();
    ctx.moveTo(startX, startTop);
    ctx.lineTo(startX, startBottom);
    ctx.stroke();

    return { cx, cy, laneWidth, rxOuter, ryOuter };
}

function drawArcadeElements(track) {
    const coneW = Math.min(width, height) * 0.026;
    const coneH = coneW * 1.2;
    const padW = Math.min(width, height) * 0.042;
    const padH = padW * 0.8;

    for (const pad of boostPads) {
        const pose = kartPose({ progress: pad.progress, lane: pad.lane }, track.rxOuter, track.ryOuter, track.laneWidth, track.cx, track.cy);
        ctx.save();
        ctx.translate(pose.x, pose.y);
        ctx.rotate(pose.angle);
        ctx.fillStyle = "#37d7ff";
        ctx.fillRect(-padW / 2, -padH / 2, padW, padH);
        ctx.fillStyle = "#9af0ff";
        ctx.fillRect(-padW * 0.3, -padH * 0.2, padW * 0.6, padH * 0.4);
        ctx.restore();
    }

    for (const traffic of trafficCars) {
        const pose = kartPose(traffic, track.rxOuter, track.ryOuter, track.laneWidth, track.cx, track.cy);
        ctx.save();
        ctx.translate(pose.x, pose.y);
        ctx.rotate(pose.angle);
        ctx.fillStyle = "#f17a2d";
        ctx.fillRect(-coneW / 2, -coneH / 2, coneW, coneH);
        ctx.fillStyle = "#fff";
        ctx.fillRect(-coneW / 2, -coneH * 0.1, coneW, coneH * 0.18);
        ctx.restore();
    }
}

function drawKarts(track) {
    const kartW = Math.min(width, height) * 0.032;
    const kartH = kartW * 1.45;

    for (const kart of karts) {
        const pose = kartPose(kart, track.rxOuter, track.ryOuter, track.laneWidth, track.cx, track.cy);
        ctx.save();
        ctx.translate(pose.x, pose.y);
        ctx.rotate(pose.angle);

        ctx.fillStyle = colors[kart.id];
        ctx.fillRect(-kartW / 2, -kartH / 2, kartW, kartH);

        ctx.fillStyle = "#111";
        ctx.fillRect(-kartW * 0.24, -kartH * 0.18, kartW * 0.48, kartH * 0.45);

        ctx.fillStyle = "#fff";
        ctx.font = `${Math.max(10, kartW * 0.45)}px Segoe UI`;
        ctx.textAlign = "center";
        ctx.fillText(String(kart.id + 1), 0, kartH * 0.8);

        ctx.restore();
    }
}

function publishStatus(done = false) {
    if (!dotnet) return;
    const standings = [...karts]
        .sort((a, b) => {
            const aVal = a.lap + (a.progress % 1);
            const bVal = b.lap + (b.progress % 1);
            return bVal - aVal;
        })
        .map((k, i) => `${i + 1}. ${k.name} (ronde ${Math.min(3, k.lap + 1)}/3${k.finished ? ", gefinisht" : ""})`)
        .join(" · ");

    const winner = karts.find(k => k.finishOrder === 1);
    const text = done && winner
        ? `🏁 Winnaar: ${winner.name} · ${standings}`
        : standings;

    dotnet.invokeMethodAsync("SetStatus", text);
}

function tick(ts) {
    if (!ctx || !canvas) return;
    if (!last) last = ts;
    const dt = Math.min(0.033, (ts - last) / 1000);
    last = ts;

    if (running) updateRace(dt);

    const track = drawTrack();
    drawArcadeElements(track);
    drawKarts(track);

    raf = requestAnimationFrame(tick);
}

export function init(canvasRef, dotnetRef) {
    canvas = canvasRef;
    dotnet = dotnetRef;
    ctx = canvas.getContext("2d", { alpha: false });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", resize);
    resize();

    if (!raf) raf = requestAnimationFrame(tick);
}

export function startRace(players) {
    humanPlayers = clamp(Number(players) || 1, 1, 4);
    buildRace();
    running = true;
    last = 0;
    statusTimer = 0;
    publishStatus(false);
}

export function dispose() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", resize);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    running = false;
    keyDown.clear();
    canvas = null;
    ctx = null;
    dotnet = null;
}
