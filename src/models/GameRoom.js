const mapGenerator = require('./MapGenerator');

/**
 * The game room file, when we create a room the constructor gets initialised and 
 * and the game loop starts updating 30 times a second
 * NOTE: All collisions used were Axis aligned bounding box
 */

class GameRoom {
    constructor(roomId, redisClient) {
        this.roomId = roomId;
        this.redisClient = redisClient; 
        this.players = new Map(); 
        this.maxPlayers = 10;
        
        this.tickRate = 30;  //number of times game updates per second
        this.playerSpeed = 5; //pixels per tick
        this.recoilDistance = 25; 
        this.playerSize = 30; // size config
        
        this.winningScore = 10;
        this.coin = null; 
        this.isGameActive = true; 
        
        this.mapData = mapGenerator.generate(this.maxPlayers);
        this.availableSpawns = [...this.mapData.startPositions];

        console.log(`[Room ${roomId}] Created with ${this.mapData.obstacles.length} walls.`);
        
        this.syncRoomStateToRedis();
        this.spawnCoin();

        //the game loop
        this.gameLoopInterval = setInterval(() => {
            this.update();
        }, 1000 / this.tickRate);
    }

    // spawn a coin in a random safe spot
    spawnCoin() {
        if (!this.isGameActive) return;

        let valid = false;
        let x, y;
        let attempts = 0;

        while (!valid && attempts < 50) {
            x = Math.floor(Math.random() * (this.mapData.width - 40)) + 20;
            y = Math.floor(Math.random() * (this.mapData.height - 40)) + 20;
            
            const coinRect = { x: x, y: y, w: 15, h: 15 };
            let collisionFound = false;
            
            // Check Walls
            for (const obs of this.mapData.obstacles) {
                if (this.checkCollision(coinRect, obs)) {
                    collisionFound = true;
                    break;
                }
            }

            if (!collisionFound) valid = true;
            attempts++;
        }

        if (valid) {
            this.coin = { x, y, id: Math.random() }; 
            // We don't log every spawn to keep console clean
        }
    }

    //TODO:apply acceleration and better collision logic
    update() {
        if (this.players.size === 0 || !this.isGameActive) return;

        const stateSnapshot = []; // snapshot of the particular tick
        let hasMovement = false; // logic changed slightly to handle coins, but keeping variable logic similar

        this.players.forEach(player => {
            const { inputs } = player;
            let dx = 0;
            let dy = 0;

            // intended movement
            if (inputs.w) dy -= this.playerSpeed;
            if (inputs.s) dy += this.playerSpeed;
            if (inputs.a) dx -= this.playerSpeed;
            if (inputs.d) dx += this.playerSpeed;

            // if keys were pressed
            if (dx !== 0 || dy !== 0) {
                
                /**
                 * We check x and y sepaaretely because there might be a case
                 * when we are on the edge of the wall, and our movement is restricted
                 * along x that would make our movement restricted along y as well 
                 */

                // x axis calculations
                const newX = player.x + dx;
                
                // Check both Map Boundaries/Walls AND Other Players
                const potentialRectX = { x: newX, y: player.y, w: this.playerSize, h: this.playerSize };
                const isWallSafeX = this.isValidPosition(newX, player.y);
                const isPlayerSafeX = !this.checkPlayerCollision(potentialRectX, player.id);

                if (isWallSafeX && isPlayerSafeX) {
                    player.x = newX;
                } else {
                    // collision logic ABAB technique
                    const bounceX = player.x - (Math.sign(dx) * this.recoilDistance);
                    
                    // Verify bounce spot is safe from walls (we ignore players for bounce to prevent getting stuck)
                    if (this.isValidPosition(bounceX, player.y)) {
                        player.x = bounceX;
                    }
                }

                // y axis
                const newY = player.y + dy;
                
                const potentialRectY = { x: player.x, y: newY, w: this.playerSize, h: this.playerSize };
                const isWallSafeY = this.isValidPosition(player.x, newY);
                const isPlayerSafeY = !this.checkPlayerCollision(potentialRectY, player.id);

                if (isWallSafeY && isPlayerSafeY) {
                    player.y = newY;
                } else {
                    // collision logic ABAB technique
                    const bounceY = player.y - (Math.sign(dy) * this.recoilDistance);
                    if (this.isValidPosition(player.x, bounceY)) {
                        player.y = bounceY;
                    }
                }
                hasMovement = true;
            }

            // coin logic
            if (this.coin) {
                const playerRect = { x: player.x, y: player.y, w: this.playerSize, h: this.playerSize };
                const coinRect = { x: this.coin.x, y: this.coin.y, w: 15, h: 15 };

                if (this.checkCollision(playerRect, coinRect)) {
                    player.score += 1;
                    this.coin = null; 
                    hasMovement = true; // ensure update is sent

                    if (player.score >= this.winningScore) {
                        this.handleWin(player);
                    } else {
                        setTimeout(() => this.spawnCoin(), 2000);
                    }
                }
            }

            // send only required information
            stateSnapshot.push({
                id: player.id,
                x: Math.round(player.x),
                y: Math.round(player.y),
                score: player.score
            });
        });

        if (hasMovement) {
            this.broadcast({
                type: 'GAME_STATE',
                players: stateSnapshot,
                coin: this.coin 
            });
        }
    }

