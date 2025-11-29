const { activeGameRooms } = require('../../managers/roomManager');

const handleGameMessage = (ws, wss, redisClient, data) => {
    
    if (!ws.roomID) return; 

    const gameRoom = activeGameRooms.get(ws.roomID);

    if (gameRoom) {
        
        if (data.type === 'input') {
            console.log(data);
            gameRoom.handleInput(ws.clientID, data.inputs);
        }
        
    }
};

module.exports = { handleGameMessage };