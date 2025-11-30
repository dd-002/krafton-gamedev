const crypto = require('crypto');
const { handleRoomMessage } = require('./handlers/roomHandler');
const { handleGameMessage } = require('./handlers/gameHandler');
const { activeGameRooms } = require('../managers/roomManager')

const handleConnection = async (ws, wss, redisClient, clientName) => {


    const clientID = crypto.randomUUID();
    ws.clientID = clientID;
    ws.clientName = clientName;
    ws.roomID = null;

    await redisClient.hSet(`user:${clientID}`, {
        clientName: clientName,
        clientID: clientID,
    });

    ws.send(JSON.stringify({ type: 'welcome', yourID: clientID }));

    // Message Router
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            // Routing Logic
            switch (data.type) {
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;

                case 'create_room':
                    await handleRoomMessage(ws, wss, redisClient, data);
                    break;

                case 'join_room':
                    await handleRoomMessage(ws, wss, redisClient, data);
                    break;

                // Game Logic (WASD)
                case 'move':
                case 'input':
                    // Check if they are actually in a room before allowing moves
                    if (ws.roomID) {
                        handleGameMessage(ws, wss, redisClient, data);
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: "Join a room first!"}));
                    }
                    break;

                default:
                    console.log("Unknown message type:", data.type);
            }

        } catch (error) {
            console.error("Error:", error);
        }
    });

    ws.on('close', () => {
        if (ws.roomID) {
            const gameRoom = activeGameRooms.get(ws.roomID);
            if (gameRoom) {
                gameRoom.removePlayer(ws.clientID);

                // if room empty, we kill
                if (gameRoom.players.size === 0) {
                    activeGameRooms.delete(ws.roomID);
                    redisClient.del(`room:${ws.roomID}`);
                    console.log(`Room ${ws.roomID} closed.`);
                }
            }
        }
    });

};

module.exports = { handleConnection };