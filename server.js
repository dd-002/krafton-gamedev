require('dotenv').config();
const WebSocket = require('ws');

const PORT = process.env.PORT;

const wss = new WebSocket.Server({ port: PORT });
console.log(`Server started on port ${PORT}. Waiting for players...`);


// Broadcast to all connected clients
function broadcast(message = "Hello") {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

setInterval(() => {
    broadcast("MKC");
}, 3000);
