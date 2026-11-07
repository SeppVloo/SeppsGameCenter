let canvas;
let ctx;
let dotnet;
let raf = 0;
let running = false;
let width = 0;
let height = 0;
let last = 0;
let raceTime = 0;
let humanPlayers = 1;
let karts = [];
let boostPads = [];
let trafficCars = [];
let roadSamples = [];
let statusTimer = 0;

const laneCount = 4;
const lapCount = 3;
const trackLength = 5200;
const drawDistance = 900;
const keyDown = new Set();
const colors = ["#ff5b5b", "#5ba5ff", "#ffd45f", "#63ee95"];
const names = ["Speler 1", "Speler 2", "Speler 3", "Speler 4"];
const aiNames = ["Bot A", "Bot B", "Bot C", "Bot D"];

const controls = [
    { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
    { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
    { up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL" },
    { up: "KeyT", down: "KeyG", left: "KeyF", right: "KeyH" }
];

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

function normDist(d) {
    const m = d % trackLength;
    return m < 0 ? m + trackLength : m;
}

function distAhead(target, from) {
    let d = normDist(target) - normDist(from);
    if (d < 0) d += trackLength;
    return d;
}

function signedLoopDist(a, b) {
    let d = distAhead(a, b);
    if (d > trackLength / 2) d -= trackLength;
    return d;
}

function laneCenter(lane) {
    return lane - (laneCount - 1) * 0.5;
}

function curveAt(distance) {
    return Math.sin(distance * 0.002) * 0.9 + Math.sin(distance * 0.0008 + 1.4) * 0.7;
}

function elevationAt(distance) {
    return Math.sin(distance * 0.0015) * 18 + Math.cos(distance * 0.0006) * 10;
}

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
        dist: 20 - index * 11,
        lane: index,
        laneTarget: index,
        speed: 120,
        topSpeed: isHuman ? 255 : 245 + Math.random() * 18,
        accel: isHuman ? 190 : 165,
        brake: isHuman ? 250 : 185,
        lap: 0,
        finished: false,
        finishOrder: 0,
        boost: 0,
        aiThink: 0,
        aiSkill: 0.68 + Math.random() * 0.3
    };
}

function spawnWorld() {
    boostPads = [];
    for (let i = 0; i < 18; i++) {
        boostPads.push({
            lane: i % laneCount,
            dist: 150 + i * 270 + Math.random() * 90
        });
    }

    trafficCars = [];
    for (let i = 0; i < 16; i++) {
        trafficCars.push({
            lane: Math.floor(Math.random() * laneCount),
            dist: 180 + i * 240 + Math.random() * 120,
            speed: 110 + Math.random() * 40
        });
    }
}

function buildRace() {
    karts = [];
    for (let i = 0; i < laneCount; i++) {
        karts.push(createKart(i, i < humanPlayers));
    }
    spawnWorld();
}

function isLaneBlocked(kart, lane, aheadMin, aheadMax) {
    for (const other of karts) {
        if (other.id === kart.id || other.finished) continue;
        const dz = distAhead(other.dist, kart.dist);
        if (Math.abs(other.lane - lane) < 0.48 && dz > aheadMin && dz < aheadMax) return true;
    }
    for (const t of trafficCars) {
        const dz = distAhead(t.dist, kart.dist);
        if (Math.abs(t.lane - lane) < 0.45 && dz > aheadMin && dz < aheadMax) return true;
    }
    return false;
}

function updateHuman(kart, dt) {
    const map = controls[kart.id];
    const throttle = keyDown.has(map.up);
    const brake = keyDown.has(map.down);
    const steer = (keyDown.has(map.right) ? 1 : 0) - (keyDown.has(map.left) ? 1 : 0);

    kart.laneTarget = clamp(kart.laneTarget + steer * dt * 2.8, 0, laneCount - 1);

    const top = kart.topSpeed * (kart.boost > 0 ? 1.24 : 1);
    if (throttle) kart.speed += kart.accel * dt;
    else kart.speed -= 95 * dt;
    if (brake) kart.speed -= kart.brake * dt;
    kart.speed = clamp(kart.speed, 85, top);
}

function updateAi(kart, dt) {
    kart.aiThink -= dt;
    if (kart.aiThink <= 0) {
        kart.aiThink = 0.2 + Math.random() * 0.32;
        const lane = Math.round(kart.laneTarget);
        const blocked = isLaneBlocked(kart, lane, 5, 70);
        if (blocked || Math.random() < 0.14) {
            const options = [lane - 1, lane + 1]
                .filter(l => l >= 0 && l < laneCount)
                .filter(l => !isLaneBlocked(kart, l, 5, 85));
            if (options.length > 0) kart.laneTarget = options[Math.floor(Math.random() * options.length)];
        }
    }

    const top = kart.topSpeed * (kart.boost > 0 ? 1.22 : 1) * (0.9 + kart.aiSkill * 0.2);
    kart.speed += (top - kart.speed) * dt * 1.6;
    if (isLaneBlocked(kart, Math.round(kart.laneTarget), 5, 45)) kart.speed -= 110 * dt;
    kart.speed = clamp(kart.speed, 88, top);
}

function applyBoostAndObstacle(kart) {
    for (const pad of boostPads) {
        if (Math.abs(kart.lane - pad.lane) < 0.42 && Math.abs(signedLoopDist(kart.dist, pad.dist)) < 12) {
            kart.boost = 1.2;
            kart.speed = Math.min(kart.topSpeed * 1.24, kart.speed + 55);
        }
    }

    for (const t of trafficCars) {
        const dz = signedLoopDist(t.dist, kart.dist);
        if (Math.abs(kart.lane - t.lane) < 0.42 && dz > -10 && dz < 10) {
            kart.speed *= 0.7;
            kart.laneTarget = clamp(kart.laneTarget + (Math.random() < 0.5 ? -0.5 : 0.5), 0, laneCount - 1);
            t.dist = normDist(kart.dist + 180 + Math.random() * 120);
            t.lane = Math.floor(Math.random() * laneCount);
            t.speed = 110 + Math.random() * 45;
        }
    }
}

function resolveKartContact() {
    for (let i = 0; i < karts.length; i++) {
        const a = karts[i];
        if (a.finished) continue;
        for (let j = i + 1; j < karts.length; j++) {
            const b = karts[j];
            if (b.finished) continue;
            const dz = Math.abs(signedLoopDist(a.dist, b.dist));
            if (dz < 9 && Math.abs(a.lane - b.lane) < 0.48) {
                const push = Math.sign(a.lane - b.lane) || (Math.random() < 0.5 ? -1 : 1);
                a.laneTarget = clamp(a.laneTarget + push * 0.32, 0, laneCount - 1);
                b.laneTarget = clamp(b.laneTarget - push * 0.32, 0, laneCount - 1);
                a.speed *= 0.95;
                b.speed *= 0.95;
            }
        }
    }
}

function updateRace(dt) {
    raceTime += dt;

    for (const t of trafficCars) {
        t.dist = normDist(t.dist + t.speed * dt);
    }

    let finishedCount = 0;
    for (const kart of karts) {
        if (kart.finished) {
            finishedCount++;
            continue;
        }

        if (kart.isHuman) updateHuman(kart, dt);
        else updateAi(kart, dt);

        kart.boost = Math.max(0, kart.boost - dt);
        kart.lane += (kart.laneTarget - kart.lane) * dt * 8;

        const turnForce = Math.abs(curveAt(kart.dist)) * 15;
        kart.speed -= turnForce * dt;
        kart.speed = Math.max(80, kart.speed);

        const prevDist = kart.dist;
        kart.dist = normDist(kart.dist + kart.speed * dt);
        if (prevDist > kart.dist) {
            kart.lap++;
            if (kart.lap >= lapCount) {
                kart.finished = true;
                kart.finishOrder = 1 + karts.filter(x => x.finished).length;
                finishedCount++;
            }
        }

        applyBoostAndObstacle(kart);
    }

    resolveKartContact();

    if (statusTimer <= 0) {
        publishStatus(finishedCount === karts.length);
        statusTimer = 0.25;
    } else {
        statusTimer -= dt;
    }

    if (finishedCount === karts.length) running = false;
}

function computeRoadSamples() {
    const player = karts[0] ?? createKart(0, true);
    roadSamples = [];

    let bend = 0;
    let drift = 0;
    const cameraLaneOffset = (player.lane - 1.5) * 0.5;

    const segments = 140;
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const worldDist = player.dist + t * drawDistance;

        const curve = curveAt(worldDist);
        drift += curve * 0.00065;
        bend += drift;

        const yDepth = Math.pow(t, 1.55);
        const y = height - yDepth * (height * 0.87);
        const roadW = (1 - t) * width * 0.47 + width * 0.06;
        const x = width / 2 + bend * width * 0.38 - cameraLaneOffset * roadW * 0.55;
        const hill = elevationAt(worldDist) * (1 - t) * 0.6;

        roadSamples.push({ t, worldDist, x, y: y - hill, roadW });
    }
}

