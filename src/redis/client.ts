import Redis from 'ioredis';
import { config } from '../config/index.js';

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(config.redis.url);

    client.on('error', (err) => {
      console.error('Redis error:', err);
    });

    client.on('connect', () => {
      console.log('Connected to Redis');
    });
  }

  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
