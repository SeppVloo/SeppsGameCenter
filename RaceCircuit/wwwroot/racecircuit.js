let canvas;
let dotnet;
let BABYLON_LIB;
let engine;
let scene;
let camera;
let light;
let hemi;
let race;
let renderLoop;
let resizeHandler;

const controls = [
    { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
    { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
    { up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL" },
    { up: "KeyT", down: "KeyG", left: "KeyF", right: "KeyH" }
];

const keyDown = new Set();
const kartColors = ["#ff595e", "#4ea8de", "#ffd166", "#80ed99"];

function onKeyDown(e) { keyDown.add(e.code); }
function onKeyUp(e) { keyDown.delete(e.code); }

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

async function loadBabylon() {
    if (BABYLON_LIB) return BABYLON_LIB;

    await new Promise((resolve, reject) => {
        const existing = document.querySelector("script[data-race-babylon='1']");
        if (existing && window.BABYLON) {
            resolve();
            return;
        }

        if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("Babylon script load failed")), { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.babylonjs.com/babylon.js";
        script.async = true;
        script.dataset.raceBabylon = "1";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Babylon script load failed"));
        document.head.appendChild(script);
    });

    BABYLON_LIB = window.BABYLON;
    return BABYLON_LIB;
}

function createKartMesh(BABYLON, sceneRef, colorHex) {
    const root = new BABYLON.TransformNode("kart", sceneRef);

    const body = BABYLON.MeshBuilder.CreateBox("body", { width: 1.9, height: 0.55, depth: 3.2 }, sceneRef);
    body.parent = root;
    body.position.y = 0.6;

    const cabin = BABYLON.MeshBuilder.CreateBox("cabin", { width: 1.2, height: 0.45, depth: 1.25 }, sceneRef);
    cabin.parent = root;
    cabin.position.y = 0.95;
    cabin.position.z = -0.2;

    const bumper = BABYLON.MeshBuilder.CreateBox("bumper", { width: 1.8, height: 0.2, depth: 0.35 }, sceneRef);
    bumper.parent = root;
    bumper.position.y = 0.4;
    bumper.position.z = 1.55;

    const wheelPositions = [
        [-0.9, 0.35, -1.05], [0.9, 0.35, -1.05],
        [-0.9, 0.35, 1.05], [0.9, 0.35, 1.05]
    ];
    for (const [x, y, z] of wheelPositions) {
        const wheel = BABYLON.MeshBuilder.CreateCylinder("wheel", { diameter: 0.52, height: 0.35, tessellation: 16 }, sceneRef);
        wheel.parent = root;
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, y, z);
        const matWheel = new BABYLON.StandardMaterial("wheelMat", sceneRef);
        matWheel.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.1);
        wheel.material = matWheel;
    }

    const bodyMat = new BABYLON.StandardMaterial("bodyMat", sceneRef);
    bodyMat.diffuseColor = BABYLON.Color3.FromHexString(colorHex);
    bodyMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    body.material = bodyMat;
    bumper.material = bodyMat;

    const cabinMat = new BABYLON.StandardMaterial("cabinMat", sceneRef);
    cabinMat.diffuseColor = new BABYLON.Color3(0.13, 0.16, 0.21);
    cabinMat.emissiveColor = new BABYLON.Color3(0.04, 0.07, 0.11);
    cabin.material = cabinMat;

    return root;
}

function createScene(BABYLON, sceneRef) {
    sceneRef.clearColor = new BABYLON.Color4(0.55, 0.78, 0.97, 1);

    const trackRadius = 58;
    const laneWidth = 3.4;
    const lanes = 4;

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 260, height: 260 }, sceneRef);
    const gMat = new BABYLON.StandardMaterial("gMat", sceneRef);
    gMat.diffuseColor = new BABYLON.Color3(0.25, 0.53, 0.28);
    gMat.specularColor = new BABYLON.Color3(0, 0, 0);
    ground.material = gMat;

    const roadOuter = trackRadius + laneWidth * lanes * 0.5 + 1.6;
    const roadInner = trackRadius - laneWidth * lanes * 0.5 - 1.6;

    const road = BABYLON.MeshBuilder.CreateTorus("road", {
        diameter: trackRadius * 2,
        thickness: laneWidth * lanes + 3.2,
        tessellation: 160
    }, sceneRef);
    road.position.y = 0.2;
    const roadMat = new BABYLON.StandardMaterial("roadMat", sceneRef);
    roadMat.diffuseColor = new BABYLON.Color3(0.42, 0.44, 0.5);
    roadMat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    road.material = roadMat;

    const edgeIn = BABYLON.MeshBuilder.CreateTorus("edgeIn", { diameter: roadInner * 2, thickness: 0.35, tessellation: 160 }, sceneRef);
    const edgeOut = BABYLON.MeshBuilder.CreateTorus("edgeOut", { diameter: roadOuter * 2, thickness: 0.35, tessellation: 160 }, sceneRef);
    edgeIn.position.y = 0.45;
    edgeOut.position.y = 0.45;

    const lineMat = new BABYLON.StandardMaterial("lineMat", sceneRef);
    lineMat.diffuseColor = new BABYLON.Color3(0.95, 0.95, 1);
    lineMat.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.12);
    edgeIn.material = lineMat;
    edgeOut.material = lineMat;

    for (let i = 1; i < lanes; i++) {
        const d = (trackRadius - laneWidth * lanes * 0.5 + i * laneWidth) * 2;
        const laneRing = BABYLON.MeshBuilder.CreateTorus(`lane${i}`, { diameter: d, thickness: 0.07, tessellation: 160 }, sceneRef);
        laneRing.position.y = 0.42;
        laneRing.material = lineMat;
    }

    for (let i = 0; i < 22; i++) {
        const angle = (i / 22) * Math.PI * 2;
        const rr = 85 + (i % 4) * 10;
        const x = Math.cos(angle) * rr;
        const z = Math.sin(angle) * rr;

        const trunk = BABYLON.MeshBuilder.CreateCylinder(`trunk${i}`, { diameter: 0.9, height: 3 }, sceneRef);
        trunk.position.set(x, 1.5, z);
        const tMat = new BABYLON.StandardMaterial(`tMat${i}`, sceneRef);
        tMat.diffuseColor = new BABYLON.Color3(0.45, 0.29, 0.18);
        trunk.material = tMat;

        const leaves = BABYLON.MeshBuilder.CreateSphere(`leaf${i}`, { diameter: 3.8, segments: 8 }, sceneRef);
        leaves.position.set(x, 4.1, z);
        const lMat = new BABYLON.StandardMaterial(`lMat${i}`, sceneRef);
        lMat.diffuseColor = new BABYLON.Color3(0.32, 0.66, 0.28);
        leaves.material = lMat;
    }

    const kartData = [];
    for (let i = 0; i < 4; i++) {
        const mesh = createKartMesh(BABYLON, sceneRef, kartColors[i]);
        kartData.push(mesh);
    }

    return {
        trackRadius,
        laneWidth,
        lanes,
        kartMeshes: kartData
    };
}

