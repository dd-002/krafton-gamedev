const SERVER_URL = 'ws://localhost:8080';

let ws;
let myId = null;
let canvas, ctx;
let isGameRunning = false;

// Ping State
let pingStart = 0; 
let currentLatency = 0; 

// Game Data
let mapData = { width: 800, height: 600, obstacles: [] };
const players = new Map(); 
let currentCoin = null;

// Inputs
const inputs = { w: false, a: false, s: false, d: false };

// physics constants
const SERVER_TICK_RATE = 30; 
const TICK_DURATION = 1000 / SERVER_TICK_RATE; 
const PLAYER_SPEED = 5; 
const LERP_FACTOR = 0.2; 
const PLAYER_SIZE = 30; 

// timing variable
let lastFrameTime = 0;
let tickAccumulator = 0;


document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-create').addEventListener('click', connectAndCreate);
    document.getElementById('btn-join').addEventListener('click', connectAndJoin);
});

// initialisation
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
        statusDiv.innerText = "Connected! Handshaking...";
        startPingLoop();
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data, mode, roomId);
    };

    ws.onclose = () => {
        if (isGameRunning) {
            alert("Disconnected from server.");
            location.reload();
        }
    };
}

function startPingLoop() {
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            pingStart = Date.now(); 
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 1000); 
}

function handleServerMessage(data, mode, targetRoomId) {
    switch (data.type) {
        case 'welcome':
            if (mode === 'create') {
                ws.send(JSON.stringify({ type: 'create_room' }));
            } else if (mode === 'join') {
                ws.send(JSON.stringify({ type: 'join_room', roomId: targetRoomId }));
            }
            break;

        case 'pong':
            const newLatency = Date.now() - pingStart;
            currentLatency = (currentLatency * 0.7) + (newLatency * 0.3);
            const pingEl = document.getElementById('ping-display');
            if (pingEl) pingEl.innerText = Math.round(currentLatency);
            break;

        case 'INIT':
            myId = data.selfId;
            mapData = data.map;
            currentCoin = data.coin;
            document.getElementById('room-display').innerText = data.roomId;
            
            players.clear();
            data.players.forEach(p => {
                // initialise coordinates
                p.serverX = p.x;
                p.serverY = p.y;
                p.drawX = p.x;
                p.drawY = p.y;
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
            // initialise visuals
            data.player.drawX = data.player.x;
            data.player.drawY = data.player.y;
            players.set(data.player.id, data.player);
            break;

        case 'PLAYER_LEFT':
            players.delete(data.id);
            break;

        case 'GAME_STATE':
            handleGameState(data);
            break;

        case 'GAME_OVER':
            handleGameOver(data);
            break;
            
        case 'error':
            document.getElementById('connection-status').innerText = data.message;
            break;
    }
    
    document.getElementById('player-count').innerText = players.size;
}

function handleGameState(data) {
    currentCoin = data.coin;

    data.players.forEach(p => {
        const localPlayer = players.get(p.id);
        if (localPlayer) {
            localPlayer.serverX = p.x;
            localPlayer.serverY = p.y;
            localPlayer.score = p.score;
        }
    });
}

function handleGameOver(data) {
    isGameRunning = false;
    document.getElementById('game-over-screen').style.display = 'block';
    document.getElementById('game-info').style.display = 'none';
    document.getElementById('winner-name').innerText = `${data.winnerName} Wins!`;
}

// input handler
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
        ws.send(JSON.stringify({
            type: 'input',
            inputs: inputs
        }));
    }
}

// lerp func
function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

function checkCollision(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.w &&
        rect1.x + rect1.w > rect2.x &&
        rect1.y < rect2.y + rect2.h &&
        rect1.y + rect1.h > rect2.y
    );
}

function isPositionSafe(x, y) {
    // Boundary Check
    if (x < 0 || x + PLAYER_SIZE > mapData.width) return false;
    if (y < 0 || y + PLAYER_SIZE > mapData.height) return false;

    // Obstacle Check
    const playerRect = { x: x, y: y, w: PLAYER_SIZE, h: PLAYER_SIZE };
    for (const obs of mapData.obstacles) {
        if (checkCollision(playerRect, obs)) {
            return false;
        }
    }
    return true;
}