    // checks if two players are colliding or not
    checkPlayerCollision(rect, selfId) {
        for (const [otherId, otherPlayer] of this.players) {
            if (otherId === selfId) continue; // Don't collide with yourself

            const otherRect = { 
                x: otherPlayer.x, 
                y: otherPlayer.y, 
                w: this.playerSize, 
                h: this.playerSize 
            };

            if (this.checkCollision(rect, otherRect)) {
                return true; // collision detected
            }
        }
        return false;
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

    isValidPosition(x, y) {
        if (x < 0 || x + this.playerSize > this.mapData.width) return false; 
        if (y < 0 || y + this.playerSize > this.mapData.height) return false;

        // collision check, AABB technique
        const playerRect = { x: x, y: y, w: this.playerSize, h: this.playerSize };
        
        for (const obs of this.mapData.obstacles) {
            if (this.checkCollision(playerRect, obs)) {
                return false;
            }
        }
        return true;
    }

    // collision check, AABB technique
    checkCollision(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.w &&
            rect1.x + rect1.w > rect2.x &&
            rect1.y < rect2.y + rect2.h &&
            rect1.y + rect1.h > rect2.y
        );
    }

    handleInput(playerId, inputs) {
        const p = this.players.get(playerId);
        if (p) {
            p.inputs = { ...p.inputs, ...inputs };
        }
    }


    // standard management methods

    //syncs updates to redis or any other database
    async syncRoomStateToRedis() {
        await this.redisClient.hSet(`room:${this.roomId}`, {
            playerCount: this.players.size,
            maxPlayers: this.maxPlayers,
            status: this.players.size >= this.maxPlayers ? 'full' : 'open'
        });
    }


    //runs when player joins a room
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

        //send the new player positions and info of all players including him
        ws.send(JSON.stringify({
            type: 'INIT',
            selfId: playerId,
            roomId:this.roomId,
            map: { 
                width: this.mapData.width, 
                height: this.mapData.height, 
                obstacles: this.mapData.obstacles 
            },
            players: sanePlayers,
            coin: this.coin 
        }));

        //send the rest of the group information about new player and details
        this.broadcast({ 
            type: 'NEW_PLAYER', 
            player: this.sanitizePlayer(newPlayer) 
        }, playerId);

        return true;
    }
    


    //runs when a player moves out of a room
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
        const { ws, inputs, ...cleanPlayer } = p; //destructuring of the player object
        return cleanPlayer;
    }

    broadcast(data, excludePlayerId = null) {
        const payload = JSON.stringify(data);
        for (const [pid, player] of this.players) {
            if (pid !== excludePlayerId && player.ws.readyState === 1) {
                player.ws.send(payload);
            }
        }
    }
}

module.exports = GameRoom;