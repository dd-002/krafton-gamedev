require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { redisClient, connectToDatabase } = require('./src/connection_manager/connectRedis');
const { handleConnection } = require('./src/connection_manager/handleConnection');

const HTTP_PORT = process.env.HTTP_PORT || 8081; // Frontend
const WS_PORT = process.env.WS_PORT || 8080;     // Backend Game Server

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
};

// html file server
const fileServer = http.createServer((req, res) => {
    const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
    
    // Map URL to file system path
    let filePath = path.join(__dirname, 'client', safePath === '/' ? 'index.html' : safePath);

    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // 404 Page
                fs.readFile(path.join(__dirname, 'public', '404.html'), (error, content404) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content404 || '404 Not Found', 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

fileServer.listen(HTTP_PORT, () => {
    console.log(`[Frontend] Website running at http://localhost:${HTTP_PORT}`);
});

// web socket server
const wss = new WebSocket.Server({ port: WS_PORT });

console.log(`[Backend] Game Server started on port ${WS_PORT}`);
connectToDatabase();

wss.on('connection', (ws, req) => {
    // Construct URL for parsing parameters
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const clientName = requestUrl.searchParams.get('name');

    if (!clientName) {
        console.log('Connection rejected: No client name provided.');
        ws.close(1008, 'Client name required'); 
        return;
    }
    handleConnection(ws, wss, redisClient, clientName);
});

