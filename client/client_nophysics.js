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

// Visual Constants
const PLAYER_SIZE = 30; 

// Network Diganosticss
let pingStart = 0;
let currentPing = 0;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-create').addEventListener('click', connectAndCreate);
    document.getElementById('btn-join').addEventListener('click', connectAndJoin);
    
    // Create the pure monitoring UI
    createDebugUI();
});

function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = mapData.width;
    canvas.height = mapData.height;
    
    isGameRunning = true;
    requestAnimationFrame(renderLoop);
    
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
}

// networking

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
        // Start the Ping Loop 
        startPingLoop();
    };

    ws.onmessage = (event) => { handleServerMessage(JSON.parse(event.data), mode, roomId); };
    ws.onclose = () => { 
        if (isGameRunning) { 
            alert("Disconnected."); 
            location.reload(); 
        } 
    };
}

function handleServerMessage(data, mode, targetRoomId) {
    switch (data.type) {
        case 'welcome':
            if (mode === 'create') ws.send(JSON.stringify({ type: 'create_room' }));
            else if (mode === 'join') ws.send(JSON.stringify({ type: 'join_room', roomId: targetRoomId }));
            break;
            
        // ping measurement
        case 'pong':
            const now = performance.now();
            // Calculate Round Trip Time
            const latency = Math.round(now - pingStart);
            
            // Smooth the value 
            currentPing = Math.round((currentPing * 0.8) + (latency * 0.2));
            
            updateDebugUI(currentPing);
            break;

        case 'INIT':
            myId = data.selfId;
            mapData = data.map;
            currentCoin = data.coin;
            document.getElementById('room-display').innerText = data.roomId;
            
            players.clear();
            data.players.forEach(p => {
                p.targetX = p.x; 
                p.targetY = p.y;
                players.set(p.id, p);
            });
            
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('gameCanvas').style.display = 'block';
            document.getElementById('game-info').style.display = 'block';
            
            initCanvas();
            break;

        case 'NEW_PLAYER':
            data.player.targetX = data.player.x;
            data.player.targetY = data.player.y;
            players.set(data.player.id, data.player);
            break;

        case 'PLAYER_LEFT':
            players.delete(data.id);
            break;

        case 'GAME_STATE':
            currentCoin = data.coin;
            data.players.forEach(p => {
                const localPlayer = players.get(p.id);
                if (localPlayer) {
                    localPlayer.targetX = p.x;
                    localPlayer.targetY = p.y;
                    localPlayer.score = p.score;
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


function startPingLoop() {
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            pingStart = performance.now();
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 1000); // Check ping every 1 second
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
    div.style.pointerEvents = 'none'; // Make sure clicks pass through to the game

    // Simple display only
    div.innerHTML = `Ping: <span id="debug-ping" style="color: #2ecc71; font-weight: bold;">0</span> ms`;

    document.body.appendChild(div);
}

function updateDebugUI(ping) {
    const el = document.getElementById('debug-ping');
    if (el) {
        el.innerText = ping;
        if (ping < 100) el.style.color = '#2ecc71'; 
        else if (ping < 200) el.style.color = '#f1c40f'; 
        else el.style.color = '#e74c3c'; 
    }
}

// --- Input (Send Only) ---

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

// Render Logic with no client side physics

function renderLoop() {
    if (!isGameRunning) return;

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
        // SMOOTH INTERPOLATION
        // We chase the server's target coordinates
        if (player.targetX !== undefined) {
            player.x += (player.targetX - player.x) * 0.2;
            player.y += (player.targetY - player.y) * 0.2;
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