// renderer
function renderLoop(timestamp) {
    if (!isGameRunning) return;

    const dt = timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    tickAccumulator += dt;

    // physics loop
    // While we have enough accumulated time for a tick, run the physics
    while (tickAccumulator >= TICK_DURATION) {
        players.forEach(player => {
            if (player.id === myId) {
                // client prediction
                let dx = 0; let dy = 0;
                if (inputs.w) dy -= PLAYER_SPEED;
                if (inputs.s) dy += PLAYER_SPEED;
                if (inputs.a) dx -= PLAYER_SPEED;
                if (inputs.d) dx += PLAYER_SPEED;

                // Apply movement safely
                if (dx !== 0) {
                    const newX = player.x + dx;
                    if (isPositionSafe(newX, player.y)) player.x = newX;
                }
                if (dy !== 0) {
                    const newY = player.y + dy;
                    if (isPositionSafe(player.x, newY)) player.y = newY;
                }
            }
        });
        tickAccumulator -= TICK_DURATION;
    }

    // reconciliation

    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Obstacles
    ctx.fillStyle = '#34495e'; 
    mapData.obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = '#2c3e50'; 
        ctx.lineWidth = 2; 
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
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Players
    players.forEach(player => {
        if (player.id === myId) {
            // adaptive reconciliation
            const dist = Math.sqrt(
                Math.pow(player.x - player.serverX, 2) + 
                Math.pow(player.y - player.serverY, 2)
            );

            // dynamic tolerance
            const isMoving = inputs.w || inputs.a || inputs.s || inputs.d;
            let tolerance = 1;
            
            if (isMoving) {
                const msPerTick = 1000 / SERVER_TICK_RATE;
                const ticksBehind = currentLatency / msPerTick;
                const acceptableError = ticksBehind * PLAYER_SPEED;
                
                tolerance = Math.max(acceptableError * 3.0, 15);
            }

            const dynamicSnapThreshold = Math.max(50, tolerance * 2);

            if (dist > dynamicSnapThreshold) {
                // Hard Correction
                player.x = player.serverX;
                player.y = player.serverY;
                // Also Snap Visuals
                player.drawX = player.x;
                player.drawY = player.y;
            } else if (dist > tolerance) {
                // Soft Correction 
                player.x = lerp(player.x, player.serverX, 0.05); 
                player.y = lerp(player.y, player.serverY, 0.05);
            }

        } else {
            // sync physics to server
            if (player.serverX !== undefined) {
                player.x = lerp(player.x, player.serverX, 0.2);
                player.y = lerp(player.y, player.serverY, 0.2);
            }
        }

        // visual interpolation
        
        if (player.drawX === undefined) { player.drawX = player.x; player.drawY = player.y; }

        // Interpolate Visuals
        const VISUAL_SMOOTHING = 0.3; // 30% per frame
        player.drawX = lerp(player.drawX, player.x, VISUAL_SMOOTHING);
        player.drawY = lerp(player.drawY, player.y, VISUAL_SMOOTHING);

        ctx.fillStyle = player.color;
        ctx.fillRect(player.drawX, player.drawY, 30, 30); 
        
        if (player.id === myId) {
            ctx.strokeStyle = '#2c3e50'; 
            ctx.lineWidth = 3; 
            ctx.strokeRect(player.drawX, player.drawY, 30, 30);
        }

        ctx.fillStyle = '#7f8c8d'; 
        ctx.fillRect(player.drawX, player.drawY - 15, 30, 6);
        const fillWidth = Math.min((player.score / 10) * 30, 30);
        ctx.fillStyle = '#2ecc71'; 
        ctx.fillRect(player.drawX, player.drawY - 15, fillWidth, 6);

        ctx.fillStyle = '#2c3e50'; 
        ctx.font = 'bold 12px Arial'; 
        ctx.textAlign = 'center'; 
        ctx.fillText(player.name, player.drawX + 15, player.drawY - 20);
    });

    requestAnimationFrame(renderLoop);
}