function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#7bc7ff");
    sky.addColorStop(0.55, "#d8efff");
    sky.addColorStop(1, "#7bbd66");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const horizon = height * 0.34;
    ctx.fillStyle = "#5e9c58";
    ctx.fillRect(0, horizon, width, height - horizon);

    for (let i = 0; i < 7; i++) {
        const x = ((i * 173 + raceTime * 8) % (width + 280)) - 140;
        const y = horizon - 10 - (i % 3) * 8;
        ctx.fillStyle = "rgba(90,130,95,0.55)";
        ctx.beginPath();
        ctx.moveTo(x - 120, y + 35);
        ctx.lineTo(x, y - 30);
        ctx.lineTo(x + 120, y + 35);
        ctx.closePath();
        ctx.fill();
    }
}

function drawRoad() {
    for (let i = roadSamples.length - 2; i >= 0; i--) {
        const a = roadSamples[i];
        const b = roadSamples[i + 1];

        const grassShade = (i % 2 === 0) ? "#4f9446" : "#4a883f";
        ctx.fillStyle = grassShade;
        ctx.beginPath();
        ctx.moveTo(0, a.y);
        ctx.lineTo(width, a.y);
        ctx.lineTo(width, b.y);
        ctx.lineTo(0, b.y);
        ctx.closePath();
        ctx.fill();

        const asphalt = (i % 2 === 0) ? "#8b8fa3" : "#7f8398";
        ctx.fillStyle = asphalt;
        ctx.beginPath();
        ctx.moveTo(a.x - a.roadW, a.y);
        ctx.lineTo(a.x + a.roadW, a.y);
        ctx.lineTo(b.x + b.roadW, b.y);
        ctx.lineTo(b.x - b.roadW, b.y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = Math.max(1, (1 - a.t) * 3.2);
        ctx.beginPath();
        ctx.moveTo(a.x - a.roadW, a.y);
        ctx.lineTo(b.x - b.roadW, b.y);
        ctx.moveTo(a.x + a.roadW, a.y);
        ctx.lineTo(b.x + b.roadW, b.y);
        ctx.stroke();

        ctx.strokeStyle = "rgba(240,245,255,0.78)";
        ctx.setLineDash([Math.max(6, (1 - a.t) * 18), Math.max(6, (1 - a.t) * 15)]);
        for (let lane = 1; lane < laneCount; lane++) {
            const lp = lane / laneCount;
            const x1 = a.x - a.roadW + a.roadW * 2 * lp;
            const x2 = b.x - b.roadW + b.roadW * 2 * lp;
            ctx.beginPath();
            ctx.moveTo(x1, a.y);
            ctx.lineTo(x2, b.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        const railH = Math.max(2, (1 - a.t) * 7);
        ctx.fillStyle = "#b6cad5";
        ctx.fillRect(a.x - a.roadW - railH * 1.2, b.y, railH, a.y - b.y);
        ctx.fillRect(a.x + a.roadW + railH * 0.2, b.y, railH, a.y - b.y);
    }
}

function sampleRoadAt(t) {
    const clamped = clamp(t, 0, 1);
    const idx = clamped * (roadSamples.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(roadSamples.length - 1, i0 + 1);
    const p = idx - i0;
    const a = roadSamples[i0];
    const b = roadSamples[i1];
    return {
        t: clamped,
        x: a.x + (b.x - a.x) * p,
        y: a.y + (b.y - a.y) * p,
        roadW: a.roadW + (b.roadW - a.roadW) * p
    };
}

function projectEntity(distanceForward, lane) {
    if (distanceForward <= 0 || distanceForward > drawDistance) return null;
    const t = distanceForward / drawDistance;
    const road = sampleRoadAt(t);
    const laneNorm = laneCenter(lane) / ((laneCount - 1) * 0.5);
    const x = road.x + laneNorm * road.roadW * 0.72;
    const scale = 1 - t;
    return { x, y: road.y, scale, t };
}

function drawTrafficAndRivals() {
    const player = karts[0];
    const sprites = [];

    for (const t of trafficCars) {
        const d = distAhead(t.dist, player.dist);
        const p = projectEntity(d, t.lane);
        if (!p) continue;
        sprites.push({ type: "traffic", d, p, lane: t.lane });
    }

    for (const kart of karts) {
        if (kart.id === 0) continue;
        const d = distAhead(kart.dist, player.dist);
        const p = projectEntity(d, kart.lane);
        if (!p) continue;
        sprites.push({ type: "kart", d, p, kart });
    }

    for (const pad of boostPads) {
        const d = distAhead(pad.dist, player.dist);
        const p = projectEntity(d, pad.lane);
        if (!p) continue;
        sprites.push({ type: "boost", d, p });
    }

    sprites.sort((a, b) => b.d - a.d);

    for (const s of sprites) {
        if (s.type === "traffic") {
            const w = Math.max(10, s.p.scale * 40);
            const h = w * 1.3;
            ctx.fillStyle = "#f38d3c";
            ctx.fillRect(s.p.x - w / 2, s.p.y - h, w, h);
            ctx.fillStyle = "#f6f1ea";
            ctx.fillRect(s.p.x - w / 2, s.p.y - h * 0.42, w, h * 0.18);
        } else if (s.type === "boost") {
            const w = Math.max(8, s.p.scale * 46);
            const h = Math.max(5, s.p.scale * 18);
            ctx.fillStyle = "#27d7ff";
            ctx.fillRect(s.p.x - w / 2, s.p.y - h * 0.66, w, h);
            ctx.fillStyle = "#a3f4ff";
            ctx.fillRect(s.p.x - w * 0.28, s.p.y - h * 0.52, w * 0.56, h * 0.5);
        } else {
            const w = Math.max(16, s.p.scale * 55);
            const h = w * 1.35;
            ctx.fillStyle = "rgba(0,0,0,0.25)";
            ctx.fillRect(s.p.x - w * 0.48, s.p.y - h * 0.12, w * 0.96, h * 0.2);
            ctx.fillStyle = colors[s.kart.id];
            roundRect(ctx, s.p.x - w / 2, s.p.y - h, w, h, Math.max(4, w * 0.14), true);
            ctx.fillStyle = "#1b1f35";
            roundRect(ctx, s.p.x - w * 0.27, s.p.y - h * 0.63, w * 0.54, h * 0.4, Math.max(3, w * 0.1), true);
        }
    }
}

function drawPlayerKart() {
    const player = karts[0];
    const x = width / 2 + laneCenter(player.lane) * width * 0.09;
    const y = height * 0.82;
    const w = clamp(width * 0.072, 54, 98);
    const h = w * 1.4;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.45, w * 0.62, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors[0];
    roundRect(ctx, x - w / 2, y - h / 2, w, h, Math.max(8, w * 0.2), true);

    ctx.fillStyle = "#182338";
    roundRect(ctx, x - w * 0.27, y - h * 0.18, w * 0.54, h * 0.42, Math.max(6, w * 0.12), true);

    ctx.fillStyle = "#fff";
    ctx.fillRect(x - w * 0.46, y - h * 0.46, w * 0.18, h * 0.08);
    ctx.fillRect(x + w * 0.28, y - h * 0.46, w * 0.18, h * 0.08);
}

function drawMiniMap() {
    const mapX = 24;
    const mapY = 22;
    const mapW = 118;
    const mapH = 78;

    roundRect(ctx, mapX, mapY, mapW, mapH, 10, true, "rgba(17,24,38,0.48)");
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    roundRect(ctx, mapX + 6, mapY + 8, mapW - 12, mapH - 14, 18, false);

    for (const kart of karts) {
        const p = normDist(kart.dist) / trackLength;
        const px = mapX + 12 + p * (mapW - 24);
        const py = mapY + mapH / 2 + laneCenter(kart.lane) * 8;
        ctx.fillStyle = colors[kart.id];
        ctx.beginPath();
        ctx.arc(px, py, kart.id === 0 ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawHud() {
    const player = karts[0];
    const standings = getStandings();
    const pos = standings.findIndex(x => x.id === 0) + 1;

    ctx.fillStyle = "rgba(15,20,34,0.38)";
    ctx.fillRect(0, 0, width, 72);

    ctx.fillStyle = "#f2f6ff";
    ctx.font = "700 22px Segoe UI";
    ctx.fillText(`${String(Math.floor(raceTime / 60)).padStart(2, "0")}:${String(Math.floor(raceTime % 60)).padStart(2, "0")}.${String(Math.floor((raceTime % 1) * 10))}`, width * 0.5 - 70, 36);

    ctx.font = "700 18px Segoe UI";
    ctx.fillText(`LAP ${Math.min(lapCount, player.lap + 1)}/${lapCount}`, width * 0.5 + 95, 36);
    ctx.fillText(`POS ${pos}/${karts.length}`, width * 0.5 + 230, 36);

    const speedPanelW = 220;
    const speedPanelH = 22;
    const sx = 22;
    const sy = height - 36;
    roundRect(ctx, sx - 8, sy - speedPanelH + 2, speedPanelW + 16, speedPanelH + 10, 8, true, "rgba(18,26,42,0.72)");
    ctx.fillStyle = "#2ddf74";
    const pct = clamp(player.speed / (player.topSpeed * 1.25), 0, 1);
    ctx.fillRect(sx, sy - speedPanelH + 8, speedPanelW * pct, speedPanelH - 8);

    ctx.fillStyle = "#f7fbff";
    ctx.font = "700 16px Segoe UI";
    ctx.fillText(`${Math.round(player.speed)} km/u`, sx + speedPanelW + 18, sy - 3);

    drawMiniMap();
}

function getStandings() {
    return [...karts].sort((a, b) => {
        const av = a.lap + normDist(a.dist) / trackLength;
        const bv = b.lap + normDist(b.dist) / trackLength;
        return bv - av;
    });
}

function publishStatus(done = false) {
    if (!dotnet) return;
    const standings = getStandings()
        .map((k, i) => `${i + 1}. ${k.name} (ronde ${Math.min(lapCount, k.lap + 1)}/${lapCount}${k.finished ? ", gefinisht" : ""})`)
        .join(" · ");

    const winner = karts.find(k => k.finishOrder === 1);
    const text = done && winner ? `🏁 Winnaar: ${winner.name} · ${standings}` : standings;
    dotnet.invokeMethodAsync("SetStatus", text);
}

function roundRect(context, x, y, w, h, r, fill, fillStyle) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
    if (fill) {
        if (fillStyle) {
            const prev = context.fillStyle;
            context.fillStyle = fillStyle;
            context.fill();
            context.fillStyle = prev;
        } else {
            context.fill();
        }
    } else {
        context.stroke();
    }
}

function render() {
    drawBackground();
    computeRoadSamples();
    drawRoad();
    drawTrafficAndRivals();
    drawPlayerKart();
    drawHud();
}

function tick(ts) {
    if (!ctx || !canvas) return;
    if (!last) last = ts;
    const dt = Math.min(0.033, (ts - last) / 1000);
    last = ts;

    if (running) updateRace(dt);
    render();

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
    raceTime = 0;
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
