require('dotenv').config();
const WebSocket = require('ws');

// Use the PORT from .env, or default to 8080 if not found
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });
console.log(`Server started on port ${PORT}. Waiting for players...`);

// Handle new client connections
wss.on('connection', (ws) => {
    console.log('New client connected!');

    // Event listener for incoming messages from this specific client
    ws.on('message', (message) => {
        try {
            // 'message' is often a Buffer in modern 'ws' versions, so we convert to string
            const messageString = message.toString();

            // Attempt to parse JSON (since our client sends JSON data)
            const data = JSON.parse(messageString);

            // Log the structured data
            console.log('Received Data:', data);
        } catch (error) {
            // If it's not JSON (or parsing fails), log the raw string
            console.log('Received Raw:', message.toString());
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('Client disconnected');
    });

    // Handle errors to prevent server crashes
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Broadcast to all connected clients
function broadcast(message = "Hello") {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Keep your existing interval
setInterval(() => {
    broadcast("MKC");
}, 3000);