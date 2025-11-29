class MapGenerator {
    constructor() {
        this.width = 800;
        this.height = 600;
        this.colors = ['#e74c3c', '#8e44ad', '#3498db', '#e67e22', '#2ecc71', '#95a5a6'];
        
        // Settings
        this.playerSize = 30;
        this.minGap = this.playerSize * 1.5; // Gap must be 1.5x larger than player to be safe
    }

    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Checks if two rectangle
    doRectsOverlap(r1, r2, padding = 0) {
        return !(
            r1.x + r1.w + padding < r2.x ||
            r1.x > r2.x + r2.w + padding ||
            r1.y + r1.h + padding < r2.y ||
            r1.y > r2.y + r2.h + padding
        );
    }

    generateObstacles(count) {
        const obstacles = [];
        let attempts = 0;
        // limits number of attemps to create obstacles
        const maxAttempts = count * 50; 

        while (obstacles.length < count && attempts < maxAttempts) {
            attempts++;
            
            const w = this.getRandomInt(40, 150);
            const h = this.getRandomInt(40, 150);
            const x = this.getRandomInt(10, this.width - w - 10);
            const y = this.getRandomInt(10, this.height - h - 10);
            
            const newObstacle = { x, y, w, h, color: this.colors[this.getRandomInt(0, 5)] };

            // checks collisons with walls and makes sure minGap exists
            if (x < this.minGap || x + w > this.width - this.minGap || 
                y < this.minGap || y + h > this.height - this.minGap) {
                continue; 
            }

            // check Collision with other Obstacles
            let validPosition = true;
            for (let other of obstacles) {
                if (this.doRectsOverlap(newObstacle, other, this.minGap)) {
                    validPosition = false;
                    break;
                }
            }

            if (validPosition) {
                obstacles.push(newObstacle);
            }
        }
        
        return obstacles;
    }

    isPositionSafe(x, y, obstacles) {
        // Boundary Check
        if (x < 0 || x + this.playerSize > this.width) return false;
        if (y < 0 || y + this.playerSize > this.height) return false;
        const playerRect = { x: x, y: y, w: this.playerSize, h: this.playerSize };        
        for (let obs of obstacles) {
            if (this.doRectsOverlap(playerRect, obs)) {
                return false; 
            }
        }
        return true;
    }

    isFarFromOthers(x, y, existingPoints) {
        const minDistance = 50; 
        for (let p of existingPoints) {
            const dist = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2));
            if (dist < minDistance) return false;
        }
        return true;
    }

    //generator function
    generate(numPositions = 10) {
        const numObstacles = this.getRandomInt(8, 12); 
        const obstacles = this.generateObstacles(numObstacles);

        const startPositions = [];
        let attempts = 0;
        while (startPositions.length < numPositions && attempts < 2000) {
            const x = this.getRandomInt(20, this.width - 50);
            const y = this.getRandomInt(20, this.height - 50);

            if (this.isPositionSafe(x, y, obstacles) && this.isFarFromOthers(x, y, startPositions)) {
                startPositions.push({ x, y });
            }
            attempts++;
        }

        while (startPositions.length < numPositions) {
            startPositions.push({ x: 50, y: 50 });
        }

        return {
            width: this.width,
            height: this.height,
            obstacles: obstacles,
            startPositions: startPositions,
        };
    }
}

module.exports = new MapGenerator();