import { createClient } from 'redis';

const redisClient = createClient({
        host: '127.0.0.1', 
        port: process.env.REDIS_PORT,   
});
redisClient.on('error', (err) => console.log('Redis Client Error', err));

async function connectToDatabase() {
  try {
    await redisClient.connect(); // Await the connection
    console.log('Connected to Redis successfully!');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
  }
}

module.exports = {redisClient, connectToDatabase}