function laneRadius(raceState, lane) {
    return raceState.trackRadius - raceState.laneWidth * 1.5 + lane * raceState.laneWidth;
}

function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

function createRaceState(humanPlayers) {
    const playerCount = clamp(Number(humanPlayers) || 1, 1, 4);
    const racers = [];

    for (let i = 0; i < 4; i++) {
        racers.push({
            id: i,
            name: i < playerCount ? `Speler ${i + 1}` : `Bot ${String.fromCharCode(65 + i)}`,
            human: i < playerCount,
            lane: i,
            laneTarget: i,
            angle: -Math.PI / 2 - i * 0.08,
            speed: 20,
            maxSpeed: i < playerCount ? 38 : 36 + Math.random() * 3,
            accel: i < playerCount ? 20 : 16,
            brake: i < playerCount ? 22 : 13,
            aiTimer: 0,
            lap: 0,
            prevAngle: -Math.PI / 2 - i * 0.08,
            finished: false,
            place: 0,
            wobble: 0
        });
    }

    return {
        racers,
        humans: playerCount,
        lapTarget: 3,
        finishedCount: 0,
        raceTime: 0,
        statusTime: 0
    };
}

function updateHuman(r, dt) {
    const map = controls[r.id];
    const throttle = keyDown.has(map.up);
    const brake = keyDown.has(map.down);
    const steer = (keyDown.has(map.right) ? 1 : 0) - (keyDown.has(map.left) ? 1 : 0);

    r.laneTarget = clamp(r.laneTarget + steer * dt * 2.7, 0, 3);
    if (throttle) r.speed += r.accel * dt;
    else r.speed -= 9 * dt;
    if (brake) r.speed -= r.brake * dt;
    r.speed = clamp(r.speed, 12, r.maxSpeed);
}

