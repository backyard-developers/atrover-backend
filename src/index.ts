import { config } from './config/index.js';
import { getRedisClient, closeRedis } from './redis/client.js';
import { initPubSub, closePubSub } from './redis/pubsub.js';
import { startCommandServer } from './command/server.js';
import { startMediaServer } from './media/server.js';

async function main(): Promise<void> {
  console.log('Starting Rover Control Backend...');
  console.log(`Instance ID: ${config.instanceId}`);

  // Initialize Redis
  console.log('Connecting to Redis...');
  getRedisClient();
  await initPubSub();

  // Start both servers
  await Promise.all([
    startCommandServer(),
    startMediaServer(),
  ]);

  console.log('\nBackend ready:');
  console.log(`  Command server: ws://localhost:${config.commandPort}/ws`);
  console.log(`  Media server:   ws://localhost:${config.mediaPort}/ws`);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  await closePubSub();
  await closeRedis();
  console.log('Redis connections closed');

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  console.error('Failed to start backend:', err);
  process.exit(1);
});
