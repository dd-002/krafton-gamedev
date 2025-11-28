//Handles room joining and creation logic

const crypto = require('crypto');
const { broadcastToRoom } = require('../utils/broadcast');

const handleRoomMessage = async (ws, wss, redisClient, data) => {
    
    // creates room
    if (data.type === 'create_room') {
        const roomId = crypto.randomUUID().substring(0, 6).toUpperCase();

        await redisClient.hSet(`room:${roomId}`, {
            createdBy: ws.clientID,
            status: 'waiting',
            createdAt: Date.now()
        });
        await redisClient.sAdd(`room:${roomId}:players`, ws.clientID);
        await redisClient.hSet(`user:${ws.clientID}`, { joinedRoom: roomId });

        ws.roomID = roomId;

        ws.send(JSON.stringify({
            type: 'room_created',
            roomId: roomId,
            message: `Room ${roomId} created.`
        }));
    }

    // joins existing room
    else if (data.type === 'join_room') {
        const targetRoomId = data.roomId;
        const roomExists = await redisClient.exists(`room:${targetRoomId}`);

        if (!roomExists) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            return;
        }

        await redisClient.sAdd(`room:${targetRoomId}:players`, ws.clientID);
        await redisClient.hSet(`user:${ws.clientID}`, { joinedRoom: targetRoomId });

        ws.roomID = targetRoomId;

        ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: targetRoomId
        }));

        broadcastToRoom(wss, targetRoomId, {
            type: 'player_joined',
            newPlayerId: ws.clientID,
            message: `${ws.clientName} joined!`
        });
    }
};

module.exports = { handleRoomMessage };