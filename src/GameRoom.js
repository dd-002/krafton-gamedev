const mapGenerator = require('./mapGenerator');

class GameRoom {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map(); // Stores players in THIS room only
        this.maxPlayers = 10;
        
        // Each room gets its own unique procedural map!
        this.mapData = mapGenerator.generate(this.maxPlayers);
        this.availableSpawns = [...this.mapData.startPositions];

        console.log(`[Room ${roomId}] Created with ${this.mapData.obstacles.length} walls.`);
    }

    addPlayer(ws, playerId) {
        if (this.players.size >= this.maxPlayers) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Room is full' }));
            return false;
        }

        // 1. Get Spawn
        let spawnPoint = this.availableSpawns.length > 0 
            ? this.availableSpawns.shift() 
            : this.mapData.startPositions[0]; // Fallback

        // 2. Create Player State
        const playerColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
        const newPlayer = {
            id: playerId,
            x: spawnPoint.x,
            y: spawnPoint.y,
            color: playerColor,
            originalSpawn: spawnPoint
        };

        this.players.set(playerId, newPlayer);
        
        // 3. Send INIT to the new guy
        ws.send(JSON.stringify({
            type: 'INIT',
            selfId: playerId,
            map: { 
                width: this.mapData.width, 
                height: this.mapData.height, 
                obstacles: this.mapData.obstacles 
            },
            players: Array.from(this.players.values())
        }));

        // 4. Tell everyone else in this room
        this.broadcast({ type: 'NEW_PLAYER', player: newPlayer }, ws);

        return true;
    }

    removePlayer(playerId) {
        if (this.players.has(playerId)) {
            const p = this.players.get(playerId);
            // Return spawn to pool
            if (p.originalSpawn) this.availableSpawns.push(p.originalSpawn);
            
            this.players.delete(playerId);
            this.broadcast({ type: 'PLAYER_LEFT', id: playerId });
            console.log(`[Room ${this.roomId}] Player ${playerId} left.`);
        }
    }

    handleMove(playerId, x, y) {
        const p = this.players.get(playerId);
        if (p) {
            p.x = x;
            p.y = y;
            // Broadcast only to people in THIS room
            this.broadcast({ type: 'PLAYER_MOVED', id: playerId, x, y });
        }
    }

    broadcast(data, excludeWs = null) {
        this.players.forEach((player) => {
             // We need access to the WS object. 
             // In a complex app, we'd store WS in the player object.
             // For now, we rely on the SocketManager to route, 
             // OR we store ws in the player struct (see update below).
        });
    }
}

module.exports = GameRoom;