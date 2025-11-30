class PhysicsEngine {
    constructor(mapData) {
        this.mapData = mapData;
        
        // Physics Constants
        this.playerSpeed = 5; 
        this.recoilDistance = 25; 
        this.playerSize = 30; 
        this.coinSize = 15;
    }

    /**
     * returns an object with the results of the frame calculation
     */
    update(players, coin) {
        const stateSnapshot = [];
        let hasChanges = false;
        let coinEatenBy = null;

        players.forEach(player => {
            const { inputs } = player;
            let dx = 0;
            let dy = 0;

            // 1. Calculate Intent
            if (inputs.w) dy -= this.playerSpeed;
            if (inputs.s) dy += this.playerSpeed;
            if (inputs.a) dx -= this.playerSpeed;
            if (inputs.d) dx += this.playerSpeed;

            // 2. Process Movement (if any)
            if (dx !== 0 || dy !== 0) {
                this.applyMovement(player, dx, dy, players);
                hasChanges = true;
            }

            if (coin) {
                const playerRect = { x: player.x, y: player.y, w: this.playerSize, h: this.playerSize };
                const coinRect = { x: coin.x, y: coin.y, w: this.coinSize, h: this.coinSize };

                if (this.checkCollision(playerRect, coinRect)) {
                    coinEatenBy = player;
                    hasChanges = true; 
                }
            }

            stateSnapshot.push({
                id: player.id,
                x: Math.round(player.x),
                y: Math.round(player.y),
                score: player.score
            });
        });

        return {
            snapshot: stateSnapshot,
            hasChanges: hasChanges,
            coinEatenBy: coinEatenBy
        };
    }

    applyMovement(player, dx, dy, allPlayers) {
        // X-Axis
        const newX = player.x + dx;
        const potentialRectX = { x: newX, y: player.y, w: this.playerSize, h: this.playerSize };
        
        if (this.isValidPosition(newX, player.y) && !this.checkPlayerCollision(potentialRectX, player.id, allPlayers)) {
            player.x = newX;
        } else {
            // Recoil X
            const bounceX = player.x - (Math.sign(dx) * this.recoilDistance);
            if (this.isValidPosition(bounceX, player.y)) {
                player.x = bounceX;
            }
        }

        // Y-Axis
        const newY = player.y + dy;
        const potentialRectY = { x: player.x, y: newY, w: this.playerSize, h: this.playerSize };

        if (this.isValidPosition(player.x, newY) && !this.checkPlayerCollision(potentialRectY, player.id, allPlayers)) {
            player.y = newY;
        } else {
            // Recoil Y
            const bounceY = player.y - (Math.sign(dy) * this.recoilDistance);
            if (this.isValidPosition(player.x, bounceY)) {
                player.y = bounceY;
            }
        }
    }

    checkPlayerCollision(rect, selfId, allPlayers) {
        for (const [otherId, otherPlayer] of allPlayers) {
            if (otherId === selfId) continue; 

            const otherRect = { 
                x: otherPlayer.x, 
                y: otherPlayer.y, 
                w: this.playerSize, 
                h: this.playerSize 
            };

            if (this.checkCollision(rect, otherRect)) {
                return true; 
            }
        }
        return false;
    }

    isValidPosition(x, y) {
        // Boundary Check
        if (x < 0 || x + this.playerSize > this.mapData.width) return false; 
        if (y < 0 || y + this.playerSize > this.mapData.height) return false;

        // Wall Check
        const playerRect = { x: x, y: y, w: this.playerSize, h: this.playerSize };
        for (const obs of this.mapData.obstacles) {
            if (this.checkCollision(playerRect, obs)) {
                return false;
            }
        }
        return true;
    }

    checkCollision(rect1, rect2) {
        return (
            rect1.x < rect2.x + rect2.w &&
            rect1.x + rect1.w > rect2.x &&
            rect1.y < rect2.y + rect2.h &&
            rect1.y + rect1.h > rect2.y
        );
    }
}

module.exports = PhysicsEngine;