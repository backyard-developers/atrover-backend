import type { WebSocket } from 'ws';
import * as roverManager from '../rover/manager.js';
import { publish } from '../redis/pubsub.js';
import type { IncomingMessage } from './types.js';

export async function handleMessage(ws: WebSocket, data: string, roverId?: string): Promise<string | undefined> {
  let message: IncomingMessage;

  try {
    message = JSON.parse(data);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    return roverId;
  }

  switch (message.type) {
    case 'register': {
      const info = roverManager.createRover(message.name);
      await roverManager.registerRover(info);
      roverManager.setCommandSocket(info.id, ws);

      ws.send(JSON.stringify({
        type: 'registered',
        roverId: info.id,
      }));

      await publish('rover:events', JSON.stringify({
        event: 'rover:connected',
        roverId: info.id,
        name: message.name,
      }));

      return info.id;
    }

    case 'heartbeat': {
      if (roverId) {
        await roverManager.updateRoverHeartbeat(roverId);
        ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
      }
      return roverId;
    }

    case 'command': {
      const sent = roverManager.sendCommandToRover(message.roverId, message.command);

      if (!sent) {
        await publish('rover:commands', JSON.stringify({
          targetRoverId: message.roverId,
          command: message.command,
        }));
      }

      ws.send(JSON.stringify({
        type: 'command_ack',
        roverId: message.roverId,
      }));

      return roverId;
    }

    default: {
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      return roverId;
    }
  }
}

export async function handleDisconnect(roverId: string | undefined): Promise<void> {
  if (roverId) {
    await roverManager.unregisterRover(roverId);

    await publish('rover:events', JSON.stringify({
      event: 'rover:disconnected',
      roverId,
    }));
  }
}