function laneBlocked(raceState, racer, lane) {
    for (const other of raceState.racers) {
        if (other.id === racer.id || other.finished) continue;
        const d = Math.abs(angleDiff(other.angle, racer.angle));
        if (Math.abs(other.lane - lane) < 0.45 && d < 0.16) return true;
    }
    return false;
}

function updateAi(raceState, r, dt) {
    r.aiTimer -= dt;
    if (r.aiTimer <= 0) {
        r.aiTimer = 0.23 + Math.random() * 0.4;
        const lane = Math.round(r.laneTarget);
        if (laneBlocked(raceState, r, lane) || Math.random() < 0.14) {
            const options = [lane - 1, lane + 1]
                .filter(x => x >= 0 && x <= 3)
                .filter(x => !laneBlocked(raceState, r, x));
            if (options.length > 0) r.laneTarget = options[Math.floor(Math.random() * options.length)];
        }
    }

    const desired = r.maxSpeed * (0.88 + Math.random() * 0.12);
    r.speed += (desired - r.speed) * dt * 1.6;
    if (laneBlocked(raceState, r, Math.round(r.laneTarget))) r.speed -= 10 * dt;
    r.speed = clamp(r.speed, 12, r.maxSpeed);
}

function resolveContacts(raceState) {
    const arr = raceState.racers;
    for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
            const a = arr[i], b = arr[j];
            if (a.finished || b.finished) continue;
            const ad = Math.abs(angleDiff(a.angle, b.angle));
            if (ad < 0.08 && Math.abs(a.lane - b.lane) < 0.38) {
                const dir = Math.sign(a.lane - b.lane) || (Math.random() < 0.5 ? -1 : 1);
                a.laneTarget = clamp(a.laneTarget + dir * 0.35, 0, 3);
                b.laneTarget = clamp(b.laneTarget - dir * 0.35, 0, 3);
                a.speed *= 0.95;
                b.speed *= 0.95;
                a.wobble = 0.18;
                b.wobble = -0.18;
            }
        }
    }
}

function stepRace(raceState, dt) {
    raceState.raceTime += dt;

    for (const r of raceState.racers) {
        if (r.finished) continue;

        if (r.human) updateHuman(r, dt);
        else updateAi(raceState, r, dt);

        r.lane += (r.laneTarget - r.lane) * dt * 6.5;
        r.wobble *= Math.max(0, 1 - dt * 6);

        r.prevAngle = r.angle;
        const radius = laneRadius(raceState, r.lane);
        r.angle += (r.speed / radius) * dt;
        if (r.prevAngle < 0 && r.angle >= 0) {
            r.lap++;
            if (r.lap >= raceState.lapTarget) {
                r.finished = true;
                raceState.finishedCount++;
                r.place = raceState.finishedCount;
            }
        }
    }

    resolveContacts(raceState);
}

