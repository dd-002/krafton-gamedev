const crypto = require('crypto'); // for creating client id


const handleConnection = (ws, wss, clientName) => {
    
    // 1. Generate a Unique ID
    const clientID = crypto.randomUUID();

    // 2. Attach metadata to the WebSocket object directly
    // This allows us to access 'ws.clientID' in any other function later
    ws.clientID = clientID;
    ws.clientName = clientName;

    console.log(`New Player Connected: ${clientName} (ID: ${clientID})`);

    // 3. Send the ID back to the client immediately so they know who they are
    const welcomePayload = {
        type: 'welcome',
        message: `Welcome ${clientName}!`,
        yourID: clientID,
        yourName: clientName
    };
    ws.send(JSON.stringify(welcomePayload));

    // Event listener for incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            // Log with the specific client's ID/Name
            console.log(`[${ws.clientName}] sent:`, data);

        } catch (error) {
            console.log(`[${ws.clientName}] sent raw:`, message.toString());
        }
    });

    ws.on('close', () => {
        console.log(`${ws.clientName} (${ws.clientID}) disconnected`);
    });

    ws.on('error', (error) => {
        console.error(`Error with ${ws.clientName}:`, error);
    });
};

module.exports = { handleConnection };