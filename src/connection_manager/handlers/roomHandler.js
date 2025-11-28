const crypto = require('crypto');
const GameRoom = require('../../models/GameRoom'); 
const { activeGameRooms } = require('../../managers/roomManager'); 

const handleRoomMessage = async (ws, wss, redisClient, data) => {
    

    if (data.type === 'create_room') {
        const roomId = crypto.randomUUID().substring(0, 6).toUpperCase();

 
        const newGameRoom = new GameRoom(roomId, redisClient);
        

        activeGameRooms.set(roomId, newGameRoom);


        await newGameRoom.addPlayer(ws, { 
            clientID: ws.clientID, 
            clientName: ws.clientName 
        });


        ws.roomID = roomId;
        await redisClient.hSet(`user:${ws.clientID}`, { joinedRoom: roomId });
    }


    else if (data.type === 'join_room') {
        const targetRoomId = data.roomId;
        

        const gameRoom = activeGameRooms.get(targetRoomId);

        if (!gameRoom) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found or game ended' }));
            return;
        }


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