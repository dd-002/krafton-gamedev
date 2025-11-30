const SERVER_URL = 'ws://localhost:8080';

let ws;
let myId = null;
let canvas, ctx;
let isGameRunning = false;

// Game Data
let mapData = { width: 800, height: 600, obstacles: [] };
const players = new Map(); 
let currentCoin = null;

// Inputs
const inputs = { w: false, a: false, s: false, d: false };

// --- PHYSICS CONSTANTS ---
const PLAYER_SIZE = 30;
const RECOIL_DISTANCE = 25;
const SPEED_PER_MS = 0.15; 

// --- RECONCILIATION TUNING ---
const RECONCILIATION_TOLERANCE = 40; // The "Trust Zone" (prevents jitter)
const SNAP_THRESHOLD = 100; // Hard correction threshold

// --- TIMESTEP TRACKING ---
let lastServerTick = 0; // Track the latest frame we received
// -------------------------

let lastFrameTime = 0;
let pingStart = 0;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-create').addEventListener('click', connectAndCreate);
    document.getElementById('btn-join').addEventListener('click', connectAndJoin);
    createDebugUI();
});

function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = mapData.width;
    canvas.height = mapData.height;
    
    isGameRunning = true;
    lastFrameTime = performance.now();
    requestAnimationFrame(renderLoop);
    
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
}

// --- Networking ---

function connectAndCreate() {
    const name = document.getElementById('username').value || 'Anon';
    connect(name, 'create');
}

function connectAndJoin() {
    const name = document.getElementById('username').value || 'Anon';
    const roomId = document.getElementById('room-code').value;
    connect(name, 'join', roomId);
}

function connect(name, mode, roomId = null) {
    const statusDiv = document.getElementById('connection-status');
    statusDiv.innerText = "Connecting...";
    
    ws = new WebSocket(`${SERVER_URL}?name=${encodeURIComponent(name)}`);

    ws.onopen = () => { 
        statusDiv.innerText = "Connected!";
        startPingLoop();
    };

    ws.onmessage = (event) => { handleServerMessage(JSON.parse(event.data), mode, roomId); };
    ws.onclose = () => { if (isGameRunning) { alert("Disconnected."); location.reload(); } };
}

function handleServerMessage(data, mode, targetRoomId) {
    switch (data.type) {
        case 'welcome':
            if (mode === 'create') ws.send(JSON.stringify({ type: 'create_room' }));
            else if (mode === 'join') ws.send(JSON.stringify({ type: 'join_room', roomId: targetRoomId }));
            break;
            
        case 'pong':
            const latency = Math.round(performance.now() - pingStart);
            updateDebugUI(latency, lastServerTick);
            break;

        case 'INIT':
            myId = data.selfId;
            mapData = data.map;
            currentCoin = data.coin;
            document.getElementById('room-display').innerText = data.roomId;
            players.clear();
            data.players.forEach(p => {
                p.serverX = p.x; 
                p.serverY = p.y;
                players.set(p.id, p);
            });
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('gameCanvas').style.display = 'block';
            document.getElementById('game-info').style.display = 'block';
            initCanvas();
            break;

        case 'NEW_PLAYER':
            data.player.serverX = data.player.x;
            data.player.serverY = data.player.y;
            players.set(data.player.id, data.player);
            break;

        case 'PLAYER_LEFT':
            players.delete(data.id);
            break;

        case 'GAME_STATE':
            // --- TIMESTEP CHECK ---
            // If this packet is OLDER than what we already have, ignore it.
            if (data.serverTick < lastServerTick) {
                console.warn(`Dropped out-of-order packet. Cur: ${lastServerTick}, Rcv: ${data.serverTick}`);
                return;
            }
            lastServerTick = data.serverTick;
            // ----------------------

            currentCoin = data.coin;
            
            data.players.forEach(p => {
                const localPlayer = players.get(p.id);
                if (localPlayer) {
                    localPlayer.serverX = p.x;
                    localPlayer.serverY = p.y;
                    localPlayer.score = p.score;

                    if (p.id === myId) {
                        const dist = Math.hypot(localPlayer.x - p.x, localPlayer.y - p.y);
                        
                        // JITTER FIX:
                        // Only snap if the error is HUGE (like > 100px). 
                        // If it's small (<40px), we assume it's just lag and ignore it.
                        if (dist > SNAP_THRESHOLD) {
                            localPlayer.x = p.x;
                            localPlayer.y = p.y;
                        }
                    }
                }
            });
            break;

        case 'GAME_OVER':
            isGameRunning = false;
            document.getElementById('game-over-screen').style.display = 'block';
            document.getElementById('winner-name').innerText = `${data.winnerName} Wins!`;
            break;
    }
    document.getElementById('player-count').innerText = players.size;
}

// --- PHYSICS ENGINE PORT ---

function applyPhysics(player, dt) {
    const moveDist = SPEED_PER_MS * dt;
    let dx = 0;
    let dy = 0;

    if (inputs.w) dy -= moveDist;
    if (inputs.s) dy += moveDist;
    if (inputs.a) dx -= moveDist;
    if (inputs.d) dx += moveDist;

    if (dx !== 0 || dy !== 0) {
        applyMovement(player, dx, dy);
    }
}

