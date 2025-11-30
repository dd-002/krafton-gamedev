const mapGenerator = require('./MapGenerator');
const PhysicsEngine = require('../engines/PhysicsEngine');


//Manages all game related activites

class GameRoom {
    constructor(roomId, redisClient) {
        this.roomId = roomId;
        this.redisClient = redisClient; 
        this.players = new Map(); 
        this.maxPlayers = 10;
        
        // Configuration
        this.tickRate = 30; 
        this.winningScore = 10;
        this.coin = null; 
        this.isGameActive = true; 
        
        // Generate Map
        this.mapData = mapGenerator.generate(this.maxPlayers);
        this.availableSpawns = [...this.mapData.startPositions];

        // Initialize Physics Engine
        this.physics = new PhysicsEngine(this.mapData);

        console.log(`[Room ${roomId}] Created with ${this.mapData.obstacles.length} walls.`);
        
        this.syncRoomStateToRedis();
        this.spawnCoin();

        // Start Game Loop
        this.gameLoopInterval = setInterval(() => {
            this.update();
        }, 1000 / this.tickRate);
    }

    /**
     * main game loop, delegates physics tasks to engine and handles game events, broadcaasts results
     */
    update() {
        if (this.players.size === 0 || !this.isGameActive) return;

        // Delegate Physics Logic
        const result = this.physics.update(this.players, this.coin);
        
        // Handle Logic Events returned by Physics
        if (result.coinEatenBy) {
            this.handleCoinEaten(result.coinEatenBy);
        }

        // Broadcast if anything happened
        if (result.hasChanges || result.coinEatenBy) {
            this.broadcast({
                type: 'GAME_STATE',
                players: result.snapshot,
                coin: this.coin 
            });
        }
    }

    handleCoinEaten(player) {
        player.score += 1;
        this.coin = null; 
        
        console.log(`[Room ${this.roomId}] Coin eaten by ${player.name} (Score: ${player.score})`);

        if (player.score >= this.winningScore) {
            this.handleWin(player);
        } else {
            // Respawn after 2 seconds
            setTimeout(() => this.spawnCoin(), 2000);
        }
    }

    spawnCoin() {
        if (!this.isGameActive) return;

        let valid = false;
        let x, y;
        let attempts = 0;

        while (!valid && attempts < 50) {
            x = Math.floor(Math.random() * (this.mapData.width - 40)) + 20;
            y = Math.floor(Math.random() * (this.mapData.height - 40)) + 20;
            
            const coinRect = { x: x, y: y, w: 15, h: 15 };
            
            // We use the Physics Engine to check if this random spot is valid
            let collisionFound = false;
            for (const obs of this.mapData.obstacles) {
                if (this.physics.checkCollision(coinRect, obs)) {
                    collisionFound = true;
                    break;
                }
            }

            if (!collisionFound) valid = true;
            attempts++;
        }

        if (valid) {
            this.coin = { x, y, id: Math.random() }; 
        }
    }

    handleWin(winner) {
        this.isGameActive = false;
        clearInterval(this.gameLoopInterval);
        
        console.log(`[Room ${this.roomId}] Game Over. Winner: ${winner.name}`);

        this.broadcast({
            type: 'GAME_OVER',
            winnerId: winner.id,
            winnerName: winner.name,
            message: `Game Over! ${winner.name} wins!`
        });
    }

    handleInput(playerId, inputs) {
        const p = this.players.get(playerId);
        if (p) {
            p.inputs = { ...p.inputs, ...inputs };
        }
    }

    // networking and management

    async syncRoomStateToRedis() {
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
            score: 0, 
            color: playerColor,
            originalSpawn: spawnPoint,
            ws: ws,
            inputs: { w: false, a: false, s: false, d: false }
        };

        this.players.set(playerId, newPlayer);
        
        await this.redisClient.sAdd(`room:${this.roomId}:players`, playerId);
        await this.syncRoomStateToRedis();

        const sanePlayers = Array.from(this.players.values()).map(p => this.sanitizePlayer(p));

        ws.send(JSON.stringify({
            type: 'INIT',
            selfId: playerId,
            roomId: this.roomId,
            map: { 
                width: this.mapData.width, 
                height: this.mapData.height, 
                obstacles: this.mapData.obstacles 
            },
            players: sanePlayers,
            coin: this.coin 
        }));

        this.broadcast({ 
            type: 'NEW_PLAYER', 
            player: this.sanitizePlayer(newPlayer) 
        }, playerId);

        return true;
    }

    async removePlayer(playerId) {
        if (this.players.has(playerId)) {
            const p = this.players.get(playerId);
            if (p.originalSpawn) this.availableSpawns.push(p.originalSpawn);
            
            this.players.delete(playerId);
            
            await this.redisClient.sRem(`room:${this.roomId}:players`, playerId);
            await this.syncRoomStateToRedis();

            this.broadcast({ type: 'PLAYER_LEFT', id: playerId });

            if (this.players.size === 0) {
                clearInterval(this.gameLoopInterval);
            }
        }
    }

    sanitizePlayer(p) {
        const { ws, inputs, ...cleanPlayer } = p;
        return cleanPlayer;
    }

    //broadcast(data, excludePlayerId = null) {
    //    const payload = JSON.stringify(data);
    //    for (const [pid, player] of this.players) {
    //        if (pid !== excludePlayerId && player.ws.readyState === 1) {
    //            player.ws.send(payload);
    //        }
    //    }
    //}
    
    // artificial lag to broadcast
    broadcast(data, excludePlayerId = null) {
        const payload = JSON.stringify(data);
        
        // We use setTimeout to artificially delay the packets
        setTimeout(() => {
            for (const [pid, player] of this.players) {
                if (pid !== excludePlayerId && player.ws.readyState === 1) {
                    player.ws.send(payload);
                }
            }
        }, 200); // 200 ms lag
    }
}

module.exports = GameRoom;