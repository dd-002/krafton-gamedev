const { activeGameRooms } = require('../../managers/roomManager');

const handleGameMessage = (ws, wss, redisClient, data) => {
    
    if (!ws.roomID) return; 

    
    const gameRoom = activeGameRooms.get(ws.roomID);

    if (gameRoom) {
        
        if (data.type === 'move') {
            // Pass the logic to the class
            gameRoom.handleMove(ws.clientID, { x: data.x, y: data.y });
        }
        
        // other actions
        
    }
};

module.exports = { handleGameMessage };