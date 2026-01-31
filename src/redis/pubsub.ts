import Redis from 'ioredis';
import { config } from '../config/index.js';

let subscriber: Redis | null = null;
let publisher: Redis | null = null;

export type MessageHandler = (channel: string, message: string) => void;

const handlers: Map<string, MessageHandler[]> = new Map();

export async function initPubSub(): Promise<void> {
  subscriber = new Redis(config.redis.url);
  publisher = new Redis(config.redis.url);

  subscriber.on('message', (channel, message) => {
    const channelHandlers = handlers.get(channel);
    if (channelHandlers) {
      channelHandlers.forEach((handler) => handler(channel, message));
    }
  });

  console.log('PubSub initialized');
}

export async function subscribe(channel: string, handler: MessageHandler): Promise<void> {
  if (!subscriber) {
    throw new Error('PubSub not initialized');
  }

  if (!handlers.has(channel)) {
    handlers.set(channel, []);
    await subscriber.subscribe(channel);
  }

  handlers.get(channel)!.push(handler);
}

export async function publish(channel: string, message: string): Promise<void> {
  if (!publisher) {
    throw new Error('PubSub not initialized');
  }

  await publisher.publish(channel, message);
}

export async function closePubSub(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
  handlers.clear();
}
