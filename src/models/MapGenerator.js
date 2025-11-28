class MapGenerator {
    constructor() {
        this.width = 800;
        this.height = 600;
        this.colors = ['#e74c3c', '#8e44ad', '#3498db', '#e67e22', '#2ecc71', '#95a5a6'];
    }

    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Check if a point is inside the map and not hitting obstacles
    isPositionSafe(x, y, obstacles) {
        const playerSize = 30;
        
        // Boundary Check
        if (x < 0 || x + playerSize > this.width) return false;
        if (y < 0 || y + playerSize > this.height) return false;

        // Obstacle Collision Check
        const playerRect = { x: x, y: y, w: playerSize, h: playerSize };
        for (let obs of obstacles) {
            if (
                playerRect.x < obs.x + obs.w &&
                playerRect.x + playerRect.w > obs.x &&
                playerRect.y < obs.y + obs.h &&
                playerRect.y + playerRect.h > obs.y
            ) {
                return false; 
            }
        }
        return true;
    }

    // Check if a new spawn point is too close to existing spawn points
    isFarFromOthers(x, y, existingPoints) {
        const minDistance = 50; // Pixels
        for (let p of existingPoints) {
            const dist = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2));
            if (dist < minDistance) return false;
        }
        return true;
    }

    // The Main Generator Function
    generate(numPositions = 10) {
        const obstacles = [];
        const startPositions = [];
        
        // 1. Generate Obstacles
        const numObstacles = this.getRandomInt(10, 20);
        for (let i = 0; i < numObstacles; i++) {
            const w = this.getRandomInt(40, 150);
            const h = this.getRandomInt(40, 150);
            const x = this.getRandomInt(0, this.width - w);
            const y = this.getRandomInt(0, this.height - h);
            obstacles.push({ x, y, w, h, color: this.colors[this.getRandomInt(0, 5)] });
        }

        // 2. Generate 'numPositions' safe spawn points
        let attempts = 0;
        while (startPositions.length < numPositions && attempts < 1000) {
            const x = this.getRandomInt(20, this.width - 50);
            const y = this.getRandomInt(20, this.height - 50);

            // Must be safe from walls AND far from other players
            if (this.isPositionSafe(x, y, obstacles) && this.isFarFromOthers(x, y, startPositions)) {
                startPositions.push({ x, y });
            }
            attempts++;
        }

        // Fallback: If we couldn't find enough spots, fill the rest with (50,50) to prevent errors
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