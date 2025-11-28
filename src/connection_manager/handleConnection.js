//Handles Client Connections

const crypto = require('crypto'); // for creating client id


const handleConnection = async (ws, wss, redisClient,clientName) => {

    // 1. Generate a Unique ID
    const clientID = crypto.randomUUID();

    // attached clientID to object
    ws.clientID = clientID;
    ws.clientName = clientName;

    await redisClient.hSet(`user:${clientID}`, {
        clientName: clientName,
        clientID: clientID,
        joinedRoom: "false",
        joinedGame: "false",
    });

    console.log(`New Player Connected: ${clientName} (ID: ${clientID})`);


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
            console.log(`[${ws.clientName}] sent:`, data);

            //TODO : Game logic

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