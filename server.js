require('dotenv').config();
const WebSocket = require('ws');
const { redisClient, connectToDatabase } = require('./src/connection_manager/connectRedis');
const {handleConnection} = require('./src/connection_manager/handleConnection');





// Use the PORT from .env, or default to 8080 if not found
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });
console.log(`Server started on port ${PORT}.`);
connectToDatabase();


wss.on('connection', (ws, req) => {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const clientName = requestUrl.searchParams.get('name');

    // Validation
    if (!clientName) {
        console.log('Connection rejected: No client name provided.');
        ws.close(1008, 'Client name required'); // 1008 = Policy Violation
        return;
    }
    handleConnection(ws, wss, redisClient, clientName);
});


