const crypto = require('crypto');
const GameRoom = require('../classes/GameRoom'); // Import your class
const { activeGameRooms } = require('../managers/roomManager'); // Import the Map

const handleRoomMessage = async (ws, wss, redisClient, data) => {
    
    // --- CREATE ROOM ---
    if (data.type === 'create_room') {
        const roomId = crypto.randomUUID().substring(0, 6).toUpperCase();

        // 1. Instantiate the Game Logic Class
        const newGameRoom = new GameRoom(roomId, redisClient);
        
        // 2. Store it in memory
        activeGameRooms.set(roomId, newGameRoom);

        // 3. Add the creator to the game
        await newGameRoom.addPlayer(ws, { 
            clientID: ws.clientID, 
            clientName: ws.clientName 
        });

        // 4. Update Client WS State
        ws.roomID = roomId;
        await redisClient.hSet(`user:${ws.clientID}`, { joinedRoom: roomId });
    }

    // --- JOIN ROOM ---
    else if (data.type === 'join_room') {
        const targetRoomId = data.roomId;
        
        // 1. Check if the Game Instance exists in memory
        const gameRoom = activeGameRooms.get(targetRoomId);

        if (!gameRoom) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found or game ended' }));
            return;
        }

        // 2. Add player to the existing instance
        const success = await gameRoom.addPlayer(ws, { 
            clientID: ws.clientID, 
            clientName: ws.clientName 
        });

        if (success) {
            ws.roomID = targetRoomId;
            await redisClient.hSet(`user:${ws.clientID}`, { joinedRoom: targetRoomId });
        }
    }
};

module.exports = { handleRoomMessage };