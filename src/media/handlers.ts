import type { WebSocket } from 'ws';
import * as roverManager from '../rover/manager.js';
import * as state from '../redis/state.js';
import { config } from '../config/index.js';
import { MediaType, type MediaControlMessage } from './types.js';

const subscribers: Map<string, Set<WebSocket>> = new Map();

export function handleBinaryMessage(ws: WebSocket, data: Buffer, roverId?: string): void {
  if (!roverId || data.length < 2) {
    return;
  }

  const mediaType = data[0];
  const frameData = data.slice(1);

  const roverSubscribers = subscribers.get(roverId);
  if (roverSubscribers) {
    const frame = Buffer.concat([Buffer.from([mediaType]), frameData]);
    roverSubscribers.forEach((subscriber) => {
      if (subscriber.readyState === 1) {
        subscriber.send(frame);
      }
    });
  }

  if (mediaType === MediaType.VIDEO) {
    console.debug(`Video frame from ${roverId}: ${frameData.length} bytes`);
  } else if (mediaType === MediaType.AUDIO) {
    console.debug(`Audio frame from ${roverId}: ${frameData.length} bytes`);
  }
}

export function handleTextMessage(ws: WebSocket, data: string, roverId?: string): string | undefined {
  let message: MediaControlMessage;

  try {
    message = JSON.parse(data);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    return roverId;
  }

  switch (message.type) {
    case 'register': {
      const rover = roverManager.getLocalRover(message.roverId);
      if (rover) {
        roverManager.setMediaSocket(message.roverId, ws);
        const mediaUrl = `ws://${config.mediaHost}:${config.mediaPort}/ws`;
        state.setMediaUrl(message.roverId, mediaUrl).catch((err) => {
          console.error(`Failed to store mediaUrl for rover ${message.roverId}:`, err);
        });
        ws.send(JSON.stringify({ type: 'registered', roverId: message.roverId }));
        console.log(`Media socket registered for rover: ${message.roverId}`);
        return message.roverId;
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Rover not found. Register via command server first.' }));
        return roverId;
      }
    }

    case 'start_stream': {
      if (!subscribers.has(message.roverId)) {
        subscribers.set(message.roverId, new Set());
      }
      subscribers.get(message.roverId)!.add(ws);

      ws.send(JSON.stringify({
        type: 'stream_started',
        roverId: message.roverId,
        mediaType: message.mediaType,
      }));

      console.log(`Client subscribed to ${message.mediaType} stream from rover: ${message.roverId}`);
      return roverId;
    }

    case 'stop_stream': {
      const roverSubscribers = subscribers.get(message.roverId);
      if (roverSubscribers) {
        roverSubscribers.delete(ws);
        if (roverSubscribers.size === 0) {
          subscribers.delete(message.roverId);
        }
      }

      ws.send(JSON.stringify({
        type: 'stream_stopped',
        roverId: message.roverId,
      }));

      console.log(`Client unsubscribed from rover: ${message.roverId}`);
      return roverId;
    }

    default: {
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      return roverId;
    }
  }
}

export function handleDisconnect(ws: WebSocket, roverId?: string): void {
  subscribers.forEach((roverSubscribers, rId) => {
    roverSubscribers.delete(ws);
    if (roverSubscribers.size === 0) {
      subscribers.delete(rId);
    }
  });

  if (roverId) {
    console.log(`Media socket disconnected for rover: ${roverId}`);
  }
}
