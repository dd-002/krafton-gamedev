const mapGenerator = require('./MapGenerator');

class GameRoom {
    constructor(roomId, redisClient) {
        this.roomId = roomId;
        this.redisClient = redisClient; 
        this.players = new Map(); // stores { id, x, y, color, ws }
        this.maxPlayers = 10;
        
        // Procedural Map Generation
        this.mapData = mapGenerator.generate(this.maxPlayers);
        this.availableSpawns = [...this.mapData.startPositions];

        console.log(`[Room ${roomId}] Created with ${this.mapData.obstacles.length} walls.`);
        
        // Sync initial state to Redis
        this.syncRoomStateToRedis();
    }

    async syncRoomStateToRedis() {
        // syncs room meta data only
        await this.redisClient.hSet(`room:${this.roomId}`, {
            playerCount: this.players.size,
            maxPlayers: this.maxPlayers,
            status: this.players.size >= this.maxPlayers ? 'full' : 'open'
        });
    }

    async addPlayer(ws, playerInfo) {
        if (this.players.size >= this.maxPlayers) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Room is full' }));
            return false;
        }

        const playerId = playerInfo.clientID;

        
        let spawnPoint = this.availableSpawns.length > 0 
            ? this.availableSpawns.shift() 
            : this.mapData.startPositions[0];

       
        const playerColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
        
        const newPlayer = {
            id: playerId,
            name: playerInfo.clientName,
            x: spawnPoint.x,
            y: spawnPoint.y,
            color: playerColor,
            originalSpawn: spawnPoint,
            ws: ws 
        };

        this.players.set(playerId, newPlayer);
        
        
        await this.redisClient.sAdd(`room:${this.roomId}:players`, playerId);
        await this.syncRoomStateToRedis();

        
        // sanePlayers are basically all players inside the room
        // we sanitize the players that is remove the ws object from them
        const sanePlayers = Array.from(this.players.values()).map(p => this.sanitizePlayer(p));

        //we send the new player details about the room as well as his selfid
        ws.send(JSON.stringify({
            type: 'INIT',
            selfId: playerId,
            map: { 
                width: this.mapData.width, 
                height: this.mapData.height, 
                obstacles: this.mapData.obstacles 
            },
            players: sanePlayers
        }));

        
        //we tell everone else in the room a ew player has joined
        this.broadcast({ 
            type: 'NEW_PLAYER', 
            player: this.sanitizePlayer(newPlayer) 
        }, playerId); // we dont sent it to the new player

        return true;
    }

    async removePlayer(playerId) {
        if (this.players.has(playerId)) {
            const p = this.players.get(playerId);
            
            // return the spawn position to the pool
            if (p.originalSpawn) this.availableSpawns.push(p.originalSpawn);
            
            this.players.delete(playerId);
            
            // clean from redis
            await this.redisClient.sRem(`room:${this.roomId}:players`, playerId);
            await this.syncRoomStateToRedis();

            this.broadcast({ type: 'PLAYER_LEFT', id: playerId });
            console.log(`[Room ${this.roomId}] Player ${playerId} left.`);
        }
    }


    //TODO:A lot
    handleMove(playerId, movementData) {
        const p = this.players.get(playerId);
        if (p) {
            
            // TODO: Collision Check
            p.x = movementData.x;
            p.y = movementData.y;

            // dont store in redis only store in memory
            // broadcast to everyone in the current room
            this.broadcast({ 
                type: 'PLAYER_MOVED', 
                id: playerId, 
                x: p.x, 
                y: p.y 
            }, playerId); // exclude sender, maybe changed
        }
    }

    // removes ws object 
    sanitizePlayer(p) {
        const { ws, ...cleanPlayer } = p;
        return cleanPlayer;
    }

    // broadcast to everyone in this room
    broadcast(data, excludePlayerId = null) {
        const payload = JSON.stringify(data);
        
        for (const [pid, player] of this.players) {
            if (pid !== excludePlayerId && player.ws.readyState === 1) { // 1 = OPEN
                player.ws.send(payload);
            }
        }
    }
}

module.exports = GameRoom;