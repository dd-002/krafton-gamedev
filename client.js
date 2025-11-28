const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('Connected to WebSocket server');
  ws.send('Hello from Node.js client!');
};

ws.onmessage = (event) => {
  console.log('Received from server: %s', event.data);
};

ws.onclose = () => {
  console.log('Disconnected from WebSocket server');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};