function updateMeshes(BABYLON, raceState) {
    for (const r of raceState.racers) {
        const mesh = raceState.kartMeshes[r.id];
        const radius = laneRadius(raceState, r.lane);
        const x = Math.cos(r.angle) * radius;
        const z = Math.sin(r.angle) * radius;
        const dir = r.angle + Math.PI / 2;

        mesh.position.x = x;
        mesh.position.y = 0.15;
        mesh.position.z = z;
        mesh.rotation.y = -dir + r.wobble;
    }

    const me = raceState.racers[0];
    const meMesh = raceState.kartMeshes[0];
    const front = new BABYLON.Vector3(Math.cos(me.angle + Math.PI / 2), 0, Math.sin(me.angle + Math.PI / 2));
    camera.lockedTarget = meMesh;
    camera.position = meMesh.position
        .subtract(front.scale(10.5))
        .add(new BABYLON.Vector3(0, 5.8, 0));
}

function standingsText(raceState) {
    const sorted = [...raceState.racers].sort((a, b) => {
        if (a.finished && b.finished) return a.place - b.place;
        if (a.finished) return -1;
        if (b.finished) return 1;
        const av = a.lap + (a.angle / (Math.PI * 2));
        const bv = b.lap + (b.angle / (Math.PI * 2));
        return bv - av;
    });

    const mePos = sorted.findIndex(x => x.id === 0) + 1;
    const me = raceState.racers[0];

    return `Positie ${mePos}/4 · Ronde ${Math.min(raceState.lapTarget, me.lap + 1)}/${raceState.lapTarget} · Snelheid ${Math.round(me.speed * 3.6)} km/u`;
}

function publishStatus(raceState, force = false) {
    raceState.statusTime -= 0.016;
    if (!force && raceState.statusTime > 0) return;
    raceState.statusTime = 0.25;

    if (!dotnet) return;
    const done = raceState.finishedCount === raceState.racers.length;
    const winner = raceState.racers.find(x => x.place === 1);
    const base = standingsText(raceState);
    const text = done && winner ? `🏁 Winnaar: ${winner.name} · ${base}` : base;
    dotnet.invokeMethodAsync("SetStatus", text);
}

function disposeScene() {
    if (renderLoop && engine) {
        engine.stopRenderLoop(renderLoop);
    }
    renderLoop = null;

    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);

    if (resizeHandler) {
        window.removeEventListener("resize", resizeHandler);
        resizeHandler = null;
    }

    if (scene) {
        scene.dispose();
        scene = null;
    }
    if (engine) {
        engine.dispose();
        engine = null;
    }

    race = null;
}

export async function init(canvasRef, dotnetRef) {
    canvas = canvasRef;
    dotnet = dotnetRef;

    const BABYLON = await loadBabylon();

    disposeScene();

    engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, disableWebGL2Support: false });
    scene = new BABYLON.Scene(engine);

    hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.85;

    light = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.3, -1, 0.25), scene);
    light.position = new BABYLON.Vector3(40, 80, -35);
    light.intensity = 0.65;

    camera = new BABYLON.FreeCamera("cam", new BABYLON.Vector3(0, 6, -10), scene);
    camera.fov = 0.82;

    const track = createScene(BABYLON, scene);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    resizeHandler = () => engine?.resize();
    window.addEventListener("resize", resizeHandler);

    race = {
        ...track,
        ...createRaceState(1)
    };
    race.kartMeshes = track.kartMeshes;

    renderLoop = () => {
        if (!scene || !race) return;
        const dt = Math.min(0.033, engine.getDeltaTime() / 1000);
        stepRace(race, dt);
        updateMeshes(BABYLON, race);
        publishStatus(race);
        scene.render();
    };

    engine.runRenderLoop(renderLoop);
    publishStatus(race, true);
}

export function startRace(humanPlayers) {
    if (!race) return;
    const next = createRaceState(humanPlayers);
    race.racers = next.racers;
    race.humans = next.humans;
    race.lapTarget = next.lapTarget;
    race.finishedCount = 0;
    race.raceTime = 0;
    race.statusTime = 0;

    publishStatus(race, true);
}

export function dispose() {
    disposeScene();
    dotnet = null;
    canvas = null;
}