function applyMovement(player, dx, dy) {
    // X-Axis
    const newX = player.x + dx;
    const rectX = { x: newX, y: player.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
    
    if (isPositionSafe(newX, player.y) && !checkPlayerCollision(rectX, player.id)) {
        player.x = newX;
    } else {
        const bounceX = player.x - (Math.sign(dx) * RECOIL_DISTANCE);
        if (isPositionSafe(bounceX, player.y)) player.x = bounceX;
    }

    // Y-Axis
    const newY = player.y + dy;
    const rectY = { x: player.x, y: newY, w: PLAYER_SIZE, h: PLAYER_SIZE };

    if (isPositionSafe(player.x, newY) && !checkPlayerCollision(rectY, player.id)) {
        player.y = newY;
    } else {
        const bounceY = player.y - (Math.sign(dy) * RECOIL_DISTANCE);
        if (isPositionSafe(player.x, bounceY)) player.y = bounceY;
    }
}

function isPositionSafe(x, y) {
    if (x < 0 || x + PLAYER_SIZE > mapData.width) return false;
    if (y < 0 || y + PLAYER_SIZE > mapData.height) return false;

    const pRect = { x: x, y: y, w: PLAYER_SIZE, h: PLAYER_SIZE };
    for (const obs of mapData.obstacles) {
        if (checkCollision(pRect, obs)) return false;
    }
    return true;
}

function checkPlayerCollision(rect, selfId) {
    for (const [otherId, otherPlayer] of players) {
        if (otherId === selfId) continue;
        // Collision check against visual position of enemies
        const otherRect = { x: otherPlayer.x, y: otherPlayer.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
        if (checkCollision(rect, otherRect)) return true;
    }
    return false;
}

function checkCollision(r1, r2) {
    return (r1.x < r2.x + r2.w && r1.x + r1.w > r2.x &&
            r1.y < r2.y + r2.h && r1.y + r1.h > r2.y);
}

// --- RENDER & GAME LOOP ---

function renderLoop(timestamp) {
    if (!isGameRunning) return;

    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Obstacles
    ctx.fillStyle = '#34495e'; 
    mapData.obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = '#2c3e50'; 
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    });

    // Draw Coin
    if (currentCoin) {
        const cx = currentCoin.x + 7.5;
        const cy = currentCoin.y + 7.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#f1c40f';
        ctx.fill();
        ctx.strokeStyle = '#f39c12';
        ctx.stroke();
    }

    players.forEach(player => {
        if (player.id === myId) {
            // Apply Physics Prediction (Client-Side)
            applyPhysics(player, dt);
            
            // Note: We do NOT interpolate/smooth "My Player" here. 
            // We trust the physics engine above. 
            // The "handleServerMessage" function handles the snapping if we are wrong.
        } else {
            // Interpolate Enemies
            if (player.serverX !== undefined) {
                player.x += (player.serverX - player.x) * 0.2;
                player.y += (player.serverY - player.y) * 0.2;
            }
        }

        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
        
        if (player.id === myId) {
            ctx.strokeStyle = '#2c3e50'; 
            ctx.lineWidth = 3; 
            ctx.strokeRect(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE);
        }

        ctx.fillStyle = '#7f8c8d'; 
        ctx.fillRect(player.x, player.y - 15, PLAYER_SIZE, 6);
        const fillWidth = Math.min((player.score / 10) * PLAYER_SIZE, PLAYER_SIZE);
        ctx.fillStyle = '#2ecc71'; 
        ctx.fillRect(player.x, player.y - 15, fillWidth, 6);

        ctx.fillStyle = '#2c3e50'; 
        ctx.font = 'bold 12px Arial'; 
        ctx.textAlign = 'center'; 
        ctx.fillText(player.name, player.x + 15, player.y - 20);
    });

    requestAnimationFrame(renderLoop);
}

// --- Inputs ---

function handleKey(e) {
    if (e.repeat) return;
    const isDown = e.type === 'keydown';
    let changed = false;

    switch(e.key.toLowerCase()) {
        case 'w': if (inputs.w !== isDown) { inputs.w = isDown; changed = true; } break;
        case 'a': if (inputs.a !== isDown) { inputs.a = isDown; changed = true; } break;
        case 's': if (inputs.s !== isDown) { inputs.s = isDown; changed = true; } break;
        case 'd': if (inputs.d !== isDown) { inputs.d = isDown; changed = true; } break;
    }

    if (changed && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', inputs: inputs }));
    }
}

// --- Debug UI ---

function startPingLoop() {
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            pingStart = performance.now();
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 1000); 
}

function createDebugUI() {
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.top = '10px';
    div.style.right = '10px';
    div.style.background = 'rgba(0, 0, 0, 0.6)';
    div.style.padding = '8px 12px';
    div.style.color = 'white';
    div.style.fontFamily = 'monospace';
    div.style.fontSize = '14px';
    div.style.borderRadius = '5px';
    div.style.zIndex = '1000';
    div.style.pointerEvents = 'none'; 
    // Added Tick Display
    div.innerHTML = `
        <div>Ping: <span id="debug-ping" style="color: #2ecc71; font-weight: bold;">0</span> ms</div>
        <div style="font-size: 11px; color: #aaa;">Server Tick: <span id="debug-tick">0</span></div>
    `;
    document.body.appendChild(div);
}

function updateDebugUI(ping, tick) {
    const elPing = document.getElementById('debug-ping');
    const elTick = document.getElementById('debug-tick');
    
    if (elPing) {
        elPing.innerText = ping;
        if (ping < 100) elPing.style.color = '#2ecc71'; 
        else if (ping < 200) elPing.style.color = '#f1c40f'; 
        else elPing.style.color = '#e74c3c'; 
    }
    
    if (elTick && tick) {
        elTick.innerText = tick;
    }
}