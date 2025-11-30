const SERVER_URL = 'ws://localhost:8080';

// state variables
let ws;
let myId = null;
let canvas, ctx;
let isGameRunning = false;

// dame data
let mapData = { width: 800, height: 600, obstacles: [] };
const players = new Map(); 
let currentCoin = null;

const inputs = { w: false, a: false, s: false, d: false };

// physics constant same as server
const PLAYER_SPEED = 5; 
const LERP_FACTOR = 0.1; 
const ERROR_THRESHOLD = 50; 

document.addEventListener('DOMContentLoaded', () => {
    // Attach button listeners after DOM loads
    document.getElementById('btn-create').addEventListener('click', connectAndCreate);
    document.getElementById('btn-join').addEventListener('click', connectAndJoin);
});

// initialisation of canvas
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

// creating a room
function connectAndCreate() {
    const name = document.getElementById('username').value || 'Anon';
    connect(name, 'create');
}


// joining a room
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

// message routing
function handleServerMessage(data, mode, targetRoomId) {
    switch (data.type) {
        case 'welcome':
            if (mode === 'create') {
                ws.send(JSON.stringify({ type: 'create_room' }));
            } else if (mode === 'join') {
                ws.send(JSON.stringify({ type: 'join_room', roomId: targetRoomId }));
            }
            break;

        case 'INIT':
            // game init
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
            
            // switches ui
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
            // updates from server
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

// lerp util func
function lerp(start, end, factor) {
    return start + (end - start) * factor;
}

// render loop
function renderLoop() {
    if (!isGameRunning) return;

    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw obstacles
    ctx.fillStyle = '#34495e'; 
    mapData.obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = '#2c3e50'; 
        ctx.lineWidth = 2; 
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    });

    // draws coin
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

    // draw players
    players.forEach(player => {
        
        
        if (player.id === myId) {
            // client prediction
            if (inputs.w) player.y -= PLAYER_SPEED;
            if (inputs.s) player.y += PLAYER_SPEED;
            if (inputs.a) player.x -= PLAYER_SPEED;
            if (inputs.d) player.x += PLAYER_SPEED;

            // Server Reconciliation
            const dist = Math.sqrt(
                Math.pow(player.x - player.serverX, 2) + 
                Math.pow(player.y - player.serverY, 2)
            );

            if (dist > ERROR_THRESHOLD) {
                // wall hit on server
                player.x = player.serverX;
                player.y = player.serverY;
            } else if (dist > 1) {
                // drift correction
                player.x = lerp(player.x, player.serverX, LERP_FACTOR);
                player.y = lerp(player.y, player.serverY, LERP_FACTOR);
            }
        } else {
            // lerp interpolation to server position
            if (player.serverX !== undefined) {
                player.x = lerp(player.x, player.serverX, 0.2);
                player.y = lerp(player.y, player.serverY, 0.2);
            }
        }

        // draws player
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, 30, 30); 
        
        if (player.id === myId) {
            ctx.strokeStyle = '#2c3e50'; 
            ctx.lineWidth = 3; 
            ctx.strokeRect(player.x, player.y, 30, 30);
        }

        // score bar
        ctx.fillStyle = '#7f8c8d'; 
        ctx.fillRect(player.x, player.y - 15, 30, 6);
        
        const fillWidth = Math.min((player.score / 10) * 30, 30);
        ctx.fillStyle = '#2ecc71'; 
        ctx.fillRect(player.x, player.y - 15, fillWidth, 6);

        // name
        ctx.fillStyle = '#2c3e50'; 
        ctx.font = 'bold 12px Arial'; 
        ctx.textAlign = 'center'; 
        ctx.fillText(player.name, player.x + 15, player.y - 20);
    });

    requestAnimationFrame(renderLoop);
}