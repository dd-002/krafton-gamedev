const WebSocket = require('ws');

const broadcastToRoom = (wss, roomId, payload) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.roomID === roomId) {
            client.send(JSON.stringify(payload));
        }
    });
};

module.exports = { broadcastToRoom };